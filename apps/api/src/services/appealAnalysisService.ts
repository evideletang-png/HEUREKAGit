import fs from "fs";
import path from "path";
import { db } from "@workspace/db";
import {
  analysesTable,
  appealDocumentAnalysesTable,
  appealDocumentsTable,
  appealEventsTable,
  appealGroundSuggestionsTable,
  appealsTable,
  buildabilityResultsTable,
  constraintsTable,
  documentReviewsTable,
  indexedRegulatoryRulesTable,
  regulatoryUnitsTable,
  ruleArticlesTable,
  zoneAnalysesTable,
} from "@workspace/db";
import { desc, eq, or } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { loadPrompt } from "./promptLoader.js";
import { VisionService } from "./visionService.js";
import { logger } from "../utils/logger.js";

type AppealAnalysisInput = {
  appeal: any;
  dossier?: any | null;
  document: any;
  filePath: string;
  userId?: string | null;
};

type DetectedAppealPoint = {
  title?: string;
  category?: string;
  source_text?: string;
  claimant_argument?: string;
  procedural_assessment?: Record<string, unknown>;
  substantive_assessment?: Record<string, unknown>;
  admissibility_label?: string;
  opposability_label?: string;
  confidence?: string;
  required_checks?: unknown[];
  sources?: unknown[];
  seriousness_score?: number;
  response_draft?: string;
};

const ALLOWED_ADMISSIBILITY = new Set(["recevable_probable", "discutable", "irrecevable_probable", "a_confirmer"]);
const ALLOWED_CONFIDENCE = new Set(["high", "medium", "low"]);
const ALLOWED_CATEGORIES = new Set(["procedure", "urbanisme", "affichage", "notification", "interet_a_agir", "pieces", "fond_plu", "autre"]);
const ALLOWED_OPPOSABILITY = new Set(["opposable", "discutable", "non_opposable", "a_confirmer"]);

function trimText(value: unknown, max = 8000) {
  const text = String(value ?? "").replace(/\u0000/g, "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[contenu tronqué: ${text.length - max} caractères supplémentaires]`;
}

function clampScore(value: unknown, fallback = 45) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function labelToScore(label: string) {
  switch (label) {
    case "recevable_probable": return 72;
    case "discutable": return 52;
    case "irrecevable_probable": return 24;
    default: return 40;
  }
}

function normalizeEnum(value: unknown, allowed: Set<string>, fallback: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function extractJsonObject(content: string) {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(cleaned.slice(first, last + 1));
  }
  throw new Error("La réponse IA ne contient pas de JSON exploitable.");
}

async function extractAppealText(filePath: string, mimeType?: string | null) {
  const ext = path.extname(filePath).toLowerCase();
  if (mimeType?.startsWith("text/") || ext === ".txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  if (mimeType === "application/pdf" || ext === ".pdf") {
    let extractedText = "";
    try {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      extractedText = result.text || "";
    } catch (error) {
      logger.warn("[AppealAnalysis] pdf-parse failed, trying OCR fallback.", { filePath, error: String((error as Error)?.message || error) });
    }

    if (extractedText.trim().length < 250) {
      const ocrText = await VisionService.extractTextFromScannedPDF(filePath, 12);
      if (ocrText.trim().length > extractedText.trim().length) {
        extractedText = ocrText;
      }
    }
    return extractedText;
  }

  return "";
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "null";
  }
}

