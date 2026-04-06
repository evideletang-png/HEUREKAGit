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
import { townHallUploadSessionsTable } from "../../../../packages/db/src/schema/townHallUploadSessions.js";
import { createHash } from "crypto";
import { logger } from "../utils/logger.js";
import { processDocumentForRAG } from "../services/baseIAIngestion.js";
import { generateGlobalSynthesis, type ExtractedDocumentData } from "../services/pluAnalysis.js";
import { persistRegulatoryUnitsForDocument } from "../services/regulatoryUnitService.js";
import { persistRegulatoryZoneSectionsForDocument } from "../services/regulatoryZoneSectionService.js";
import { authenticate, requireMairie, type AuthRequest } from "../middlewares/authenticate.js";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { VisionService } from "../services/visionService.js";
import { orchestrateDossierAnalysis } from "../services/orchestrator.js";
import { MessagingService } from "../services/messagingService.js";
import { WorkflowService, DOSSIER_STATUS } from "../services/workflowService.js";
import { DocumentGenerationService } from "../services/documentGenerationService.js";
import { AUTHORITY_POLICY } from "@workspace/ai-core";
import { assessExtractedTextQuality, hasUsableExtractedText, isTextLikelyGarbled, normalizeExtractedText, repairExtractedText, scoreTextQuality } from "../services/textQualityService.js";
import { execFileSync } from "child_process";

// dossierEventsTable is now imported above

// municipalitySettingsTable is now imported directly from @workspace/db

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRIMARY_UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
const LEGACY_UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const TOWN_HALL_UPLOAD_DIRS = Array.from(new Set([PRIMARY_UPLOADS_DIR, LEGACY_UPLOADS_DIR]));
const TOWN_HALL_UPLOAD_SESSION_DIR = path.join(PRIMARY_UPLOADS_DIR, ".town-hall-upload-sessions");
const RESUMABLE_UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

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

function canAccessCommune(role: string | null | undefined, assignedCommunes: string[], commune: string | null | undefined): boolean {
  if (role === "admin" || role === "super_admin") return true;
  const normalized = (commune || "").toLowerCase().trim();
  return !!normalized && assignedCommunes.includes(normalized);
}

function parseDocumentTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map(tag => tag.trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).map(tag => tag.trim()).filter(Boolean);
    } catch {
      return raw.split(",").map(tag => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

function authorityForCanonicalType(canonicalType: string): number {
  if (canonicalType === "plu_reglement") return AUTHORITY_POLICY.REGULATION_LOCAL;
  if (canonicalType === "oap") return AUTHORITY_POLICY.PLANNING_OAP;
  if (canonicalType === "plu_annexe") return AUTHORITY_POLICY.ANNEX_TECHNICAL;
  if (canonicalType === "padd") return AUTHORITY_POLICY.ADMIN_GUIDE;
  return AUTHORITY_POLICY.UNKNOWN;
}

function inferCanonicalDocumentType(documentType: string | null | undefined, category?: string | null, subCategory?: string | null) {
  const hint = [documentType || "", category || "", subCategory || ""].join(" ").toLowerCase();
  if (hint.includes("padd")) return "other";
  if (hint.includes("oap") || hint.includes("orientation")) return "oap";
  if (hint.includes("plan") || hint.includes("graphique") || hint.includes("carte") || hint.includes("zonage") || hint.includes("annexe")) {
    return "plu_annexe";
  }
  if (hint.includes("reglement") || hint.includes("règlement") || hint.includes("plu")) {
    return "plu_reglement";
  }
  return "other";
}

function mapCanonicalTypeToBaseIAType(canonicalType: string) {
  if (canonicalType === "plu_reglement" || canonicalType === "plu_annexe") return "plu";
  if (canonicalType === "oap") return "oap";
  return "other";
}

function isCanonicalTypeOpposable(canonicalType: string) {
  return canonicalType === "plu_reglement" || canonicalType === "plu_annexe";
}

function isRegulatoryLikeDocument(documentType: string | null | undefined, category?: string | null, subCategory?: string | null) {
  const hint = [documentType || "", category || "", subCategory || ""].join(" ").toLowerCase();
  return hint.includes("plu")
    || hint.includes("reglement")
    || hint.includes("règlement")
    || hint.includes("zonage")
    || hint.includes("annexe")
    || hint.includes("oap")
    || hint.includes("orientation")
    || hint.includes("padd");
}

async function resolveInseeCode(commune: string): Promise<string | null> {
  const value = (commune || "").trim();
  if (!value) return null;
  if (/^\d{5}$/.test(value)) return value;

  const [settings] = await db.select({ inseeCode: municipalitySettingsTable.inseeCode })
    .from(municipalitySettingsTable)
    .where(or(
      eq(municipalitySettingsTable.commune, value),
      eq(sql`lower(${municipalitySettingsTable.commune})`, value.toLowerCase())
    )).limit(1);
  if (settings?.inseeCode) return settings.inseeCode;
  return null;
}

async function resolveAuthorizedTownHallCommune(userId: string, requestedCommune?: string) {
  const [currentUser] = await db.select({ role: usersTable.role, communes: usersTable.communes })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const assignedCommunes = parseCommunes(currentUser?.communes);
  const targetCommune = requestedCommune || assignedCommunes[0];

  if (!targetCommune) {
    return {
      ok: false as const,
      status: 400,
      error: { error: "BAD_REQUEST", message: "Commune requise pour indexer dans la Base IA." }
    };
  }

  if (currentUser?.role !== "admin" && !assignedCommunes.some(c => c.toLowerCase() === targetCommune.toLowerCase())) {
    return {
      ok: false as const,
      status: 403,
      error: { error: "FORBIDDEN", message: "Vous n'avez pas accès à cette commune." }
    };
  }

  return {
    ok: true as const,
    currentUser,
    assignedCommunes,
    targetCommune,
  };
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

interface TownHallExtractionContext {
  originalName?: string;
  documentType?: string | null;
  category?: string | null;
  subCategory?: string | null;
}

function normalizeTownHallClassification(input: {
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
}) {
  const category = (input.category || "").trim();
  const subCategory = (input.subCategory || "").trim();
  const documentType = (input.documentType || "").trim();

  if (!category || category === "OTHER") {
    return {
      category: "ANNEXES",
      subCategory: "MISC",
      documentType: documentType || "Other",
    };
  }

  if (category === "ANNEXES" && !subCategory) {
    return {
      category,
      subCategory: "MISC",
      documentType: documentType || "Other",
    };
  }

  return {
    category,
    subCategory,
    documentType,
  };
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
    category: "ANNEXES",
    subCategory: "MISC",
    documentType: "Other",
    tags: []
  };
}

// ─── PLU KNOWLEDGE BASE ───────────────────────────────────────────────────────

function shouldRunRegulatoryVision(context: TownHallExtractionContext, currentText: string): boolean {
  const hint = [
    context.originalName || "",
    context.documentType || "",
    context.category || "",
    context.subCategory || "",
    currentText.slice(0, 400),
  ].join(" ").toLowerCase();

  return currentText.trim().length < 400
    || hint.includes("zonage")
    || hint.includes("zoning")
    || hint.includes("plan")
    || hint.includes("graphique")
    || hint.includes("carte")
    || hint.includes("schéma")
    || hint.includes("schema")
    || hint.includes("croquis")
    || hint.includes("oap");
}

async function extractTextFromFile(filePath: string, mimetype: string, context: TownHallExtractionContext = {}): Promise<string> {
  if (mimetype === "application/pdf") {
    const pickBestText = (...candidates: string[]) => {
      const normalizedCandidates = candidates
        .map((candidate) => repairExtractedText(candidate))
        .filter((candidate) => candidate.length > 0);

      return normalizedCandidates
        .sort((left, right) => {
          const qualityDelta = scoreTextQuality(right) - scoreTextQuality(left);
          if (Math.abs(qualityDelta) > 0.03) return qualityDelta;
          return right.length - left.length;
        })[0] || "";
    };

    const extractWithPdfToText = (mode: "layout" | "raw") => {
      try {
        const args = mode === "layout"
          ? ["-layout", "-enc", "UTF-8", "-nopgbrk", filePath, "-"]
          : ["-raw", "-enc", "UTF-8", "-nopgbrk", filePath, "-"];
        return execFileSync("pdftotext", args, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60000,
        });
      } catch (err) {
        console.warn("[pdftotext]", mode, err instanceof Error ? err.message : String(err));
        return "";
      }
    };

    try {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      const pdfParseText = result.text || "";
      const pdfToTextLayout = extractWithPdfToText("layout");
      const pdfToTextRaw = extractWithPdfToText("raw");
      let extractedText = pickBestText(pdfParseText, pdfToTextLayout, pdfToTextRaw);

      const hint = [context.originalName || "", context.documentType || "", context.category || "", context.subCategory || ""].join(" ").toLowerCase();
      const isPriorityRegulatoryDocument =
        hint.includes("plu")
        || hint.includes("reglement")
        || hint.includes("règlement")
        || hint.includes("oap")
        || hint.includes("padd")
        || hint.includes("zonage");
      const shouldForceOcr =
        extractedText.trim().length < 400
        || isTextLikelyGarbled(extractedText)
        || (isPriorityRegulatoryDocument && scoreTextQuality(extractedText) < 0.9);

      if (shouldForceOcr) {
        const ocrPages = isPriorityRegulatoryDocument ? 12 : 8;
        const ocrText = await VisionService.extractTextFromScannedPDF(filePath, ocrPages);
        const bestCandidate = pickBestText(extractedText, ocrText);
        if (scoreTextQuality(bestCandidate) >= scoreTextQuality(extractedText)) {
          extractedText = bestCandidate;
        }
      }

      if (shouldRunRegulatoryVision(context, extractedText)) {
        const visualSummary = await VisionService.analyzeRegulatoryDocument(
          filePath,
          [context.documentType, context.originalName].filter(Boolean).join(" · ")
        );
        if (visualSummary.trim().length > 80) {
          extractedText = `${extractedText.trim()}\n\n--- ANALYSE VISUELLE REGLEMENTAIRE ---\n${visualSummary}`.trim();
        }
      }

      return repairExtractedText(extractedText);
    } catch (e) {
      console.error("[pdf-parse]", e);
      const pdfToTextLayout = extractWithPdfToText("layout");
      const pdfToTextRaw = extractWithPdfToText("raw");
      const ocrText = await VisionService.extractTextFromScannedPDF(filePath, 12);
      const extractedText = repairExtractedText(
        [pdfToTextLayout, pdfToTextRaw, ocrText]
          .sort((left, right) => scoreTextQuality(right) - scoreTextQuality(left))[0] || ""
      );
      if (extractedText.trim().length > 0) {
        return extractedText;
      }
      return "[Impossible d'extraire le texte du PDF automatiquement]";
    }
  }

  if (mimetype.startsWith("image/")) {
    const visualSummary = await VisionService.analyzeRegulatoryDocument(
      filePath,
      [context.documentType, context.originalName].filter(Boolean).join(" · ")
    );
    return visualSummary.trim().length > 0
      ? `--- ANALYSE VISUELLE REGLEMENTAIRE ---\n${visualSummary}`
      : "[Impossible d'extraire le texte de l'image automatiquement]";
  }

  return fs.readFileSync(filePath, "utf-8");
}

function ensureTownHallUploadsDir() {
  if (!fs.existsSync(PRIMARY_UPLOADS_DIR)) {
    fs.mkdirSync(PRIMARY_UPLOADS_DIR, { recursive: true });
  }
}

function ensureTownHallUploadSessionDir() {
  ensureTownHallUploadsDir();
  if (!fs.existsSync(TOWN_HALL_UPLOAD_SESSION_DIR)) {
    fs.mkdirSync(TOWN_HALL_UPLOAD_SESSION_DIR, { recursive: true });
  }
}

function resolveTownHallUploadSessionPath(sessionId: string): string {
  ensureTownHallUploadSessionDir();
  return path.join(TOWN_HALL_UPLOAD_SESSION_DIR, `${sessionId}.part`);
}

function resolveTownHallDocumentPath(id: string, fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const ext = path.extname(fileName || "");
  for (const uploadDir of TOWN_HALL_UPLOAD_DIRS) {
    const primaryPath = path.join(uploadDir, fileName);
    if (fs.existsSync(primaryPath)) return primaryPath;

    const legacyPath = path.join(uploadDir, `${id}${ext}`);
    if (fs.existsSync(legacyPath)) return legacyPath;
  }
  return null;
}

function hasUsableTownHallText(rawText: string | null | undefined): boolean {
  return hasUsableExtractedText(rawText);
}

function getTownHallDocumentAvailability(doc: {
  id: string;
  title?: string | null;
  fileName: string | null;
  rawText: string | null;
  documentType?: string | null;
  hasVisionAnalysis?: boolean | null;
}) {
  const filePath = resolveTownHallDocumentPath(doc.id, doc.fileName);
  const hasStoredFile = !!filePath;
  const hasExtractedText = hasUsableTownHallText(doc.rawText);
  const textQuality = assessExtractedTextQuality(doc.rawText);
  const lowerType = String(doc.documentType || "").toLowerCase();
  const hasVisualRegulatoryAnalysis = !!doc.hasVisionAnalysis || String(doc.rawText || "").includes("--- ANALYSE VISUELLE REGLEMENTAIRE ---");
  const extractionHint = hasVisualRegulatoryAnalysis
    ? "ocr_or_vision"
    : lowerType.includes("written regulation") || lowerType.includes("reglement") || lowerType.includes("règlement")
      ? "written_regulation"
      : "standard";

  let availabilityStatus: "indexed" | "processing" | "indexed_without_source_file" | "missing_file" | "broken" = "processing";
  let availabilityMessage = "Document recu, indexation en cours.";

  if (hasStoredFile && hasExtractedText) {
    availabilityStatus = "indexed";
    availabilityMessage = "Document disponible et exploitable par l'analyse.";
  } else if (!hasStoredFile && hasExtractedText) {
    availabilityStatus = "indexed_without_source_file";
    availabilityMessage = "Le texte du document est indexe, mais le fichier source est introuvable sur le disque.";
  } else if (hasStoredFile && !hasExtractedText) {
    availabilityStatus = "processing";
    availabilityMessage = "Le fichier est present, mais le texte n'est pas encore exploitable pour l'analyse.";
  } else if (doc.fileName) {
    availabilityStatus = "missing_file";
    availabilityMessage = "Le fichier source est introuvable et aucun texte exploitable n'a ete indexe.";
  } else {
    availabilityStatus = "broken";
    availabilityMessage = "Le document est incomplet et doit etre reimporte.";
  }

  return {
    filePath,
    hasStoredFile,
    hasExtractedText,
    availabilityStatus,
    availabilityMessage,
    textQualityScore: Math.round(textQuality.score * 100),
    textQualityLabel: textQuality.label,
    textQualityMessage: textQuality.message,
    extractionHint,
    hasVisualRegulatoryAnalysis,
  };
}

async function queueTownHallDocumentIndexing(args: {
  docId: string;
  persistentPath: string;
  mimeType: string;
  originalName: string;
  targetCommune: string;
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
  requestedTags: string[];
  zone?: string | null;
}) {
  setImmediate(async () => {
    try {
      const rawText = await extractTextFromFile(args.persistentPath, args.mimeType, {
        originalName: args.originalName,
        documentType: args.documentType,
        category: args.category,
        subCategory: args.subCategory,
      });
      const suggestion = autoSuggestClassification(rawText, args.originalName);
      const classification = normalizeTownHallClassification({
        category: args.category || suggestion.category,
        subCategory: args.subCategory || suggestion.subCategory,
        documentType: args.documentType || suggestion.documentType,
      });
      const category = classification.category;
      const subCategory = classification.subCategory;
      const documentType = classification.documentType;
      const tags = args.requestedTags.length > 0 ? args.requestedTags : suggestion.tags;
      const canonicalType = inferCanonicalDocumentType(documentType, category, subCategory);
      const isOpposable = isCanonicalTypeOpposable(canonicalType);
      const isRegulatory = isRegulatoryLikeDocument(documentType, category, subCategory);

      await db.update(townHallDocumentsTable)
        .set({
          rawText,
          category,
          subCategory,
          documentType,
          tags,
          isRegulatory,
          isOpposable,
          updatedAt: new Date()
        })
        .where(eq(townHallDocumentsTable.id, args.docId));

      const inseeCode = await resolveInseeCode(args.targetCommune);
      const municipalityKey = inseeCode || args.targetCommune;
      const uploadBatchId = crypto.randomUUID();
      const fileHash = createHash("sha256").update(rawText).digest("hex");
      const [baseIADoc] = await db.insert(baseIADocumentsTable).values({
        batchId: uploadBatchId,
        municipalityId: municipalityKey,
        zoneCode: args.zone || null,
        category: category || "REGULATORY",
        subCategory: subCategory || "PLU",
        type: mapCanonicalTypeToBaseIAType(canonicalType),
        fileName: path.basename(args.persistentPath),
        fileHash,
        status: "parsing",
        rawText,
      }).returning();

      await processDocumentForRAG(baseIADoc.id, municipalityKey, rawText, {
        document_id: baseIADoc.id,
        document_type: canonicalType,
        pool_id: `${municipalityKey}-PLU-ACTIVE`,
        status: "active",
        commune: municipalityKey,
        zone: args.zone || undefined,
        source_authority: authorityForCanonicalType(canonicalType),
        provenance: "base_ia_plu",
      } as any);

      await persistRegulatoryUnitsForDocument({
        baseIADocumentId: baseIADoc.id,
        townHallDocumentId: args.docId,
        municipalityId: municipalityKey,
        zoneCode: args.zone || null,
        documentType: canonicalType,
        sourceAuthority: authorityForCanonicalType(canonicalType),
        isOpposable,
        rawText,
      });

      await persistRegulatoryZoneSectionsForDocument({
        baseIADocumentId: baseIADoc.id,
        townHallDocumentId: args.docId,
        municipalityId: municipalityKey,
        documentType: canonicalType,
        sourceAuthority: authorityForCanonicalType(canonicalType),
        isOpposable,
        rawText,
      });

      await db.update(baseIADocumentsTable)
        .set({ status: "indexed" })
        .where(eq(baseIADocumentsTable.id, baseIADoc.id));
      logger.debug("[mairie/upload] Successfully processed RAG", { docId: args.docId });
    } catch (ragErr) {
      logger.error("[mairie/upload] RAG vectorization failed", ragErr, { docId: args.docId });
    }
  });
}

router.post("/documents/uploads/init", async (req: AuthRequest, res) => {
  try {
    const {
      fileName,
      fileSize,
      mimeType,
      category,
      subCategory,
      documentType,
      commune,
      zone,
      title,
      tags,
    } = req.body as {
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      category?: string;
      subCategory?: string;
      documentType?: string;
      commune?: string;
      zone?: string;
      title?: string;
      tags?: unknown;
    };

    if (!fileName || typeof fileSize !== "number" || fileSize <= 0) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Nom et taille du fichier requis." });
    }

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, commune);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const ext = path.extname(fileName || "") || ".pdf";
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    const [session] = await db.insert(townHallUploadSessionsTable).values({
      userId: req.user!.userId,
      commune: access.targetCommune,
      title: title || fileName,
      originalFileName: fileName,
      storedFileName,
      mimeType: mimeType || "application/pdf",
      fileSize,
      receivedBytes: 0,
      category: category || null,
      subCategory: subCategory || null,
      documentType: documentType || null,
      zone: zone || null,
      tags: parseDocumentTags(tags),
      status: "uploading",
    }).returning();

    fs.writeFileSync(resolveTownHallUploadSessionPath(session.id), "");

    return res.json({
      sessionId: session.id,
      chunkSize: RESUMABLE_UPLOAD_CHUNK_SIZE,
      receivedBytes: 0,
      totalBytes: session.fileSize,
      status: session.status,
      targetCommune: access.targetCommune,
      fileName: session.originalFileName,
    });
  } catch (err) {
    logger.error("[mairie/uploads/init]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'initialiser l'upload." });
  }
});

