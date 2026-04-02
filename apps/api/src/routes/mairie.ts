import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { desc, eq, sql, and, inArray, or, ne } from "drizzle-orm";
import { 
  dossiersTable, 
  documentReviewsTable, 
  usersTable, 
  analysesTable, 
  dossierMessagesTable, 
  townHallDocumentsTable, 
  townHallPromptsTable, 
  baseIABatchesTable, 
  baseIADocumentsTable, 
  baseIAEmbeddingsTable,
  municipalitySettingsTable,
  dossierEventsTable,
  ruleArticlesTable,
  zoneAnalysesTable
} from "@workspace/db";
import { createHash } from "crypto";
import { processDocumentForRAG } from "../services/baseIAIngestion.js";
import { generateGlobalSynthesis, type ExtractedDocumentData } from "../services/pluAnalysis.js";
import { authenticate, requireMairie, type AuthRequest } from "../middlewares/authenticate.js";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { VisionService } from "../services/visionService.js";
import { GPUProviderService } from "../services/gpuProviderService.js";
import { orchestrateDossierAnalysis } from "../services/orchestrator.js";
import { MessagingService } from "../services/messagingService.js";
import { WorkflowService, DOSSIER_STATUS } from "../services/workflowService.js";
import { DocumentGenerationService } from "../services/documentGenerationService.js";
import { geocodeAddress } from "../services/geocoding.js";

// dossierEventsTable is now imported above

// municipalitySettingsTable is now imported directly from @workspace/db

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const router: IRouter = Router();

router.use(authenticate, requireMairie);

// ─── DECISION GENERATION ───────────────────────────────────────────────────
router.post("/dossiers/:id/generate-decision", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const draft = await DocumentGenerationService.generateArreteDraft(id as string, req.user!.userId);
    return res.json({ draft });
  } catch (err) {
    return res.status(500).json({ error: "GENERATION_FAILED" });
  }
});

// ─── HELPER: parse communes from a user row ───────────────────────────────────
function parseCommunes(raw: string | null): string[] {
  if (!raw) return [];
  try { 
    const parsed = JSON.parse(raw); 
    if (Array.isArray(parsed)) return parsed.map(String);
    if (typeof parsed === "string") return [parsed];
    return [];
  } catch { 
    return raw.split(",").map(c => c.trim()).filter(Boolean); 
  }
}