async function buildAppealContext(appeal: any, dossier?: any | null) {
  const dossierDocuments = dossier?.id
    ? await db.select({
      id: documentReviewsTable.id,
      title: documentReviewsTable.title,
      pieceCode: documentReviewsTable.pieceCode,
      documentNature: documentReviewsTable.documentNature,
      status: documentReviewsTable.status,
      pieceStatus: documentReviewsTable.pieceStatus,
      rawText: documentReviewsTable.rawText,
      extractedDataJson: documentReviewsTable.extractedDataJson,
      comparisonResultJson: documentReviewsTable.comparisonResultJson,
    }).from(documentReviewsTable)
      .where(eq(documentReviewsTable.dossierId, dossier.id))
      .orderBy(desc(documentReviewsTable.createdAt))
      .limit(10)
    : [];

  const analysisAddressConditions = [appeal.projectAddress, dossier?.address]
    .map((address) => String(address || "").trim())
    .filter(Boolean)
    .map((address) => eq(analysesTable.address, address));
  const linkedAnalyses = analysisAddressConditions.length > 0 ? await db.select({
    id: analysesTable.id,
    title: analysesTable.title,
    address: analysesTable.address,
    city: analysesTable.city,
    zoneCode: analysesTable.zoneCode,
    zoningLabel: analysesTable.zoningLabel,
    summary: analysesTable.summary,
    geoContextJson: analysesTable.geoContextJson,
  }).from(analysesTable)
    .where(or(...analysisAddressConditions))
    .orderBy(desc(analysesTable.createdAt))
    .limit(3)
    .catch(() => []) : [];

  const analysisIds = linkedAnalyses.map((analysis) => analysis.id);
  const zoneAnalyses = analysisIds.length > 0
    ? await db.select().from(zoneAnalysesTable).where(or(...analysisIds.map((analysisId) => eq(zoneAnalysesTable.analysisId, analysisId)))).limit(8)
    : [];
  const zoneAnalysisIds = zoneAnalyses.map((zone) => zone.id);
  const ruleArticles = zoneAnalysisIds.length > 0
    ? await db.select().from(ruleArticlesTable).where(or(...zoneAnalysisIds.map((zoneId) => eq(ruleArticlesTable.zoneAnalysisId, zoneId)))).limit(24)
    : [];
  const buildability = analysisIds.length > 0
    ? await db.select().from(buildabilityResultsTable).where(or(...analysisIds.map((analysisId) => eq(buildabilityResultsTable.analysisId, analysisId)))).limit(3)
    : [];
  const constraints = analysisIds.length > 0
    ? await db.select().from(constraintsTable).where(or(...analysisIds.map((analysisId) => eq(constraintsTable.analysisId, analysisId)))).limit(20)
    : [];

  const communeHints = [appeal.commune, dossier?.commune, dossier?.metadata?.inseeCode, dossier?.metadata?.insee_code]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const communeFilter = communeHints.length > 0
    ? or(...communeHints.map((hint) => eq(regulatoryUnitsTable.municipalityId, hint)))
    : undefined;
  const regulatoryUnits = communeFilter
    ? await db.select({
      id: regulatoryUnitsTable.id,
      municipalityId: regulatoryUnitsTable.municipalityId,
      zoneCode: regulatoryUnitsTable.zoneCode,
      documentType: regulatoryUnitsTable.documentType,
      theme: regulatoryUnitsTable.theme,
      articleNumber: regulatoryUnitsTable.articleNumber,
      title: regulatoryUnitsTable.title,
      sourceText: regulatoryUnitsTable.sourceText,
      parsedValues: regulatoryUnitsTable.parsedValues,
      confidence: regulatoryUnitsTable.confidence,
      isOpposable: regulatoryUnitsTable.isOpposable,
    }).from(regulatoryUnitsTable).where(communeFilter).limit(40)
    : [];

  const indexedRules = communeHints.length > 0
    ? await db.select({
      id: indexedRegulatoryRulesTable.id,
      communeId: indexedRegulatoryRulesTable.communeId,
      articleCode: indexedRegulatoryRulesTable.articleCode,
      themeCode: indexedRegulatoryRulesTable.themeCode,
      ruleLabel: indexedRegulatoryRulesTable.ruleLabel,
      valueNumeric: indexedRegulatoryRulesTable.valueNumeric,
      valueText: indexedRegulatoryRulesTable.valueText,
      unit: indexedRegulatoryRulesTable.unit,
      conditionText: indexedRegulatoryRulesTable.conditionText,
      normativeEffect: indexedRegulatoryRulesTable.normativeEffect,
      sourceText: indexedRegulatoryRulesTable.sourceText,
      status: indexedRegulatoryRulesTable.status,
    }).from(indexedRegulatoryRulesTable)
      .where(or(...communeHints.map((hint) => eq(indexedRegulatoryRulesTable.communeId, hint))))
      .limit(40)
    : [];

  return {
    appeal: {
      id: appeal.id,
      type: appeal.appealType,
      status: appeal.status,
      claimantRole: appeal.claimantRole,
      claimantIdentity: appeal.claimantIdentity,
      projectAddress: appeal.projectAddress,
      decisionReference: appeal.decisionReference,
      permitType: appeal.permitType,
      commune: appeal.commune,
      postingStartDate: appeal.postingStartDate,
      filingDate: appeal.filingDate,
      notificationToAuthorityDate: appeal.notificationToAuthorityDate,
      notificationToBeneficiaryDate: appeal.notificationToBeneficiaryDate,
      postingEvidenceStatus: appeal.postingEvidenceStatus,
      summary: appeal.summary,
    },
    dossier: dossier ? {
      id: dossier.id,
      title: dossier.title,
      dossierNumber: dossier.dossierNumber,
      typeProcedure: dossier.typeProcedure,
      status: dossier.status,
      address: dossier.address,
      commune: dossier.commune,
      metadata: dossier.metadata,
    } : null,
    dossier_documents: dossierDocuments.map((document) => ({
      ...document,
      rawText: trimText(document.rawText, 2500),
      extractedDataJson: trimText(document.extractedDataJson, 2500),
      comparisonResultJson: trimText(document.comparisonResultJson, 2500),
    })),
    analyses: linkedAnalyses,
    zone_analyses: zoneAnalyses.map((zone) => ({
      ...zone,
      sourceExcerpt: trimText(zone.sourceExcerpt, 1800),
      structuredJson: trimText(zone.structuredJson, 2200),
    })),
    rule_articles: ruleArticles.map((article) => ({
      id: article.id,
      articleNumber: article.articleNumber,
      title: article.title,
      summary: article.summary,
      sourceText: trimText(article.sourceText, 1600),
      structuredJson: trimText(article.structuredJson, 1800),
      confidence: article.confidence,
    })),
    buildability,
    constraints,
    regulatory_units: regulatoryUnits.map((unit) => ({
      ...unit,
      sourceText: trimText(unit.sourceText, 1400),
    })),
    indexed_rules: indexedRules.map((rule) => ({
      ...rule,
      sourceText: trimText(rule.sourceText, 1200),
    })),
  };
}