router.get("/documents/uploads/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [session] = await db.select().from(townHallUploadSessionsTable)
      .where(and(eq(townHallUploadSessionsTable.id, id as string), eq(townHallUploadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Session d'upload introuvable." });
    }

    return res.json({
      sessionId: session.id,
      receivedBytes: session.receivedBytes,
      totalBytes: session.fileSize,
      status: session.status,
      documentId: session.townHallDocumentId,
      errorMessage: session.errorMessage,
      commune: session.commune,
      fileName: session.originalFileName,
      category: session.category,
      subCategory: session.subCategory,
      documentType: session.documentType,
      zone: session.zone,
      mimeType: session.mimeType,
      title: session.title,
      tags: parseDocumentTags(session.tags),
    });
  } catch (err) {
    logger.error("[mairie/uploads/status]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de recuperer la session d'upload." });
  }
});

router.post("/documents/uploads/:id/chunk", upload.single("chunk"), async (req: AuthRequest, res) => {
  const file = req.file;
  try {
    const { id } = req.params;
    if (!file) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Chunk requis." });
    }

    const [session] = await db.select().from(townHallUploadSessionsTable)
      .where(and(eq(townHallUploadSessionsTable.id, id as string), eq(townHallUploadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(404).json({ error: "NOT_FOUND", message: "Session d'upload introuvable." });
    }

    if (session.status !== "uploading") {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(409).json({ error: "INVALID_STATUS", message: "Cette session n'accepte plus de chunks." });
    }

    const start = Number(req.body.start ?? "0");
    if (!Number.isFinite(start) || start !== session.receivedBytes) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(409).json({
        error: "OFFSET_MISMATCH",
        message: "Le decalage du chunk ne correspond pas a l'etat serveur.",
        receivedBytes: session.receivedBytes,
      });
    }

    fs.appendFileSync(resolveTownHallUploadSessionPath(session.id), fs.readFileSync(file.path));
    const nextReceivedBytes = Math.min(session.receivedBytes + file.size, session.fileSize);
    const nextStatus = nextReceivedBytes >= session.fileSize ? "uploaded" : "uploading";

    await db.update(townHallUploadSessionsTable)
      .set({
        receivedBytes: nextReceivedBytes,
        status: nextStatus,
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(townHallUploadSessionsTable.id, session.id));

    try { fs.unlinkSync(file.path); } catch {}

    return res.json({
      sessionId: session.id,
      receivedBytes: nextReceivedBytes,
      totalBytes: session.fileSize,
      status: nextStatus,
      done: nextReceivedBytes >= session.fileSize,
    });
  } catch (err) {
    try { if (file?.path) fs.unlinkSync(file.path); } catch {}
    logger.error("[mairie/uploads/chunk]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'enregistrer ce chunk." });
  }
});

