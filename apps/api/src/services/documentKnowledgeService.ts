import {
  db,
  regulatoryUnitsTable,
  regulatoryZoneSectionsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { documentKnowledgeProfilesTable } from "../../../../packages/db/src/schema/documentKnowledgeProfiles.js";
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

  await db.insert(documentKnowledgeProfilesTable).values({
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
    updatedAt: new Date(),
  });

  return {
    detectedZonesCount: detectedZones.length,
    structuredTopicsCount: structuredTopics.length,
    manualReviewRequired,
  };
}