// ─── DOSSIERS LIST ────────────────────────────────────────────────────────────
router.get("/dossiers", async (req: AuthRequest, res) => {
  try {
    const currentUser = await db
      .select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    const communes = currentUser[0] ? parseCommunes(currentUser[0].communes) : [];
    const isAdmin = currentUser[0]?.role === "admin";

    const dossiers = await db
      .select({
        id: dossiersTable.id,
        title: dossiersTable.title,
        typeProcedure: dossiersTable.typeProcedure,
        status: dossiersTable.status,
        createdAt: dossiersTable.createdAt,
        updatedAt: dossiersTable.updatedAt,
        commune: dossiersTable.commune,
        address: dossiersTable.address,
        dossierNumber: dossiersTable.dossierNumber,
        metadata: dossiersTable.metadata,
        assignedMetropoleId: dossiersTable.assignedMetropoleId,
        assignedAbfId: dossiersTable.assignedAbfId,
        isAbfConcerned: dossiersTable.isAbfConcerned,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(dossiersTable)
      .innerJoin(usersTable, eq(dossiersTable.userId, usersTable.id))
      .orderBy(desc(dossiersTable.createdAt));

    const requestedCommune = req.query.commune as string | undefined;

    // Filter logic
    const filtered = dossiers.filter(d => {
      const city = (d.commune || "").toLowerCase().trim();
      const role = currentUser[0]?.role;

      if (role === "admin" || role === "super_admin") {
        if (requestedCommune && requestedCommune !== "all") {
          return city === requestedCommune.toLowerCase().trim();
        }
        return true;
      }
      
      if (role === "metropole") {
        // Metropole sees dossiers assigned to them
        return d.assignedMetropoleId === req.user!.userId;
      }

      if (role === "abf") {
        // ABF sees dossiers where their avis is requested
        return d.isAbfConcerned === true;
      }

      // Mairie role filtering
      if (requestedCommune) {
        const canAccess = communes.some(c => c.toLowerCase().trim() === requestedCommune.toLowerCase().trim());
        if (!canAccess) return false;
        return city === requestedCommune.toLowerCase().trim();
      }
      
      return communes.some(c => c.toLowerCase().trim() === city);
    });

    const enrichedDossiers = filtered.map(d => {
      const meta = (d.metadata as any) || {};
      const missingPiecesCount = meta.preControl?.pieces_manquantes?.length || 0;
      const nonCompliantRulesCount = meta.pluAnalysis?.controles?.filter((c: any) => c.statut === "NON_CONFORME").length || 0;
      
      let criticalityScore = 0;
      // Extreme Priority: Missing pieces halting the instruction
      if (d.status === "INCOMPLET") criticalityScore += 100 + missingPiecesCount;
      // High Priority: Instruction blocked by PLU rules
      if (nonCompliantRulesCount > 0) criticalityScore += 50 + nonCompliantRulesCount;
      // Small bump for recent submissions to review
      if (d.status === "DEPOSE") criticalityScore += 10;

      return {
        ...d,
        anomalyCount: missingPiecesCount + nonCompliantRulesCount,
        criticalityScore,
        metadata: meta // Expose to frontend
      };
    });

    // Sort by criticality descending, then date
    enrichedDossiers.sort((a, b) => {
      if (b.criticalityScore !== a.criticalityScore) {
        return b.criticalityScore - a.criticalityScore;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return res.json({ dossiers: enrichedDossiers });
  } catch (err) {
    console.error("[mairie/dossiers]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// ─── DOSSIER DETAIL ───────────────────────────────────────────────────────────
router.get("/dossiers/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch the dossier first
    const [dossier] = await db
      .select({
        id: dossiersTable.id,
        title: dossiersTable.title,
        typeProcedure: dossiersTable.typeProcedure,
        status: dossiersTable.status,
        commune: dossiersTable.commune,
        address: dossiersTable.address,
        parcelRef: sql`metadata->>'parcel_ref'`,
        metadata: dossiersTable.metadata,
        userName: usersTable.name,
        userEmail: usersTable.email,
        createdAt: dossiersTable.createdAt,
      })
      .from(dossiersTable)
      .innerJoin(usersTable, eq(dossiersTable.userId, usersTable.id))
      .where(eq(dossiersTable.id, id as string))
      .limit(1);

    // If not found in dossiersTable, maybe it is a standalone document review (legacy)
    if (!dossier) {
      const [doc] = await db
        .select({
          id: documentReviewsTable.id,
          title: documentReviewsTable.title,
          status: documentReviewsTable.status,
          commune: documentReviewsTable.commune,
          address: documentReviewsTable.address,
          userName: usersTable.name,
          userEmail: usersTable.email,
          dossierId: documentReviewsTable.dossierId,
        })
        .from(documentReviewsTable)
        .leftJoin(usersTable, sql`${documentReviewsTable.userId}::text = ${usersTable.id}::text`)
        .where(eq(documentReviewsTable.id, id as string))
        .limit(1);

      if (!doc) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Dossier introuvable." });
      }

      // If it's a legacy doc, redirect or handle as dossier
      const dossierId = doc.dossierId || doc.id;
      const allDocuments = await db
        .select({
          id: documentReviewsTable.id,
          title: documentReviewsTable.title,
          fileName: documentReviewsTable.fileName,
          documentType: documentReviewsTable.documentType,
          status: documentReviewsTable.status,
          createdAt: documentReviewsTable.createdAt,
        })
        .from(documentReviewsTable)
        .where(sql`${documentReviewsTable.dossierId} = ${dossierId} OR ${documentReviewsTable.id} = ${dossierId}`)
        .orderBy(documentReviewsTable.createdAt);

      return res.json({ ...doc, documents: allDocuments });
    }

    // Standard Dossier flow
    const allDocuments = await db
      .select({
        id: documentReviewsTable.id,
        title: documentReviewsTable.title,
        fileName: documentReviewsTable.fileName,
        documentType: documentReviewsTable.documentType,
        pieceCode: documentReviewsTable.pieceCode,
        pieceStatus: documentReviewsTable.pieceStatus,
        isRequested: documentReviewsTable.isRequested,
        status: documentReviewsTable.status,
        createdAt: documentReviewsTable.createdAt,
      })
      .from(documentReviewsTable)
      .where(eq(documentReviewsTable.dossierId, dossier.id as string))
      .orderBy(documentReviewsTable.createdAt);

    const allMessages = await db
      .select()
      .from(dossierMessagesTable)
      .where(eq(dossierMessagesTable.dossierId, dossier.id as string))
      .orderBy(dossierMessagesTable.createdAt);

    return res.json({ ...dossier, documents: allDocuments, messages: allMessages });
  } catch (err) {
    console.error("[mairie/dossiers/:id]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// ─── DOSSIER TIMELINE ────────────────────────────────────────────────────────
router.get("/dossiers/:id/timeline", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const events = await db.select()
      .from(dossierEventsTable)
      .where(eq(dossierEventsTable.dossierId, id as string))
      .orderBy(desc(dossierEventsTable.createdAt));
    return res.json({ events });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── MESSAGING ───────────────────────────────────────────────────────────────
router.get("/dossiers/:id/messages", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const messages = await MessagingService.getThread(id as string);
    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/dossiers/:id/messages", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content, parentId, documentId } = req.body;
    
    // Fetch User Role for the message
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    const msg = await MessagingService.sendMessage(
      id as string,
      req.user!.userId,
      user?.role || "unknown",
      content,
      parentId,
      documentId
    );
    return res.json({ success: true, message: msg });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── WORKFLOW ACTIONS ────────────────────────────────────────────────────────

// 1. Transmission à la Métropole (par la Mairie)
router.post("/dossiers/:id/transmit", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { metropoleId } = req.body;
    
    await WorkflowService.transmitToMetropole(id as string, req.user!.userId, metropoleId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "TRANSMIT_FAILED" });
  }
});

// 1.5 Saisir l'ABF (par la Mairie/Métropole)
router.post("/dossiers/:id/request-abf", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // Toggle isAbfConcerned and set status to ATTENTE_ABF
    await db.update(dossiersTable)
      .set({ 
        isAbfConcerned: true, 
        status: DOSSIER_STATUS.ATTENTE_ABF,
        updatedAt: new Date() 
      })
      .where(eq(dossiersTable.id, id as string));

    await WorkflowService.transitionStatus(
      id as string,
      DOSSIER_STATUS.ATTENTE_ABF,
      req.user!.userId,
      "Saisine manuelle de l'Architecte des Bâtiments de France (ABF)."
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "ABF_REQUEST_FAILED" });
  }
});

// 2. Décision ABF (par l'ABF)
router.post("/dossiers/:id/abf-avis", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { decision, motivation } = req.body;
    
    // Check if user is ABF
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (user?.role !== "abf" && user?.role !== "admin") return res.status(403).json({ error: "FORBIDDEN" });

    await WorkflowService.transitionStatus(
      id as string, 
      DOSSIER_STATUS.AVIS_ABF_RECU, 
      req.user!.userId, 
      `Avis ABF rendu : ${decision}. ${motivation}`,
      { decision, motivation }
    );
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "ABF_ACTION_FAILED" });
  }
});

router.patch("/dossiers/:id/metadata", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { metadata } = req.body;

    if (!metadata || typeof metadata !== "object") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Metadata invalide." });
    }

    const [existing] = await db.select({ metadata: dossiersTable.metadata }).from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    const newMetadata = {
      ...(existing.metadata as any),
      ...metadata
    };

    await db.update(dossiersTable)
      .set({ metadata: newMetadata, updatedAt: new Date() })
      .where(eq(dossiersTable.id, id as string));

    // Optional: Re-run orchestrator for financials?
    // For now, return OK and let frontend trigger refetch
    return res.json({ success: true, metadata: newMetadata });
  } catch (err) {
    console.error("[mairie/dossiers/:id/metadata]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/dossiers/:id/re-analyze", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // 1. Fetch dossier to get commune and user
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    if (!dossier) return res.status(404).json({ error: "NOT_FOUND" });

    // 2. Run orchestrator
    const result = await orchestrateDossierAnalysis(
      dossier.id,
      [], // No docs pre-loaded
      { userId: dossier.userId },
      (dossier.metadata as any)?.analysisId || null
    );

    // 3. Update dossier with analysis ID in metadata
    if (result.analysisResult?.id) {
       const newMeta = {
         ...(dossier.metadata as any || {}),
         analysisId: result.analysisResult.id
       };
       await db.update(dossiersTable)
         .set({ metadata: newMeta, updatedAt: new Date() })
         .where(eq(dossiersTable.id, dossier.id));
    }

    return res.json({ success: true, result });
  } catch (err: any) {
    console.error("[mairie/dossiers/:id/re-analyze]", err);
    return res.status(500).json({ error: "ORCHESTRATOR_FAILED", message: err.message });
  }
});