router.post("/documents/uploads/:id/complete", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [session] = await db.select().from(townHallUploadSessionsTable)
      .where(and(eq(townHallUploadSessionsTable.id, id as string), eq(townHallUploadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Session d'upload introuvable." });
    }

    if (session.status === "processing" || session.status === "completed") {
      return res.json({
        status: "processing",
        message: "Document recu, indexation en cours.",
        documentId: session.townHallDocumentId,
      });
    }

    if (session.receivedBytes < session.fileSize) {
      return res.status(409).json({
        error: "UPLOAD_INCOMPLETE",
        message: "Le fichier n'est pas encore entierement recu.",
        receivedBytes: session.receivedBytes,
        totalBytes: session.fileSize,
      });
    }

    const sessionPath = resolveTownHallUploadSessionPath(session.id);
    if (!fs.existsSync(sessionPath)) {
      await db.update(townHallUploadSessionsTable)
        .set({ status: "failed", errorMessage: "Fichier temporaire introuvable.", updatedAt: new Date() })
        .where(eq(townHallUploadSessionsTable.id, session.id));
      return res.status(500).json({ error: "FILE_MISSING", message: "Le fichier temporaire de cette session est introuvable." });
    }

    ensureTownHallUploadsDir();
    const persistentPath = path.join(PRIMARY_UPLOADS_DIR, session.storedFileName);
    fs.renameSync(sessionPath, persistentPath);

    const [doc] = await db.insert(townHallDocumentsTable).values({
      userId: req.user!.userId,
      commune: session.commune,
      title: session.title || session.originalFileName,
      fileName: session.storedFileName,
      rawText: "",
      category: session.category || null,
      subCategory: session.subCategory || null,
      documentType: session.documentType || null,
      isRegulatory: true,
      tags: parseDocumentTags(session.tags),
      zone: session.zone || null
    }).returning();

    await db.update(townHallUploadSessionsTable)
      .set({
        status: "processing",
        townHallDocumentId: doc.id,
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(townHallUploadSessionsTable.id, session.id));

    res.json({ status: "processing", message: "Document recu, indexation en cours.", documentId: doc.id });

    await queueTownHallDocumentIndexing({
      docId: doc.id,
      persistentPath,
      mimeType: session.mimeType || "application/pdf",
      originalName: session.originalFileName,
      targetCommune: session.commune || "",
      category: session.category,
      subCategory: session.subCategory,
      documentType: session.documentType,
      requestedTags: parseDocumentTags(session.tags),
      zone: session.zone,
    });

    await db.update(townHallUploadSessionsTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(townHallUploadSessionsTable.id, session.id));
    return;
  } catch (err) {
    logger.error("[mairie/uploads/complete]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de finaliser cet upload." });
  }
});

