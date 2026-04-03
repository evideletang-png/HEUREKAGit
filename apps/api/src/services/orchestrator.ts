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
  townHallPromptsTable,
  geocodingCacheTable
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { extractDocumentData, extractRelevantRules, compareWithPLU, generateGlobalSynthesis } from "./pluAnalysis.js";
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
    logger.warn("[GeocodeCache] Write failed:", e);
  }
}

// ────────────────────────────────────────────────────────────────────────────

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
export async function resolveJurisdictionContext(communeInsee: string): Promise<JurisdictionContext> {
  const [communeRecord] = await db.select().from(communesTable).where(eq(communesTable.inseeCode, communeInsee)).limit(1);
  
  if (!communeRecord) {
    logger.warn(`[Jurisdiction] Unknown commune ${communeInsee}. Falling back to Global ONLY.`);
    return {
      commune_insee: communeInsee,
      jurisdiction_id: "GLOBAL",
      name: "Unknown",
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
  docs: any[], 
  userInfo: { userId: string; email?: string },
  analysisId: string | null = null
): Promise<OrchestrationResult> {
  logger.info(`>>> [8-Step Tunnel] Starting Orchestration. Dossier: ${dossierId || "N/A"}, Analysis: ${analysisId || "N/A"}`);

  // Helper: update analyses.status for progress tracking
  async function setAnalysisStatus(s: "collecting_data" | "parsing_documents" | "extracting_rules" | "calculating" | "completed" | "failed") {
    if (!analysisId) return;
    try {
      await db.update(analysesTable).set({ status: s, updatedAt: new Date() }).where(eq(analysesTable.id, analysisId));
      logger.info(`[Orchestrator] Analysis ${analysisId} status → ${s}`);
    } catch (e) {
      logger.warn("[Orchestrator] Could not update analysis status:", e);
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

  // 0. Fetch initial info
  let initialAddress = "";
  let initialCommune = "00000";
  let typeProcedure = "PCMI";
  let isCUa = false;
  let status = "BROUILLON";

  if (dossierId) {
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
    if (!dossier) throw new Error(`Dossier ${dossierId} not found.`);
    initialAddress = dossier.address || "";
    initialCommune = dossier.commune || "00000";
    typeProcedure = dossier.typeProcedure;
    isCUa = typeProcedure === "CUa";
    status = dossier.status;

    if (status === "DEPOSE" || status === "BROUILLON") {
      await WorkflowService.transitionStatus(dossierId, DOSSIER_STATUS.PRE_INSTRUCTION, "SYSTEM", "Dossier déposé : Début de la pré-instruction automatique.");
    }
  } else if (analysisId) {
    const [analysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1);
    if (!analysis) throw new Error(`Analysis ${analysisId} not found.`);
    initialAddress = analysis.address;
    initialCommune = analysis.postalCode || "00000"; // Fallback to postal code if city hidden
  }

  try {
  await setAnalysisStatus("collecting_data");

  // 1. IDENTIFY THE ANALYSIS CONTEXT (Step 1)
  const contextIdentification = await identifyAnalysisContext(initialCommune, initialAddress || undefined);
  const currentCommune = contextIdentification.commune;
  finalZone = contextIdentification.zone;
  
  // 1.1 Resolve Jurisdiction
  const jurisdictionContext = await resolveJurisdictionContext(currentCommune);

  // 2. REBUILD DOCUMENT TARGETING LOGIC (Step 2)
  const targetedDocs = await rebuildDocumentTargeting(docs, finalZone);

  // 3. Build Regulatory Context (RAG)
  const context = await buildAnalysisContext(currentCommune, finalZone, jurisdictionContext);

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
          commune: currentCommune,
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
      if (existingParcel && existingAnalysis?.zoneCode) {
        skipGeocoding = true;
        parcelData = existingParcel;
        finalZone = existingAnalysis.zoneCode;
        logger.info(`[Orchestrator] Skipping geocoding — analysis ${analysisId} already has zone ${finalZone} and parcel data.`);
      }
    } catch (e) {
      logger.warn("[Orchestrator] Could not check existing parcel:", e);
    }
  }

  if (!skipGeocoding && initialAddress) {
    try {
      // Check cache first
      let bestMatch: { lat: number; lng: number; label: string; banId?: string; inseeCode?: string } | null =
        await getCachedGeocode(initialAddress);
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
        }

        const zoningInfo = await getZoningByCoords(bestMatch.lat, bestMatch.lng, currentCommune);
        if (zoningInfo && zoningInfo.zoneCode !== finalZone) {
          finalZone = zoningInfo.zoneCode;
          const newContext = await buildAnalysisContext(currentCommune, finalZone, jurisdictionContext);
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
  let communeName = currentCommune;
  try {
    const [c] = await db.select().from(communesTable).where(eq(communesTable.inseeCode, currentCommune)).limit(1);
    if (c) communeName = c.name;
    logger.info(`[Orchestrator] Resolved ${currentCommune} to ${communeName} for extraction`);
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
    if (Array.isArray(parsed)) {
      parsedRules = parsed;
    } else if (parsed && typeof parsed === 'object') {
      parsedRules = parsed.articles || parsed.data || parsed.rules || [];
      if (!Array.isArray(parsedRules)) parsedRules = [parsedRules]; // Wrap single object
    }
  } catch (e) {
    logger.error("[Orchestrator] Failed to parse rules JSON.");
  }

  const { NormalizationService } = await import("./normalizationService.js");
  const normalizedParams = await NormalizationService.normalizeRules(parsedRules);

  await setAnalysisStatus("calculating");

  // 8. CALCULATION TUNNEL (Step 6)
  const { CalculationTunnel } = await import("./calculationTunnel.js");
  calculations = await CalculationTunnel.runTunnel(parcelData || {}, resolvedProjectData, normalizedParams);

  // 8b. PERSIST BUILDABILITY RESULTS
  if (analysisId && calculations) {
    try {
      const buildabilityData = {
        analysisId,
        maxFootprintM2: calculations?.footprint?.max ?? calculations?.footprint?.authorized ?? null,
        remainingFootprintM2: calculations?.footprint?.remaining ?? null,
        maxHeightM: calculations?.height?.max ?? null,
        setbackRoadM: calculations?.setbacks?.road ?? null,
        setbackBoundaryM: calculations?.setbacks?.boundary ?? null,
        parkingRequirement: calculations?.parking?.requirement != null ? String(calculations.parking.requirement) : null,
        greenSpaceRequirement: calculations?.greenSpace?.requirement != null ? String(calculations.greenSpace.requirement) : null,
        assumptionsJson: JSON.stringify(calculations?.assumptions || {}),
        confidenceScore: calculations?.confidence ?? 0.5,
        resultSummary: calculations?.summary ?? `Zone ${finalZone}: emprise max ${calculations?.footprint?.max ?? "?"}m², hauteur max ${calculations?.height?.max ?? "?"}m`,
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
      logger.warn("[Orchestrator] Could not persist buildability results:", bErr);
    }
  }

  // 9. MCP ENRICHMENT
  try {
    const { fetchMarketData, fetchAdminGuide } = await import("./mcpIntegration.js");
    marketData = await fetchMarketData(currentCommune);
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

  const finalUpdate = {
    metadata: currentMeta,
    globalScore: score,
    zoneCode: finalZone,
    geoContextJson: JSON.stringify({
      municipality: currentCommune,
      zone: finalZone,
      financial_analysis: financialAnalysis,
      plu_trace: strictPluAnalysis,
      mcp_context: { marketData, adminGuide }
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
      logger.warn("[Orchestrator] Could not load commune custom prompt:", e);
    }

    // Call the new analyzePLUZone with Triage & Scoring
    const { analyzePLUZone } = await import("./pluAnalysis.js");
    const fullZoneAnalysis = await analyzePLUZone(
      regulatoryContext,
      finalZone,
      `${finalZone} : Zone identifiée`,
      communeName,
      communeCustomPrompt,
      projectDescription,
      parcelData
    );

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
async function identifyAnalysisContext(communeInsee: string, address?: string) {
  logger.info(`[Step 1] Identification context for INSE ${communeInsee}, Address: ${address}`);
  
  let detectedCommune = communeInsee;
  let detectedZone = "UA";
  let lat = 0;
  let lng = 0;

  // 1. MCP Geocoding First (with DB cache)
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

  // 2. Planning (Zone Identification)
  if (lat && lng) {
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
