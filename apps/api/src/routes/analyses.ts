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
  baseIAEmbeddingsTable,
} from "@workspace/db";
import { eq, desc, and, count, sql, or, ilike, inArray } from "drizzle-orm";
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
import { extractDeterministicRegulatoryRules } from "../services/pluAnalysis.js";
import { loadRegulatoryUnits, buildArticlesFromRegulatoryUnits } from "../services/regulatoryUnitService.js";
import { buildArticlesFromUrbanRules, loadStructuredRulesForAnalysis } from "../services/urbanRuleExtractionService.js";
import { buildMunicipalityTextFilter, resolveMunicipalityAliases, uniqueNonEmpty } from "../services/municipalityAliasService.js";
import { generateCadastralExtractPDF } from "../services/cadastralExtractService.js";

const router: IRouter = Router();

function synthesizeEvidenceFromSourceExcerpt(zoneAnalysisId: string, sourceExcerpt: string | null | undefined) {
  return extractDeterministicRegulatoryRules(sourceExcerpt || "").map((article, index) => ({
    id: `source-excerpt-${index}`,
    zoneAnalysisId,
    articleNumber: article.articleNumber,
    title: article.title,
    sourceText: article.sourceText,
    summary: article.summary,
    impactText: article.impactText,
    vigilanceText: article.vigilanceText,
    confidence: article.confidence,
    structuredJson: JSON.stringify(article.structuredData || { fallback: "source_excerpt" }),
  }));
}

