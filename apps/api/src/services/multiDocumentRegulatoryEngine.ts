import { buildCrossDocumentReasoning } from "./crossDocumentReasoner.js";
import { classifyRegulatoryDocumentSet } from "./regulatoryDocumentClassifier.js";
import { buildZoneRegulatoryIndex } from "./regulatoryIndexer.js";
import {
  formatMultiDocumentOperationalConclusion,
  formatMultiDocumentOtherPieces,
  formatMultiDocumentProfessionalInterpretation,
} from "./regulatoryOutputFormatter.js";
import type { ClassifiedRegulatoryDocument, RegulatoryEngineOutput } from "./regulatoryInterpretationTypes.js";
import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";

type TownHallDocumentLike = {
  id: string;
  title?: string | null;
  fileName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
  rawText?: string | null;
  isOpposable?: boolean | null;
  structuredContent?: unknown;
};

type DocumentProfileLike = {
  id?: string | null;
  townHallDocumentId?: string | null;
  documentType?: string | null;
  documentSubtype?: string | null;
  sourceName?: string | null;
  opposable?: boolean | null;
  classifierConfidence?: number | null;
  sourceAuthority?: number | null;
  extractionMode?: string | null;
  extractionReliability?: number | null;
  manualReviewRequired?: boolean | null;
  rawClassification?: unknown;
  detectedZones?: unknown;
  structuredTopics?: unknown;
};

type SegmentLike = {
  id: string;
  documentId: string;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  anchorType: string | null;
  anchorLabel: string | null;
  themeCode: string;
  sourceTextFull: string;
  documentTitle?: string | null;
};

type OverlayLike = {
  id: string;
  overlayCode: string;
  overlayLabel: string | null;
  overlayType: string | null;
  status: string | null;
};

type ZoneSectionLike = {
  id: string;
  zoneCode: string;
  heading: string | null;
  sourceText: string | null;
  startPage: number | null;
  endPage: number | null;
  townHallDocumentId?: string | null;
  documentTitle?: string | null;
};

export function buildMultiDocumentRegulatoryEngine(args: {
  commune: string;
  zoneCode: string;
  docs: TownHallDocumentLike[];
  profiles: DocumentProfileLike[];
  segments: SegmentLike[];
  rules: StructuredUrbanRuleSource[];
  overlays: OverlayLike[];
  zoneSections?: ZoneSectionLike[];
}) {
  const documentSet = classifyRegulatoryDocumentSet({
    docs: args.docs,
    profiles: args.profiles,
    zoneCode: args.zoneCode,
  });

  const index = buildZoneRegulatoryIndex({
    commune: args.commune,
    zoneCode: args.zoneCode,
    documents: documentSet,
    segments: args.segments,
    rules: args.rules,
    overlays: args.overlays,
    zoneSections: args.zoneSections,
  });

  const engineOutput = buildCrossDocumentReasoning({
    index,
    overlays: args.overlays,
    rules: args.rules,
    documents: documentSet,
  });

  return {
    index,
    documentSet,
    engineOutput,
    professionalInterpretation: formatMultiDocumentProfessionalInterpretation(engineOutput),
    operationalConclusion: formatMultiDocumentOperationalConclusion(engineOutput),
    otherDocuments: formatMultiDocumentOtherPieces(engineOutput),
  };
}

export type { ClassifiedRegulatoryDocument, RegulatoryEngineOutput };
