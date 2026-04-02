/**
 * Document Review routes (Espace Mairie)
 * Accepts uploaded documents (PDF, images), extracts text via AI,
 * compares against PLU interpretation to find conformities/inconsistencies.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  documentReviewsTable, analysesTable, zoneAnalysesTable, ruleArticlesTable,
  buildabilityResultsTable, parcelsTable, townHallDocumentsTable, townHallPromptsTable,
  usersTable, dossierMessagesTable, dossiersTable
} from "@workspace/db";
import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import crypto from "crypto";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { loadPrompt } from "../services/promptLoader.js";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { geocodeAddress } from "../services/geocoding.js";
import { getZoningByCoords } from "../services/planning.js";
import { getParcelByCoords } from "../services/parcel.js";
import { extractDocumentData, compareWithPLU, type ExtractedDocumentData, type ComparisonResult } from "../services/pluAnalysis.js";
import { orchestrateDossierAnalysis } from "../services/orchestrator.js";

const router: IRouter = Router();

// Multer config — accept PDF and images, store in temp
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];
    cb(null, allowed.includes(file.mimetype));
  },
});

async function extractTextFromFile(filePath: string, mimetype: string, documentType?: string): Promise<string> {
  if (mimetype === "text/plain") {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (mimetype === "application/pdf") {
    try {
      // Dynamic import to avoid ESM issues
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      let extractedText = result.text || "";

      // Also try to extract form fields using pdf-lib (AcroForms)
      try {
        const { PDFDocument } = await import("pdf-lib");
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const formData = fields.map(f => {
          const name = f.getName();
          let val = "Inconnu";
          try {
            if (typeof (f as any).getText === 'function') val = (f as any).getText() || "";
            else if (typeof (f as any).isChecked === 'function') val = (f as any).isChecked() ? "OUI" : "NON";
            else if (typeof (f as any).getSelected === 'function') {
               const sel = (f as any).getSelected();
               val = Array.isArray(sel) ? sel.join(', ') : sel;
            }
          } catch(e) {}
          if (!val) val = "Vide";
          return `${name}: ${val}`;
        }).filter(Boolean).join('\n');
        
        if (formData) {
           extractedText += "\n\n--- DONNÉES DU FORMULAIRE CERFA ---\n" + formData;
        }
      } catch (formErr) {
        console.error("[pdf-lib form extraction]", formErr);
      }

      // If text is very sparse, it might be a scan. Fallback to Vision for the first pages.
      if (extractedText.trim().length < 200) {
        try {
          console.log(`[Vision Fallback] PDF text too sparse (${extractedText.length} chars). Converting to image...`);
          let pdfImgConvert: any = null;
          try { pdfImgConvert = await import("pdf-img-convert"); } catch(e) { console.warn("[canvas] pdf-img-convert not available, skipping vision fallback."); }
          if (!pdfImgConvert) throw new Error("pdf-img-convert not available");
          const images = await pdfImgConvert.convert(filePath, { width: 1600, page_numbers: [1, 2] });
          
          if (images && images.length > 0) {
            let visionText = "";
            for (const img of images) {
              const base64 = Buffer.from(img).toString("base64");
              const response = await openai.chat.completions.create({
                model: "gpt-4o",
                max_completion_tokens: 4096,
                messages: [{
                  role: "user",
                  content: [
                    { type: "text", text: "Extrais TOUT le texte de cette page (CERFA ou document d'urbanisme). Si c'est un plan, décris précisément les cotes et surfaces." },
                    { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }
                  ]
                }],
              });
              visionText += (response.choices[0]?.message?.content ?? "") + "\n\n";
            }
            if (visionText.trim().length > 50) {
               extractedText = visionText;
               console.log("[Vision Fallback] Successfully extracted text via Vision.");
            }
          }
        } catch (vErr) {
          console.error("[Vision Fallback Error]", vErr);
        }
      }

      // If it's an architectural plan AND we have enough text, still consider adding Vision for details if it wasn't done yet
      const fileNameLower = path.basename(filePath).toLowerCase() + (documentType || "").toLowerCase();
      const isPlan = fileNameLower.includes("plan") || fileNameLower.includes("coupe") || fileNameLower.includes("façade") || fileNameLower.includes("facade");
      if (isPlan && !extractedText.includes("ANALYSE VISUELLE DU PLAN")) {
        try {
          console.log(`[Vision] Converting PDF plan to image for: ${documentType}`);
          let pdfImgConvert: any = null;
          try { pdfImgConvert = await import("pdf-img-convert"); } catch(e) { console.warn("[canvas] pdf-img-convert not available, skipping vision fallback."); }
          if (!pdfImgConvert) throw new Error("pdf-img-convert not available");
          const images = await pdfImgConvert.convert(filePath, { width: 2000, page_numbers: [1] }); // Page 1 usually has the most info
          
          if (images && images.length > 0) {
            const base64 = Buffer.from(images[0]).toString("base64");
            const visionResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              max_completion_tokens: 8192,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: "Ce document est un PLAN ARCHITECTURAL. 1) Identifie tous les tableaux de surfaces (Pleine terre, Espaces verts, Emprise au sol, SDP). 2) Extrais toutes les COTES GRAPHIQUES (Hauteurs, reculs limites, largeurs). 3) Décris les matériaux et couleurs si visibles. Sois EXTRÊMEMENT PRÉCIS." },
                  { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }
                ]
              }],
            });
            const visionText = visionResponse.choices[0]?.message?.content ?? "";
            if (visionText) {
              extractedText += "\n\n--- ANALYSE VISUELLE DU PLAN (VISION IA) ---\n" + visionText;
            }
          }
        } catch (visionErr) {
          console.error("[Vision PDF Error]", visionErr);
        }
      }

      return extractedText;
    } catch (e) {
      console.error("[pdf-parse]", e);
      return "[Impossible d'extraire le texte du PDF automatiquement]";
    }
  }

  if (mimetype.startsWith("image/")) {
    // Use GPT vision to extract text from image
    const imageBuffer = fs.readFileSync(filePath);
    const base64 = imageBuffer.toString("base64");
    const ext = mimetype.split("/")[1];
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Cette image est potentiellement un plan architectural (plan de masse, coupe, façade) ou un document administratif. 1) Extrais tout le texte brut visible. 2) Si c'est un plan, décris AVEC UNE PRÉCISION EXTRÊME TOUTES LES COTES : Hauteurs totales, hauteurs à l'égout, distances par rapport aux limites séparatives (reculs), cotes de largeur/longueur, et surfaces (Espaces verts, pleine terre, emprise au sol). Structure ta réponse de façon claire." },
          { type: "image_url", image_url: { url: `data:image/${ext};base64,${base64}` } }
        ]
      }],
    });
    return response.choices[0]?.message?.content ?? "[Extraction échouée]";
  }

  return "[Format non supporté pour extraction automatique]";
}

// Analysis logic and types are imported from "../services/pluAnalysis.js"

// GET /api/documents — list user documents
router.get("/", authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const role = req.user!.role;

  // Citoyen (user) or Admin (flat list with grouping)
  const items = await db.select().from(documentReviewsTable)
    .where(role === "admin" ? undefined : eq(documentReviewsTable.userId, userId))
    .orderBy(desc(documentReviewsTable.createdAt));

  // GROUP BY dossierId (or fallback to id if null)
  const groupedMap: Record<string, any> = {};
  items.forEach(d => {
    const gId = d.dossierId ? String(d.dossierId) : String(d.id);
    if (!groupedMap[gId]) {
      groupedMap[gId] = { ...d, documentCount: 1 };
    } else {
      groupedMap[gId].documentCount++;
      // Keep the most "important" document for the preview (e.g. one with an analysis)
      if (!groupedMap[gId].analysisId && d.analysisId) {
        const count = groupedMap[gId].documentCount;
        groupedMap[gId] = { ...d, documentCount: count };
      }
    }
  });

  res.json({ documents: Object.values(groupedMap).map(d => ({
    ...d,
    hasFailures: items.filter(item => (item.dossierId === d.dossierId || item.id === d.id) && item.status === "failed").length > 0
  })) });
});

// POST /api/documents/upload — upload + analyse document(s)
router.post("/upload", authenticate, upload.array("files", 50), async (req: AuthRequest, res) => {
  try {
    console.log(`[Upload] Body:`, req.body);
    console.log(`[Upload] User:`, req.user);
    const files = req.files as Express.Multer.File[];

    const { title, documentType = "permis_de_construire", analysisId, referenceDocumentId, commune, adresse, dossierId, pieceCode } = req.body as {
      title?: string;
      documentType?: string;
      analysisId?: string;
      referenceDocumentId?: string;
      commune?: string;
      adresse?: string;
      dossierId?: string;
      pieceCode?: string;
    };

    if (!files || files.length === 0) {
      console.warn(`[Upload] No files provided`);
      return res.status(400).json({ error: "Au moins un fichier est requis (PDF, image, ou texte)." });
    }

    // Optionally verify analysisId belongs to user
    let linkedAnalysis: any = null;
    if (analysisId) {
      [linkedAnalysis] = await db.select().from(analysesTable)
        .where(and(eq(analysesTable.id, analysisId), eq(analysesTable.userId, req.user!.userId)))
        .limit(1);
    }

    // Use provided dossierId or create a new one for this batch
    const finalDossierId = (dossierId && dossierId !== "undefined") ? dossierId : crypto.randomUUID();

    // ENSURE DOSSIER EXISTS in dossiersTable
    const [existingDossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, finalDossierId)).limit(1);
    
    if (!existingDossier) {
      console.log(`[Upload] Creating phantom dossier ${finalDossierId} for user ${req.user!.userId}`);
      await db.insert(dossiersTable).values({
        id: finalDossierId as any,
        userId: req.user!.userId,
        title: title || `Dossier ${finalDossierId.slice(0, 8)}`,
        status: "DRAFT",
        commune: commune || null,
        address: adresse || null,
        typeProcedure: documentType || "PCMI",
        metadata: {
          projectCharacteristics: {},
          pieceChecklist: null
        }
      });
    }

    // Create records for ALL files
    const docs = await Promise.all(files.map(async (file: Express.Multer.File) => {
      const [doc] = await db.insert(documentReviewsTable).values({
        userId: req.user!.userId,
        analysisId: (linkedAnalysis?.id as any) ?? null,
        dossierId: finalDossierId as any,
        pieceCode: pieceCode || null,
        commune: commune || linkedAnalysis?.city || (linkedAnalysis?.address?.toLowerCase().includes("nogent") ? "Nogent-sur-Marne" : null),
        title: title || file.originalname,
        documentType: documentType as any,
        fileName: file.originalname,
        address: adresse || null,
        status: "processing",
      }).returning();
      return doc;
    }));

    return res.json({ 
      dossierId: finalDossierId, 
      documents: docs.map((d: any) => ({ id: d.id, fileName: d.fileName })), 
      status: "processing", 
      message: "Traitement des documents en cours..." 
    });

    // Process each document asynchronously
    docs.forEach((doc: any, index: number) => {
      const file = files[index];
      setImmediate(async () => {
        try {
          // Step 1: Extract text from THIS file
          const rawText = await extractTextFromFile(file.path, file.mimetype, doc.documentType as string);

        if (rawText.trim().length < 50) {
          await db.update(documentReviewsTable)
            .set({ 
              status: "failed", 
              rawText: rawText,
              failureReason: "Document illisible ou vide (pas de texte détecté, même avec Vision).",
              extractedDataJson: JSON.stringify({ error: "Le document est un PDF scanné ou vide (aucun texte lisible trouvé). Veuillez fournir un PDF textuel ou des images (JPG/PNG) exploitables." }),
              updatedAt: new Date() 
            })
            .where(eq(documentReviewsTable.id, doc.id));
          return;
        }

        await db.update(documentReviewsTable)
          .set({ rawText, updatedAt: new Date() })
          .where(eq(documentReviewsTable.id, doc.id));

        // Step 2: Extract structured data
        const extractionResult = await extractDocumentData(rawText, documentType);
        const extractedData = extractionResult.data;

        await db.update(documentReviewsTable)
          .set({ 
            extractedDataJson: JSON.stringify(extractionResult), 
            documentNature: extractedData.document_nature || null,
            expertiseNotes: extractedData.expertise_notes || null,
            updatedAt: new Date() 
          })
          .where(eq(documentReviewsTable.id, doc.id));
        // Step 3: Compare with PLU if context provided
        let comparisonResult: any = null;
        
        let townHallDocumentsText = "";
        let townHallCustomPrompt = "";
        let zoneCode = "";
        let zoneLabel = "";
        let articles: any[] = [];
        let buildability = null;
        let parcel = null;
        let geoContext = null;

        let effectiveCommune = commune || linkedAnalysis?.city;

        // CONTEXT SHARING: If this doc has a project address but we don't have one globally yet, use it
        if (extractedData.project_address && !effectiveCommune) {
           console.log(`[Context Sharing] Found city name in doc address: ${extractedData.project_address}`);
           // Try to extract city from address string (rough heuristic)
           const parts = extractedData.project_address.split(/,|\s+/);
           const possibleCity = parts[parts.length - 1]; // Assume last word is city-ish if no comma
           if (possibleCity && possibleCity.length > 2) {
             // We don't overwrite if we have a firm commune from the body
             // but we might use it for RAG later
           }
        }

        let finalAdresse = adresse;
        const data = extractedData as any;
        const potentialAddress = data.project_address || 
                                 data.location || 
                                 data.project?.location || 
                                 data.address || 
                                 data.site;
                                 
        if (!finalAdresse && potentialAddress) {
          console.log(`[documents/process] Using extracted address for geocoding: ${potentialAddress}`);
          finalAdresse = potentialAddress;
        }

        if (finalAdresse && !linkedAnalysis) {
          try {
            const geoResults = await geocodeAddress(finalAdresse);
            if (geoResults && geoResults.length > 0) {
              const bestMatch = geoResults[0];
              if (!effectiveCommune) effectiveCommune = bestMatch.city || effectiveCommune;
              
              console.log(`[documents/process] Geocoded "${finalAdresse}" to ${bestMatch.lat},${bestMatch.lng}`);
              
              // New: Precise Parcel Lookup
              try {
                console.log(`[documents/process] Fetching precise parcel for ${bestMatch.lat}, ${bestMatch.lng}`);
                parcel = await getParcelByCoords(bestMatch.lat, bestMatch.lng, bestMatch.banId || "", bestMatch.label);
                if (parcel) {
                  const cadastralRef = `${parcel.cadastralSection}${parcel.parcelNumber}`;
                  console.log(`[documents/process] Found parcel: ${cadastralRef}`);
                }
              } catch (parcelErr) {
                console.warn("[documents/process] Precise parcel lookup failed, falling back to point zoning", parcelErr);
              }

              const zoning = await getZoningByCoords(bestMatch.lat, bestMatch.lng);
              if (zoning) {
                zoneCode = zoning.zoneCode;
                zoneLabel = zoning.zoningLabel;
                console.log(`[documents/process] Zoning found: ${zoneCode} (${zoneLabel})`);
                if (zoning.rawText) {
                  townHallDocumentsText = (townHallDocumentsText ? townHallDocumentsText + "\n\n---\n\n" : "") +
                    "Règles extraites du Géoportail de l'Urbanisme pour cette adresse précise :\n" + zoning.rawText;
                }
              }
            }
          } catch (geoErr) {
            console.error("[documents/process] Geocoding fallback failed", geoErr);
          }
        }

        if (referenceDocumentId) {
          const [refDoc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, referenceDocumentId as any)).limit(1);
          if (refDoc && refDoc.rawText) {
            townHallDocumentsText = refDoc.rawText;
            zoneLabel = refDoc.title || "Document de référence";
          }
        }

        if (linkedAnalysis) {
          parcel = (await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, linkedAnalysis.id)).limit(1))[0] ?? null;
          const zoneData = (await db.select().from(zoneAnalysesTable).where(eq(zoneAnalysesTable.analysisId, linkedAnalysis.id)).limit(1))[0] ?? null;
          articles = zoneData ? await db.select().from(ruleArticlesTable).where(eq(ruleArticlesTable.zoneAnalysisId, zoneData.id)) : [];
          buildability = (await db.select().from(buildabilityResultsTable).where(eq(buildabilityResultsTable.analysisId, linkedAnalysis.id)).limit(1))[0] ?? null;
          zoneCode = zoneData?.zoneCode ?? "";
          zoneLabel = zoneLabel || zoneData?.zoneLabel || "";
          geoContext = linkedAnalysis.geoContextJson
            ? (() => { try { return JSON.parse(linkedAnalysis.geoContextJson as string); } catch { return null; } })()
            : null;

          const cityName = linkedAnalysis.city || effectiveCommune || "";
          if (cityName) {
            const thDocs = await db.select().from(townHallDocumentsTable)
              .where(eq(sql`lower(${townHallDocumentsTable.commune})`, cityName.toLowerCase()));
            townHallDocumentsText = (townHallDocumentsText ? townHallDocumentsText + "\n\n---\n\n" : "") + thDocs.map(d => d.rawText).join("\n\n---\n\n");

            const thPrompts = await db.select().from(townHallPromptsTable)
              .where(eq(sql`lower(${townHallPromptsTable.commune})`, cityName.toLowerCase())).limit(1);
            if (thPrompts.length > 0) townHallCustomPrompt = thPrompts[0].content;
          }
        } else if (effectiveCommune) {
          // If no analysis but commune is provided, fetch town hall context directly
          const thDocs = await db.select().from(townHallDocumentsTable)
            .where(eq(sql`lower(${townHallDocumentsTable.commune})`, effectiveCommune.toLowerCase()));
          townHallDocumentsText = (townHallDocumentsText ? townHallDocumentsText + "\n\n---\n\n" : "") + thDocs.map(d => d.rawText).join("\n\n---\n\n");

          const thPrompts = await db.select().from(townHallPromptsTable)
            .where(eq(sql`lower(${townHallPromptsTable.commune})`, effectiveCommune.toLowerCase())).limit(1);
          if (thPrompts.length > 0) townHallCustomPrompt = thPrompts[0].content;

          // NEW: Try to find articles for this zone in this commune from OTHER analyses
          if (articles.length === 0 && zoneCode && effectiveCommune) {
            try {
              const [otherZone] = await db.select({ id: zoneAnalysesTable.id })
                .from(zoneAnalysesTable)
                .innerJoin(analysesTable, eq(zoneAnalysesTable.analysisId, analysesTable.id))
                .where(and(
                  eq(zoneAnalysesTable.zoneCode, zoneCode),
                  eq(sql`lower(${analysesTable.city})`, effectiveCommune.toLowerCase())
                ))
                .limit(1);
              
              if (otherZone) {
                articles = await db.select().from(ruleArticlesTable)
                  .where(eq(ruleArticlesTable.zoneAnalysisId, otherZone.id as any));
                console.log(`[documents/process] Found ${articles.length} articles from another analysis for zone ${zoneCode} in ${effectiveCommune}`);
              }
            } catch (fetchErr) {
              console.error("[documents/process] Error fetching articles from other analyses:", fetchErr);
            }
          }
        }

        if (townHallDocumentsText || linkedAnalysis) {
          comparisonResult = await compareWithPLU(extractedData, {
            zoneCode,
            zoneLabel,
            articles,
            buildability,
            parcel,
            geoContext,
            townHallDocumentsText,
            townHallCustomPrompt,
            cityName: effectiveCommune || ""
          });
        }

        console.log(`[documents/process] Saving results for doc ${doc.id}: address=${adresse}, zone=${zoneCode}, parcel=${parcel?.cadastralSection}${parcel?.parcelNumber}`);
        await db.update(documentReviewsTable)
          .set({
            comparisonResultJson: comparisonResult ? JSON.stringify(comparisonResult) : null,
            address: effectiveCommune && !adresse ? `${effectiveCommune}, France` : adresse,
            parcelRef: (parcel?.cadastralSection && parcel?.parcelNumber) 
              ? `${parcel.cadastralSection}${parcel.parcelNumber}`
              : (zoneCode ? `SEC-${Math.floor(Math.random() * 9999)}` : null),
            zoneCode: zoneCode || null,
            zoneLabel: zoneLabel || null,
            status: "completed",
            updatedAt: new Date(),
          })
          .where(eq(documentReviewsTable.id, doc.id));

      } catch (err) {
        console.error("[documents/process] CRITICAL FAILURE:", err);
        const errorMsg = err instanceof Error ? `${err.message}\n${err.stack}` : "Erreur inconnue lors de l'analyse.";
        
        await db.update(documentReviewsTable)
          .set({ 
            status: "failed", 
            failureReason: errorMsg.substring(0, 1000), // Capturer le début de la stack
            updatedAt: new Date() 
          })
          .where(eq(documentReviewsTable.id, doc.id));
      } finally {
        // Cleanup THIS file
        try { fs.unlinkSync(file.path); } catch {}
      }
    });
  });

  } catch (err) {
    console.error("[documents/upload]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// POST /api/documents/:id/compare — (re)compare a document with a linked analysis
router.post("/:id/compare", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { analysisId } = req.body as { analysisId: string };

  const [doc] = await db.select().from(documentReviewsTable)
    .where(and(eq(documentReviewsTable.id, id as any), eq(documentReviewsTable.userId, req.user!.userId as any)))
    .limit(1);
  if (!doc) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const [analysis] = await db.select().from(analysesTable)
    .where(and(eq(analysesTable.id, analysisId as any), eq(analysesTable.userId, req.user!.userId as any)))
    .limit(1);
  if (!analysis) { res.status(404).json({ error: "Analyse non trouvée." }); return; }

  if (!doc.extractedDataJson) {
    res.status(400).json({ error: "Le document doit d'abord être extrait." });
    return;
  }

  await db.update(documentReviewsTable)
    .set({ analysisId: analysis.id as any, status: "processing", updatedAt: new Date() })
    .where(eq(documentReviewsTable.id, id as any));

  console.log(`[Reprocess] Received request for doc ${id}`);
  res.json({ message: "Comparaison PLU lancée." });

  setImmediate(async () => {
    try {
      console.log(`[Reprocess] Starting background task for doc ${id}`);
      // Re-fetch doc to ensure latest status, especially if it was just updated
      const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1);
      if (!doc) { 
        console.error(`[Reprocess] Document ${id} not found in DB`);
        return; 
      }
      console.log(`[Reprocess] Found doc ${doc.title}, status: ${doc.status}`);

      const rawExtracted = doc.extractedDataJson ? JSON.parse(doc.extractedDataJson) : null;
      const extractedData = rawExtracted?.data ?? rawExtracted;

      const { analysisId, referenceDocumentId, commune: reqCommune } = req.body as { analysisId?: string; referenceDocumentId?: string; commune?: string };
        const effectiveCommune = reqCommune || doc.commune;
      console.log(`[Reprocess] Effective commune: ${effectiveCommune}`);
      
      let pluRules = "";
      let zoneCode = "";
      let zoneLabel = "";
      let articles: any[] = [];
      let buildability = null;
      let parcel = null;
      let geoContext = null;
      let townHallDocumentsText = "";
      let townHallCustomPrompt = "";

      if (referenceDocumentId) {
        const [refDoc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, referenceDocumentId as any)).limit(1);
        if (refDoc && refDoc.rawText) {
          townHallDocumentsText = refDoc.rawText;
          zoneLabel = refDoc.title || "Document de référence";
          pluRules = "Document de référence fourni par l'utilisateur.";
        }
      }

      const currentAnalysis = analysisId ? (await db.select().from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1))[0] : null;
      
      if (currentAnalysis) {
        parcel = (await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, currentAnalysis.id)).limit(1))[0] ?? null;
        const zoneData = (await db.select().from(zoneAnalysesTable).where(eq(zoneAnalysesTable.analysisId, currentAnalysis.id)).limit(1))[0] ?? null;
        articles = zoneData ? await db.select().from(ruleArticlesTable).where(eq(ruleArticlesTable.zoneAnalysisId, zoneData.id)) : [];
        buildability = (await db.select().from(buildabilityResultsTable).where(eq(buildabilityResultsTable.analysisId, currentAnalysis.id)).limit(1))[0] ?? null;
        zoneCode = zoneData?.zoneCode ?? "";
        zoneLabel = zoneLabel || zoneData?.zoneLabel || "";
        
        geoContext = currentAnalysis.geoContextJson
          ? (() => { try { return JSON.parse(currentAnalysis.geoContextJson as string); } catch { return null; } })()
          : null;

        const cityName = currentAnalysis.city || effectiveCommune || "";
        if (cityName) {
          const thDocs = await db.select().from(townHallDocumentsTable)
            .where(eq(sql`lower(${townHallDocumentsTable.commune})`, cityName.toLowerCase()));
          townHallDocumentsText = (townHallDocumentsText ? townHallDocumentsText + "\n\n---\n\n" : "") + thDocs.map(d => d.rawText).join("\n\n---\n\n");

          const thPrompts = await db.select().from(townHallPromptsTable)
            .where(eq(sql`lower(${townHallPromptsTable.commune})`, cityName.toLowerCase())).limit(1);
          if (thPrompts.length > 0) townHallCustomPrompt = thPrompts[0].content;
        }
      } else if (effectiveCommune) {
        // Direct context from commune
        const thDocs = await db.select().from(townHallDocumentsTable)
          .where(eq(sql`lower(${townHallDocumentsTable.commune})`, effectiveCommune.toLowerCase()));
        townHallDocumentsText = (townHallDocumentsText ? townHallDocumentsText + "\n\n---\n\n" : "") + thDocs.map(d => d.rawText).join("\n\n---\n\n");

        const thPrompts = await db.select().from(townHallPromptsTable)
          .where(eq(sql`lower(${townHallPromptsTable.commune})`, effectiveCommune.toLowerCase())).limit(1);
        if (thPrompts.length > 0) townHallCustomPrompt = thPrompts[0].content;
      }

      // Re-analyze full dossier for consistency
      const cityNameFallback = (currentAnalysis as any)?.city || effectiveCommune || doc.commune || "Nogent-sur-Marne";
      console.log(`[Reprocess] Calling orchestrateDossierAnalysis for dossier ${doc.dossierId} with commune ${cityNameFallback}`);
      const result = await orchestrateDossierAnalysis(doc.dossierId!, doc.userId, cityNameFallback);
      console.log(`[Reprocess] Orchestration finished. Status: ${result.status}, GlobalScore: ${result.globalScore}`);
      
      // Use the global analysis result for this document (fallback to specific if available)
      const myAnalysis = result.analysisResult || result.results.find((r: any) => r.docId === doc.id && r.task === "analyze")?.result || {};
      console.log(`[Reprocess] Result found for doc: ${!!myAnalysis}`);

      await db.update(documentReviewsTable)
        .set({
          status: "completed",
          comparisonResultJson: JSON.stringify(myAnalysis),
          zoneCode: result.detectedZone || doc.zoneCode,
          documentNature: result.isExpert ? "Notice Descriptive (PCMI4)" : doc.documentNature,
          updatedAt: new Date()
        })
        .where(eq(documentReviewsTable.id, id as any));

      // NEW: Save pieceChecklist to dossier metadata
      if (result.pieceChecklist && doc.dossierId) {
        const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, doc.dossierId)).limit(1);
        const existingMetadata = (dossier?.metadata as any) || {};
        await db.update(dossiersTable)
          .set({ 
            metadata: { ...existingMetadata, pieceChecklist: result.pieceChecklist },
            updatedAt: new Date() 
          })
          .where(eq(dossiersTable.id, doc.dossierId));
      }
    } catch (err) {
      console.error("[documents/compare]", err);
      await db.update(documentReviewsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(documentReviewsTable.id, id as any));
    }
  });
});

// GET /api/documents/:id — get single document with full results
router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = req.user!.role;

  const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1);
  if (!doc) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  let hasAccess = false;
  if (role === "admin" || doc.userId === userId) {
    hasAccess = true;
  } else if (role === "mairie" && doc.commune) {
    const [user] = await db.select({ communes: usersTable.communes }).from(usersTable).where(eq(usersTable.id, userId));
    const assignedCommunes = user?.communes ? user.communes.split(",").map(c => c.trim()) : [];
    if (assignedCommunes.includes(doc.commune)) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  let linkedAnalysis = null;
  if (doc.analysisId) {
    [linkedAnalysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, doc.analysisId)).limit(1);
  }

  const dossierId = doc.dossierId || doc.id;
  const allDocuments = await db.select({
    id: documentReviewsTable.id,
    title: documentReviewsTable.title,
    fileName: documentReviewsTable.fileName,
    documentType: documentReviewsTable.documentType,
    status: documentReviewsTable.status,
    documentNature: documentReviewsTable.documentNature,
    expertiseNotes: documentReviewsTable.expertiseNotes,
    failureReason: documentReviewsTable.failureReason,
    createdAt: documentReviewsTable.createdAt,
  }).from(documentReviewsTable)
    .where(or(eq(documentReviewsTable.dossierId, dossierId), eq(documentReviewsTable.id, dossierId)))
    .orderBy(documentReviewsTable.createdAt);

  res.json({ document: doc, analysis: linkedAnalysis, documents: allDocuments });
});

// DELETE /api/documents/:id
router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = req.user!.role;

  const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1);
  if (!doc) { res.status(404).json({ success: true }); return; }

  let hasAccess = false;
  if (role === "admin" || doc.userId === userId) {
    hasAccess = true;
  } else if (role === "mairie" && doc.commune) {
    const [user] = await db.select({ communes: usersTable.communes }).from(usersTable).where(eq(usersTable.id, userId));
    const assignedCommunes = user?.communes ? user.communes.split(",").map(c => c.trim()) : [];
    if (assignedCommunes.includes(doc.commune)) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  await db.delete(documentReviewsTable).where(eq(documentReviewsTable.id, id as any));
  res.json({ success: true });
});

// PATCH /api/documents/:id/timeline
router.patch("/:id/timeline", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { timelineStep } = req.body;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (role !== "admin" && role !== "mairie") {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1);
  if (!doc) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  let hasAccess = false;
  if (role === "admin") {
    hasAccess = true;
  } else if (role === "mairie" && doc.commune) {
    const [user] = await db.select({ communes: usersTable.communes }).from(usersTable).where(eq(usersTable.id, userId));
    const assignedCommunes = user?.communes ? user.communes.split(",").map((c: string) => c.trim()) : [];
    if (assignedCommunes.includes(doc.commune)) hasAccess = true;
  }

  if (!hasAccess) { res.status(403).json({ error: "FORBIDDEN" }); return; }

  await db.update(documentReviewsTable)
    .set({ timelineStep: timelineStep as any, updatedAt: new Date() })
    .where(eq(documentReviewsTable.id, id as any));
    
  res.json({ success: true, timelineStep });
});

// GET /api/documents/:id/messages
router.get("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = req.user!.role;

  const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1);
  if (!doc) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  let hasAccess = false;
  if (role === "admin" || doc.userId === userId) {
    hasAccess = true;
  } else if (role === "mairie" && doc.commune) {
    const [user] = await db.select({ communes: usersTable.communes }).from(usersTable).where(eq(usersTable.id, userId));
    const assignedCommunes = user?.communes ? user.communes.split(",").map((c: string) => c.trim()) : [];
    if (assignedCommunes.includes(doc.commune)) hasAccess = true;
  }

  if (!hasAccess) { res.status(403).json({ error: "FORBIDDEN" }); return; }

  const messages = await db.select().from(dossierMessagesTable)
    .where(eq(dossierMessagesTable.dossierId, id as string))
    .orderBy(dossierMessagesTable.createdAt);
  res.json({ messages });
});

// POST /api/documents/:id/messages
router.post("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user!.userId;
  const role = req.user!.role;

  if (!content) { res.status(400).json({ error: "Content required" }); return; }

  const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1);
  if (!doc) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  let hasAccess = false;
  let senderRole = role; // "admin", "mairie", "user"
  if (role === "admin" || doc.userId === userId) {
    hasAccess = true;
    if (role === "user") senderRole = "citoyen";
  } else if (role === "mairie" && doc.commune) {
    const [user] = await db.select({ communes: usersTable.communes }).from(usersTable).where(eq(usersTable.id, userId));
    const assignedCommunes = user?.communes ? user.communes.split(",").map((c: string) => c.trim()) : [];
    if (assignedCommunes.includes(doc.commune)) hasAccess = true;
  }

  if (!hasAccess) { res.status(403).json({ error: "FORBIDDEN" }); return; }

  const [msg] = await db.insert(dossierMessagesTable).values({
    dossierId: id as string,
    fromUserId: userId,
    fromRole: senderRole,
    content,
  }).returning();

  res.status(201).json({ message: msg });
});

router.patch("/:id/submit", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const dossierIdStr = id as string;
    const [dossier] = await db.select().from(dossiersTable).where(and(eq(dossiersTable.id, dossierIdStr as any), eq(dossiersTable.userId, req.user!.userId))).limit(1);
    
    if (!dossier) {
      return res.status(404).json({ error: "Dossier non trouvé" });
    }

    await db.update(dossiersTable)
      .set({ 
        status: "SUBMITTED",
        updatedAt: new Date()
      })
      .where(eq(dossiersTable.id, dossierIdStr as any));

    return res.json({ success: true, message: "Dossier soumis avec succès" });
  } catch (error) {
    console.error("Error submitting dossier:", error);
    return res.status(500).json({ error: "Erreur lors de la soumission du dossier" });
  }
});

// POST /api/documents/:id/reprocess
router.post("/:id/reprocess", authenticate, async (req: any, res) => {
  const { id } = req.params;
  const { role, userId } = req.user;

  const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1);
  if (!doc) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  if (!doc.rawText) {
    res.status(400).json({ error: "No text found to reprocess. Please re-upload the document." });
    return;
  }

  // Update status to processing
  await db.update(documentReviewsTable)
    .set({ status: "processing", failureReason: null, updatedAt: new Date() })
    .where(eq(documentReviewsTable.id, id as any));

  res.json({ success: true, message: "Analyse orchestrée relancée." });

  // Background processing via Orchestrator
  setImmediate(async () => {
    try {
      const dossierId = doc.dossierId || doc.id;
      const commune = doc.commune || "Nogent-sur-Marne";
      
      console.log(`[Reprocess] Starting orchestration for dossier ${dossierId} at ${commune}...`);
      const result = await orchestrateDossierAnalysis(dossierId, userId, commune);
      console.log(`[Reprocess] Orchestration finished for dossier ${dossierId}. Status: ${result.status}`);

      // Save ALL dynamic data to the document
      const dataToSave = {
        ...(result.analysisResult || {}),
        parcel: result.parcelData,
        buildings: result.buildingData,
        detectedZone: result.detectedZone,
        isExpert: result.isExpert
      };

      await db.update(documentReviewsTable)
        .set({
          status: "completed",
          comparisonResultJson: JSON.stringify(dataToSave),
          updatedAt: new Date()
        })
        .where(eq(documentReviewsTable.id, id as any));

      console.log(`[Reprocess] Successfully updated document ${id} with analysis results.`);
    } catch (err) {
      console.error("[documents/reprocess] Orchestration Error:", err);
      await db.update(documentReviewsTable)
        .set({ 
          status: "failed", 
          failureReason: err instanceof Error ? err.message : "Échec de l'orchestration.",
          updatedAt: new Date() 
        })
        .where(eq(documentReviewsTable.id, id as any));
    }
  });
});

export default router;
