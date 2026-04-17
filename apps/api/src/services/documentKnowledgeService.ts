import {
  db,
  regulatoryUnitsTable,
  regulatoryZoneSectionsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { documentKnowledgeProfilesTable } from "../../../../packages/db/src/schema/documentKnowledgeProfiles.js";
import { detectCrossDocumentSignalsFromText } from "./regulatoryDocumentClassifier.js";
import { assessExtractedTextQuality, hasUsableExtractedText } from "./textQualityService.js";
import { inferUrbanRuleDescriptor } from "./urbanRuleCatalog.js";

type PersistDocumentKnowledgeProfileArgs = {
  baseIADocumentId?: string | null;
  townHallDocumentId?: string | null;
  municipalityId: string;
  documentType: string;
  documentSubtype?: string | null;
  sourceName: string;
  sourceUrl?: string | null;
  versionDate?: string | null;
  opposable?: boolean;
  sourceAuthority?: number;
  rawText: string;
  rawClassification?: Record<string, unknown>;
};

type ReasoningConfidence = "high" | "medium" | "low";
type NormativeEffect =
  | "primary"
  | "additive"
  | "restrictive"
  | "substitutive"
  | "procedural"
  | "informative";

type StoredCrossDocumentDependency = {
  topic_code: string | null;
  source_document_id: string | null;
  source_document_name: string;
  target_document_id: string | null;
  target_document_name: string;
  dependency_type:
    | "graphic_referral"
    | "annex_referral"
    | "risk_referral"
    | "overlay_referral"
    | "document_referral"
    | "subsector_referral"
    | "topic_support";
  normative_effect: NormativeEffect;
  reason: string;
  confidence: ReasoningConfidence;
};

type StoredNormativeEffectDescriptor = {
  topic_code: string | null;
  source_label: string;
  effect: NormativeEffect;
  reason: string;
  confidence: ReasoningConfidence;
};

type StoredRiskConstraint = {
  label: string;
  effect: NormativeEffect;
  confidence: ReasoningConfidence;
  note: string;
};

type StoredGraphicalDependency = {
  document_id: string | null;
  document_name: string;
  canonical_type: string | null;
  reason: string;
  confidence: ReasoningConfidence;
};

function normalizeTopicLabel(topic: { family: string; topic: string; label: string }) {
  return topic.label || topic.topic || topic.family;
}

function inferReasoningConfidence(args: {
  extractionReliability: number;
  detectedZonesCount: number;
  structuredTopicsCount: number;
  manualReviewRequired: boolean;
  crossDocumentSignalCount: number;
}): ReasoningConfidence {
  if (
    args.extractionReliability >= 0.82
    && args.detectedZonesCount > 0
    && args.structuredTopicsCount > 0
    && !args.manualReviewRequired
  ) {
    return "high";
  }

  if (
    args.extractionReliability >= 0.5
    && (args.detectedZonesCount > 0 || args.structuredTopicsCount > 0 || args.crossDocumentSignalCount > 0)
  ) {
    return "medium";
  }

  return "low";
}

function inferDocumentNormativeEffect(documentType: string, documentSubtype?: string | null): NormativeEffect {
  const hint = `${documentType || ""} ${documentSubtype || ""}`.toLowerCase();
  if (/(ppri|pprt|risk|risque|servitude|sup|spr|psmv|pvap|abf|patrimoine)/.test(hint)) return "restrictive";
  if (/(zonage|graphique|height|hauteur|dispositions particuli|annexe r[ée]glementaire)/.test(hint)) return "additive";
  if (/(definition|modalit[ée]s de calcul|lexique)/.test(hint)) return "procedural";
  if (/(padd|rapport|informative)/.test(hint)) return "informative";
  return "primary";
}

function effectFromSignalKind(kind: ReturnType<typeof detectCrossDocumentSignalsFromText>[number]["kind"]): NormativeEffect {
  switch (kind) {
    case "graphic_referral":
      return "additive";
    case "annex_referral":
      return "additive";
    case "risk_referral":
    case "overlay_referral":
      return "restrictive";
    case "subsector_referral":
      return "primary";
    default:
      return "procedural";
  }
}

function buildKnowledgeGraph(args: {
  documentType: string;
  documentSubtype?: string | null;
  sourceName: string;
  sourceDocumentId: string | null;
  detectedZones: Array<{
    zoneCode: string | null;
    parentZoneCode: string | null;
    startPage: number | null;
    endPage: number | null;
    reviewStatus: string | null;
  }>;
  structuredTopics: Array<{
    family: string;
    topic: string;
    label: string;
  }>;
  crossDocumentSignals: ReturnType<typeof detectCrossDocumentSignalsFromText>;
}) {
  const defaultEffect = inferDocumentNormativeEffect(args.documentType, args.documentSubtype);

  const zoneLinks = args.detectedZones.map((zone) => ({
    zoneCode: zone.zoneCode,
    parentZoneCode: zone.parentZoneCode,
    startPage: zone.startPage,
    endPage: zone.endPage,
    relation: zone.parentZoneCode ? "subzone_scope" : "zone_scope",
  }));

  const topicLinks = args.structuredTopics.map((topic) => ({
    topic_code: topic.topic,
    family: topic.family,
    label: topic.label,
    confidence: "medium" as ReasoningConfidence,
  }));

  const crossDocumentDependencies: StoredCrossDocumentDependency[] = args.crossDocumentSignals.map((signal) => ({
    topic_code: null,
    source_document_id: args.sourceDocumentId,
    source_document_name: args.sourceName,
    target_document_id: null,
    target_document_name: signal.label,
    dependency_type: signal.kind,
    normative_effect: effectFromSignalKind(signal.kind),
    reason: signal.excerpt
      ? `Renvoi détecté dans le document : ${signal.excerpt}`
      : `Renvoi détecté vers ${signal.label}.`,
    confidence: signal.confidence,
  }));

  const topicalSupportDependencies: StoredCrossDocumentDependency[] = args.structuredTopics.map((topic) => ({
    topic_code: topic.topic,
    source_document_id: args.sourceDocumentId,
    source_document_name: args.sourceName,
    target_document_id: null,
    target_document_name: topic.label,
    dependency_type: "topic_support",
    normative_effect: defaultEffect,
    reason: `Le document porte une matière utile sur le thème ${topic.label.toLowerCase()}.`,
    confidence: "medium",
  }));

  const graphicalDependencies: StoredGraphicalDependency[] = args.crossDocumentSignals
    .filter((signal) => signal.kind === "graphic_referral")
    .map((signal) => ({
      document_id: null,
      document_name: signal.label,
      canonical_type: /hauteur/i.test(signal.excerpt || "") ? "height_map" : "graphic_regulation",
      reason: signal.excerpt
        ? `Lecture graphique requise : ${signal.excerpt}`
        : "Le document renvoie à une pièce graphique complémentaire.",
      confidence: signal.confidence,
    }));

  const riskConstraints: StoredRiskConstraint[] = [
    ...(defaultEffect === "restrictive"
      ? [{
          label: args.sourceName,
          effect: defaultEffect,
          confidence: "high" as ReasoningConfidence,
          note: "Cette pièce porte une contrainte superposée potentiellement plus restrictive que le socle de zone.",
        }]
      : []),
    ...args.crossDocumentSignals
      .filter((signal) => signal.kind === "risk_referral" || signal.kind === "overlay_referral")
      .map((signal) => ({
        label: signal.label,
        effect: effectFromSignalKind(signal.kind),
        confidence: signal.confidence,
        note: signal.excerpt
          ? `Contrainte à recouper : ${signal.excerpt}`
          : "Une contrainte de risque ou de servitude doit être recroisée.",
      })),
  ];

  const normativeEffects: StoredNormativeEffectDescriptor[] = [
    {
      topic_code: null,
      source_label: args.sourceName,
      effect: defaultEffect,
      reason: `Effet normatif inféré à partir de ${args.documentSubtype || args.documentType}.`,
      confidence: "medium",
    },
    ...args.structuredTopics.map((topic) => ({
      topic_code: topic.topic,
      source_label: `${args.sourceName} · ${topic.label}`,
      effect: defaultEffect,
      reason: `Le document complète l'arbitrage du thème ${topic.label.toLowerCase()}.`,
      confidence: "medium" as ReasoningConfidence,
    })),
  ];

  return {
    zone_links: zoneLinks,
    topic_links: topicLinks,
    cross_document_dependencies: [...crossDocumentDependencies, ...topicalSupportDependencies],
    graphical_dependencies: graphicalDependencies,
    risk_constraints: riskConstraints,
    normative_effects: normativeEffects,
  };
}

function buildStoredReasoning(args: {
  documentType: string;
  documentSubtype?: string | null;
  sourceName: string;
  sourceDocumentId: string | null;
  opposable: boolean;
  sourceAuthority: number;
  textExtractable: boolean;
  ocrStatus: string;
  extractionMode: string;
  extractionReliability: number;
  manualReviewRequired: boolean;
  detectedZones: Array<{
    zoneCode: string | null;
    parentZoneCode: string | null;
    startPage: number | null;
    endPage: number | null;
    reviewStatus: string | null;
  }>;
  structuredTopics: Array<{
    family: string;
    topic: string;
    label: string;
  }>;
  crossDocumentSignals: ReturnType<typeof detectCrossDocumentSignalsFromText>;
}) {
  const warnings: string[] = [];
  if (!args.textExtractable) {
    warnings.push("Le texte du document reste peu exploitable et nécessite une reprise manuelle ou OCR complémentaire.");
  }
  if (args.detectedZones.length === 0) {
    warnings.push("Aucune zone stabilisée n’a encore été détectée dans ce document.");
  }
  if (args.structuredTopics.length === 0) {
    warnings.push("Aucun thème réglementaire structuré n’a encore été consolidé.");
  }
  if (args.crossDocumentSignals.length > 0) {
    warnings.push("Le document comporte des renvois ou dépendances vers d’autres pièces qui doivent être croisées.");
  }
  if (args.manualReviewRequired) {
    warnings.push("Une revue experte reste recommandée avant de considérer ce document comme entièrement stabilisé.");
  }

  const confidence = inferReasoningConfidence({
    extractionReliability: args.extractionReliability,
    detectedZonesCount: args.detectedZones.length,
    structuredTopicsCount: args.structuredTopics.length,
    manualReviewRequired: args.manualReviewRequired,
    crossDocumentSignalCount: args.crossDocumentSignals.length,
  });

  const zoneSummary = args.detectedZones.length > 0
    ? `zones détectées : ${args.detectedZones.slice(0, 4).map((zone) => zone.zoneCode).filter(Boolean).join(", ")}`
    : "aucune zone stabilisée";
  const topicSummary = args.structuredTopics.length > 0
    ? `thèmes compris : ${args.structuredTopics.slice(0, 5).map(normalizeTopicLabel).join(", ")}`
    : "aucun thème consolidé";
  const signalSummary = args.crossDocumentSignals.length > 0
    ? `renvois détectés : ${args.crossDocumentSignals.slice(0, 4).map((signal) => signal.label).join(", ")}`
    : null;
  const knowledgeGraph = buildKnowledgeGraph({
    documentType: args.documentType,
    documentSubtype: args.documentSubtype,
    sourceName: args.sourceName,
    sourceDocumentId: args.sourceDocumentId,
    detectedZones: args.detectedZones,
    structuredTopics: args.structuredTopics,
    crossDocumentSignals: args.crossDocumentSignals,
  });

  const reasoningSummary = [
    `Document ${args.opposable ? "opposable" : "complémentaire"} de type ${args.documentSubtype || args.documentType}.`,
    `Lecture ${args.textExtractable ? "réussie" : "partielle"} (${args.extractionMode}, fiabilité ${Math.round(args.extractionReliability * 100)}%).`,
    `Compréhension documentaire : ${zoneSummary}; ${topicSummary}.`,
    signalSummary,
    args.manualReviewRequired ? "Le raisonnement reste prudent et nécessite une validation humaine." : "Le document est suffisamment structuré pour alimenter directement le moteur réglementaire.",
  ].filter(Boolean).join(" ");

  return {
    pipelineVersion: "document_reasoning_v1",
    readStatus: args.textExtractable ? "done" : "partial",
    analysisStatus: args.detectedZones.length > 0 || args.structuredTopics.length > 0 ? "done" : (args.textExtractable ? "partial" : "failed"),
    understandingStatus: args.structuredTopics.length > 0 ? (args.manualReviewRequired ? "partial" : "done") : "failed",
    confidence,
    canonicalDocumentType: args.documentType,
    documentSubtype: args.documentSubtype || null,
    opposable: args.opposable,
    sourceAuthority: args.sourceAuthority,
    extraction: {
      textExtractable: args.textExtractable,
      ocrStatus: args.ocrStatus,
      extractionMode: args.extractionMode,
      extractionReliability: args.extractionReliability,
      manualReviewRequired: args.manualReviewRequired,
    },
    zones: args.detectedZones,
    topics: args.structuredTopics,
    crossDocumentSignals: args.crossDocumentSignals,
    graph: knowledgeGraph,
    warnings,
    reasoningSummary,
  };
}

function inferExtractionMode(rawText: string) {
  const normalized = rawText || "";
  if (!hasUsableExtractedText(normalized)) return "manual_only";
  if (normalized.includes("--- ANALYSE VISUELLE REGLEMENTAIRE ---")) return "layout_vision";
  const quality = assessExtractedTextQuality(normalized);
  if (quality.label === "excellent") return "native_text";
  return "ocr_text";
}

function inferOcrStatus(rawText: string) {
  const normalized = rawText || "";
  if (!hasUsableExtractedText(normalized)) return "failed";
  if (normalized.includes("--- ANALYSE VISUELLE REGLEMENTAIRE ---")) return "done";
  return "pending";
}

export async function persistDocumentKnowledgeProfile(args: PersistDocumentKnowledgeProfileArgs) {
  if (args.baseIADocumentId) {
    await db.delete(documentKnowledgeProfilesTable).where(eq(documentKnowledgeProfilesTable.baseIADocumentId, args.baseIADocumentId));
  } else if (args.townHallDocumentId) {
    await db.delete(documentKnowledgeProfilesTable).where(eq(documentKnowledgeProfilesTable.townHallDocumentId, args.townHallDocumentId));
  }

  const quality = assessExtractedTextQuality(args.rawText);
  const extractionMode = inferExtractionMode(args.rawText);
  const ocrStatus = inferOcrStatus(args.rawText);

  const sectionFilter = args.baseIADocumentId
    ? eq(regulatoryZoneSectionsTable.baseIADocumentId, args.baseIADocumentId)
    : eq(regulatoryZoneSectionsTable.townHallDocumentId, args.townHallDocumentId || "");

  const unitFilter = args.baseIADocumentId
    ? eq(regulatoryUnitsTable.baseIADocumentId, args.baseIADocumentId)
    : eq(regulatoryUnitsTable.townHallDocumentId, args.townHallDocumentId || "");

  const [sections, units] = await Promise.all([
    db.select({
      zoneCode: regulatoryZoneSectionsTable.zoneCode,
      parentZoneCode: regulatoryZoneSectionsTable.parentZoneCode,
      startPage: regulatoryZoneSectionsTable.startPage,
      endPage: regulatoryZoneSectionsTable.endPage,
      reviewStatus: regulatoryZoneSectionsTable.reviewStatus,
    }).from(regulatoryZoneSectionsTable).where(sectionFilter),
    db.select({
      theme: regulatoryUnitsTable.theme,
      articleNumber: regulatoryUnitsTable.articleNumber,
      sourceText: regulatoryUnitsTable.sourceText,
    }).from(regulatoryUnitsTable).where(unitFilter),
  ]);

  const detectedZones = sections.map((section) => ({
    zoneCode: section.zoneCode,
    parentZoneCode: section.parentZoneCode,
    startPage: section.startPage,
    endPage: section.endPage,
    reviewStatus: section.reviewStatus,
  }));

  const structuredTopics = Array.from(new Map(
    units.map((unit) => {
      const descriptor = inferUrbanRuleDescriptor(unit);
      return [`${descriptor.family}:${descriptor.topic}`, {
        family: descriptor.family,
        topic: descriptor.topic,
        label: descriptor.label,
      }];
    }),
  ).values());

  const manualReviewRequired =
    quality.label === "poor"
    || quality.label === "missing"
    || detectedZones.length === 0
    || structuredTopics.length === 0;

  const crossDocumentSignals = detectCrossDocumentSignalsFromText(args.rawText);
  const reasoning = buildStoredReasoning({
    documentType: args.documentType,
    documentSubtype: args.documentSubtype || null,
    sourceName: args.sourceName,
    sourceDocumentId: args.townHallDocumentId || args.baseIADocumentId || null,
    opposable: args.opposable ?? true,
    sourceAuthority: args.sourceAuthority ?? 0,
    textExtractable: hasUsableExtractedText(args.rawText),
    ocrStatus,
    extractionMode,
    extractionReliability: quality.score,
    manualReviewRequired,
    detectedZones,
    structuredTopics,
    crossDocumentSignals,
  });

  const profileRecord: typeof documentKnowledgeProfilesTable.$inferInsert = {
    baseIADocumentId: args.baseIADocumentId || null,
    townHallDocumentId: args.townHallDocumentId || null,
    municipalityId: args.municipalityId,
    documentType: args.documentType,
    documentSubtype: args.documentSubtype || null,
    sourceName: args.sourceName,
    sourceUrl: args.sourceUrl || null,
    versionDate: args.versionDate || null,
    opposable: args.opposable ?? true,
    status: manualReviewRequired ? "draft" : "validated",
    textExtractable: hasUsableExtractedText(args.rawText),
    ocrStatus,
    extractionMode,
    extractionReliability: quality.score,
    manualReviewRequired,
    classifierConfidence: args.rawClassification ? 0.85 : 0.6,
    sourceAuthority: args.sourceAuthority ?? 0,
    rawClassification: args.rawClassification || {},
    detectedZones,
    structuredTopics,
    reasoningSummary: reasoning.reasoningSummary,
    reasoningJson: reasoning,
    updatedAt: new Date(),
  };

  await db.insert(documentKnowledgeProfilesTable).values(profileRecord);

  return {
    detectedZonesCount: detectedZones.length,
    structuredTopicsCount: structuredTopics.length,
    manualReviewRequired,
    reasoningSummary: reasoning.reasoningSummary,
    reasoningConfidence: reasoning.confidence,
  };
}
