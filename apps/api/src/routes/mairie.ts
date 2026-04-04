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
  zoneAnalysesTable,
  communesTable
} from "@workspace/db";
import { createHash } from "crypto";
import { logger } from "../utils/logger.js";
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
import { recordDecision } from "../services/learningService.js";

// dossierEventsTable is now imported above

// municipalitySettingsTable is now imported directly from @workspace/db

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024, files: 70 }
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
    logger.error("[mairie/dossiers]", err);
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
    logger.error("[mairie/dossiers/:id]", err);
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

    // Feed learning loop with ABF opinion
    const [dossier] = await db.select({ commune: dossiersTable.commune })
      .from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    if (dossier?.commune) {
      recordDecision(dossier.commune, decision === "favorable", [])
        .catch(e => logger.warn("[abf-avis] recordDecision failed:", e));
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "ABF_ACTION_FAILED" });
  }
});

// POST /dossiers/:id/decision — render a final ACCEPTE or REFUSE decision and feed the learning loop
router.post("/dossiers/:id/decision", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { decision, motivation, rejectedCategories } = req.body as {
      decision: "ACCEPTE" | "REFUSE";
      motivation?: string;
      rejectedCategories?: string[];
    };

    if (decision !== "ACCEPTE" && decision !== "REFUSE") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "decision doit être ACCEPTE ou REFUSE." });
    }

    const [dossier] = await db.select({ commune: dossiersTable.commune, status: dossiersTable.status })
      .from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    if (!dossier) return res.status(404).json({ error: "NOT_FOUND" });

    const newStatus = decision === "ACCEPTE" ? DOSSIER_STATUS.ACCEPTE : DOSSIER_STATUS.REFUSE;
    await WorkflowService.transitionStatus(
      id as string,
      newStatus,
      req.user!.userId,
      motivation || `Décision rendue : ${decision}`
    );

    // Feed learning loop — non-blocking
    if (dossier.commune) {
      recordDecision(
        dossier.commune,
        decision === "ACCEPTE",
        rejectedCategories ?? []
      ).catch(e => logger.warn("[decision] recordDecision failed:", e));
    }

    return res.json({ success: true, status: newStatus });
  } catch (err) {
    logger.error("[mairie/dossiers/:id/decision]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
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
    logger.error("[mairie/dossiers/:id/metadata]", err);
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
    logger.error("[mairie/dossiers/:id/re-analyze]", err);
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
    logger.error("[mairie/dossiers/:id/summary]", err);
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
    logger.error("[mairie/messages/:dossierId]", err);
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
    logger.error("[mairie/messages/:dossierId POST]", err);
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
  // Normalise: lowercase + strip accents for robust filename matching
  const normalise = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const content = normalise(text + " " + fileName);
  const fn = normalise(fileName);

  // ── Infrastructure & Réseaux ────────────────────────────────────────────────
  if (fn.includes("assainissement") || fn.includes("euep") || fn.includes("eu_ep") || fn.includes("eaux_usees")) {
    return { category: "INFRASTRUCTURE", subCategory: "NETWORKS", documentType: "Sanitation (EU/EP)", tags: ["Infrastructure", "Assainissement"] };
  }
  if (fn.includes("eau") || fn.includes("aep") || fn.includes("adduction")) {
    return { category: "INFRASTRUCTURE", subCategory: "NETWORKS", documentType: "Water & AEP", tags: ["Infrastructure", "Eau"] };
  }
  if (fn.includes("gaz") || fn.includes("energie") || fn.includes("erdf") || fn.includes("edf")) {
    return { category: "INFRASTRUCTURE", subCategory: "NETWORKS", documentType: "Energy/Gaz", tags: ["Infrastructure", "Energie"] };
  }
  if (fn.includes("dechets") || fn.includes("ordures") || fn.includes("collecte")) {
    return { category: "INFRASTRUCTURE", subCategory: "NETWORKS", documentType: "Waste management", tags: ["Infrastructure", "Dechets"] };
  }

  // ── Annexes & Risques ───────────────────────────────────────────────────────
  if (fn.includes("pprn") || content.includes("pprn")) {
    return { category: "ANNEXES", subCategory: "RISKS", documentType: "PPRN", tags: ["Risque", "PPRN"] };
  }
  if (fn.includes("pprt") || content.includes("pprt")) {
    return { category: "ANNEXES", subCategory: "RISKS", documentType: "PPRT", tags: ["Risque", "PPRT"] };
  }
  if (fn.includes("risque") || fn.includes("inondation") || fn.includes("alea") || fn.includes("ppri")) {
    return { category: "ANNEXES", subCategory: "RISKS", documentType: "Risk Map", tags: ["Risque"] };
  }
  if (fn.includes("bruit") || fn.includes("nuisance") || fn.includes("acoustique")) {
    return { category: "ANNEXES", subCategory: "RISKS", documentType: "Noise Exposure Plan", tags: ["Bruit"] };
  }
  if (fn.includes("abf") || fn.includes("monument") || fn.includes("patrimoine") || fn.includes("zppaup") || fn.includes("avap")) {
    return { category: "ANNEXES", subCategory: "HERITAGE", documentType: "ABF perimeter", tags: ["Patrimoine", "ABF"] };
  }

  // ── Documents Graphiques ────────────────────────────────────────────────────
  if (fn.includes("reglement_graphique") || fn.includes("plan_graphique") || fn.includes("plan_de_zonage") || fn.includes("zonage_graphique")) {
    return { category: "ZONING", subCategory: "PLANS", documentType: "Zoning map", tags: ["PLU", "Graphique"] };
  }
  if (fn.includes("secteur") || fn.includes("zoning")) {
    return { category: "ZONING", subCategory: "PLANS", documentType: "Zoning sectors", tags: ["PLU", "Zonage"] };
  }

  // ── Réglementaire PLU ───────────────────────────────────────────────────────
  if (fn.includes("padd") || content.includes("projet d'amenagement et de developpement")) {
    return { category: "REGULATORY", subCategory: "PLU", documentType: "PADD", tags: ["PLU", "PADD"] };
  }
  if (fn.includes("oap") || content.includes("orientation d'amenagement et de programmation")) {
    return { category: "REGULATORY", subCategory: "PLU", documentType: "OAP", tags: ["PLU", "OAP"] };
  }
  if (fn.includes("arrete") || fn.includes("deliberation") || fn.includes("decision")) {
    return { category: "REGULATORY", subCategory: "PLU", documentType: "Administrative Act", tags: ["PLU", "Acte"] };
  }
  // Any file mentioning PLU / règlement / plan local / etc.
  if (fn.includes("plu") || fn.includes("reglement") || fn.includes("plan_local") || fn.includes("rapport") ||
      content.includes("plan local d'urbanisme") || content.includes("reglement ecrit") || content.includes("zone u") || content.includes("zone a ")) {
    return { category: "REGULATORY", subCategory: "PLU", documentType: "Written regulation", tags: ["PLU"] };
  }

  // ── Content-based fallback ───────────────────────────────────────────────────
  if (content.includes("assainissement")) {
    return { category: "INFRASTRUCTURE", subCategory: "NETWORKS", documentType: "Sanitation (EU/EP)", tags: ["Infrastructure"] };
  }
  if (content.includes("risque") || content.includes("inondation")) {
    return { category: "ANNEXES", subCategory: "RISKS", documentType: "Risk Map", tags: ["Risque"] };
  }

  return {
    category: "REGULATORY",
    subCategory: "PLU",
    documentType: "Written regulation",
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
      logger.error("[pdf-parse]", e);
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

// POST /documents/analyze — upload files, extract text, classify, return staging data
router.post("/documents/analyze", upload.array("files", 70), async (req: AuthRequest, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "Fichiers requis." });

    const uploadsDir = path.resolve(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const staged = [];
    for (const file of files) {
      const tempId = `tmp-${file.filename}`;
      const tempPath = path.join(uploadsDir, tempId);
      fs.copyFileSync(file.path, tempPath);
      try { fs.unlinkSync(file.path); } catch {}

      const rawText = await extractTextFromFile(tempPath, file.mimetype);
      const suggestion = autoSuggestClassification(rawText, file.originalname);

      staged.push({
        tempId,
        fileName: file.originalname,
        category: suggestion.category,
        subCategory: suggestion.subCategory,
        documentType: suggestion.documentType,
        tags: suggestion.tags,
        textPreview: rawText.slice(0, 150).replace(/\s+/g, " ").trim(),
      });
    }

    return res.json(staged);
  } catch (err) {
    logger.error("[mairie/documents/analyze]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/documents/batch", upload.array("files", 70), async (req: AuthRequest, res) => {
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

    res.json({ batchId: batch.id, status: "processing", total: files.length, indexed: 0, skipped: 0, message: "Traitement par lot démarré." });

    // 2. Process Files Background
    setImmediate(() => { (async () => {
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
          // "auto" means let the classifier decide
          const category    = (!req.body.category    || req.body.category    === "auto") ? suggestion.category    : req.body.category;
          const subCategory = (!req.body.subCategory || req.body.subCategory === "auto") ? suggestion.subCategory : req.body.subCategory;
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
               logger.debug("[mairie/batch] Successfully processed RAG", { docId: doc.id });
             } catch (ragErr) {
               logger.error("[mairie/batch] RAG Processing failed", ragErr, { docId: doc.id });
               // We don't block the rest of the batch if RAG fails, but we should log it
               await db.update(baseIADocumentsTable).set({ status: "vectorization_failed" }).where(eq(baseIADocumentsTable.id, doc.id));
             }
          }

          results.push({ fileName: file.originalname, status: "indexed", id: doc.id });
          try { fs.unlinkSync(file.path); } catch {}
        }

        await db.update(baseIABatchesTable).set({ status: "completed" }).where(eq(baseIABatchesTable.id, batch.id));
        logger.info("[mairie/batch] Completed batch", { batchId: batch.id });
      } catch (err) {
        logger.error("[mairie/batch] Error in background process", err);
        await db.update(baseIABatchesTable).set({ status: "failed" }).where(eq(baseIABatchesTable.id, batch.id));
      }
    })().catch((err: any) => logger.error("[mairie/batch] Unhandled rejection", err)); });

    return;
  } catch (err) {
    logger.error("[mairie/documents/batch POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// POST /documents/batch/confirm — index pre-analyzed staged files (synchronous — returns real results)
router.post("/documents/batch/confirm", async (req: AuthRequest, res) => {
  try {
    const { commune, files } = req.body as {
      commune?: string;
      files: Array<{ tempId: string; fileName: string; category: string; subCategory: string; documentType: string; tags: string[] }>;
    };
    if (!files || files.length === 0) return res.status(400).json({ error: "Aucun fichier à confirmer." });

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    const targetCommune = commune || (assignedCommunes.length > 0 ? assignedCommunes[0] : undefined);

    const uploadsDir = path.resolve(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    let indexed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const staged of files) {
      const tempPath = path.join(uploadsDir, staged.tempId);

      if (!fs.existsSync(tempPath)) {
        errors.push(`${staged.fileName}: fichier temporaire introuvable`);
        continue;
      }

      try {
        const content = fs.readFileSync(tempPath);
        const hash = createHash("sha256").update(content).digest("hex");

        // Check for duplicate in baseIADocumentsTable by hash
        const [existingBase] = await db.select({ id: baseIADocumentsTable.id })
          .from(baseIADocumentsTable)
          .where(eq(baseIADocumentsTable.fileHash, hash)).limit(1);
        if (existingBase) {
          // Re-classify the existing townHallDocument with the user's current selection
          await db.update(townHallDocumentsTable).set({
            category: staged.category,
            subCategory: staged.subCategory,
            documentType: staged.documentType,
            tags: staged.tags,
            commune: targetCommune || null,
          }).where(and(
            eq(townHallDocumentsTable.userId, req.user!.userId),
            eq(townHallDocumentsTable.fileName, staged.fileName),
          ));
          try { fs.unlinkSync(tempPath); } catch {}
          indexed++; // count as re-classified, not skipped
          continue;
        }

        const rawText = await extractTextFromFile(tempPath, "application/pdf");

        const [doc] = await db.insert(townHallDocumentsTable).values({
          userId: req.user!.userId,
          commune: targetCommune || null,
          title: staged.fileName,
          fileName: staged.fileName,
          rawText,
          category: staged.category,
          subCategory: staged.subCategory,
          documentType: staged.documentType,
          tags: staged.tags,
          zone: null,
        }).returning();

        const [batch] = await db.insert(baseIABatchesTable).values({ createdBy: req.user!.userId, status: "processing" }).returning();

        const [baseDoc] = await db.insert(baseIADocumentsTable).values({
          batchId: batch.id,
          municipalityId: targetCommune || null,
          fileName: staged.fileName,
          fileHash: hash,
          status: "indexed",
          type: staged.subCategory === "PLU" ? "plu" : "other",
          category: staged.category,
          subCategory: staged.subCategory,
          tags: staged.tags,
        }).returning();

        // RAG vectorisation (non-blocking — failure doesn't abort the file)
        if (targetCommune) {
          const dt = staged.documentType.toLowerCase();
          let canonicalType: any = "other";
          if (dt.includes("regulation") || dt.includes("reglement")) canonicalType = "plu_reglement";
          else if (dt.includes("padd") || dt.includes("oap")) canonicalType = "oap";
          else if (dt.includes("annexe")) canonicalType = "plu_annexe";
          try {
            await processDocumentForRAG(baseDoc.id, targetCommune, rawText, { document_type: canonicalType, commune: targetCommune, zone: null });
            await db.update(baseIABatchesTable).set({ status: "completed" }).where(eq(baseIABatchesTable.id, batch.id));
          } catch (ragErr: any) {
            logger.error("[mairie/confirm] RAG failed", ragErr, { fileName: staged.fileName });
            await db.update(baseIADocumentsTable).set({ status: "vectorization_failed" }).where(eq(baseIADocumentsTable.id, baseDoc.id));
            await db.update(baseIABatchesTable).set({ status: "failed" }).where(eq(baseIABatchesTable.id, batch.id));
            errors.push(`${staged.fileName}: indexation IA échouée — ${ragErr?.message ?? "erreur inconnue"}`);
          }
        }

        const persistentPath = path.join(uploadsDir, `${doc.id}${path.extname(staged.fileName)}`);
        try { fs.renameSync(tempPath, persistentPath); } catch { try { fs.unlinkSync(tempPath); } catch {} }

        indexed++;
      } catch (err: any) {
        logger.error("[mairie/confirm] file error", err, { tempId: staged.tempId });
        errors.push(`${staged.fileName}: ${err?.message ?? "erreur inconnue"}`);
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }

    return res.json({ status: "done", indexed, skipped, errors, total: files.length });
  } catch (err) {
    logger.error("[mairie/documents/batch/confirm]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "Erreur inconnue" });
  }
});

// GET /documents/batch/:id — poll batch ingestion progress
router.get("/documents/batch/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [batch] = await db.select().from(baseIABatchesTable)
      .where(eq(baseIABatchesTable.id, id))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND", message: "Batch introuvable." });

    // Count per-document statuses
    const docs = await db.select({
      id: baseIADocumentsTable.id,
      fileName: baseIADocumentsTable.fileName,
      status: baseIADocumentsTable.status,
      errorMessage: baseIADocumentsTable.errorMessage,
    }).from(baseIADocumentsTable)
      .where(eq(baseIADocumentsTable.batchId, id));

    const total   = docs.length;
    const indexed = docs.filter(d => d.status === "indexed").length;
    const failed  = docs.filter(d => d.status === "failed" || d.status === "vectorization_failed").length;
    const pending = total - indexed - failed;

    return res.json({
      batchId: batch.id,
      status: batch.status,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      progress: { total, indexed, failed, pending },
      documents: docs,
    });
  } catch (err) {
    logger.error("[mairie/documents/batch GET]", err);
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

    setImmediate(() => { (async () => {
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
             logger.debug("[mairie/upload] Successfully processed RAG", { docId: doc.id });
           } catch (ragErr) {
             logger.error("[mairie/upload] RAG vectorization failed", ragErr, { docId: doc.id });
           }
        }
        
        // Store file persistently for Vision (Phase 4)
        const persistentPath = path.join(process.cwd(), "uploads", `${doc.id}${path.extname(file.originalname)}`);
        try {
          fs.copyFileSync(file.path, persistentPath);
          logger.debug("[VisionStorage] File stored", { path: persistentPath });
        } catch (copyErr) {
          logger.error("[VisionStorage] Failed to store file", copyErr);
        }

        logger.info("[mairie/upload] Successfully processed", { fileName: file.originalname });
        try { fs.unlinkSync(file.path); } catch {}
      } catch (err) {
        logger.error("[mairie/upload] Background error", err);
      }
    })().catch((err: any) => logger.error("[mairie/upload] Unhandled rejection", err)); });

    return;
  } catch(err) {
    logger.error("[mairie/documents POST]", err);
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

/**
 * GET /gpu/probe?insee=37113
 * Public endpoint (no auth) — shows raw zone-urba + writingMaterials for debugging.
 */
router.get("/gpu/probe", async (req, res) => {
  const insee = (req.query.insee as string || "").trim();
  if (!insee) return res.status(400).json({ error: "insee param required" });
  const diagnostic = await GPUProviderService.diagnose(insee);
  return res.json({ insee, diagnostic });
});

router.post("/gpu/sync", async (req: AuthRequest, res) => {
  try {
    // 1. Resolve INSEE logic (Dynamic & Robust)
    let insee: string | null = null;
    const commune = (req.query.commune as string || "").trim();
    if (!commune) return res.status(400).json({ error: "Commune requise" });

    logger.info("[GPU] Starting sync", { commune });

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

    // C. DB Resolution — check municipalitySettings and communesTable
    if (!insee) {
      const [settings] = await db.select().from(municipalitySettingsTable)
        .where(or(
          eq(municipalitySettingsTable.commune, commune),
          eq(sql`lower(${municipalitySettingsTable.commune})`, commune.toLowerCase())
        )).limit(1);
      insee = settings?.inseeCode || null;
    }

    // C2. communesTable lookup (used by admin to register communes with INSEE)
    if (!insee) {
      const [communeRow] = await db.select({ inseeCode: communesTable.inseeCode })
        .from(communesTable)
        .where(or(
          eq(communesTable.name, commune),
          eq(sql`lower(${communesTable.name})`, commune.toLowerCase())
        )).limit(1);
      insee = communeRow?.inseeCode || null;
      if (insee) logger.debug("[GPU] Resolved INSEE from communesTable", { commune, insee });
    }

    // D. Dynamic Geocoding Resolution (FINAL FALLBACK)
    let geocodedLon: number | null = null;
    let geocodedLat: number | null = null;
    if (!insee) {
      logger.debug("[GPU] Dynamic resolution via geocoding", { commune });
      const geocodeResults = await geocodeAddress(commune, "municipality");
      if (geocodeResults.length > 0) {
        insee = geocodeResults[0].inseeCode || null;
        geocodedLon = geocodeResults[0].lng ?? null;
        geocodedLat = geocodeResults[0].lat ?? null;
        logger.info("[GPU] Geocoding resolved INSEE", { commune, insee, lon: geocodedLon, lat: geocodedLat });
        // Cache in municipalitySettings for future lookups
        if (insee) {
          await db.insert(municipalitySettingsTable).values({ commune, inseeCode: insee })
            .onConflictDoUpdate({ target: municipalitySettingsTable.commune, set: { inseeCode: insee } });
        }
      }
    }

    if (!insee) {
      return res.status(400).json({
        error: "COMMUNE_NOT_RESOLVED",
        message: `Impossible de résoudre le code INSEE pour '${commune}'. Spécifiez le code INSEE à 5 chiffres directement.`
      });
    }

    logger.debug("[GPU] Final INSEE code resolved", { insee });

    // 1. Fetch all documents — try INSEE first, fall back to coordinates if available
    let allDocs = await GPUProviderService.getDocumentsByInsee(insee);
    if (allDocs.length === 0 && geocodedLon !== null && geocodedLat !== null) {
      logger.warn("[GPU] INSEE search returned 0 docs — trying coordinate fallback", { lon: geocodedLon, lat: geocodedLat });
      allDocs = await GPUProviderService.getDocumentsByCoords(geocodedLon, geocodedLat);
    }

    // 2. Keep approved/active documents — GPU uses multiple status values for "in force"
    const ACTIVE_STATUSES = ["document.production", "document.opposable", "document.approuve", "document.en_vigueur", "production", "opposable", "approuve"];
    let activeDocs = allDocs.filter(d => d.status && ACTIVE_STATUSES.some(s => d.status.toLowerCase().includes(s.replace("document.", ""))));
    // If nothing matches known statuses, take all documents (the API `active=true` param already filters)
    if (activeDocs.length === 0 && allDocs.length > 0) {
      logger.warn("[GPU] No docs matched known active statuses — ingesting all returned docs", { statuses: allDocs.map(d => d.status) });
      activeDocs = allDocs;
    }
    logger.info("[GPU] Active documents", { active: activeDocs.length, total: allDocs.length });

    if (activeDocs.length === 0) {
      // Return diagnostic info so the caller can see what the GPU API actually returned
      const diagnostic = await GPUProviderService.diagnose(insee);
      return res.json({ success: true, count: 0, documents: [], insee, message: `Aucun document trouvé sur le GPU pour INSEE ${insee}.`, diagnostic });
    }

    let count = 0;
    const results = [];
    const uploadDir = path.resolve(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    for (const gpuDoc of activeDocs) {
      logger.debug("[GPU] Processing doc", { docId: gpuDoc.id, name: gpuDoc.originalName });

      // 3. Fetch the file list for this document
      const allFiles = await GPUProviderService.getFilesByDocumentId(gpuDoc.id);
      logger.debug("[GPU] Total files in document", { count: allFiles.length });

      // 4. Filter to regulatory-relevant files
      const criticalFiles = GPUProviderService.filterCriticalFiles(allFiles);
      logger.debug("[GPU] Critical files to ingest", { count: criticalFiles.length });

      for (const file of criticalFiles) {
        const note = await GPUProviderService.generateExplanatoryNote(file.name, file.title);

        // 5. Download the PDF via curl (adding -L to follow redirects)
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const destPath = path.join(uploadDir, safeFilename);
        let downloadOk = false;
        try {
          const curlDownload = `curl -s -L -k --max-time 60 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o "${destPath}" "${file.url}"`;
          execSync(curlDownload, { timeout: 65000 });
          const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
          if (size > 5000) {
            downloadOk = true;
            logger.debug("[GPU] Downloaded file", { file: safeFilename, bytes: size });
          } else {
            logger.warn("[GPU] Download suspicious — file too small, skipping text extraction", { bytes: size, file: safeFilename });
          }
        } catch (downloadErr: any) {
          logger.error("[GPU] Download failed", downloadErr, { file: file.name });
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

        // 6b. Extract text from the downloaded file
        let rawText = "";
        if (downloadOk && fs.existsSync(destPath)) {
          try {
            rawText = await extractTextFromFile(destPath, "application/pdf");
            logger.debug("[GPU] Text extracted", { file: safeFilename, chars: rawText.length });
          } catch (textErr) {
            logger.warn("[GPU] Text extraction failed", { file: safeFilename, err: textErr });
          }
        }

        // 6c. File hash for dedup
        let fileHash = "";
        try {
          const buf = fs.readFileSync(destPath);
          fileHash = createHash("sha256").update(buf).digest("hex");
        } catch {}

        // 7. Upsert into townHallDocumentsTable (dedup by fileName + commune)
        const existing = await db.select({ id: townHallDocumentsTable.id })
          .from(townHallDocumentsTable)
          .where(and(
            eq(townHallDocumentsTable.userId, req.user!.userId),
            eq(townHallDocumentsTable.fileName, safeFilename),
            eq(townHallDocumentsTable.commune, commune)
          ))
          .limit(1);

        if (existing.length > 0) {
          logger.debug("[GPU] Already in townHallDocuments, skipping", { file: safeFilename });
          continue;
        }

        const [insertedDoc] = await db.insert(townHallDocumentsTable).values({
          userId: req.user!.userId,
          commune: commune,
          title: file.name,
          fileName: safeFilename,
          rawText,
          category,
          subCategory,
          documentType,
          explanatoryNote: note,
          tags: [],
          isRegulatory: true,
          isOpposable: true,
        }).returning();

        // 8. Register in baseIADocumentsTable and embed into base_ia_embeddings
        //    All document types are registered — graphical/map files get a synthetic
        //    description so the context builder can find and reference them.
        if (insee) {
          try {
            // Determine document_type for Base IA metadata
            let baseIADocType: "plu_reglement" | "oap" | "plu_annexe" | "other" = "other";
            if (documentType === "Written regulation") baseIADocType = "plu_reglement";
            else if (documentType === "OAP" || documentType === "PADD") baseIADocType = "oap";
            else if (category === "ANNEXES") baseIADocType = "plu_annexe";

            const isMapOrGraphic = documentType === "Zoning map" ||
              safeFilename.toLowerCase().includes("graphique") ||
              safeFilename.toLowerCase().includes("zonage") ||
              safeFilename.toLowerCase().includes("carte");

            const sourceAuthority =
              baseIADocType === "plu_reglement" ? 9 :
              baseIADocType === "oap"           ? 8 :
              isMapOrGraphic                    ? 7 :   // Maps: high authority as spatial reference
              baseIADocType === "plu_annexe"    ? 6 : 5;

            const poolId = `${insee}-PLU-ACTIVE`;

            // Check if already indexed in Base IA (by file hash)
            const existingBaseIA = fileHash
              ? await db.select({ id: baseIADocumentsTable.id })
                  .from(baseIADocumentsTable)
                  .where(eq(baseIADocumentsTable.fileHash, fileHash))
                  .limit(1)
              : [];

            if (existingBaseIA.length === 0) {
              // For graphical/map files with no extractable text: create a synthetic
              // description chunk so the AI knows the document exists and can reference it.
              let ingestText = rawText;
              if (rawText.length < 200 && downloadOk) {
                if (isMapOrGraphic) {
                  ingestText = [
                    `[Document graphique — Plan de zonage PLU]`,
                    `Commune : ${commune} (INSEE: ${insee})`,
                    `Fichier : ${file.name}`,
                    `Type : ${documentType || "Plan graphique"}`,
                    req.query.zone ? `Zone : ${req.query.zone}` : "",
                    `Statut : Document opposable — Source officielle GPU`,
                    note ? `Description : ${note}` : "",
                    `Ce document est le plan graphique de zonage de la commune. Il délimite les zones (U, AU, N, A) et leurs sous-zones. Se référer au règlement écrit pour les règles applicables par zone.`,
                  ].filter(Boolean).join("\n");
                } else {
                  // Non-graphic PDF with little text — try Vision OCR (pdftoppm → GPT-4o)
                  try {
                    ingestText = await VisionService.extractTextFromScannedPDF(destPath, 5);
                    if (ingestText.length > 100) {
                      logger.info("[GPU] Vision OCR succeeded for scanned PDF", { file: safeFilename, chars: ingestText.length });
                    } else {
                      ingestText = "";
                    }
                  } catch (visionErr) {
                    logger.warn("[GPU] Vision OCR failed for low-text PDF", { file: safeFilename });
                  }
                }
              }

              if (ingestText.length > 50) {
                const syncBatchId = crypto.randomUUID();
                const [baseIADoc] = await db.insert(baseIADocumentsTable).values({
                  batchId: syncBatchId,
                  municipalityId: insee,
                  zoneCode: req.query.zone as string || null,
                  category: "REGULATORY",
                  subCategory: isMapOrGraphic ? "PLANS" : "PLU",
                  type: baseIADocType === "plu_reglement" || baseIADocType === "plu_annexe" ? "plu" :
                        baseIADocType === "oap" ? "oap" : "other",
                  fileName: safeFilename,
                  fileHash: fileHash || null,
                  status: "parsing",
                  rawText: ingestText,
                }).returning();

                await processDocumentForRAG(baseIADoc.id, insee, ingestText, {
                  document_id: baseIADoc.id,
                  document_type: isMapOrGraphic ? "plu_annexe" : baseIADocType,
                  pool_id: poolId,
                  status: "active",
                  commune: insee,          // always store INSEE code, not display name
                  zone: req.query.zone as string || undefined,
                  source_authority: sourceAuthority,
                } as any);

                await db.update(baseIADocumentsTable)
                  .set({ status: "indexed" })
                  .where(eq(baseIADocumentsTable.id, baseIADoc.id));

                // Also update townHallDocuments with the text we have
                if (ingestText !== rawText && insertedDoc) {
                  await db.update(townHallDocumentsTable)
                    .set({ rawText: ingestText })
                    .where(eq(townHallDocumentsTable.id, insertedDoc.id));
                }

                logger.info("[GPU] ✅ Indexed into Base IA", {
                  file: safeFilename, pool: poolId,
                  type: isMapOrGraphic ? "map/graphic" : baseIADocType,
                  chars: ingestText.length,
                });
              } else {
                logger.warn("[GPU] Skipping embed — no usable text even after fallbacks", { file: safeFilename });
              }
            } else {
              logger.debug("[GPU] Already in Base IA (hash match), skipping embed", { file: safeFilename });
            }
          } catch (ragErr) {
            logger.error("[GPU] Base IA ingestion failed", ragErr, { file: safeFilename });
            // Don't abort — townHallDocuments record already saved
          }
        }

        count++;
        results.push({ name: file.title || file.name, fileName: safeFilename });
      }
    }

    logger.info("[GPU] Sync complete", { count, commune });
    return res.json({ success: true, count, documents: results });
  } catch (err) {
    logger.error("[mairie/gpu/sync]", err);
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
      logger.warn("[mairie/view] Document record or filename not found", { docId: id });
      return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    }

    // 2. Locate the file in physical storage (uploads/)
    const uploadDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.join(uploadDir, doc.fileName);
    
    if (!fs.existsSync(filePath)) {
      logger.error("[mairie/view] Physical file missing", null, { fileName: doc.fileName });
      return res.status(404).json({ error: "FILE_NOT_FOUND_ON_DISK" });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    return fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    logger.error("[mairie/view] Critical error", err, { docId: req.params.id });
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
    logger.error("[mairie/prompts GET]", err);
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
    logger.error("[mairie/prompts POST]", err);
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
    logger.error("[mairie/settings GET]", err);
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
    logger.error("[mairie/settings POST]", err);
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
    logger.error("[mairie/dossiers DELETE]", err);
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
    setImmediate(() => { (async () => {
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
        
        logger.info("[Vision] Analysis completed", { docId: id });
        return;
      } catch (visionErr: any) {
        logger.error("[Vision] Analysis failed", visionErr, { docId: id });
        await db.update(documentReviewsTable)
          .set({ 
            status: "failed", 
            failureReason: `Échec de l'analyse vision: ${visionErr.message}`,
            updatedAt: new Date()
          })
          .where(eq(documentReviewsTable.id, id as any));
      }
    })().catch((err: any) => logger.error("[mairie/vision] Unhandled rejection", err)); });

    return responseSent;
  } catch (err) {
    logger.error("[mairie/vision POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── BASE IA BACKFILL & COVERAGE ─────────────────────────────────────────────

/**
 * POST /gpu/reindex?commune=xxx
 * Backfills all existing town_hall_documents records that have no Base IA
 * embeddings yet (rawText empty or never indexed). Runs in background.
 * Accepts optional ?commune= to scope to a single commune.
 */
router.post("/gpu/reindex", async (req: AuthRequest, res) => {
  try {
    const commune = (req.query.commune as string || "").trim() || null;

    // Resolve to a set of commune values to query by
    const whereClause = commune
      ? or(
          eq(townHallDocumentsTable.commune, commune),
          eq(sql`lower(${townHallDocumentsTable.commune})`, commune.toLowerCase())
        )
      : undefined;

    const docs = await db.select({
      id: townHallDocumentsTable.id,
      commune: townHallDocumentsTable.commune,
      fileName: townHallDocumentsTable.fileName,
      rawText: townHallDocumentsTable.rawText,
      documentType: townHallDocumentsTable.documentType,
      category: townHallDocumentsTable.category,
      subCategory: townHallDocumentsTable.subCategory,
      isRegulatory: townHallDocumentsTable.isRegulatory,
    }).from(townHallDocumentsTable)
      .where(whereClause);

    res.json({
      message: `Reindex démarré en arrière-plan pour ${docs.length} documents.`,
      total: docs.length,
      commune: commune || "toutes",
    });

    setImmediate(() => { (async () => {
      let indexed = 0;
      let skipped = 0;
      let failed = 0;

      for (const doc of docs) {
        try {
          if (!doc.commune) { skipped++; continue; }

          // Resolve INSEE for this commune
          let insee: string | null = null;
          if (/^\d{5}$/.test(doc.commune)) {
            insee = doc.commune;
          } else {
            const [settings] = await db.select({ inseeCode: municipalitySettingsTable.inseeCode })
              .from(municipalitySettingsTable)
              .where(or(
                eq(municipalitySettingsTable.commune, doc.commune),
                eq(sql`lower(${municipalitySettingsTable.commune})`, doc.commune.toLowerCase())
              )).limit(1);
            if (settings?.inseeCode) {
              insee = settings.inseeCode;
            } else {
              // communesTable fallback
              const [communeRow] = await db.select({ inseeCode: communesTable.inseeCode })
                .from(communesTable)
                .where(or(
                  eq(communesTable.name, doc.commune),
                  eq(sql`lower(${communesTable.name})`, doc.commune.toLowerCase())
                )).limit(1);
              if (communeRow?.inseeCode) {
                insee = communeRow.inseeCode;
              } else {
                // Geocoding fallback
                const geo = await geocodeAddress(doc.commune, "municipality");
                if (geo.length > 0) insee = geo[0].inseeCode || null;
              }
            }
          }

          if (!insee) {
            logger.warn("[Reindex] Could not resolve INSEE for commune, skipping", { commune: doc.commune, docId: doc.id });
            skipped++;
            continue;
          }

          // Check if already indexed in Base IA
          const alreadyIndexed = await db.select({ id: baseIADocumentsTable.id })
            .from(baseIADocumentsTable)
            .where(
              // Match by fileName + municipalityId (no hash available for legacy records)
              and(
                eq(baseIADocumentsTable.municipalityId, insee),
                eq(baseIADocumentsTable.fileName, doc.fileName || "")
              )
            ).limit(1);

          if (alreadyIndexed.length > 0) {
            skipped++;
            continue;
          }

          // Get or re-extract raw text
          let rawText = doc.rawText || "";
          if (rawText.length < 100) {
            const uploadDir = path.resolve(process.cwd(), "uploads");
            const filePath = path.join(uploadDir, doc.fileName || "");
            if (fs.existsSync(filePath)) {
              try {
                rawText = await extractTextFromFile(filePath, "application/pdf");
                // Persist back to townHallDocuments
                if (rawText.length > 0) {
                  await db.update(townHallDocumentsTable)
                    .set({ rawText })
                    .where(eq(townHallDocumentsTable.id, doc.id));
                }
              } catch (e) {
                logger.warn("[Reindex] Text extraction failed", { file: doc.fileName });
              }
            }
          }

          // Determine type metadata
          const isMapOrGraphic = (doc.documentType || "").toLowerCase().includes("zoning") ||
            (doc.fileName || "").toLowerCase().includes("graphique") ||
            (doc.fileName || "").toLowerCase().includes("zonage");

          let baseIADocType: "plu_reglement" | "oap" | "plu_annexe" | "other" = "other";
          if ((doc.documentType || "").toLowerCase().includes("regulation") ||
              (doc.documentType || "").toLowerCase().includes("reglement")) baseIADocType = "plu_reglement";
          else if ((doc.documentType || "").toLowerCase().includes("oap") ||
                   (doc.documentType || "").toLowerCase().includes("padd")) baseIADocType = "oap";
          else if (doc.category === "ANNEXES") baseIADocType = "plu_annexe";

          // Synthetic description for maps with no text
          let ingestText = rawText;
          if (rawText.length < 100 && isMapOrGraphic) {
            ingestText = [
              `[Document graphique — Plan de zonage PLU]`,
              `Commune : ${doc.commune} (INSEE: ${insee})`,
              `Fichier : ${doc.fileName}`,
              `Type : ${doc.documentType || "Plan graphique"}`,
              `Statut : Document opposable — Source officielle`,
            ].join("\n");
          }

          if (ingestText.length < 50) { skipped++; continue; }

          const sourceAuthority =
            baseIADocType === "plu_reglement" ? 9 :
            baseIADocType === "oap"           ? 8 :
            isMapOrGraphic                    ? 7 :
            baseIADocType === "plu_annexe"    ? 6 : 5;

          const poolId = `${insee}-PLU-ACTIVE`;

          const reindexBatchId = crypto.randomUUID();
          const [baseIADoc] = await db.insert(baseIADocumentsTable).values({
            batchId: reindexBatchId,
            municipalityId: insee,
            category: "REGULATORY",
            subCategory: isMapOrGraphic ? "PLANS" : "PLU",
            type: baseIADocType === "plu_reglement" || baseIADocType === "plu_annexe" ? "plu" :
                  baseIADocType === "oap" ? "oap" : "other",
            fileName: doc.fileName || "",
            status: "parsing",
            rawText: ingestText,
          }).returning();

          await processDocumentForRAG(baseIADoc.id, insee, ingestText, {
            document_id: baseIADoc.id,
            document_type: isMapOrGraphic ? "plu_annexe" : baseIADocType,
            pool_id: poolId,
            status: "active",
            commune: insee,          // always store INSEE code, not display name
            source_authority: sourceAuthority,
          } as any);

          await db.update(baseIADocumentsTable)
            .set({ status: "indexed" })
            .where(eq(baseIADocumentsTable.id, baseIADoc.id));

          indexed++;
          logger.info("[Reindex] ✅ Indexed", { docId: doc.id, file: doc.fileName, pool: poolId });
        } catch (e) {
          failed++;
          logger.error("[Reindex] Failed to index doc", e, { docId: doc.id });
        }
      }

      logger.info("[Reindex] Complete", { indexed, skipped, failed, total: docs.length });
    })().catch((e: any) => logger.error("[Reindex] Unhandled rejection", e)); });

    return;
  } catch (err) {
    logger.error("[mairie/gpu/reindex]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/**
 * GET /base-ia/coverage?commune=xxx
 * Returns chunk counts per zone for a commune so you can verify
 * the Base IA has enough content before running an analysis.
 */
router.get("/base-ia/coverage", async (req: AuthRequest, res) => {
  try {
    const commune = (req.query.commune as string || "").trim();
    if (!commune) return res.status(400).json({ error: "commune requis" });

    // Resolve INSEE
    let insee: string | null = /^\d{5}$/.test(commune) ? commune : null;
    if (!insee) {
      const [settings] = await db.select({ inseeCode: municipalitySettingsTable.inseeCode })
        .from(municipalitySettingsTable)
        .where(or(
          eq(municipalitySettingsTable.commune, commune),
          eq(sql`lower(${municipalitySettingsTable.commune})`, commune.toLowerCase())
        )).limit(1);
      insee = settings?.inseeCode || null;
    }
    if (!insee) {
      const geo = await geocodeAddress(commune, "municipality");
      if (geo.length > 0) insee = geo[0].inseeCode || null;
    }

    if (!insee) {
      return res.status(400).json({ error: "COMMUNE_NOT_RESOLVED", message: `Impossible de résoudre le code INSEE pour '${commune}'.` });
    }

    // Count Base IA documents and embeddings
    const docs = await db.select({
      id: baseIADocumentsTable.id,
      fileName: baseIADocumentsTable.fileName,
      type: baseIADocumentsTable.type,
      status: baseIADocumentsTable.status,
      zoneCode: baseIADocumentsTable.zoneCode,
    }).from(baseIADocumentsTable)
      .where(eq(baseIADocumentsTable.municipalityId, insee));

    // Count embeddings per zone from base_ia_embeddings
    const embeddingRows = await db.execute(
      sql`SELECT metadata->>'zone' AS zone, COUNT(*) AS chunk_count
          FROM base_ia_embeddings
          WHERE municipality_id = ${insee}
          GROUP BY metadata->>'zone'
          ORDER BY chunk_count DESC`
    );

    const totalChunks = (embeddingRows.rows as any[]).reduce((sum, r) => sum + Number(r.chunk_count), 0);
    const indexed = docs.filter(d => d.status === "indexed").length;
    const failed  = docs.filter(d => d.status === "failed" || d.status === "vectorization_failed").length;

    return res.json({
      commune,
      insee,
      documents: { total: docs.length, indexed, failed },
      embeddings: {
        totalChunks,
        byZone: (embeddingRows.rows as any[]).map(r => ({
          zone: r.zone || "(global)",
          chunks: Number(r.chunk_count),
        })),
      },
      ready: totalChunks > 0,
      documentList: docs,
    });
  } catch (err) {
    logger.error("[mairie/base-ia/coverage]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