router.get("/dossiers/:id/summary", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Get the dossier first
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    
    let dossierId: string;
    let allDocs: any[] = [];
    let initialDoc: any = null;

    if (dossier) {
      dossierId = dossier.id;
      allDocs = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.dossierId, dossierId));
      initialDoc = allDocs[0] || {};
    } else {
      // Legacy document review flow
      const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as string)).limit(1);
      if (!doc) return res.status(404).json({ error: "NOT_FOUND" });
      dossierId = doc.dossierId || doc.id;
      allDocs = await db.select().from(documentReviewsTable)
        .where(sql`${documentReviewsTable.dossierId} = ${dossierId} OR ${documentReviewsTable.id} = ${dossierId}`);
      initialDoc = doc;
    }

    if (allDocs.length === 0 && !dossier) return res.status(404).json({ error: "NO_DOCUMENTS" });

    // 3. Get PLU context (zone, city, custom prompts)
    const docWithContext = allDocs.find(d => d.analysisId) || initialDoc || allDocs[0] || {};
    const dossierMeta = (dossier?.metadata || {}) as any;
    let pluContext: any = {
      zoneCode: docWithContext?.zoneCode || dossierMeta?.zone?.code || "N/A",
      zoneLabel: docWithContext?.zoneLabel || dossierMeta?.zone?.label || "N/A",
      cityName: docWithContext?.commune || dossier?.commune || undefined,
    };

    // 3.5 Fetch Financial and Vision data from latest analysis
    const [latestAnalysis] = await db.select().from(analysesTable)
      .where(eq(analysesTable.id, (dossier as any)?.analysisId || (docWithContext as any)?.analysisId || ""))
      .limit(1);
    
    const financialData = (latestAnalysis as any)?.comparisonResultJson ? JSON.parse((latestAnalysis as any).comparisonResultJson).financialAnalysis : null;
    const visionReports = allDocs.filter(d => d.hasVisionAnalysis).map(d => ({
      title: d.title,
      report: d.visionResultText
    }));

    if (pluContext.cityName) {
      const [prompt] = await db.select().from(townHallPromptsTable)
        .where(eq(sql`lower(${townHallPromptsTable.commune})`, pluContext.cityName.toLowerCase())).limit(1);
      if (prompt) pluContext.townHallCustomPrompt = prompt.content;
    }

    // 4. Prepare data for AI
    const apiDocs = allDocs.map(d => ({
      title: d.title,
      type: d.documentType,
      extractedData: d.extractedDataJson ? JSON.parse(d.extractedDataJson) : {},
      analysis: d.comparisonResultJson ? JSON.parse(d.comparisonResultJson) : { 
        summary: "Non analysé", 
        global_status: "indéterminé", 
        points_attention: [], 
        inconsistencies: [] 
      }
    }));

    // 5. Generate synthesis
    const synthesis = await generateGlobalSynthesis(apiDocs, pluContext);

    // 6. Inject pieceChecklist if available in dossier metadata
    const pieceChecklist = dossierMeta?.pieceChecklist;
    if (pieceChecklist) {
      (synthesis as any).pieceChecklist = pieceChecklist;
    }

    // 7. Inject Financial & Vision context
    (synthesis as any).financial = financialData;
    (synthesis as any).visionSummaries = visionReports;
    (synthesis as any).marketData = (latestAnalysis as any)?.comparisonResultJson ? JSON.parse((latestAnalysis as any).comparisonResultJson).marketData : null;

    return res.json(synthesis);
  } catch (err) {
    console.error("[mairie/dossiers/:id/summary]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── MESSAGERIE ───────────────────────────────────────────────────────────────

router.get("/messages/:dossierId", async (req: AuthRequest, res) => {
  try {
    const { dossierId } = req.params;
    const { documentId } = req.query;

    let whereClause = eq(dossierMessagesTable.dossierId, dossierId as string);
    if (documentId) {
      whereClause = and(whereClause, eq(dossierMessagesTable.documentId, documentId as string)) as any;
    }

    const messages = await db
      .select()
      .from(dossierMessagesTable)
      .where(whereClause)
      .orderBy(dossierMessagesTable.createdAt);

    res.json({ messages });
  } catch (err) {
    console.error("[mairie/messages/:dossierId]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.post("/messages/:dossierId", async (req: AuthRequest, res) => {
  try {
    const { dossierId } = req.params;
    const { content, documentId } = req.body as { content?: string; documentId?: string };

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Le message ne peut pas être vide." });
      return;
    }
    if (content.trim().length > 2000) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Message trop long (max 2000 caractères)." });
      return;
    }

    // Check dossier exists
    const dossier = await db
      .select({ id: documentReviewsTable.id, dossierId: documentReviewsTable.dossierId })
      .from(documentReviewsTable)
      .where(sql`${documentReviewsTable.id}::text = ${dossierId} OR ${documentReviewsTable.dossierId}::text = ${dossierId}`)
      .limit(1);

    if (!dossier.length) {
      res.status(404).json({ error: "NOT_FOUND", message: "Dossier introuvable." });
      return;
    }

    // Get current user's role
    const fromRole = req.user!.role === "admin" ? "admin" : "mairie";

    const [inserted] = await db.insert(dossierMessagesTable).values({
      dossierId: dossierId as string,
      fromUserId: req.user!.userId,
      fromRole,
      content: content.trim(),
      documentId: documentId || null,
    }).returning();

    // 2. Identify @tags for smart piece tracking (Module 7)
    const mentions = content.match(/@([A-Z0-9]+)/g);
    if (mentions) {
       for (const mention of mentions) {
         const cleanCode = mention.substring(1).toUpperCase(); // e.g. PCMI2
         
         const existingDocs = await db.select().from(documentReviewsTable)
           .where(and(
             eq(documentReviewsTable.dossierId, dossierId as string),
             eq(documentReviewsTable.pieceCode, cleanCode)
           )).limit(1);

         if (existingDocs.length > 0) {
           // Tag existing document as requested & invalid
           await db.update(documentReviewsTable)
             .set({ isRequested: true, pieceStatus: "incorrecte", updatedAt: new Date() })
             .where(eq(documentReviewsTable.id, existingDocs[0].id));
         } else {
           // Create a virtual missing piece to track
           await db.insert(documentReviewsTable).values({
             userId: req.user!.userId,
             dossierId: dossierId as string,
             title: `Pièce Complémentaire : ${cleanCode}`,
             documentType: "autre",
             pieceCode: cleanCode,
             pieceStatus: "manquante",
             isRequested: true
           });
         }
       }
       
       // Force dossier status to incomplete if pieces requested
       await db.update(dossiersTable)
         .set({ status: "INCOMPLET", updatedAt: new Date() })
         .where(eq(dossiersTable.id, dossierId as string));
    }

    res.json({ message: inserted });
  } catch (err) {
    console.error("[mairie/messages/:dossierId POST]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});


// ─── AUTO-SUGGEST CLASSIFICATION ───────────────────────────────────────────

interface SuggestedClassification {
  category: string;
  subCategory: string;
  documentType: string;
  tags: string[];
}

function autoSuggestClassification(text: string, fileName: string): SuggestedClassification {
  const content = (text + " " + fileName).toLowerCase();
  
  if (content.includes("plu") || content.includes("règlement") || content.includes("zonage")) {
    let docType = "Written regulation";
    if (content.includes("plan") || content.includes("graphique") || content.includes("carte")) docType = "Zoning map";
    if (content.includes("padd")) docType = "PADD";
    if (content.includes("oap")) docType = "OAP";
    
    return {
      category: "REGULATORY",
      subCategory: "PLU",
      documentType: docType,
      tags: ["PLU", content.includes("article") ? "Article" : ""].filter(Boolean)
    };
  }
  
  if (content.includes("pprn") || content.includes("pprt") || content.includes("risque") || content.includes("inondation")) {
    return {
      category: "ANNEXES",
      subCategory: "RISKS",
      documentType: content.includes("pprn") ? "PPRN" : (content.includes("pprt") ? "PPRT" : "Risk Map"),
      tags: ["Risk", content.includes("flood") || content.includes("inondation") ? "Flood_risk" : ""].filter(Boolean)
    };
  }
  
  if (content.includes("abf") || content.includes("monument") || content.includes("patrimoine")) {
    return {
      category: "ANNEXES",
      subCategory: "HERITAGE",
      documentType: "ABF perimeter",
      tags: ["Heritage", "ABF"]
    };
  }
  
  if (content.includes("eau") || content.includes("edf") || content.includes("assainissement") || content.includes("réseau")) {
    return {
      category: "INFRASTRUCTURE",
      subCategory: "NETWORKS",
      documentType: content.includes("eau") ? "Water" : (content.includes("assainissement") ? "Sanitation" : "Electricity"),
      tags: ["Infrastructure", "Network"]
    };
  }

  return {
    category: "OTHER",
    subCategory: "MISC",
    documentType: "Other",
    tags: []
  };
}

// ─── PLU KNOWLEDGE BASE ───────────────────────────────────────────────────────

async function extractTextFromFile(filePath: string, mimetype: string): Promise<string> {
  if (mimetype === "application/pdf") {
    try {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      return result.text;
    } catch (e) {
      console.error("[pdf-parse]", e);
      return "[Impossible d'extraire le texte du PDF automatiquement]";
    }
  }
  return fs.readFileSync(filePath, "utf-8");
}

router.get("/documents", async (req: AuthRequest, res) => {
  try {
    const requestedCommune = req.query.commune as string | undefined;
    
    let whereClause = eq(townHallDocumentsTable.userId, req.user!.userId);
    if (requestedCommune) {
      whereClause = and(whereClause, eq(sql`lower(${townHallDocumentsTable.commune})`, requestedCommune.toLowerCase())) as any;
    }

    const docs = await db.select().from(townHallDocumentsTable)
      .where(whereClause)
      .orderBy(desc(townHallDocumentsTable.createdAt));
    
    const filteredDocs = docs.map(d => ({ 
      id: d.id, 
      title: d.title, 
      fileName: d.fileName, 
      createdAt: d.createdAt, 
      commune: d.commune,
      category: d.category,
      subCategory: d.subCategory,
      documentType: d.documentType,
      tags: d.tags
    }));
    return res.json({ documents: filteredDocs });
  } catch(err) { return res.status(500).json({ error: "INTERNAL_ERROR" }); }
});

router.post("/documents/batch", upload.array("files", 10), async (req: AuthRequest, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "Fichiers requis." });
    }

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    
    let targetCommune = req.body.commune as string | undefined;
    if (!targetCommune && assignedCommunes.length > 0) {
      targetCommune = assignedCommunes[0];
    }

    // 1. Create Batch
    const [batch] = await db.insert(baseIABatchesTable).values({
      createdBy: req.user!.userId,
      status: "processing"
    }).returning();

    const results = [];

    res.json({ batchId: batch.id, status: "processing", message: "Traitement par lot démarré." });

    // 2. Process Files Background
    setImmediate(async () => {
      try {
        const results = [];
        for (const file of files) {
          const content = fs.readFileSync(file.path);
          const hash = createHash("sha256").update(content).digest("hex");

          // Check for dupe
          const [existing] = await db.select().from(baseIADocumentsTable)
            .where(eq(baseIADocumentsTable.fileHash, hash)).limit(1);

          if (existing) {
            results.push({ fileName: file.originalname, status: "skipped_duplicate", id: existing.id });
            try { fs.unlinkSync(file.path); } catch {}
            continue;
          }

          const rawText = await extractTextFromFile(file.path, file.mimetype);
          const suggestion = autoSuggestClassification(rawText, file.originalname);
          const category = req.body.category || suggestion.category;
          const subCategory = req.body.subCategory || suggestion.subCategory;
          const tags = req.body.tags ? JSON.parse(req.body.tags) : suggestion.tags;

          const [doc] = await db.insert(baseIADocumentsTable).values({
            batchId: batch.id,
            municipalityId: targetCommune || null,
            fileName: file.originalname,
            fileHash: hash,
            status: "indexed",
            type: req.body.type || "plu",
            category,
            subCategory,
            tags
          }).returning();

          // Also support legacy table for back-compat
          await db.insert(townHallDocumentsTable).values({
            userId: req.user!.userId,
            commune: targetCommune || null,
            title: file.originalname,
            fileName: file.originalname,
            rawText: rawText,
            category,
            subCategory,
            documentType: req.body.documentType || suggestion.documentType,
            tags,
            zone: req.body.zone || null
          });

          // Process the document for RAG (Chunking + Embeddings)
          if (targetCommune) {
             try {
               await processDocumentForRAG(doc.id, targetCommune, rawText, {
                 document_type: (req.body.type === "plu" ? "plu_reglement" : (req.body.type === "annexe" ? "plu_annexe" : "other")),
                 commune: targetCommune,
                 zone: req.body.zone || null
               });
               console.log(`[mairie/batch] Successfully processed RAG for doc ${doc.id}`);
             } catch (ragErr) {
               console.error(`[mairie/batch] RAG Processing failed for doc ${doc.id}:`, ragErr);
               // We don't block the rest of the batch if RAG fails, but we should log it
               await db.update(baseIADocumentsTable).set({ status: "vectorization_failed" }).where(eq(baseIADocumentsTable.id, doc.id));
             }
          }

          results.push({ fileName: file.originalname, status: "indexed", id: doc.id });
          try { fs.unlinkSync(file.path); } catch {}
        }

        await db.update(baseIABatchesTable).set({ status: "completed" }).where(eq(baseIABatchesTable.id, batch.id));
        console.log(`[mairie/batch] Completed batch ${batch.id}`);
      } catch (err) {
        console.error(`[mairie/batch] Error in background process:`, err);
        await db.update(baseIABatchesTable).set({ status: "failed" }).where(eq(baseIABatchesTable.id, batch.id));
      }
    });

    return;
  } catch (err) {
    console.error("[mairie/documents/batch POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/documents", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Fichier requis." }); return; }
    
    // Validate commune ownership
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    
    let targetCommune = req.body.commune as string | undefined;
    if (!targetCommune && assignedCommunes.length > 0) {
      targetCommune = assignedCommunes[0];
    }
    
    if (currentUser[0]?.role !== "admin" && targetCommune && !assignedCommunes.some(c => c.toLowerCase() === targetCommune!.toLowerCase())) {
      try { fs.unlinkSync(file.path); } catch {}
      res.status(403).json({ error: "FORBIDDEN", message: "Vous n'avez pas accès à cette commune." });
      return;
    }
    
    res.json({ status: "processing", message: "Document reçu, analyse en arrière-plan démarrée." });

    setImmediate(async () => {
      try {
        const rawText = await extractTextFromFile(file.path, file.mimetype);
        const suggestion = autoSuggestClassification(rawText, file.originalname);
        const category = req.body.category || suggestion.category;
        const subCategory = req.body.subCategory || suggestion.subCategory;
        const documentType = req.body.documentType || suggestion.documentType;
        const tags = req.body.tags ? (typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags) : suggestion.tags;

        const [doc] = await db.insert(townHallDocumentsTable).values({
          userId: req.user!.userId,
          commune: targetCommune || null,
          title: req.body.title || file.originalname,
          fileName: file.originalname,
          rawText: rawText,
          category,
          subCategory,
          documentType,
          tags,
          zone: req.body.zone || null
        }).returning();
        
        // Embad generation using RAG pipeline
        if (targetCommune) {
            try {
              // Map suggest classification to canonical document_type
              let canonicalType: any = "other";
              const dt = (documentType || "").toLowerCase();
              if (dt.includes("regulation") || dt.includes("reglement")) canonicalType = "plu_reglement";
              else if (dt.includes("padd") || dt.includes("oap") || dt.includes("orientation")) canonicalType = "oap";
              else if (dt.includes("annexe")) canonicalType = "plu_annexe";

              await processDocumentForRAG(doc.id, targetCommune, rawText, {
                document_type: canonicalType,
                commune: targetCommune,
                zone: req.body.zone || null
              });
             console.log(`[mairie/upload] Successfully processed RAG for doc ${doc.id}`);
           } catch (ragErr) {
             console.error(`[mairie/upload] RAG vectorization failed for doc ${doc.id}:`, ragErr);
           }
        }
        
        // Store file persistently for Vision (Phase 4)
        const persistentPath = path.join(process.cwd(), "uploads", `${doc.id}${path.extname(file.originalname)}`);
        try {
          fs.copyFileSync(file.path, persistentPath);
          console.log(`[VisionStorage] File stored: ${persistentPath}`);
        } catch (copyErr) {
          console.error(`[VisionStorage] Failed to store file:`, copyErr);
        }

        console.log(`[mairie/upload] Successfully processed ${file.originalname}`);
        try { fs.unlinkSync(file.path); } catch {}
      } catch (err) {
        console.error(`[mairie/upload] Background error:`, err);
      }
    });

    return;
  } catch(err) {
    console.error("[mairie/documents POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", details: err instanceof Error ? err.stack : String(err) });
  }
});

router.delete("/documents/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    await db.delete(townHallDocumentsTable)
      .where(and(eq(townHallDocumentsTable.id, id), eq(townHallDocumentsTable.userId, req.user!.userId)));
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: "INTERNAL_ERROR" }); }
});

