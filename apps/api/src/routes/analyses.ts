import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  analysesTable,
  parcelsTable,
  buildingsTable,
  zoneAnalysesTable,
  ruleArticlesTable,
  constraintsTable,
  buildabilityResultsTable,
  generatedReportsTable,
  eventLogsTable,
  municipalitySettingsTable,
  globalConfigsTable,
} from "@workspace/db";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";
import { geocodeAddress } from "../services/geocoding.js";
import { getParcelByCoords, getBuildingsByParcel, type ParcelData } from "../services/parcel.js";
import { orchestrateDossierAnalysis } from "../services/orchestrator.js";

const router: IRouter = Router();

async function logEvent(analysisId: string, step: string, status: string, message?: string) {
  await db.insert(eventLogsTable).values({ analysisId, step, status, message });
}

export async function runAnalysisPipeline(analysisId: string, parcelData: ParcelData, userId: string, projectDescription?: string): Promise<void> {
  console.log(`\n>>> [8-STEP TUNNEL] Starting for analysis ${analysisId}`);
  try {
    const [analysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1);
    if (!analysis) return;

    await db.update(analysesTable).set({ status: "parsing_documents", updatedAt: new Date() }).where(eq(analysesTable.id, analysisId));
    await logEvent(analysisId, "orchestration", "started", "Démarrage du tunnel déterministe en 8 étapes.");

    // The 'Analyses' generic pipeline doesn't have unique 'docs' like a dossier.
    // We pass an empty array for docs, and the orchestrator will pull the PLU docs from Base IA.
    await orchestrateDossierAnalysis(null, [], { userId }, analysisId);

    await db.update(analysesTable).set({ status: "completed", updatedAt: new Date() }).where(eq(analysesTable.id, analysisId));
    await logEvent(analysisId, "orchestration", "completed", "Analyse déterministe terminée avec succès.");

  } catch (err) {
    console.error(`[PIPELINE_ERROR][${analysisId}]`, err);
    await db.update(analysesTable).set({ status: "failed", updatedAt: new Date() }).where(eq(analysesTable.id, analysisId));
    await logEvent(analysisId, "orchestration", "failed", `Erreur critique : ${String(err)}`);
  }
}