function normalizePoint(point: DetectedAppealPoint, index: number) {
  const admissibilityLabel = normalizeEnum(point.admissibility_label, ALLOWED_ADMISSIBILITY, "a_confirmer");
  const proceduralAssessment = typeof point.procedural_assessment === "object" && point.procedural_assessment
    ? point.procedural_assessment
    : {};
  const substantiveAssessment = typeof point.substantive_assessment === "object" && point.substantive_assessment
    ? point.substantive_assessment
    : {};

  return {
    title: trimText(point.title || `Point détecté ${index + 1}`, 220),
    category: normalizeEnum(point.category, ALLOWED_CATEGORIES, "autre"),
    sourceText: trimText(point.source_text || point.claimant_argument || "Extrait source non isolé.", 3000),
    claimantArgument: trimText(point.claimant_argument || point.source_text || "", 2000),
    proceduralAssessment,
    substantiveAssessment,
    admissibilityLabel,
    opposabilityLabel: normalizeEnum(
      point.opposability_label || substantiveAssessment.opposability_label,
      ALLOWED_OPPOSABILITY,
      "a_confirmer",
    ),
    confidence: normalizeEnum(point.confidence, ALLOWED_CONFIDENCE, "low"),
    requiredChecks: Array.isArray(point.required_checks) ? point.required_checks : [],
    sources: Array.isArray(point.sources) ? point.sources : [],
    seriousnessScore: clampScore(point.seriousness_score, labelToScore(admissibilityLabel)),
    responseDraft: trimText(point.response_draft || "", 2500) || null,
  };
}