router.post("/gpu/sync", async (req: AuthRequest, res) => {
  try {
    // 1. Resolve INSEE logic (Dynamic & Robust)
    let insee: string | null = null;
    const commune = (req.query.commune as string || "").trim();
    if (!commune) return res.status(400).json({ error: "Commune requise" });

    console.log(`[GPU] Starting sync for commune: '${commune}'`);

    // A. Direct INSEE check (5 digits)
    if (/^\d{5}$/.test(commune)) {
      insee = commune;
    }

    // B. Hardcoded / Common Mapping
    if (!insee) {
      const lowerInput = commune.toLowerCase();
      if (lowerInput === "rochecorbon") insee = "37203";
      else if (lowerInput === "saint-avertin" || lowerInput === "saint avertin") insee = "37208";
      else if (lowerInput === "nogent-sur-marne" || lowerInput === "nogent sur marne") insee = "94052";
    }

    // C. DB Resolution
    if (!insee) {
      const [settings] = await db.select().from(municipalitySettingsTable)
        .where(or(
          eq(municipalitySettingsTable.commune, commune),
          eq(sql`lower(${municipalitySettingsTable.commune})`, commune.toLowerCase())
        )).limit(1);
      insee = settings?.inseeCode || null;
    }

    // D. Dynamic Geocoding Resolution (FINAL FALLBACK)
    if (!insee) {
      console.log(`[GPU] Dynamic resolution for: '${commune}'`);
      const geocodeResults = await geocodeAddress(commune, "municipality");
      if (geocodeResults.length > 0) {
        insee = geocodeResults[0].inseeCode || null;
        console.log(`[GPU] Geocoding resolved '${commune}' to INSEE ${insee} (${geocodeResults[0].label})`);
      }
    }

    if (!insee) {
      return res.status(400).json({
        error: "COMMUNE_NOT_RESOLVED",
        message: `Impossible de résoudre le code INSEE pour '${commune}'. Spécifiez le code INSEE à 5 chiffres directement.`
      });
    }

    console.log(`[GPU] Final INSEE code resolved: ${insee}`);

    // 1. Fetch all documents for this commune
    const allDocs = await GPUProviderService.getDocumentsByInsee(insee);

    // 2. Keep only the active document(s)
    const activeDocs = allDocs.filter(d => d.status === "document.production");
    console.log(`[GPU] ${activeDocs.length} active document(s) (document.production) out of ${allDocs.length} total`);

    if (activeDocs.length === 0) {
      return res.json({ success: true, count: 0, documents: [], message: "Aucun document actif trouvé (document.production) pour cette commune." });
    }

    let count = 0;
    const results = [];
    const uploadDir = path.resolve(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    for (const gpuDoc of activeDocs) {
      console.log(`[GPU] Processing doc ${gpuDoc.id} — ${gpuDoc.originalName}`);

      // 3. Fetch the file list for this document
      const allFiles = await GPUProviderService.getFilesByDocumentId(gpuDoc.id);
      console.log(`[GPU]   Total files in document: ${allFiles.length}`);

      // 4. Filter to regulatory-relevant files
      const criticalFiles = GPUProviderService.filterCriticalFiles(allFiles);
      console.log(`[GPU]   Critical files to ingest: ${criticalFiles.length}`);

      for (const file of criticalFiles) {
        const note = await GPUProviderService.generateExplanatoryNote(file.name, file.title);

        // 5. Download the PDF via curl (adding -L to follow redirects)
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const destPath = path.join(uploadDir, safeFilename);
        try {
          const curlDownload = `curl -s -L -k --max-time 60 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o "${destPath}" "${file.url}"`;
          execSync(curlDownload, { timeout: 65000 });
          const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
          if (size > 5000) { // Increased threshold to avoid capturing tiny HTML redirect pages
            console.log(`[GPU]   Downloaded: ${safeFilename} (${(size/1024).toFixed(1)} KB)`);
          } else {
            console.warn(`[GPU]   Download suspicious (${size} bytes): ${safeFilename}`);
          }
        } catch (downloadErr: any) {
          console.error(`[GPU]   Download failed for ${file.name}: ${downloadErr.message}`);
          // Continue anyway — we still catalog the document
        }

        // 6. Smart Classification for Frontend (matching KB_STRUCTURE in portail-mairie.tsx)
        let category = "REGULATORY";
        let subCategory = "PLU";
        let documentType = "Administrative Act";

        const fileNameLower = file.name.toLowerCase();
        if (fileNameLower.includes("reglement") && !fileNameLower.includes("graphique")) {
          documentType = "Written regulation";
        } else if (fileNameLower.includes("padd")) {
          documentType = "PADD";
        } else if (fileNameLower.includes("oap") || fileNameLower.includes("orientation")) {
          documentType = "OAP";
        } else if (fileNameLower.includes("graphique") || fileNameLower.includes("zonage")) {
          category = "ZONING";
          subCategory = "PLANS";
          documentType = "Zoning map";
        } else if (fileNameLower.includes("ppri") || fileNameLower.includes("risques")) {
          category = "ANNEXES";
          subCategory = "RISKS";
          documentType = "Risk Map";
        } else if (fileNameLower.includes("sup") || fileNameLower.includes("servitude") || fileNameLower.includes("monument") || fileNameLower.includes("unesco") || fileNameLower.includes("heritage")) {
          category = "ANNEXES";
          subCategory = "HERITAGE";
          documentType = "Monuments historiques";
        }

        // 7. Upsert into DB (skip if already exists for THIS user by filename+commune)
        const existing = await db.select({ id: townHallDocumentsTable.id })
          .from(townHallDocumentsTable)
          .where(and(
            eq(townHallDocumentsTable.userId, req.user!.userId),
            eq(townHallDocumentsTable.fileName, safeFilename),
            eq(townHallDocumentsTable.commune, commune)
          ))
          .limit(1);

        if (existing.length > 0) {
          console.log(`[GPU]   Already in DB for this user, skipping: ${safeFilename}`);
          continue;
        }

        await db.insert(townHallDocumentsTable).values({
          userId: req.user!.userId,
          commune: commune,
          title: file.name,
          fileName: safeFilename,
          rawText: "",
          category: category,
          subCategory: subCategory,
          documentType: documentType,
          explanatoryNote: note,
          tags: [], 
          isRegulatory: true,
          isOpposable: true
        });
        count++;
        results.push({ name: file.title || file.name, fileName: safeFilename });
      }
    }

    console.log(`[GPU] Sync complete: ${count} document(s) ingested for ${commune}`);
    return res.json({ success: true, count, documents: results });
  } catch (err) {
    console.error("[mairie/gpu/sync]", err);
    return res.status(500).json({ error: "GPU_SYNC_FAILED", message: err instanceof Error ? err.message : "Erreur de sync" });
  }
});


router.get("/documents/:id/view", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    
    // 1. Fetch document record to get the actual fileName
    const [doc] = await db.select({ fileName: townHallDocumentsTable.fileName })
      .from(townHallDocumentsTable)
      .where(eq(townHallDocumentsTable.id, id))
      .limit(1);

    if (!doc || !doc.fileName) {
      console.warn(`[mairie/view] Document record or filename not found for ID: ${id}`);
      return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    }

    // 2. Locate the file in physical storage (uploads/)
    const uploadDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.join(uploadDir, doc.fileName);
    
    if (!fs.existsSync(filePath)) {
      console.error(`[mairie/view] Physical file missing in uploads/ for: ${doc.fileName}`);
      return res.status(404).json({ error: "FILE_NOT_FOUND_ON_DISK" });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(`[mairie/view] Critical error for ID ${req.params.id}:`, err);
    return res.status(500).json({ error: "VIEW_FAILED" });
  }
});

