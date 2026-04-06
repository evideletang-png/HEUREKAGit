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
import {
  getParcelByCoords,
  getBuildingsByParcel,
  type ParcelData,
  getParcelSelectionPreview,
  buildParcelDataFromSelectedFeatures,
} from "../services/parcel.js";
import { orchestrateDossierAnalysis } from "../services/orchestrator.js";
import { getZoningByCoords } from "../services/planning.js";

const router: IRouter = Router();

function synthesizeEvidenceFromSourceExcerpt(zoneAnalysisId: string, sourceExcerpt: string | null | undefined) {
  const text = String(sourceExcerpt || "").replace(/\s+/g, " ").trim();
  if (text.length < 200) return [];

  const candidates = [
    { title: "Implantation par rapport à la voie", articleNumber: 6, pattern: /(implantation|alignement|voie|emprise publique|recul[^.]{0,80}voie)/i },
    { title: "Implantation sur limites séparatives", articleNumber: 7, pattern: /(limites s[ée]paratives|recul[^.]{0,80}limites|prospect)/i },
    { title: "Emprise au sol", articleNumber: 9, pattern: /(emprise au sol|ces\b|coefficient d['’]emprise)/i },
    { title: "Hauteur", articleNumber: 10, pattern: /(hauteur des constructions|hauteur maximale|hauteur\b)/i },
    { title: "Stationnement", articleNumber: 12, pattern: /(stationnement|places? de stationnement|parking)/i },
    { title: "Espaces verts et pleine terre", articleNumber: 13, pattern: /(espaces verts|pleine terre|plantations|perm[ée]abilit[ée])/i },
  ];

  return candidates
    .map((candidate, index) => {
      const match = candidate.pattern.exec(text);
      if (!match) return null;

      const start = Math.max(0, match.index - 180);
      const end = Math.min(text.length, match.index + 420);
      const snippet = text.slice(start, end).trim();
      if (snippet.length < 90) return null;

      return {
        id: `source-excerpt-${index}`,
        zoneAnalysisId,
        articleNumber: candidate.articleNumber,
        title: candidate.title,
        sourceText: snippet,
        summary: `Extrait réglementaire repéré automatiquement dans la base documentaire pour le thème "${candidate.title.toLowerCase()}".`,
        impactText: "",
        vigilanceText: "Preuve affichée à partir du texte source indexé en attendant une structuration plus fine.",
        confidence: "low",
        structuredJson: JSON.stringify({ fallback: "source_excerpt", theme: candidate.title }),
      };
    })
    .filter((article): article is NonNullable<typeof article> => article !== null);
}

type SelectedParcelPayload = {
  idu?: string;
  section?: string;
  numero?: string;
  parcelRef?: string;
  contenanceM2?: number;
  feature?: any;
};

async function logEvent(analysisId: string, step: string, status: string, message?: string) {
  await db.insert(eventLogsTable).values({ analysisId, step, status, message });
}

function buildPersistedParcelMetadata(parcelData: ParcelData) {
  return {
    ...(parcelData.metadata || {}),
    parcelRefs: Array.isArray((parcelData.metadata as any)?.parcelRefs) ? (parcelData.metadata as any).parcelRefs : undefined,
    parcelCount: (parcelData.metadata as any)?.parcelCount || 1,
    perimeterM: parcelData._perimeterM ?? null,
    depthM: parcelData._depthM ?? null,
    isCornerPlot: parcelData._isCornerPlot ?? false,
    topography: parcelData._topography ?? null,
    frontRoadName: parcelData._classifyBoundariesResult?.road_boundary_segments?.[0]?.properties?.closest_road_name ?? null,
  };
}

function buildLockedAnalysisContext(args: {
  address: string;
  geo: { lat: number; lng: number; banId?: string; inseeCode?: string; city?: string; postcode?: string; label: string };
  zoningInfo?: Awaited<ReturnType<typeof getZoningByCoords>> | null;
  parcelData: ParcelData;
  selectedParcels?: SelectedParcelPayload[];
}) {
  const { address, geo, zoningInfo, parcelData, selectedParcels } = args;
  const parcelRefs = Array.isArray((parcelData.metadata as any)?.parcelRefs)
    ? (parcelData.metadata as any).parcelRefs
    : [[parcelData.cadastralSection, parcelData.parcelNumber].filter(Boolean).join(" ")].filter(Boolean);

  return {
    source_lock: {
      lockedAt: new Date().toISOString(),
      address,
      label: geo.label,
      lat: geo.lat,
      lng: geo.lng,
      banId: geo.banId || null,
      inseeCode: geo.inseeCode || (parcelData.metadata as any)?.commune || null,
      city: geo.city || null,
      postcode: geo.postcode || null,
      zoneCode: zoningInfo?.zoneCode || null,
      zoningLabel: zoningInfo?.zoningLabel || null,
      parcelRefs,
      parcelCount: (parcelData.metadata as any)?.parcelCount || parcelRefs.length || 1,
      parcelIdus: selectedParcels?.map((parcel) => parcel.idu).filter(Boolean) || [String((parcelData.metadata as any)?.idu || "")].filter(Boolean),
      selectionMode: selectedParcels && selectedParcels.length > 1 ? "land_assembly" : "single_parcel",
    },
  };
}

async function persistAnalysisParcelContext(
  analysisId: string,
  parcelData: ParcelData,
  buildingData?: Awaited<ReturnType<typeof getBuildingsByParcel>> | null,
) {
  await db.delete(parcelsTable).where(eq(parcelsTable.analysisId, analysisId));
  await db.insert(parcelsTable).values({
    analysisId,
    cadastralSection: parcelData.cadastralSection ?? null,
    parcelNumber: parcelData.parcelNumber ?? null,
    parcelSurfaceM2: parcelData.parcelSurfaceM2 ?? null,
    geometryJson: parcelData.geometryJson ? JSON.stringify(parcelData.geometryJson) : null,
    centroidLat: parcelData.centroidLat ?? null,
    centroidLng: parcelData.centroidLng ?? null,
    roadFrontageLengthM: parcelData.roadFrontageLengthM ?? null,
    sideBoundaryLengthM: parcelData.sideBoundaryLengthM ?? null,
    metadataJson: JSON.stringify(buildPersistedParcelMetadata(parcelData)),
  });

  await db.delete(buildingsTable).where(eq(buildingsTable.analysisId, analysisId));
  if (buildingData?.buildings?.length) {
    await db.insert(buildingsTable).values(
      buildingData.buildings.map((building) => ({
        analysisId,
        footprintM2: building.footprintM2 ?? null,
        estimatedFloorAreaM2: building.estimatedFloorAreaM2 ?? null,
        avgHeightM: building.avgHeightM ?? null,
        avgFloors: building.avgFloors ?? null,
        geometryJson: building.geometryJson ? JSON.stringify(building.geometryJson) : null,
      })),
    );
  }
}

export async function runAnalysisPipeline(analysisId: string, parcelData: ParcelData, userId: string, projectDescription?: string): Promise<void> {
  console.log(`\n>>> [8-STEP TUNNEL] Starting for analysis ${analysisId}`);
  try {
    const [analysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1);
    if (!analysis) return;

    await db.update(analysesTable).set({ status: "parsing_documents", updatedAt: new Date() }).where(eq(analysesTable.id, analysisId));
    await logEvent(analysisId, "orchestration", "started", "Démarrage du tunnel déterministe en 8 étapes.");

    // The generic analysis pipeline reuses the persisted parcel context when available.
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

router.post("/parcel-preview", authenticate, async (req: AuthRequest, res) => {
  try {
    const { lat, lng, banId, label } = req.body as { lat?: number; lng?: number; banId?: string; label?: string };
    if (typeof lat !== "number" || typeof lng !== "number") {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Coordonnées requises." });
      return;
    }

    const preview = await getParcelSelectionPreview(lat, lng, banId || "", label || "");
    let zoningPreview: { zoneCode: string | null; zoningLabel: string | null } | null = null;
    try {
      const zoningInfo = await getZoningByCoords(lat, lng);
      zoningPreview = {
        zoneCode: zoningInfo?.zoneCode || null,
        zoningLabel: zoningInfo?.zoningLabel || null,
      };
    } catch (zoningErr) {
      console.warn("[analyses/parcel-preview] zoning preview unavailable:", zoningErr);
    }

    res.json({ ...preview, zoningPreview });
  } catch (err) {
    console.error("[analyses/parcel-preview]", err);
    res.status(500).json({ error: "PARCEL_PREVIEW_FAILED", message: "Impossible de précharger les parcelles autour de l'adresse." });
  }
});

// Create analysis
router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      address,
      parcelRef,
      title,
      lat,
      lng,
      banId,
      inseeCode,
      city,
      postcode,
      selectedParcels,
    } = req.body as {
      address: string;
      parcelRef?: string;
      title?: string;
      lat?: number;
      lng?: number;
      banId?: string;
      inseeCode?: string;
      city?: string;
      postcode?: string;
      selectedParcels?: SelectedParcelPayload[];
    };

    if (!address) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "L'adresse est requise." });
      return;
    }

    const [analysis] = await db.insert(analysesTable).values({
      userId: req.user!.userId,
      address,
      parcelRef,
      title: title || address,
      city: city || null,
      postalCode: postcode || null,
      status: "draft",
    }).returning();

    await logEvent(analysis.id, "creation", "completed", `Analyse créée pour : ${address}`);

    // Step 1: Geocode
    let geo:
      | { lat: number; lng: number; banId?: string; label: string; inseeCode?: string; city?: string; postcode?: string }
      | undefined;

    if (typeof lat === "number" && typeof lng === "number") {
      geo = {
        lat,
        lng,
        banId,
        label: address,
        inseeCode,
        city,
        postcode,
      };
    } else {
      const geoResults = await geocodeAddress(analysis.address);
      const firstGeo = geoResults[0];
      if (firstGeo) {
        geo = {
          lat: firstGeo.lat,
          lng: firstGeo.lng,
          banId: firstGeo.banId,
          label: firstGeo.label,
          inseeCode: firstGeo.inseeCode,
          city: firstGeo.city,
          postcode: firstGeo.postcode,
        };
      }
    }

    if (!geo) {
      await db.update(analysesTable).set({ status: "failed", updatedAt: new Date() }).where(eq(analysesTable.id, analysis.id));
      await logEvent(analysis.id, "geocoding", "failed", "Adresse non trouvée.");
      res.status(500).json({ error: "GEOCODING_FAILED", message: "Adresse non trouvée." });
      return;
    }

    // Step 2: Parcel data
    let parcelData: ParcelData;
    let buildingData: Awaited<ReturnType<typeof getBuildingsByParcel>> | null = null;
    let zoningInfo: Awaited<ReturnType<typeof getZoningByCoords>> | null = null;
    try {
      if (selectedParcels && selectedParcels.length > 0) {
        parcelData = await buildParcelDataFromSelectedFeatures(
          geo.lat,
          geo.lng,
          selectedParcels.map((parcel) => parcel.feature).filter(Boolean),
        );
      } else {
        parcelData = await getParcelByCoords(geo.lat, geo.lng, geo.banId ?? "", geo.label);
      }
    } catch (parcelErr) {
      await db.update(analysesTable).set({ status: "failed", updatedAt: new Date() }).where(eq(analysesTable.id, analysis.id));
      await logEvent(analysis.id, "parcel", "failed",
        `Données cadastrales non disponibles pour cette adresse. ${(parcelErr as Error).message}`);
      res.status(500).json({ error: "PARCEL_DATA_FAILED", message: "Données cadastrales non disponibles." });
      return;
    }

    try {
      buildingData = await getBuildingsByParcel(parcelData);
    } catch (buildingErr) {
      console.warn("[analyses/create] building context unavailable:", buildingErr);
    }

    try {
      zoningInfo = await getZoningByCoords(geo.lat, geo.lng, geo.inseeCode || geo.city || undefined);
    } catch (zoningErr) {
      console.warn("[analyses/create] zoning preview unavailable:", zoningErr);
    }

    const selectedParcelRefs =
      Array.isArray((parcelData.metadata as any)?.parcelRefs) && (parcelData.metadata as any).parcelRefs.length > 0
        ? (parcelData.metadata as any).parcelRefs.join(" + ")
        : [parcelData.cadastralSection, parcelData.parcelNumber].filter(Boolean).join(" ");

    await persistAnalysisParcelContext(analysis.id, parcelData, buildingData);

    const [updatedAnalysis] = await db.update(analysesTable).set({
      parcelRef: selectedParcelRefs || parcelRef || null,
      city: geo.city || city || null,
      postalCode: geo.postcode || postcode || null,
      zoneCode: zoningInfo?.zoneCode || null,
      zoningLabel: zoningInfo?.zoningLabel || null,
      geoContextJson: JSON.stringify(buildLockedAnalysisContext({
        address,
        geo,
        zoningInfo,
        parcelData,
        selectedParcels,
      })),
      updatedAt: new Date(),
    }).where(eq(analysesTable.id, analysis.id)).returning();

    if (selectedParcels && selectedParcels.length > 1) {
      await logEvent(analysis.id, "parcel_selection", "completed", `${selectedParcels.length} parcelles retenues pour un groupement foncier.`);
    }
    if (zoningInfo?.zoneCode) {
      await logEvent(analysis.id, "zoning_preview", "completed", `Zone détectée avant lancement : ${zoningInfo.zoneCode}.`);
    }

    setImmediate(() => runAnalysisPipeline(analysis.id, parcelData, req.user!.userId, analysis.title || ""));

    res.status(201).json(updatedAnalysis || analysis);
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
    let articles = zoneData ? await db.select().from(ruleArticlesTable).where(eq(ruleArticlesTable.zoneAnalysisId, zoneData.id)) : [];
    if (zoneData && articles.length === 0) {
      articles = synthesizeEvidenceFromSourceExcerpt(zoneData.id, zoneData.sourceExcerpt);
    }
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
    
    // Reset derived outputs while preserving the validated parcel/building context
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