export async function analyzeAppealDocument(input: AppealAnalysisInput) {
  const { appeal, dossier, document, filePath, userId } = input;
  const [analysis] = await db.insert(appealDocumentAnalysesTable).values({
    appealId: appeal.id,
    documentId: document.id,
    status: "processing",
  }).returning();

  try {
    const extractedText = await extractAppealText(filePath, document.mimeType);
    await db.update(appealDocumentsTable)
      .set({ extractedText })
      .where(eq(appealDocumentsTable.id, document.id));

    if (extractedText.trim().length < 80) {
      throw new Error("Texte du recours insuffisant ou illisible.");
    }

    const context = await buildAppealContext(appeal, dossier);
    const systemPrompt = await loadPrompt("appeal_analysis_system");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            "Analyse ce PDF de recours en moyens distincts.",
            "Le résultat doit être une aide prudente à l'instruction contradictoire, pas un avis juridique définitif.",
            "",
            "CONTEXTE INTERNE DISPONIBLE:",
            safeJson(context),
            "",
            "TEXTE EXTRAIT DU PDF DE RECOURS:",
            trimText(extractedText, 45000),
          ].join("\n"),
        },
      ],
      max_tokens: 5000,
    });

    const parsed = extractJsonObject(completion.choices[0]?.message?.content || "{}");
    const detectedPoints: DetectedAppealPoint[] = Array.isArray(parsed.detected_points) ? parsed.detected_points : [];
    const normalizedPoints: ReturnType<typeof normalizePoint>[] = detectedPoints.map((point, index) => normalizePoint(point, index));
    const globalScore = normalizedPoints.length > 0
      ? clampScore(normalizedPoints.reduce((sum, point) => sum + labelToScore(point.admissibilityLabel), 0) / normalizedPoints.length)
      : 35;
    const warnings = Array.isArray(parsed.global_warnings)
      ? parsed.global_warnings
      : (Array.isArray(parsed.warnings) ? parsed.warnings : []);

    await db.update(appealDocumentAnalysesTable)
      .set({
        status: "completed",
        summary: trimText(parsed.summary || parsed.final_assessment?.summary || "Analyse automatique terminée.", 2000),
        extractedText,
        analysisJson: parsed,
        globalAdmissibilityScore: globalScore,
        warnings,
        updatedAt: new Date(),
      })
      .where(eq(appealDocumentAnalysesTable.id, analysis.id));

    if (normalizedPoints.length > 0) {
      await db.insert(appealGroundSuggestionsTable).values(normalizedPoints.map((point) => ({
        appealId: appeal.id,
        documentAnalysisId: analysis.id,
        documentId: document.id,
        title: point.title,
        category: point.category,
        sourceText: point.sourceText,
        claimantArgument: point.claimantArgument,
        proceduralAssessment: point.proceduralAssessment,
        substantiveAssessment: point.substantiveAssessment,
        admissibilityLabel: point.admissibilityLabel,
        opposabilityLabel: point.opposabilityLabel,
        confidence: point.confidence,
        seriousnessScore: point.seriousnessScore,
        requiredChecks: point.requiredChecks,
        sources: point.sources,
        responseDraft: point.responseDraft,
        status: "suggested",
      })));
    }

    await db.update(appealsTable)
      .set({
        admissibilityScore: globalScore,
        urbanRiskScore: normalizedPoints.length > 0
          ? clampScore(normalizedPoints.reduce((sum, point) => sum + point.seriousnessScore, 0) / normalizedPoints.length)
          : appeal.urbanRiskScore,
        metadata: {
          ...(appeal.metadata || {}),
          latestAppealAnalysis: {
            documentId: document.id,
            analysisId: analysis.id,
            status: "completed",
            suggestionsCount: normalizedPoints.length,
            globalAdmissibilityScore: globalScore,
            completedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(appealsTable.id, appeal.id));

    await db.insert(appealEventsTable).values({
      appealId: appeal.id,
      userId: userId || undefined,
      type: "APPEAL_ANALYSIS_COMPLETED",
      description: `Analyse automatique du recours terminée: ${normalizedPoints.length} point(s) détecté(s).`,
      metadata: { documentId: document.id, analysisId: analysis.id, suggestionsCount: normalizedPoints.length },
    });

    return { analysisId: analysis.id, suggestionsCount: normalizedPoints.length, globalScore };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[AppealAnalysis] analysis failed", error, { appealId: appeal.id, documentId: document.id });
    await db.update(appealDocumentAnalysesTable)
      .set({
        status: "failed",
        failureReason: message,
        updatedAt: new Date(),
      })
      .where(eq(appealDocumentAnalysesTable.id, analysis.id));

    await db.insert(appealEventsTable).values({
      appealId: appeal.id,
      userId: userId || undefined,
      type: "APPEAL_ANALYSIS_FAILED",
      description: "L'analyse automatique du recours a échoué.",
      metadata: { documentId: document.id, analysisId: analysis.id, error: message },
    });

    throw error;
  }
}