router.patch("/documents/:id/metadata", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { explanatoryNote } = req.body;
    
    await db.update(townHallDocumentsTable)
      .set({ explanatoryNote, updatedAt: new Date() })
      .where(eq(townHallDocumentsTable.id, id));
      
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "UPDATE_FAILED" });
  }
});

// ─── PROMPTS PERSONNALISES ────────────────────────────────────────────────────

router.get("/prompts/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.some(c => c.toLowerCase() === commune.toLowerCase())) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    const rows = await db.select().from(townHallPromptsTable).where(eq(sql`lower(${townHallPromptsTable.commune})`, commune.toLowerCase())).limit(1) as any;
    
    res.json({ prompt: rows.length > 0 ? rows[0] : null });
  } catch(err) {
    console.error("[mairie/prompts GET]", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/prompts/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    const content = req.body.content as string;
    
    if (!content) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Le contenu est requis" });
      return;
    }
    
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.some(c => c.toLowerCase() === commune.toLowerCase())) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    // Upsert equivalent since we want one prompt per commune
    const existing = await db.select({ id: townHallPromptsTable.id }).from(townHallPromptsTable).where(eq(sql`lower(${townHallPromptsTable.commune})`, commune.toLowerCase())).limit(1);
    
    let prompt;
    if (existing.length > 0) {
      [prompt] = await db.update(townHallPromptsTable)
        .set({ content, updatedAt: new Date() })
        .where(eq(townHallPromptsTable.id, existing[0].id))
        .returning();
    } else {
      [prompt] = await db.insert(townHallPromptsTable)
        .values({ commune, content })
        .returning();
    }
    
    res.json({ prompt });
  } catch(err) {
    console.error("[mairie/prompts POST]", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
    
// ─── PARAMETRES FINANCIERS ────────────────────────────────────────────────────

router.get("/settings/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.some(c => c.toLowerCase() === commune.toLowerCase())) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    const [settings] = await db.select().from(municipalitySettingsTable)
      .where(eq(sql`lower(${municipalitySettingsTable.commune})`, commune.toLowerCase())).limit(1);
    
    res.json({ settings: settings || null });
  } catch(err) {
    console.error("[mairie/settings GET]", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/settings/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    const { 
      taRateCommunal, taRateDept, taxeFonciereRate, teomRate, rapRate, 
      valeurForfaitaireTA, valeurForfaitairePiscine, valeurForfaitaireStationnement,
      prixM2Maison, prixM2Collectif, yieldMaison, yieldCollectif,
      abattementRP, surfaceAbattement, formulas
    } = req.body;
    
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.some(c => c.toLowerCase() === commune.toLowerCase())) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    const [existing] = await db.select().from(municipalitySettingsTable)
      .where(eq(sql`lower(${municipalitySettingsTable.commune})`, commune.toLowerCase())).limit(1);
    
    let result;
    const values = {
      taRateCommunal, taRateDept, taxeFonciereRate, teomRate, rapRate,
      valeurForfaitaireTA, valeurForfaitairePiscine, valeurForfaitaireStationnement,
      prixM2Maison, prixM2Collectif, yieldMaison, yieldCollectif,
      abattementRP, surfaceAbattement,
      formulas: formulas || {},
      updatedAt: new Date()
    };

    if (existing) {
      const updated = await db.update(municipalitySettingsTable)
        .set(values)
        .where(eq(municipalitySettingsTable.id, existing.id))
        .returning();
      result = updated[0];
    } else {
      const inserted = await db.insert(municipalitySettingsTable)
        .values({ ...values, commune })
        .returning();
      result = inserted[0];
    }
    
    return res.json({ settings: result });
  } catch(err) {
    console.error("[mairie/settings POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// DELETE /api/mairie/dossiers/:id — delete entire dossier (all associated documents)
router.delete("/dossiers/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Check if the dossier exists and if the user has access
    const [dossierMaster] = (await db.select().from(documentReviewsTable)
      .where(or(eq(documentReviewsTable.id, id as any), eq(documentReviewsTable.dossierId, id as any)))
      .limit(1)) as any[];

    if (!dossierMaster) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dossier introuvable" });
    }

    let hasAccess = false;
    if (role === "admin") {
      hasAccess = true;
    } else if (role === "mairie" && dossierMaster.commune) {
      const userRows = (await db.select({ communes: usersTable.communes }).from(usersTable).where(eq(usersTable.id, userId))) as any[];
      const user = userRows[0];
      const assignedCommunes = parseCommunes(user?.communes);
      if (assignedCommunes.includes(dossierMaster.commune)) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
    }

    // Delete all documents in the dossier
    await db.delete(documentReviewsTable)
      .where(or(
        eq(documentReviewsTable.id, id as any),
        eq(documentReviewsTable.dossierId, id as any)
      ));

    return res.json({ success: true, message: "Dossier supprimé avec succès" });
  } catch (err) {
    console.error("[mairie/dossiers DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── VISION ANALYSIS (Phase 4) ───────────────────────────────────────────────

router.post("/documents/:id/vision", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch document review
    const [doc] = (await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1)) as any[];
    if (!doc) return res.status(404).json({ error: "NOT_FOUND", message: "Document introuvable." });

    // 2. Find file in uploads/
    const uploadsDir = path.join(process.cwd(), "uploads");
    const files = fs.readdirSync(uploadsDir);
    const fileName = files.find(f => f.startsWith(doc.id));
    
    if (!fileName) {
      return res.status(404).json({ error: "FILE_MISSING", message: "Fichier source introuvable pour l'analyse vision. Réuploadez le document." });
    }

    const filePath = path.join(uploadsDir, fileName);

    // 3. Trigger processing status
    await db.update(documentReviewsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(documentReviewsTable.id, id as any));

    const responseSent = res.json({ status: "processing", message: "L'analyse graphique par GPT-4o Vision a démarré." });

    // 4. Background processing
    setImmediate(async () => {
      try {
        const visualDescription = await VisionService.analyzePlan(filePath);
        
        // Update document with vision results
        await db.update(documentReviewsTable)
          .set({ 
            status: "completed",
            hasVisionAnalysis: true,
            visionResultText: visualDescription,
            updatedAt: new Date()
          })
          .where(eq(documentReviewsTable.id, id as any));
        
        console.log(`[Vision] Analysis completed for doc ${id}`);
        return;
      } catch (visionErr: any) {
        console.error(`[Vision] Analysis failed for doc ${id}:`, visionErr);
        await db.update(documentReviewsTable)
          .set({ 
            status: "failed", 
            failureReason: `Échec de l'analyse vision: ${visionErr.message}`,
            updatedAt: new Date()
          })
          .where(eq(documentReviewsTable.id, id as any));
      }
    });

    return responseSent;
  } catch (err) {
    console.error("[mairie/vision POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