async function synthesizeEvidenceFromBaseIAChunks(args: {
  municipalityId: string;
  communeName?: string | null;
  zoneCode?: string | null;
  zoneAnalysisId: string;
}) {
  const resolved = await resolveMunicipalityAliases(args.municipalityId, args.communeName);
  const aliases = uniqueNonEmpty([resolved.municipalityId, ...resolved.aliases, args.municipalityId, args.communeName]);
  if (aliases.length === 0) return [];

  const zoneCode = String(args.zoneCode || "").trim();
  const zoneNeedles = zoneCode
    ? [
        `%zone ${zoneCode}%`,
        `%${zoneCode} - article%`,
        `%${zoneCode}-article%`,
        `%${zoneCode} article%`,
        `%dispositions applicables%${zoneCode}%`,
      ]
    : [];

  const baseConditions = [
    buildMunicipalityTextFilter(baseIAEmbeddingsTable.municipalityId, aliases),
    sql`${baseIAEmbeddingsTable.metadata}->>'status' = 'active'`,
    inArray(sql`${baseIAEmbeddingsTable.metadata}->>'document_type'`, ["plu_reglement", "plu_annexe"]),
  ];

  const zoneClause = zoneNeedles.length > 0
    ? or(...zoneNeedles.map((needle) => ilike(baseIAEmbeddingsTable.content, needle)))
    : undefined;

  let chunks = await db.select({
    id: baseIAEmbeddingsTable.id,
    content: baseIAEmbeddingsTable.content,
    pageNumber: baseIAEmbeddingsTable.pageNumber,
    metadata: baseIAEmbeddingsTable.metadata,
  })
    .from(baseIAEmbeddingsTable)
    .where(and(...baseConditions, zoneClause))
    .orderBy(desc(sql`COALESCE((${baseIAEmbeddingsTable.metadata}->>'source_authority')::numeric, 0)`), baseIAEmbeddingsTable.chunkIndex)
    .limit(12);

  if (chunks.length === 0 && zoneCode) {
    chunks = await db.select({
      id: baseIAEmbeddingsTable.id,
      content: baseIAEmbeddingsTable.content,
      pageNumber: baseIAEmbeddingsTable.pageNumber,
      metadata: baseIAEmbeddingsTable.metadata,
    })
      .from(baseIAEmbeddingsTable)
      .where(and(...baseConditions))
      .orderBy(desc(sql`COALESCE((${baseIAEmbeddingsTable.metadata}->>'source_authority')::numeric, 0)`), baseIAEmbeddingsTable.chunkIndex)
      .limit(8);
  }

  if (chunks.length === 0) return [];

  const deterministicArticles = extractDeterministicRegulatoryRules(chunks.map((chunk) => chunk.content).join("\n\n---\n\n"));
  if (deterministicArticles.length > 0) {
    return deterministicArticles.slice(0, 12).map((article, index) => ({
      id: `base-ia-deterministic-${index}`,
      zoneAnalysisId: args.zoneAnalysisId,
      articleNumber: article.articleNumber,
      title: article.title,
      sourceText: article.sourceText,
      summary: article.summary,
      impactText: article.impactText,
      vigilanceText: article.vigilanceText,
      confidence: article.confidence,
      structuredJson: JSON.stringify({
        structured_source: "base_ia_chunks",
        relevanceScore: 70,
        relevanceReason: "Preuve reconstituée depuis les chunks Base IA indexés pour la commune.",
      }),
    }));
  }

  return chunks.map((chunk, index) => {
    const metadata = (chunk.metadata || {}) as Record<string, any>;
    const articleRaw = metadata.article_id || metadata.article || null;
    const articleDigits = articleRaw ? String(articleRaw).replace(/[^0-9]/g, "") : "";
    const articleNumber = articleDigits ? Number(articleDigits) : index + 1;
    const content = String(chunk.content || "").trim();
    return {
      id: `base-ia-chunk-${chunk.id}`,
      zoneAnalysisId: args.zoneAnalysisId,
      articleNumber,
      title: metadata.section_title || (articleRaw ? `Article ${articleRaw}` : `Source Base IA ${index + 1}`),
      sourceText: content,
      summary: content.slice(0, 600),
      impactText: "",
      vigilanceText: zoneCode && !content.toLowerCase().includes(zoneCode.toLowerCase())
        ? `Source communale opposable retrouvée, mais le rattachement exact à la zone ${zoneCode} reste à confirmer.`
        : "",
      confidence: "medium",
      structuredJson: JSON.stringify({
        structured_source: "base_ia_chunks",
        source_page: chunk.pageNumber,
        document_type: metadata.document_type,
        relevanceScore: zoneCode && content.toLowerCase().includes(zoneCode.toLowerCase()) ? 68 : 45,
        relevanceReason: "Preuve reconstituée depuis les chunks Base IA indexés pour la commune.",
      }),
    };
  });
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
    const { lat, lng, banId, label, banParcelles } = req.body as { lat?: number; lng?: number; banId?: string; label?: string; banParcelles?: string[] };
    if (typeof lat !== "number" || typeof lng !== "number") {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Coordonnées requises." });
      return;
    }

    const preview = await getParcelSelectionPreview(lat, lng, banId || "", label || "", banParcelles);
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
      banParcelles,
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
      banParcelles?: string[];
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
        parcelData = await getParcelByCoords(geo.lat, geo.lng, geo.banId ?? "", geo.label, banParcelles);
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
    let effectiveZoneIssuesJson = zoneData?.issuesJson || null;
    if (zoneData && articles.length === 0) {
      const geoContext = analysis.geoContextJson
        ? (typeof analysis.geoContextJson === "string" ? JSON.parse(analysis.geoContextJson) : analysis.geoContextJson)
        : null;
      const municipalityId = geoContext?.source_lock?.inseeCode || analysis.city || null;
      const communeName = geoContext?.source_lock?.city || analysis.city || null;
      const structuredRuleLoad = municipalityId
        ? await loadStructuredRulesForAnalysis({
            municipalityId,
            communeName,
            zoneCode: zoneData.zoneCode || analysis.zoneCode || undefined,
            minAuthority: 7,
          })
        : { source: "none" as const, rules: [] };
      const structuredUrbanRules = structuredRuleLoad.rules;
      const canonicalUnits = municipalityId && structuredUrbanRules.length === 0
        ? await loadRegulatoryUnits({
            municipalityId,
            communeName,
            zoneCode: zoneData.zoneCode || analysis.zoneCode || undefined,
            minAuthority: 7,
          })
        : [];

      if (structuredUrbanRules.length > 0 || canonicalUnits.length > 0) {
        const sourceArticles = structuredUrbanRules.length > 0
          ? buildArticlesFromUrbanRules(structuredUrbanRules)
          : buildArticlesFromRegulatoryUnits(canonicalUnits);
        articles = sourceArticles.map((article, index) => ({
          id: `canonical-${index}`,
          zoneAnalysisId: zoneData.id,
          articleNumber: article.articleNumber,
          title: article.title,
          sourceText: article.sourceText,
          summary: article.summary,
          impactText: article.impactText,
          vigilanceText: article.vigilanceText,
          confidence: article.confidence,
          structuredJson: JSON.stringify({
            structured_source: structuredRuleLoad.source,
            ...(article.structuredData || {}),
          }),
        }));
        try {
          const existingIssues = zoneData.issuesJson
            ? (typeof zoneData.issuesJson === "string" ? JSON.parse(zoneData.issuesJson) : zoneData.issuesJson)
            : [];
          if (Array.isArray(existingIssues)) {
            effectiveZoneIssuesJson = JSON.stringify(existingIssues.filter((issue: any) =>
              issue?.type !== "NO_PLU_DATA"
              && issue?.code !== "NO_PLU_DATA"
              && issue?.type !== "PLU_ZONE_READ_INSUFFICIENT"
              && issue?.code !== "PLU_ZONE_READ_INSUFFICIENT"
            ));
          }
        } catch {
          effectiveZoneIssuesJson = zoneData.issuesJson;
        }
      } else {
        articles = municipalityId
          ? await synthesizeEvidenceFromBaseIAChunks({
              municipalityId,
              communeName,
              zoneCode: zoneData.zoneCode || analysis.zoneCode || undefined,
              zoneAnalysisId: zoneData.id,
            })
          : [];
        if (articles.length === 0) {
          articles = synthesizeEvidenceFromSourceExcerpt(zoneData.id, zoneData.sourceExcerpt);
        }
      }
    }
    if (zoneData && articles.length > 0 && effectiveZoneIssuesJson) {
      try {
        const existingIssues = typeof effectiveZoneIssuesJson === "string" ? JSON.parse(effectiveZoneIssuesJson) : effectiveZoneIssuesJson;
        if (Array.isArray(existingIssues)) {
          effectiveZoneIssuesJson = JSON.stringify(existingIssues.filter((issue: any) =>
            issue?.type !== "NO_PLU_DATA"
            && issue?.code !== "NO_PLU_DATA"
            && issue?.type !== "PLU_ZONE_READ_INSUFFICIENT"
            && issue?.code !== "PLU_ZONE_READ_INSUFFICIENT"
          ));
        }
      } catch {
        // Keep the persisted issues as-is if an older row contains unexpected JSON.
      }
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
      zoneAnalysis: zoneData ? { ...zoneData, issuesJson: effectiveZoneIssuesJson, articles } : null,
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

// Cadastral extract PDF download
// Accepts an optional { mapImage: "data:image/png;base64,..." } body.
// The map image is generated client-side (browser canvas + tile proxy) to bypass
// IGN's server-side origin allowlist restriction on their WMS GetMap endpoint.
router.post("/:id/cadastral-extract", authenticate, async (req: AuthRequest, res) => {
  try {
    const idStr = req.params.id as string;
    const [analysis] = await db.select().from(analysesTable)
      .where(and(eq(analysesTable.id, idStr), eq(analysesTable.userId, req.user!.userId))).limit(1);
    if (!analysis) {
      res.status(404).json({ error: "NOT_FOUND", message: "Analyse non trouvée." });
      return;
    }
    const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, idStr)).limit(1);
    if (!parcel) {
      res.status(404).json({ error: "NO_PARCEL", message: "Données cadastrales non disponibles." });
      return;
    }

    // Decode optional map image sent as base64 data URL from the browser
    let mapImageBytes: Uint8Array | null = null;
    const mapImage = req.body?.mapImage;
    if (typeof mapImage === "string" && mapImage.startsWith("data:image/")) {
      const base64 = mapImage.replace(/^data:image\/\w+;base64,/, "");
      mapImageBytes = new Uint8Array(Buffer.from(base64, "base64"));
    }

    const pdfBytes = await generateCadastralExtractPDF(parcel, analysis, mapImageBytes);
    const filename = `extrait-cadastral-${parcel.cadastralSection || "parcelle"}-${parcel.parcelNumber || idStr}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBytes.byteLength);
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("[analyses/cadastral-extract]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur lors de la génération de l'extrait." });
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
