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

function buildStoredReasoning(args: {
  documentType: string;
  documentSubtype?: string | null;
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
