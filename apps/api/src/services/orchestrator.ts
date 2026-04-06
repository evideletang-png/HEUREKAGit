import {
  db,
  dossiersTable,
  documentReviewsTable,
  rulesTable,
  baseIADocumentsTable,
  globalConfigsTable,
  municipalitySettingsTable,
  analysesTable,
  zoneAnalysesTable,
  ruleArticlesTable,
  buildabilityResultsTable,
  parcelsTable,
  buildingsTable,
  townHallPromptsTable,
  geocodingCacheTable
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { extractDocumentData, extractRelevantRules, compareWithPLU, generateGlobalSynthesis, extractStructuredRuleCandidates, extractDeterministicRegulatoryRules, buildDeterministicZoneDigest } from "./pluAnalysis.js";
import { calculateGlobalScore } from "./scoringService.js";
import { evaluateFormalRules } from "./ruleEngine.js";
import { simulateProjectModifications } from "./simulationService.js";
import { resolveProjectData, resolveField, CandidateValue } from "./fieldResolutionService.js";
import { generateBusinessDecision } from "./decisionLayerService.js";
import { buildAnalysisContext } from "./contextBuilder.js";
import { recordDecision } from "./learningService.js";
import { logger } from "../utils/logger.js";
import { MetricsTracker, trackOpenAIUsage } from "../utils/metrics.js";
import { withRetry } from "../utils/retry.js";
import { evaluateRequiredPieces, PIECE_LABELS } from "./pieceRules.js";
import { BusinessDecisionSchema, SYSTEM_PROMPTS, JurisdictionContext, GLOBAL_POOL_ID } from "@workspace/ai-core";
import { communesTable } from "@workspace/db";

import { geocodeAddress } from "./geocoding.js";
import { getZoningByCoords } from "./planning.js";
import { getParcelByCoords, getBuildingsByParcel } from "./parcel.js";
import type { ParcelData } from "./parcel.js";
import { DVFService } from "./dvfService.js";

// ─── Geocoding cache helpers ────────────────────────────────────────────────

const GEOCODING_CACHE_TTL_DAYS = 90;

function normalizeAddressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

async function getCachedGeocode(address: string) {
  try {
    const key = normalizeAddressKey(address);
    const [row] = await db.select().from(geocodingCacheTable)
      .where(eq(geocodingCacheTable.addressKey, key))
      .limit(1);
    if (!row) return null;
    // Respect TTL
    if (row.expiresAt && row.expiresAt < new Date()) {
      await db.delete(geocodingCacheTable).where(eq(geocodingCacheTable.addressKey, key));
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

async function cacheGeocode(address: string, result: { lat: number; lng: number; label: string; banId?: string; inseeCode?: string; cityName?: string; score?: number }) {
  try {
    const key = normalizeAddressKey(address);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + GEOCODING_CACHE_TTL_DAYS);
    await db.insert(geocodingCacheTable).values({
      addressKey: key,
      originalAddress: address,
      lat: result.lat,
      lng: result.lng,
      label: result.label,
      banId: result.banId,
      inseeCode: result.inseeCode,
      cityName: result.cityName,
      score: result.score,
      expiresAt,
    }).onConflictDoUpdate({
      target: geocodingCacheTable.addressKey,
      set: { lat: result.lat, lng: result.lng, label: result.label, banId: result.banId, inseeCode: result.inseeCode, cityName: result.cityName, score: result.score, expiresAt },
    });
  } catch (e) {
    logger.warn("[GeocodeCache] Write failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

// ────────────────────────────────────────────────────────────────────────────

function parseJsonSafely<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
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

function hasReusableParcelContext(parcelRow: typeof parcelsTable.$inferSelect, metadata: Record<string, any> | null) {
  if (!parcelRow.geometryJson || parcelRow.centroidLat == null || parcelRow.centroidLng == null) {
    return false;
  }
  if (!metadata) return false;
  return metadata.perimeterM != null && metadata.depthM != null && metadata.topography != null;
}

function buildFallbackZoneArticlesFromParsedRules(parsedRules: any[]) {
  return parsedRules
    .map((rule: any, index: number) => {
      const rawArticle = rule?.article ?? rule?.articleNumber ?? rule?.article_id ?? null;
      const articleDigits = rawArticle == null ? "" : String(rawArticle).replace(/[^0-9]/g, "");
      const articleNumber = articleDigits ? parseInt(articleDigits, 10) : index + 1;
      const sourceText = String(
        rule?.sourceText
        ?? rule?.source_text
        ?? rule?.operational_rule
        ?? rule?.rule
        ?? rule?.content
        ?? ""
      ).trim();
      const summary = String(
        rule?.summary
        ?? rule?.operational_rule
        ?? rule?.rule
        ?? rule?.interpretation
        ?? sourceText
      ).trim();
      const title = String(
        rule?.title
        ?? rule?.section
        ?? (rawArticle ? `Article ${rawArticle}` : `Règle ${index + 1}`)
      ).trim();

      if (sourceText.length < 25 && summary.length < 25) return null;

      return {
        articleNumber,
        title,
        sourceText,
        summary,
        interpretation: summary,
        impactText: "",
        vigilanceText: Array.isArray(rule?.exceptions) ? rule.exceptions.join("; ") : "",
        confidence: "medium",
        structuredData: rule,
        relevanceScore: 60,
        relevanceReason: "Règle extraite directement du contexte réglementaire utilisé pour l'analyse.",
      };
    })
    .filter(Boolean);
}

/**
 * Knowledge Routing Rules: Mapping piece codes to search priorities
 */
const KNOWLEDGE_ROUTING: Record<string, { topics: string[], docTypes?: string[] }> = {
  "PCMI1": { topics: ["PADD", "Végétalisation", "Clôtures", "Insertion paysagère"], docTypes: ["padd", "plu"] },
  "PCMI2": { topics: ["Emprise au sol", "Implantation", "Limites séparatives"], docTypes: ["plu"] },
  "PCMI5": { topics: ["Façades", "Toitures", "Aspect architectural", "Matériaux"], docTypes: ["plu"] },
  "CERFA": { topics: ["Hauteur", "Stationnement", "Emprise au sol", "Reculs"], docTypes: ["plu", "reglement"] },
  "DP": { topics: ["Clôtures", "Piscines", "Extensions", "Abris de jardin"], docTypes: ["plu"] }
};

export interface OrchestrationResult {
  dossierId: string;
  status: "completed" | "failed";
  globalScore: number;
  results: any[];
  formalDecision?: any;
  businessDecision?: any;
  simulation?: any;
  conflicts?: any[];
  detectedZone?: string;
  isExpert?: boolean;
  analysisResult?: any;
  pluAnalysis?: {
    zone: string;
    controles: { categorie: string; statut: string; message: string; article: string }[];
    conclusion: string;
    calculationTunnel?: any; // Step 6 Trace
  };
  parcelData?: any;
  buildingData?: any;
  marketData?: any;
  adminGuide?: any;
  financialAnalysis?: any;
  pieceChecklist?: {
    pieces_obligatoires: string[];
    pieces_conditionnelles: string[];
    pieces_manquantes: string[];
    niveau_completude: "OK" | "INCOMPLET";
    justification_reglementaire: string[];
  };
}

/**
 * Computes a SHA-256 hash of the input string.
 */
function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

import { ABFService } from "./abfService.js";
import { WorkflowService, DOSSIER_STATUS } from "./workflowService.js";
import { MessagingService } from "./messagingService.js";

/**
 * Resolves the full legal context for a given commune.
 */
export async function resolveJurisdictionContext(communeInsee: string, communeNameHint?: string): Promise<JurisdictionContext> {
  let communeRecord = (await db.select().from(communesTable).where(eq(communesTable.inseeCode, communeInsee)).limit(1))[0];

  if (!communeRecord && communeNameHint) {
    communeRecord = (await db.select().from(communesTable)
      .where(sql`lower(${communesTable.name}) = lower(${communeNameHint})`)
      .limit(1))[0];
  }

  if (!communeRecord && communeInsee && !/^\d{5}$/.test(communeInsee)) {
    communeRecord = (await db.select().from(communesTable)
      .where(sql`lower(${communesTable.name}) = lower(${communeInsee})`)
      .limit(1))[0];
  }
  
  if (!communeRecord) {
    logger.warn(`[Jurisdiction] Unknown commune ${communeInsee}${communeNameHint ? ` (${communeNameHint})` : ""}. Falling back to Global ONLY.`);
    return {
      commune_insee: communeInsee,
      jurisdiction_id: "GLOBAL",
      name: communeNameHint || "Unknown",
      plan_scope: "national",
      active_pool_ids: [GLOBAL_POOL_ID]
    };
  }

  return {
    commune_insee: communeRecord.inseeCode,
    jurisdiction_id: communeRecord.jurisdictionId,
    name: communeRecord.name,
    plan_scope: "local", // This could be dynamic based on intercommunal settings
    active_pool_ids: [
      `${communeRecord.inseeCode}-PLU-ACTIVE`,
      `${communeRecord.jurisdictionId}-PLUi-ACTIVE`,
      GLOBAL_POOL_ID
    ]
  };
}

/**
 * Orchestrates the full analysis of a dossier.
 * Implements document change detection to avoid redundant LLM calls.
 */
/**
 * Orchestrates the full analysis of a dossier or a generic analysis.
 * Implements the 8-Step Deterministic Tunnel.
 */
export async function orchestrateDossierAnalysis(
  dossierId: string | null, 
  docsOrUser: any[] | string | { userId: string; email?: string },
  userInfoOrCommune?: { userId: string; email?: string } | string,
  analysisIdOrLegacy: string | null | boolean = null
): Promise<OrchestrationResult> {
  const docs = Array.isArray(docsOrUser) ? docsOrUser : [];
  const userInfo = Array.isArray(docsOrUser)
    ? ((typeof userInfoOrCommune === "object" && userInfoOrCommune) ? userInfoOrCommune : { userId: "SYSTEM" })
    : (typeof docsOrUser === "string" ? { userId: docsOrUser } : docsOrUser);
  const forcedCommune = !Array.isArray(docsOrUser) && typeof userInfoOrCommune === "string" ? userInfoOrCommune : null;
  const analysisId = Array.isArray(docsOrUser) && typeof analysisIdOrLegacy === "string" ? analysisIdOrLegacy : null;

  logger.info(`>>> [8-Step Tunnel] Starting Orchestration. Dossier: ${dossierId || "N/A"}, Analysis: ${analysisId || "N/A"}`);

  // Helper: update analyses.status for progress tracking
  async function setAnalysisStatus(s: "collecting_data" | "parsing_documents" | "extracting_rules" | "calculating" | "completed" | "failed") {
    if (!analysisId) return;
    try {
      await db.update(analysesTable).set({ status: s, updatedAt: new Date() }).where(eq(analysesTable.id, analysisId));
      logger.info(`[Orchestrator] Analysis ${analysisId} status → ${s}`);
    } catch (e) {
      logger.warn("[Orchestrator] Could not update analysis status", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  const metrics = new MetricsTracker();
  let score = 100;
  let finalZone = "UA";
  let parcelData: any = null;
  let buildingData: any = null;
  let marketData: any = null;
  let adminGuide: any = null;
  let calculations: any = null;
  let financialAnalysis: any = null;
  let ruleResults: any[] = [];
  let detailedResolvedFields: any[] = [];
  let abfDiagnostic: { isConcerned: boolean; reasons: string[] } = { isConcerned: false, reasons: [] };
  let sourceLock: any = null;

  // 0. Fetch initial info
  let initialAddress = "";
  let initialCommune = "00000";
  let initialCityName = "";
  let typeProcedure = "PCMI";
  let isCUa = false;
  let status = "BROUILLON";

  if (dossierId) {
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
    if (!dossier) throw new Error(`Dossier ${dossierId} not found.`);
    initialAddress = dossier.address || "";
    initialCommune = forcedCommune || dossier.commune || "00000";
    initialCityName = typeof dossier.commune === "string" ? dossier.commune : "";
    typeProcedure = dossier.typeProcedure;
    isCUa = typeProcedure === "CUa";
    status = dossier.status;

    if (status === "DEPOSE" || status === "BROUILLON") {
      await WorkflowService.transitionStatus(dossierId, DOSSIER_STATUS.PRE_INSTRUCTION, "SYSTEM", "Dossier déposé : Début de la pré-instruction automatique.");
    }
  } else if (analysisId) {
    const [analysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1);
    if (!analysis) throw new Error(`Analysis ${analysisId} not found.`);
    const existingGeoContext = analysis.geoContextJson
      ? (() => { try { return JSON.parse(analysis.geoContextJson); } catch { return null; } })()
      : null;
    sourceLock = existingGeoContext?.source_lock ?? null;
    initialAddress = sourceLock?.address || analysis.address;
    initialCityName = analysis.city || "";
    const [existingParcel] = await db.select({ metadataJson: parcelsTable.metadataJson })
      .from(parcelsTable)
      .where(eq(parcelsTable.analysisId, analysisId))
      .limit(1);
    const parcelMetadata = existingParcel?.metadataJson
      ? (() => { try { return JSON.parse(existingParcel.metadataJson); } catch { return null; } })()
      : null;
    initialCommune = forcedCommune || sourceLock?.inseeCode || parcelMetadata?.commune || analysis.city || "00000";
  }

  if (docs.length === 0) {
    if (dossierId) {
      docs.push(...await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.dossierId, dossierId)));
    } else if (analysisId) {
      docs.push(...await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.analysisId, analysisId)));
    }
  }

  try {
  await setAnalysisStatus("collecting_data");

  // 1. IDENTIFY THE ANALYSIS CONTEXT (Step 1)
  const contextIdentification = await identifyAnalysisContext(initialCommune, initialAddress || undefined, sourceLock);
  const currentCommune = contextIdentification.commune;
  finalZone = contextIdentification.zone;
  
  // 1.1 Resolve Jurisdiction
  const jurisdictionContext = await resolveJurisdictionContext(currentCommune, initialCityName);
  const regulatoryCommune = jurisdictionContext.commune_insee || currentCommune;
  const regulatoryCommuneName = (jurisdictionContext.name && jurisdictionContext.name !== "Unknown")
    ? jurisdictionContext.name
    : (initialCityName || currentCommune);

  // 2. REBUILD DOCUMENT TARGETING LOGIC (Step 2)
  const targetedDocs = await rebuildDocumentTargeting(docs, finalZone);

  // 3. Build Regulatory Context (RAG)
  const context = await buildAnalysisContext(regulatoryCommune, finalZone, jurisdictionContext);

  await setAnalysisStatus("parsing_documents");

  // 4. PARSE DOSSIER DOCUMENTS
  const fieldCandidates: Record<string, CandidateValue<any>[]> = {};
  const processedDocsMetadata: any[] = [];
  const results: any[] = [];

  for (const doc of docs) {
    const content = doc.rawText || "";
    const currentHash = computeHash(content);
    let extractionResult: any;

    try {
      extractionResult = await withRetry(() => extractDocumentData(
        content, 
        doc.documentType || "autre", 
        "document_extract",
        {
          dossierDocs: processedDocsMetadata,
          regulatoryRules: context.relevantRules,
          commune: regulatoryCommuneName,
          zoneCode: finalZone
        } as any
      ));
      
      const data = extractionResult.data || extractionResult;
      processedDocsMetadata.push(data);
      results.push({ docId: doc.id, status: "processed", task: "parse" });

      Object.entries(data).forEach(([field, value]) => {
        if (!fieldCandidates[field]) fieldCandidates[field] = [];
        if (value !== null && value !== undefined) {
            fieldCandidates[field].push({
              source: doc.documentType || "autre",
              value,
              confidence: 0.8
            });
        }
      });
    } catch (err) {
      logger.error(`[Orchestrator] PARSE failed for ${doc.id}`, err);
    }
  }

  // 5. FIELD RESOLUTION (Step A)
  let resolvedProjectDataFull = resolveProjectData(fieldCandidates);
  let resolvedProjectData: any = {};
  for (const [k, v] of Object.entries(resolvedProjectDataFull)) {
    resolvedProjectData[k] = (v as any).value;
  }

  // 6. SMART CADASTRE & ZONE ENRICHMENT (skip if analysis already has parcel + zone data)
  let skipGeocoding = false;
  if (analysisId) {
    try {
      const [existingParcel] = await db.select().from(parcelsTable)
        .where(eq(parcelsTable.analysisId, analysisId)).limit(1);
      const [existingAnalysis] = await db.select({ zoneCode: analysesTable.zoneCode })
        .from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1);
      const metadata = parseJsonSafely<Record<string, any>>(existingParcel?.metadataJson ?? null);
      const canReuseStoredParcel = !!existingParcel && !!existingAnalysis?.zoneCode && hasReusableParcelContext(existingParcel, metadata);
      if (canReuseStoredParcel && existingParcel) {
        skipGeocoding = true;
        parcelData = {
          cadastralSection: existingParcel.cadastralSection,
          parcelNumber: existingParcel.parcelNumber,
          parcelSurfaceM2: existingParcel.parcelSurfaceM2,
          geometryJson: existingParcel.geometryJson ? JSON.parse(existingParcel.geometryJson) : null,
          centroidLat: existingParcel.centroidLat,
          centroidLng: existingParcel.centroidLng,
          roadFrontageLengthM: existingParcel.roadFrontageLengthM,
          sideBoundaryLengthM: existingParcel.sideBoundaryLengthM,
          metadata: metadata || {},
          _perimeterM: metadata?.perimeterM ?? null,
          _depthM: metadata?.depthM ?? null,
          _isCornerPlot: metadata?.isCornerPlot ?? false,
          _topography: metadata?.topography ?? null,
          _classifyBoundariesResult: metadata?.frontRoadName
            ? { road_boundary_segments: [{ properties: { closest_road_name: metadata.frontRoadName } }] }
            : null,
        };
        const existingBuildings = await db.select().from(buildingsTable)
          .where(eq(buildingsTable.analysisId, analysisId));
        buildingData = {
          buildings: existingBuildings.map((building) => ({
            footprintM2: building.footprintM2 ?? 0,
            estimatedFloorAreaM2: building.estimatedFloorAreaM2 ?? 0,
            avgHeightM: building.avgHeightM ?? 0,
            avgFloors: building.avgFloors ?? 0,
            geometryJson: building.geometryJson ? JSON.parse(building.geometryJson) : null,
          })),
          rawFeatures: [],
          analyseParcelleResult: null,
        };
        parcelData.buildings = buildingData.buildings;
        finalZone = existingAnalysis.zoneCode ?? finalZone;
        logger.info(`[Orchestrator] Skipping geocoding — analysis ${analysisId} already has zone ${finalZone} and parcel data.`);
      } else if (existingParcel && existingAnalysis?.zoneCode) {
        logger.info(`[Orchestrator] Stored parcel context incomplete for analysis ${analysisId}; recomputing geodata to restore missing metrics.`);
      }
    } catch (e) {
      logger.warn("[Orchestrator] Could not check existing parcel", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!skipGeocoding && initialAddress) {
    try {
      // Check cache first
      const cachedGeocode = await getCachedGeocode(initialAddress);
      let bestMatch: { lat: number; lng: number; label: string; banId?: string; inseeCode?: string } | null = cachedGeocode
        ? {
            lat: cachedGeocode.lat,
            lng: cachedGeocode.lng,
            label: cachedGeocode.label,
            banId: cachedGeocode.banId ?? undefined,
            inseeCode: cachedGeocode.inseeCode ?? undefined,
          }
        : null;
      if (bestMatch) {
        logger.info(`[Orchestrator] Geocoding cache hit for "${initialAddress}"`);
      } else {
        const geoResults = await geocodeAddress(initialAddress);
        if (geoResults && geoResults.length > 0) {
          bestMatch = geoResults[0];
          await cacheGeocode(initialAddress, { lat: bestMatch.lat, lng: bestMatch.lng, label: bestMatch.label, banId: bestMatch.banId, inseeCode: bestMatch.inseeCode, score: (bestMatch as any).score });
        }
      }
      if (bestMatch) {
        parcelData = await getParcelByCoords(bestMatch.lat, bestMatch.lng, bestMatch.banId, bestMatch.label);
        if (parcelData) {
          buildingData = await getBuildingsByParcel(parcelData);
          const totalFootprint = buildingData.buildings.reduce((sum: number, b: any) => sum + b.footprintM2, 0);

          fieldCandidates["surface"] = fieldCandidates["surface"] || [];
          fieldCandidates["surface"].push({ source: "cadastre", value: parcelData.parcelSurfaceM2, confidence: 1.0 });

          fieldCandidates["emprise"] = fieldCandidates["emprise"] || [];
          fieldCandidates["emprise"].push({ source: "cadastre", value: totalFootprint, confidence: 0.95 });

          // ── Persist parcel + buildings to DB ──────────────────────────────
          if (analysisId) {
            try {
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

              if (buildingData?.buildings?.length > 0) {
                await db.delete(buildingsTable).where(eq(buildingsTable.analysisId, analysisId));
                await db.insert(buildingsTable).values(
                  buildingData.buildings.map((b: any) => ({
                    analysisId,
                    footprintM2: b.footprintM2 ?? null,
                    estimatedFloorAreaM2: b.estimatedFloorAreaM2 ?? null,
                    avgHeightM: b.avgHeightM ?? null,
                    avgFloors: b.avgFloors ?? null,
                    geometryJson: b.geometryJson ? JSON.stringify(b.geometryJson) : null,
                  }))
                );
              }
              logger.info(`[Orchestrator] Parcel + buildings persisted for analysis ${analysisId}`);
            } catch (persistErr) {
              logger.warn("[Orchestrator] Could not persist parcel/buildings", { error: persistErr instanceof Error ? persistErr.message : String(persistErr) });
            }
          }
        }

        const zoningInfo = await getZoningByCoords(bestMatch.lat, bestMatch.lng, currentCommune);
        if (zoningInfo && zoningInfo.zoneCode !== finalZone) {
          finalZone = zoningInfo.zoneCode;
          const newContext = await buildAnalysisContext(regulatoryCommune, finalZone, jurisdictionContext);
          context.relevantRules = newContext.relevantRules;
          context.relevantDocs = newContext.relevantDocs;
        }
        
        abfDiagnostic = await ABFService.checkABFConstraints(bestMatch.lat, bestMatch.lng);
      }
    } catch (e) {
      logger.error("[Orchestrator] Smart enrichment failed:", e);
    }
  }

  // Final resolution after enrichment
  resolvedProjectDataFull = resolveProjectData(fieldCandidates);
  detailedResolvedFields = Object.keys(fieldCandidates).map(f => resolveField(f, fieldCandidates[f]));
  resolvedProjectData = {};
  for (const [k, v] of Object.entries(resolvedProjectDataFull)) {
    resolvedProjectData[k] = (v as any).value;
  }

  await setAnalysisStatus("extracting_rules");

  // 7. RULE EXTRACTION & NORMALIZATION (Step 3, 4, 5)
  // Resolve commune name for AI extraction (mismatch fix for 37203 vs Rochecorbon)
  let communeName = regulatoryCommuneName;
  try {
    const [c] = await db.select().from(communesTable).where(eq(communesTable.inseeCode, regulatoryCommune)).limit(1);
    if (c) communeName = c.name;
    logger.info(`[Orchestrator] Resolved ${regulatoryCommune} to ${communeName} for extraction`);
  } catch (e) {}

  const regulatoryContext = context.relevantDocs.map(d => d.rawText || "").join("\n\n");
  const rawRules = await extractRelevantRules(regulatoryContext, { 
    zoneCode: finalZone, 
    cityName: communeName,
    jurisdictionContext 
  });
  
  let parsedRules: any[] = [];
  try {
    const parsed = JSON.parse(rawRules);
    parsedRules = extractStructuredRuleCandidates(parsed);

    if (parsedRules.length === 0 && parsed && typeof parsed === "object") {
      const nestedCandidates = [
        parsed?.data,
        parsed?.content,
        parsed?.result,
        parsed?.payload,
      ];

      for (const candidate of nestedCandidates) {
        const extracted = extractStructuredRuleCandidates(candidate);
        if (extracted.length > 0) {
          parsedRules = extracted;
          break;
        }
      }
    }
  } catch (e) {
    logger.error("[Orchestrator] Failed to parse rules JSON.");
  }

  const parsedRulesHaveSubstance = parsedRules.some((rule: any) => {
    const text = String(
      rule?.sourceText
      ?? rule?.source_text
      ?? rule?.operational_rule
      ?? rule?.rule
      ?? rule?.summary
      ?? rule?.content
      ?? ""
    ).trim();
    return text.length >= 40;
  });

  if (!parsedRulesHaveSubstance) {
    const deterministicRules = extractDeterministicRegulatoryRules(regulatoryContext, finalZone).map((rule) => ({
      article: rule.articleNumber,
      articleNumber: rule.articleNumber,
      title: rule.title,
      rule: rule.sourceText,
      sourceText: rule.sourceText,
      summary: rule.summary,
      interpretation: rule.interpretation,
      impactText: rule.impactText,
      vigilanceText: rule.vigilanceText,
      confidence: rule.confidence,
      structuredData: rule.structuredData,
    }));

    if (deterministicRules.length > 0) {
      parsedRules = deterministicRules;
      logger.info(`[Orchestrator] Using ${deterministicRules.length} deterministic regulatory rules for zone ${finalZone}.`);
    }
  }

  const { NormalizationService } = await import("./normalizationService.js");
  const normalizedParams = await NormalizationService.normalizeRules(parsedRules);

  const hasPluSourceData = (regulatoryContext || "").trim().length >= 200 || parsedRules.length > 0;
  const missingPluSourceMessage = hasPluSourceData
    ? null
    : `Aucun document PLU opposable indexe pour la zone ${finalZone} sur la commune ${communeName}.`;

  await setAnalysisStatus("calculating");

  // 8. CALCULATION TUNNEL (Step 6)
  if (hasPluSourceData) {
    const { CalculationTunnel } = await import("./calculationTunnel.js");
    calculations = await CalculationTunnel.runTunnel(parcelData || {}, resolvedProjectData, normalizedParams);
  } else {
    calculations = null;
    logger.warn(`[Orchestrator] Skipping buildability tunnel for analysis ${analysisId || dossierId || "N/A"} — no opposable PLU source available for zone ${finalZone}.`);
  }

  // 8b. PERSIST BUILDABILITY RESULTS
  if (analysisId && calculations) {
    try {
      // TunnelResult uses snake_case keys; normalizedParams has numeric arrays
      const maxFootprint = calculations.max_authorized_footprint_m2 ?? null;
      const remainingFootprint = calculations.remaining_footprint_m2 ?? null;
      const maxHeight = normalizedParams.max_height?.[0] ?? null;
      const roadSetback = normalizedParams.road_setback?.[0] ?? null;
      const boundarySetback = normalizedParams.boundary_setback?.[0] ?? null;
      const parkingReq = normalizedParams.parking_requirements?.[0] ?? null;
      const greenSpaceReq = normalizedParams.landscaping_requirements?.[0] ?? null;
      const assumptions = [
        ...(calculations.blocking_constraints ?? []),
        ...(calculations.uncertainties ?? []),
      ];

      const buildabilityData = {
        analysisId,
        maxFootprintM2: maxFootprint,
        remainingFootprintM2: remainingFootprint,
        maxHeightM: maxHeight,
        setbackRoadM: roadSetback,
        setbackBoundaryM: boundarySetback,
        parkingRequirement: parkingReq ? String(parkingReq) : null,
        greenSpaceRequirement: greenSpaceReq ? String(greenSpaceReq) : null,
        assumptionsJson: JSON.stringify(assumptions),
        confidenceScore: (maxFootprint != null && maxFootprint > 0) ? 0.75 : 0.4,
        resultSummary: calculations.theoretical_potential_synthesis
          ?? `Zone ${finalZone}: emprise max ${maxFootprint ?? "?"}m², hauteur max ${maxHeight ?? "?"}m`,
      };
      const [existingBuildability] = await db.select({ id: buildabilityResultsTable.id })
        .from(buildabilityResultsTable).where(eq(buildabilityResultsTable.analysisId, analysisId)).limit(1);
      if (!existingBuildability) {
        await db.insert(buildabilityResultsTable).values(buildabilityData);
      } else {
        await db.update(buildabilityResultsTable).set(buildabilityData).where(eq(buildabilityResultsTable.id, existingBuildability.id));
      }
      logger.info(`[Orchestrator] Buildability results persisted for analysis ${analysisId}`);
    } catch (bErr) {
      logger.warn("[Orchestrator] Could not persist buildability results", { error: bErr instanceof Error ? bErr.message : String(bErr) });
    }
  }

  // 9. MCP ENRICHMENT
  try {
    const { fetchMarketData, fetchAdminGuide } = await import("./mcpIntegration.js");
    marketData = await fetchMarketData(regulatoryCommune);
    adminGuide = await fetchAdminGuide(typeProcedure);
  } catch (mcpErr) {}

  // 10. FINANCIAL TAX ENRICHMENT (Step 7) - PIVOTED TO TAX-ONLY
  try {
    const { calculateFinancials, mapSettingsToParams } = await import("./financialAnalysis.js");
    const targetFootprint = calculations?.footprint?.authorized || 0;
    const projectVars = {
      surface_habitable: targetFootprint * 0.8,
      surface_taxable: targetFootprint,
      surface_taxable_creee: targetFootprint,
      surface_taxable_existante: calculations?.footprint?.existing || 0,
      type_projet: (resolvedProjectData.type_projet || 'maison') as 'maison' | 'collectif',
      cout_construction: 1500,
      nombre_stationnements: 1,
      surface_piscine: 0
    };

    let mairieParams = mapSettingsToParams(null);
    let municipalityFormulas: Record<string, string> = {};

    try {
      const [settings] = await db.select().from(municipalitySettingsTable)
        .where(sql`lower(${municipalitySettingsTable.commune}) = ${currentCommune.toLowerCase()}`).limit(1);
      if (settings) {
        mairieParams = mapSettingsToParams(settings);
        municipalityFormulas = (settings.formulas as Record<string, string>) || {};
      }
    } catch (err) {}

    financialAnalysis = calculateFinancials(projectVars, mairieParams, municipalityFormulas);
  } catch (finErr) {
    logger.warn("[Orchestrator] Tax enrichment failed");
  }

  // 11. FORMAL RULE EVALUATION & DECISION
  ruleResults = evaluateFormalRules(resolvedProjectData, context.relevantRules);
  const simulation = simulateProjectModifications(resolvedProjectData, context.relevantRules);
  const businessDecisionRaw = generateBusinessDecision(ruleResults, detailedResolvedFields, { missingCritical: [] });

  const finalMetrics = metrics.getMetrics();
  const businessDecision = BusinessDecisionSchema.parse({
    ...businessDecisionRaw,
    metrics: {
      executionTimeMs: finalMetrics.durationMs || 0,
      tokenUsage: finalMetrics.tokens.total || 0,
      estimatedCostUsd: finalMetrics.estimatedCostUsd || 0
    }
  });

  const scoring = calculateGlobalScore({ articles: parsedRules }, processedDocsMetadata);
  score = scoring.score;

  const characteristics = {
    monument_historique: resolvedProjectData.monument_historique || false,
    demolition_partielle: resolvedProjectData.demolition_partielle || false,
    zone_ABF: abfDiagnostic.isConcerned,
  };
  const checklistResult = evaluateRequiredPieces(typeProcedure, characteristics as any);
  const allRequiredCodes = [...checklistResult.pieces_obligatoires, ...checklistResult.pieces_conditionnelles];
  const receivedCodes = docs.map(d => d.pieceCode).filter(Boolean) as string[];
  const missingPieces = allRequiredCodes.filter(code => !receivedCodes.includes(code));
  
  const pieceChecklist = {
    ...checklistResult,
    pieces_manquantes: missingPieces,
    niveau_completude: (missingPieces.length === 0 ? "OK" : "INCOMPLET") as "OK" | "INCOMPLET",
  };

  // 12. FINAL UPDATE (Step 8) - BRIDGE TO ANALYSES API
  const strictPluAnalysis = {
    zone: finalZone,
    controles: ruleResults.map((r: any) => ({
      categorie: r.rule_id || "Général",
      statut: r.status === "compliant" ? "CONFORME" : "NON_CONFORME",
      message: r.justification,
      article: r.rule_id
    })),
    conclusion: businessDecision.summary
  };

  const currentMeta: any = {
    pluAnalysis: strictPluAnalysis,
    financialAnalysis: { ...financialAnalysis, type: "TAX_ONLY" },
    pieceChecklist,
    calculations,
    conflicts: detailedResolvedFields.filter(f => f.status === "conflict")
  };

  // Build geoContextJson using keys the frontend expects
  const totalBuildingFootprint = buildingData?.buildings?.reduce((s: number, b: any) => s + (b.footprintM2 || 0), 0) ?? 0;
  const parcelSurface = parcelData?.parcelSurfaceM2 ?? 0;
  const roadFrontage = parcelData?.roadFrontageLengthM ?? 0;
  const sideLength = parcelData?.sideBoundaryLengthM ?? 0;

  const finalUpdate = {
    metadata: currentMeta,
    globalScore: score,
    zoneCode: finalZone,
    geoContextJson: JSON.stringify({
      source_lock: sourceLock ?? null,
      municipality: currentCommune,
      zone: finalZone,
      financial_analysis: financialAnalysis,
      plu_trace: strictPluAnalysis,
      data_quality: {
        address_and_parcel: sourceLock?.lat && sourceLock?.lng ? "validated" : parcelData ? "calculated" : "to_confirm",
        zoning: finalZone && (sourceLock?.zoneCode || currentCommune) ? "validated" : "to_confirm",
        buildability: calculations ? "calculated" : "to_confirm",
        neighbour_context: buildingData?.buildings?.length ? "estimated" : "to_confirm",
        topography: parcelData?._topography ? "estimated" : "to_confirm",
        roads: parcelData?._classifyBoundariesResult ? "calculated" : "to_confirm",
      },
      missing_requirements: {
        plu_source: missingPluSourceMessage,
      },
      parcel: {
        id: parcelData?.metadata?.idu ?? null,
        refs: (parcelData?.metadata as any)?.parcelRefs ?? null,
        parcel_count: (parcelData?.metadata as any)?.parcelCount ?? 1,
      },
      // Keys the frontend reads directly
      parcel_metrics: {
        perimeter_m: parcelData?._perimeterM ?? null,
        depth_m: parcelData?._depthM ?? null,
        is_corner_plot: parcelData?._isCornerPlot ?? false,
      },
      parcel_boundaries: {
        road_length_m: roadFrontage || null,
        side_length_m: sideLength || null,
        front_road_name: parcelData?._classifyBoundariesResult?.road_boundary_segments?.[0]?.properties?.closest_road_name ?? null,
      },
      buildings_on_parcel: {
        count: buildingData?.buildings?.length ?? 0,
        footprint_m2: totalBuildingFootprint || null,
        coverage_ratio: parcelSurface > 0 && totalBuildingFootprint > 0 ? totalBuildingFootprint / parcelSurface : null,
        avg_height_m: buildingData?.buildings?.[0]?.avgHeightM ?? null,
        avg_floors: buildingData?.buildings?.[0]?.avgFloors ?? null,
        estimated_floor_area_m2: buildingData?.buildings?.reduce((s: number, b: any) => s + (b.estimatedFloorAreaM2 || 0), 0) || null,
      },
      neighbour_context: {
        buildings: buildingData?.buildings ?? [],
        avg_neighbour_height_m: buildingData?.buildings?.length
          ? buildingData.buildings.reduce((s: number, b: any) => s + (b.avgHeightM || 0), 0) / buildingData.buildings.length
          : null,
        urban_typology: parcelSurface > 2000 ? "pavillonnaire_diffus" : parcelSurface > 500 ? "urbain_dense" : "centre_bourg",
        dominant_alignment: normalizedParams.road_setback?.[0] === 0 ? "alignement_obligatoire" : "retrait",
      },
      roads: {
        nearest_road_name: parcelData?._classifyBoundariesResult?.road_boundary_segments?.[0]?.properties?.closest_road_name ?? null,
        distance_to_road_m: roadFrontage > 0 ? 0 : null,
        road_width_m: null,
        access_possible: roadFrontage > 0,
      },
      topography: {
        elevation_min: parcelData?._topography?.elevationMin ?? null,
        elevation_max: parcelData?._topography?.elevationMax ?? null,
        slope_percent: parcelData?._topography?.slopePercent ?? null,
        is_flat: parcelData?._topography?.isFlat ?? null,
      },
      plu: strictPluAnalysis,
      market_data: marketData ?? null,
      admin_guide: adminGuide ?? null,
    }),
    updatedAt: new Date()
  };

  if (dossierId) {
    await db.update(dossiersTable).set({ metadata: currentMeta, updatedAt: new Date() }).where(eq(dossiersTable.id, dossierId));
  }

  if (analysisId) {
    await db.update(analysesTable)
      .set(finalUpdate as any)
      .where(eq(analysesTable.id, analysisId));

    // Persist Zone Analysis & Articles for "Urbanisme" tab
    console.log(`[Orchestrator] Running AI Triage & Digest for Zone ${finalZone}...`);
    const projectDescription = (typeof currentMeta.pièces?.CERFA === 'object' ? currentMeta.pièces.CERFA.description_projet : "") || initialAddress || "";

    // Phase 2b: Load commune-specific custom prompt from town hall prompts table
    let communeCustomPrompt: string | undefined;
    try {
      const [promptRow] = await db.select({ content: townHallPromptsTable.content })
        .from(townHallPromptsTable)
        .where(sql`lower(${townHallPromptsTable.commune}) = ${communeName.toLowerCase()}`)
        .limit(1);
      if (promptRow) {
        communeCustomPrompt = promptRow.content;
        logger.info(`[Orchestrator] Loaded custom prompt for commune ${communeName}`);
      }
    } catch (e) {
      logger.warn("[Orchestrator] Could not load commune custom prompt", { error: e instanceof Error ? e.message : String(e) });
    }

    // Call the new analyzePLUZone with Triage & Scoring
    let fullZoneAnalysis: any = { zoneLabel: `Zone ${finalZone}`, digest: {}, issues: [], articles: [] };
    try {
      const { analyzePLUZone } = await import("./pluAnalysis.js");
      fullZoneAnalysis = await analyzePLUZone(
        regulatoryContext,
        finalZone,
        `${finalZone} : Zone identifiée`,
        communeName,
        communeCustomPrompt,
        projectDescription,
        parcelData,
        jurisdictionContext
      );
    } catch (pluErr) {
      logger.warn("[Orchestrator] analyzePLUZone failed, zone record will be created with empty data", { error: pluErr instanceof Error ? pluErr.message : String(pluErr) });
    }

    if (!Array.isArray(fullZoneAnalysis.articles) || fullZoneAnalysis.articles.length === 0) {
      const fallbackArticles = buildFallbackZoneArticlesFromParsedRules(parsedRules);
      if (fallbackArticles.length > 0) {
        fullZoneAnalysis.articles = fallbackArticles;
        logger.info(`[Orchestrator] Using ${fallbackArticles.length} fallback regulatory evidence entries for zone ${finalZone}.`);
      }
    }

    if ((!fullZoneAnalysis.digest || typeof fullZoneAnalysis.digest !== "object") && Array.isArray(fullZoneAnalysis.articles) && fullZoneAnalysis.articles.length > 0) {
      fullZoneAnalysis.digest = buildDeterministicZoneDigest(fullZoneAnalysis.articles, finalZone);
    }

    const [existingZone] = await db.select().from(zoneAnalysesTable)
      .where(eq(zoneAnalysesTable.analysisId, analysisId)).limit(1);
    
    let zoneAnalysisId = existingZone?.id;
    if (!zoneAnalysisId) {
      const [newZone] = await db.insert(zoneAnalysesTable).values({
        analysisId,
        zoneCode: finalZone,
        zoneLabel: fullZoneAnalysis.zoneLabel || `${finalZone} : Zone identifiée`,
        sourceExcerpt: regulatoryContext.substring(0, 50000),
        structuredJson: JSON.stringify(fullZoneAnalysis.digest || {}), // Store Digest here
        issuesJson: JSON.stringify(fullZoneAnalysis.issues || []),
      }).returning();
      zoneAnalysisId = newZone.id;
    } else {
       await db.update(zoneAnalysesTable).set({ 
         zoneCode: finalZone, 
         zoneLabel: fullZoneAnalysis.zoneLabel || `${finalZone} : Zone identifiée`,
         structuredJson: JSON.stringify(fullZoneAnalysis.digest || {}),
         issuesJson: JSON.stringify(fullZoneAnalysis.issues || []),
         updatedAt: new Date() 
       }).where(eq(zoneAnalysesTable.id, zoneAnalysisId));
    }

    // Persist Ranked Articles
    await db.delete(ruleArticlesTable).where(eq(ruleArticlesTable.zoneAnalysisId, zoneAnalysisId));
    
    const articlesToSave = fullZoneAnalysis.articles || [];
    if (articlesToSave.length > 0) {
      await db.insert(ruleArticlesTable).values(articlesToSave.map((r: any) => {
        const rawArt = String(r.article || r.articleNumber || 0);
        const artNum = parseInt(rawArt.replace(/[^0-9]/g, ''));
        
        return {
          zoneAnalysisId,
          articleNumber: isNaN(artNum) ? 0 : artNum,
          title: r.title || `Article ${rawArt}`,
          sourceText: r.sourceText || r.operational_rule || "",
          summary: r.summary || r.interpretation || "",
          impactText: r.impactText || r.impact || "",
          vigilanceText: r.vigilanceText || r.vigilance || "",
          confidence: r.confidence || "unknown",
          structuredJson: JSON.stringify({
            relevanceScore: r.relevanceScore,
            relevanceReason: r.relevanceReason,
            ...r.structuredData
          })
        };
      }));
    }
  }

  await setAnalysisStatus("completed");

  return {
    dossierId: dossierId || "ANALYSIS_ONLY",
    status: "completed",
    globalScore: score,
    analysisResult: { id: analysisId }, // Return ID for tracking
    pluAnalysis: { ...strictPluAnalysis, calculationTunnel: calculations },
    businessDecision,
    simulation,
    conflicts: currentMeta.conflicts,
    detectedZone: finalZone,
    isExpert: true,
    parcelData,
    buildingData,
    marketData,
    adminGuide,
    financialAnalysis,
    pieceChecklist,
    results: [{ task: "orchestration", result: "completed" }]
  };
  } catch (err) {
    await setAnalysisStatus("failed");
    throw err;
  }
}
/**
 * Step 1: Identify Analysis Context (MCP-First)
 */
async function identifyAnalysisContext(communeInsee: string, address?: string, sourceLock?: { lat?: number; lng?: number; inseeCode?: string; zoneCode?: string }) {
  logger.info(`[Step 1] Identification context for INSE ${communeInsee}, Address: ${address}`);
  
  let detectedCommune = sourceLock?.inseeCode || communeInsee;
  let detectedZone = sourceLock?.zoneCode || "UA";
  let lat = typeof sourceLock?.lat === "number" ? sourceLock.lat : 0;
  let lng = typeof sourceLock?.lng === "number" ? sourceLock.lng : 0;

  if (lat && lng) {
    logger.info("[Step 1] Using locked analysis context from validated selection.");
  }

  // 1. MCP Geocoding First (with DB cache)
  if (!lat || !lng) {
    const cachedStep1 = address ? await getCachedGeocode(address) : null;
    if (cachedStep1) {
      lat = cachedStep1.lat;
      lng = cachedStep1.lng;
      detectedCommune = cachedStep1.inseeCode || communeInsee;
      logger.info(`[Step 1] Geocoding cache hit for "${address}"`);
    } else {
      try {
        const { callMcpTool } = await import("./mcpClient.js");
        const geocodeResult = await callMcpTool("https://mcp.data.gouv.fr/mcp", "geocode", { q: address });
        if (geocodeResult && geocodeResult.lat) {
          lat = geocodeResult.lat;
          lng = geocodeResult.lng;
          detectedCommune = geocodeResult.citycode || communeInsee;
          logger.info(`[MCP Step 1] Geocoding successful: ${lat}, ${lng} (INSEE: ${detectedCommune})`);
          if (address) await cacheGeocode(address, { lat, lng, label: address, inseeCode: detectedCommune });
        }
      } catch (err) {
        logger.warn("[MCP Step 1] Geocoding MCP failed, falling back to legacy fetch.");
        const gResults = await geocodeAddress(address || "");
        if (gResults.length > 0) {
          lat = gResults[0].lat;
          lng = gResults[0].lng;
          detectedCommune = gResults[0].inseeCode || communeInsee;
          if (address) await cacheGeocode(address, { lat, lng, label: gResults[0].label, banId: gResults[0].banId, inseeCode: detectedCommune, score: gResults[0].score });
        }
      }
    }
  }

  // 2. Planning (Zone Identification)
  if (lat && lng && !sourceLock?.zoneCode) {
     const zoneInfo = await getZoningByCoords(lat, lng, detectedCommune);
     detectedZone = zoneInfo?.zoneCode || "UA";
  }

  return {
    commune: detectedCommune,
    zone: detectedZone,
    lat,
    lng,
    plu_type: "PLU",
    project_type: "PCMI",
    constraints_context: []
  };
}

/**
 * Step 2: Rebuild Document Targeting Logic
 */
async function rebuildDocumentTargeting(docs: any[], targetZone: string) {
  const selected = [];
  const excluded = [];

  for (const doc of docs) {
    const type = doc.documentType || "other";
    const content = doc.rawText || "";
    
    // RE-MAPPING LOGIC BY MEANING
    if (content.toUpperCase().includes(`ZONE ${targetZone}`)) {
      selected.push({ name: doc.title, type: "reglement_zone", zone: targetZone, priority_reason: "Match zone content" });
    } else if (type === "plu_reglement") {
      selected.push({ name: doc.title, type: "reglement_zone", zone: "ALL", priority_reason: "Metadata type match" });
    } else {
      excluded.push({ name: doc.title, reason: "Incompatible with target zone or scope" });
    }
  }

  return { selected_documents: selected, excluded_documents: excluded };
}