router.get("/documents", async (req: AuthRequest, res) => {
  try {
    const requestedCommune = req.query.commune as string | undefined;

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(c => c.toLowerCase().trim());

    const docs = await db.select().from(townHallDocumentsTable).orderBy(desc(townHallDocumentsTable.createdAt));
    const filteredByAccess = docs.filter((d) => {
      const docCommune = (d.commune || "").toLowerCase().trim();
      if (role === "admin" || role === "super_admin") return true;
      return !!docCommune && assignedCommunes.includes(docCommune);
    });
    const docsForCommune = requestedCommune
      ? filteredByAccess.filter(d => (d.commune || "").toLowerCase().trim() === requestedCommune.toLowerCase().trim())
      : filteredByAccess;
    
    const filteredDocs = docsForCommune.map(d => {
      const availability = getTownHallDocumentAvailability(d);
      const classification = normalizeTownHallClassification({
        category: d.category,
        subCategory: d.subCategory,
        documentType: d.documentType,
      });
      return {
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        createdAt: d.createdAt,
        commune: d.commune,
        category: classification.category,
        subCategory: classification.subCategory,
        documentType: classification.documentType,
        explanatoryNote: d.explanatoryNote,
        tags: d.tags,
        hasStoredFile: availability.hasStoredFile,
        hasExtractedText: availability.hasExtractedText,
        availabilityStatus: availability.availabilityStatus,
        availabilityMessage: availability.availabilityMessage,
        textQualityScore: availability.textQualityScore,
        textQualityLabel: availability.textQualityLabel,
        textQualityMessage: availability.textQualityMessage,
        extractionHint: availability.extractionHint,
        hasVisualRegulatoryAnalysis: availability.hasVisualRegulatoryAnalysis,
      };
    });
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

          const ext = path.extname(file.originalname || "") || ".pdf";
          const storedFileName = `${crypto.randomUUID()}${ext}`;
          ensureTownHallUploadsDir();
          const persistentPath = path.join(PRIMARY_UPLOADS_DIR, storedFileName);

          try {
            fs.copyFileSync(file.path, persistentPath);
          } catch (copyErr) {
            logger.error("[mairie/batch] Failed to persist batch upload", copyErr, { fileName: file.originalname });
            try { fs.unlinkSync(file.path); } catch {}
            results.push({ fileName: file.originalname, status: "failed_persist" });
            continue;
          }

          const rawText = await extractTextFromFile(persistentPath, file.mimetype, {
            originalName: file.originalname,
            documentType: req.body.documentType || null,
            category: req.body.category || null,
            subCategory: req.body.subCategory || null,
          });
          const suggestion = autoSuggestClassification(rawText, file.originalname);
          const classification = normalizeTownHallClassification({
            category: req.body.category || suggestion.category,
            subCategory: req.body.subCategory || suggestion.subCategory,
            documentType: req.body.documentType || suggestion.documentType,
          });
          const category = classification.category;
          const subCategory = classification.subCategory;
          const tags = req.body.tags ? JSON.parse(req.body.tags) : suggestion.tags;
          const canonicalType = inferCanonicalDocumentType(classification.documentType, category, subCategory);
          const isOpposable = isCanonicalTypeOpposable(canonicalType);
          const isRegulatory = isRegulatoryLikeDocument(classification.documentType, category, subCategory);
          const inseeCode = targetCommune ? await resolveInseeCode(targetCommune) : null;
          const municipalityKey = inseeCode || targetCommune || null;

          const [doc] = await db.insert(baseIADocumentsTable).values({
            batchId: batch.id,
            municipalityId: municipalityKey,
            fileName: storedFileName,
            fileHash: hash,
            status: "indexed",
            type: mapCanonicalTypeToBaseIAType(canonicalType),
            category,
            subCategory,
            tags,
            rawText,
          }).returning();

          // Also support legacy table for back-compat
          await db.insert(townHallDocumentsTable).values({
            userId: req.user!.userId,
            commune: targetCommune || null,
            title: file.originalname,
            fileName: storedFileName,
            rawText: rawText,
            category,
            subCategory,
            documentType: classification.documentType,
            isRegulatory,
            isOpposable,
            tags,
            zone: req.body.zone || null
          });

          // Process the document for RAG (Chunking + Embeddings)
          if (municipalityKey) {
             try {
               await processDocumentForRAG(doc.id, municipalityKey, rawText, {
                 document_id: doc.id,
                 document_type: canonicalType,
                 pool_id: `${municipalityKey}-PLU-ACTIVE`,
                 status: "active",
                 commune: municipalityKey,
                 zone: req.body.zone || undefined,
                 source_authority: authorityForCanonicalType(canonicalType),
               });
               await persistRegulatoryUnitsForDocument({
                 baseIADocumentId: doc.id,
                 municipalityId: municipalityKey,
                 zoneCode: req.body.zone || null,
                 documentType: canonicalType,
                 sourceAuthority: authorityForCanonicalType(canonicalType),
                 isOpposable,
                 rawText,
               });
               await persistRegulatoryZoneSectionsForDocument({
                 baseIADocumentId: doc.id,
                 municipalityId: municipalityKey,
                 documentType: canonicalType,
                 sourceAuthority: authorityForCanonicalType(canonicalType),
                 isOpposable,
                 rawText,
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

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined);
    if (!access.ok) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(access.status).json(access.error);
    }
    const targetCommune = access.targetCommune;

    const ext = path.extname(file.originalname || "") || ".pdf";
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    ensureTownHallUploadsDir();
    const persistentPath = path.join(PRIMARY_UPLOADS_DIR, storedFileName);

    try {
      fs.copyFileSync(file.path, persistentPath);
    } catch (copyErr) {
      try { fs.unlinkSync(file.path); } catch {}
      logger.error("[VisionStorage] Failed to store file", copyErr);
      return res.status(500).json({ error: "FILE_STORAGE_FAILED", message: "Le fichier n'a pas pu etre enregistre." });
    }

    const requestedTags = parseDocumentTags(req.body.tags);
    const [doc] = await db.insert(townHallDocumentsTable).values({
      userId: req.user!.userId,
      commune: targetCommune,
      title: req.body.title || file.originalname,
      fileName: storedFileName,
      rawText: "",
      category: req.body.category || null,
      subCategory: req.body.subCategory || null,
      documentType: req.body.documentType || null,
      tags: requestedTags,
      zone: req.body.zone || null
    }).returning();

    try { fs.unlinkSync(file.path); } catch {}

    res.json({ status: "processing", message: "Document recu, indexation en cours.", documentId: doc.id });

    await queueTownHallDocumentIndexing({
      docId: doc.id,
      persistentPath,
      mimeType: file.mimetype,
      originalName: file.originalname,
      targetCommune,
      category: req.body.category || null,
      subCategory: req.body.subCategory || null,
      documentType: req.body.documentType || null,
      requestedTags,
      zone: req.body.zone || null,
    });
    return;
  } catch(err) {
    console.error("[mairie/documents POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", details: err instanceof Error ? err.stack : String(err) });
  }
});

router.delete("/documents", async (req: AuthRequest, res) => {
  try {
    const requestedCommune = String(req.query.commune || "").trim();
    if (!requestedCommune) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Paramètre commune requis." });
    }

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(c => c.toLowerCase().trim());
    const requestedLower = requestedCommune.toLowerCase().trim();

    if (role !== "admin" && role !== "super_admin" && !assignedCommunes.includes(requestedLower)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    const docsToDelete = await db.select({ id: townHallDocumentsTable.id, fileName: townHallDocumentsTable.fileName })
      .from(townHallDocumentsTable)
      .where(eq(sql`lower(${townHallDocumentsTable.commune})`, requestedLower));

    const docIds = docsToDelete.map(d => d.id);

    if (docIds.length > 0) {
      await db.delete(townHallDocumentsTable).where(inArray(townHallDocumentsTable.id, docIds));
    }

    // Remove Base IA docs + embeddings for that commune key.
    await db.delete(baseIAEmbeddingsTable)
      .where(eq(sql`lower(${baseIAEmbeddingsTable.metadata}->>'commune')`, requestedLower));
    await db.delete(baseIADocumentsTable)
      .where(eq(sql`lower(${baseIADocumentsTable.municipalityId})`, requestedLower));

    // Cleanup persisted files if present
    for (const file of docsToDelete) {
      const p = resolveTownHallDocumentPath(file.id, file.fileName);
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }

    return res.json({ success: true, deletedDocuments: docIds.length, commune: requestedCommune });
  } catch (err) {
    logger.error("[mairie/documents DELETE bulk]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.delete("/documents/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(c => c.toLowerCase().trim());

    const [doc] = await db.select({
      id: townHallDocumentsTable.id,
      commune: townHallDocumentsTable.commune,
      fileName: townHallDocumentsTable.fileName
    }).from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, id)).limit(1);

    if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    if (!canAccessCommune(role, assignedCommunes, doc.commune)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    await db.delete(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, id));

    const filePath = resolveTownHallDocumentPath(doc.id, doc.fileName);
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }

    return res.json({ success: true });
  } catch(err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/gpu/sync", async (req: AuthRequest, res) => {
  return res.status(410).json({
    error: "FEATURE_REMOVED",
    message: "La synchronisation GPU a ete retiree. Importez les documents souhaites manuellement pendant l'onboarding de la Base IA."
  });
});


router.get("/documents/:id/view", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(c => c.toLowerCase().trim());

    // 1. Fetch document record to get the actual fileName
    const [doc] = await db.select({ fileName: townHallDocumentsTable.fileName, commune: townHallDocumentsTable.commune })
      .from(townHallDocumentsTable)
      .where(eq(townHallDocumentsTable.id, id))
      .limit(1);

    if (!doc || !doc.fileName) {
      console.warn(`[mairie/view] Document record or filename not found for ID: ${id}`);
      return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    }
    if (!canAccessCommune(role, assignedCommunes, doc.commune)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    // 2. Locate the file in physical storage
    const filePath = resolveTownHallDocumentPath(id, doc.fileName);

    if (!filePath || !fs.existsSync(filePath)) {
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

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(c => c.toLowerCase().trim());

    const [doc] = await db.select({ commune: townHallDocumentsTable.commune })
      .from(townHallDocumentsTable)
      .where(eq(townHallDocumentsTable.id, id))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    if (!canAccessCommune(role, assignedCommunes, doc.commune)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

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