// List analyses
router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string || "1");
    const limit = parseInt(req.query.limit as string || "20");
    const offset = (page - 1) * limit;

    const items = await db.select().from(analysesTable)
      .where(eq(analysesTable.userId, req.user!.userId))
      .orderBy(desc(analysesTable.createdAt))
      .limit(limit).offset(offset);

    const [{ total }] = await db.select({ total: count() }).from(analysesTable)
      .where(eq(analysesTable.userId, req.user!.userId));

    res.json({ analyses: items, total: Number(total), page, limit });
  } catch (err) {
    console.error("[analyses/list]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// Create analysis
router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { address, parcelRef, title } = req.body as { address: string; parcelRef?: string; title?: string };

    if (!address) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "L'adresse est requise." });
      return;
    }

    const [analysis] = await db.insert(analysesTable).values({
      userId: req.user!.userId,
      address,
      parcelRef,
      title: title || address,
      status: "draft",
    }).returning();

    await logEvent(analysis.id, "creation", "completed", `Analyse créée pour : ${address}`);

    // Step 1: Geocode
    const geoResults = await geocodeAddress(analysis.address);
    const geo = geoResults[0];
    if (!geo) {
      await db.update(analysesTable).set({ status: "failed", updatedAt: new Date() }).where(eq(analysesTable.id, analysis.id));
      await logEvent(analysis.id, "geocoding", "failed", "Adresse non trouvée.");
      res.status(500).json({ error: "GEOCODING_FAILED", message: "Adresse non trouvée." });
      return;
    }

    // Step 2: Parcel data
    let parcelData: ParcelData;
    try {
      parcelData = await getParcelByCoords(geo.lat, geo.lng, geo.banId ?? "", geo.label);
    } catch (parcelErr) {
      await db.update(analysesTable).set({ status: "failed", updatedAt: new Date() }).where(eq(analysesTable.id, analysis.id));
      await logEvent(analysis.id, "parcel", "failed",
        `Données cadastrales non disponibles pour cette adresse. ${(parcelErr as Error).message}`);
      res.status(500).json({ error: "PARCEL_DATA_FAILED", message: "Données cadastrales non disponibles." });
      return;
    }

    setImmediate(() => runAnalysisPipeline(analysis.id, parcelData, req.user!.userId, analysis.title || ""));

    res.status(201).json(analysis);
  } catch (err) {
    console.error("[analyses/create]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// Get single analysis
router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [analysis] = await db.select().from(analysesTable)
      .where(and(eq(analysesTable.id, id as string), eq(analysesTable.userId, req.user!.userId))).limit(1);

    if (!analysis) {
      res.status(404).json({ error: "NOT_FOUND", message: "Analyse non trouvée." });
      return;
    }

    const idStr = id as string;
    const parcel = (await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, idStr)).limit(1))[0] || null;
    const buildings = await db.select().from(buildingsTable).where(eq(buildingsTable.analysisId, idStr));
    const zoneData = (await db.select().from(zoneAnalysesTable).where(eq(zoneAnalysesTable.analysisId, idStr)).limit(1))[0];
    const articles = zoneData ? await db.select().from(ruleArticlesTable).where(eq(ruleArticlesTable.zoneAnalysisId, zoneData.id)) : [];
    const buildability = (await db.select().from(buildabilityResultsTable).where(eq(buildabilityResultsTable.analysisId, idStr)).limit(1))[0] || null;
    const constraints = await db.select().from(constraintsTable).where(eq(constraintsTable.analysisId, idStr));
    const report = (await db.select().from(generatedReportsTable).where(eq(generatedReportsTable.analysisId, idStr)).limit(1))[0] || null;
    const logs = await db.select().from(eventLogsTable).where(eq(eventLogsTable.analysisId, idStr)).orderBy(desc(eventLogsTable.createdAt));

    res.json({
      analysis: {
        ...analysis,
        geoContextJson: analysis.geoContextJson ? JSON.parse(analysis.geoContextJson) : null,
        severityWeightsJson: analysis.severityWeightsJson ? JSON.parse(analysis.severityWeightsJson) : null,
      },
      parcel,
      buildings,
      zoneAnalysis: zoneData ? { ...zoneData, articles } : null,
      buildability,
      constraints,
      report,
      logs,
    });
  } catch (err) {
    console.error("[analyses/get]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// Delete analysis
router.delete("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [analysis] = await db.select().from(analysesTable)
      .where(and(eq(analysesTable.id, id as string), eq(analysesTable.userId, req.user!.userId))).limit(1);
    if (!analysis) {
      res.status(404).json({ error: "NOT_FOUND", message: "Analyse non trouvée." });
      return;
    }
    await db.delete(analysesTable).where(eq(analysesTable.id, id as string));
    res.json({ success: true, message: "Analyse supprimée." });
  } catch (err) {
    console.error("[analyses/delete]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// Run/restart pipeline
router.post("/:id/run", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [analysis] = await db.select().from(analysesTable)
      .where(eq(analysesTable.id, id as string)).limit(1);
      
    if (!analysis) {
      res.status(404).json({ error: "NOT_FOUND", message: "Analyse non trouvée." });
      return;
    }
    const idStr = id as string;
    const userId = req.user?.userId || analysis.userId;

    // Fetch parcel data to pass to the pipeline
    const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, idStr)).limit(1);
    
    // Reset all derived data and event logs for a clean retry
    await db.delete(parcelsTable).where(eq(parcelsTable.analysisId, idStr));
    await db.delete(buildingsTable).where(eq(buildingsTable.analysisId, idStr));
    await db.delete(zoneAnalysesTable).where(eq(zoneAnalysesTable.analysisId, idStr));
    await db.delete(buildabilityResultsTable).where(eq(buildabilityResultsTable.analysisId, idStr));
    await db.delete(constraintsTable).where(eq(constraintsTable.analysisId, idStr));
    await db.delete(generatedReportsTable).where(eq(generatedReportsTable.analysisId, idStr));
    await db.delete(eventLogsTable).where(eq(eventLogsTable.analysisId, idStr));

    // If we have parcel data, we can use it, otherwise we'll let the pipeline rediscover it
    const parcelData: any = parcel ? {
      cadastralSection: parcel.cadastralSection || "",
      parcelNumber: parcel.parcelNumber || "",
      parcelSurfaceM2: parcel.parcelSurfaceM2 || 0,
      geometryJson: parcel.geometryJson ? JSON.parse(parcel.geometryJson) : {},
      centroidLat: parcel.centroidLat || 0,
      centroidLng: parcel.centroidLng || 0,
      roadFrontageLengthM: parcel.roadFrontageLengthM || 0,
      sideBoundaryLengthM: parcel.sideBoundaryLengthM || 0,
      metadata: parcel.metadataJson ? JSON.parse(parcel.metadataJson) : {},
    } : null;

    runAnalysisPipeline(idStr, parcelData, userId, analysis.title || "").catch(err => {
      console.error(`[pipeline/restart-error][${idStr}]`, err);
      logEvent(idStr, "pipeline", "failed", `Erreur lors du redémarrage du pipeline: ${String(err)}`);
    });

    const [updated] = await db.select().from(analysesTable).where(eq(analysesTable.id, id as string)).limit(1);
    res.json(updated);
  } catch (err) {
    console.error("[analyses/run]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// Helper routes
router.get("/:id/parcel", authenticate, async (req: AuthRequest, res) => {
  try {
    const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, req.params.id as string)).limit(1);
    res.json(parcel);
  } catch (err) { res.status(500).json({ error: "INTERNAL_ERROR" }); }
});

router.get("/:id/logs", authenticate, async (req: AuthRequest, res) => {
  try {
    const logs = await db.select().from(eventLogsTable).where(eq(eventLogsTable.analysisId, req.params.id as string)).orderBy(desc(eventLogsTable.createdAt));
    res.json(logs);
  } catch (err) { res.status(500).json({ error: "INTERNAL_ERROR" }); }
});

export default router;
