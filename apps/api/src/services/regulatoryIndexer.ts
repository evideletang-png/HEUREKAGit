import { REGULATORY_ARTICLE_REFERENCE, REGULATORY_THEME_SEED } from "./regulatoryCalibrationService.js";
import { detectCrossDocumentSignalsFromText } from "./regulatoryDocumentClassifier.js";
import { normalizeExtractedText } from "./textQualityService.js";
import type {
  ClassifiedRegulatoryDocument,
  IndexedRegulatorySource,
  IndexedTopicBundle,
  ZoneRegulatoryIndex,
  CrossDocumentSignal,
} from "./regulatoryInterpretationTypes.js";
import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";

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

type OverlayLike = {
  id: string;
  overlayCode: string;
  overlayLabel: string | null;
  overlayType: string | null;
  status: string | null;
};

const THEME_LABEL_BY_CODE: Map<string, string> = new Map(
  REGULATORY_THEME_SEED.map(([code, label]) => [code, label]),
);

const ARTICLE_HINT_BY_THEME: Map<string, string> = new Map(
  REGULATORY_THEME_SEED
    .filter((entry) => !!entry[3])
    .map(([code, , , articleHint]) => [code, String(articleHint)]),
);

const ARTICLE_TITLE_BY_CODE: Map<string, string> = new Map(
  REGULATORY_ARTICLE_REFERENCE.map((entry) => [entry.code, entry.label]),
);

const TOPIC_ALIAS_MAP: Record<string, string> = {
  footprint: "emprise_sol",
  height: "hauteur",
  parking: "stationnement",
  green_space: "espaces_verts",
  greenSpace: "espaces_verts",
  setback_public: "recul_voie",
  setback_side: "recul_limite",
  setback_between_buildings: "distance_entre_batiments",
  access_roads: "acces_voirie",
  networks: "reseaux",
  land_use_restrictions: "interdictions",
  specific_zone_rules: "conditions_particulieres",
  risk_restrictions: "risques",
};

function normalizeZoneCode(value: string | null | undefined) {
  return normalizeExtractedText(value || "").replace(/\s+/g, "");
}

function inferArticleCodeFromText(...values: Array<string | null | undefined>) {
  const merged = values.filter(Boolean).join("\n");
  const match = merged.match(/(?:article|art\.)\s*(\d{1,2})\b/i);
  return match?.[1] || null;
}

function inferTopicCode(source: {
  themeCode?: string | null;
  ruleTopic?: string | null;
  ruleFamily?: string | null;
  articleCode?: string | null;
  anchorLabel?: string | null;
  text?: string | null;
}) {
  const directTheme = String(source.themeCode || source.ruleTopic || "").trim();
  if (directTheme) {
    return TOPIC_ALIAS_MAP[directTheme] || directTheme;
  }

  const family = String(source.ruleFamily || "").trim();
  if (family) {
    return TOPIC_ALIAS_MAP[family] || family;
  }

  const articleCode = source.articleCode || inferArticleCodeFromText(source.anchorLabel, source.text);
  if (articleCode) {
    const themeEntry = Array.from(ARTICLE_HINT_BY_THEME.entries()).find(([, hint]) => hint === articleCode);
    if (themeEntry?.[0]) return themeEntry[0];
  }

  const haystack = normalizeExtractedText([source.anchorLabel, source.text].filter(Boolean).join(" "));
  if (haystack.includes("stationnement")) return "stationnement";
  if (haystack.includes("emprise au sol") || haystack.includes("ces")) return "emprise_sol";
  if (haystack.includes("hauteur") || haystack.includes("acrotere") || haystack.includes("egout")) return "hauteur";
  if (haystack.includes("limites separatives")) return "recul_limite";
  if (haystack.includes("voie") || haystack.includes("alignement")) return "recul_voie";
  if (haystack.includes("pleine terre") || haystack.includes("plantations")) return "espaces_verts";
  if (haystack.includes("risque") || haystack.includes("ppri") || haystack.includes("pprt")) return "risques";
  return "conditions_particulieres";
}

function makeQualificationFromDocument(doc: ClassifiedRegulatoryDocument): IndexedRegulatorySource["qualification"] {
  switch (doc.normative_weight) {
    case "opposable_direct":
      return "règle opposable directe";
    case "opposable_indirect":
      return "règle opposable indirecte";
    case "orientation":
      return "orientation de projet";
    case "justification":
      return "justification / doctrine locale";
    default:
      return "information de contexte";
  }
}

function buildDocumentSummary(doc: ClassifiedRegulatoryDocument) {
  const parts = [
    doc.document_type || doc.canonical_type,
    doc.reasoning_note,
  ].filter(Boolean);
  return parts.join(" · ");
}

function dedupeSignals(signals: CrossDocumentSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.kind}:${signal.label}:${signal.excerpt || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createEmptyTopicBundle(topicCode: string): IndexedTopicBundle {
  return {
    topic_code: topicCode,
    topic_label: THEME_LABEL_BY_CODE.get(topicCode) || topicCode,
    relevant_articles: ARTICLE_HINT_BY_THEME.get(topicCode) ? [ARTICLE_HINT_BY_THEME.get(topicCode)!] : [],
    sources: [],
    direct_rules: [],
    indirect_sources: [],
    graphical_sources: [],
    risk_sources: [],
    cross_document_signals: [],
  };
}

function getRuleThemeCode(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & {
    themeCode?: string | null;
    ruleTopic?: string | null;
    ruleFamily?: string | null;
  };
  return inferTopicCode({
    themeCode: typedRule.themeCode || null,
    ruleTopic: typedRule.ruleTopic || null,
    ruleFamily: typedRule.ruleFamily || null,
  });
}

function getRuleArticleCode(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & {
    sourceArticle?: string | null;
    articleCode?: string | null;
    ruleAnchorLabel?: string | null;
    sourceExcerpt?: string | null;
    ruleTextRaw?: string | null;
  };
  const explicit = typedRule.sourceArticle || typedRule.articleCode || null;
  if (explicit) {
    const normalized = String(explicit).replace(/\D+/g, "");
    if (normalized) return normalized;
  }
  return inferArticleCodeFromText(
    typedRule.ruleAnchorLabel || null,
    typedRule.sourceExcerpt || typedRule.ruleTextRaw || null,
  ) || null;
}

function getRuleRawText(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & {
    ruleTextRaw?: string | null;
    sourceText?: string | null;
    sourceExcerpt?: string | null;
  };
  return String(typedRule.ruleTextRaw || typedRule.sourceText || typedRule.sourceExcerpt || "");
}

function getRuleDocumentId(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { sourceDocumentId?: string | null; documentId?: string | null };
  return typedRule.sourceDocumentId || typedRule.documentId || null;
}

function getRuleDocumentName(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { sourceDocumentName?: string | null };
  return typedRule.sourceDocumentName || null;
}

function getRuleSourcePage(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { sourcePage?: number | null };
  return typeof typedRule.sourcePage === "number" ? typedRule.sourcePage : null;
}

function getRuleSourcePageEnd(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { sourcePageEnd?: number | null };
  return typeof typedRule.sourcePageEnd === "number" ? typedRule.sourcePageEnd : null;
}

function getRuleAnchorType(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { ruleAnchorType?: string | null };
  return typedRule.ruleAnchorType || null;
}

function getRuleAnchorLabel(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { ruleAnchorLabel?: string | null };
  return typedRule.ruleAnchorLabel || null;
}

function getRuleSummary(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { ruleSummary?: string | null; ruleLabel?: string | null };
  return String(typedRule.ruleSummary || getRuleRawText(rule) || typedRule.ruleLabel || "");
}

function getRuleNormativeEffect(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { normativeEffect?: string | null };
  return String(typedRule.normativeEffect || "");
}

function getRuleReviewStatus(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { reviewStatus?: string | null };
  return String(typedRule.reviewStatus || "");
}

function getRuleZoneCode(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { zoneCode?: string | null };
  return String(typedRule.zoneCode || "");
}

function getRuleRelationResolutionNote(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { relationResolutionNote?: string | null };
  return typedRule.relationResolutionNote || null;
}

function ensureTopicBundle(map: Map<string, IndexedTopicBundle>, topicCode: string) {
  const normalized = topicCode || "conditions_particulieres";
  if (!map.has(normalized)) {
    map.set(normalized, createEmptyTopicBundle(normalized));
  }
  return map.get(normalized)!;
}

export function buildZoneRegulatoryIndex(args: {
  commune: string;
  zoneCode: string;
  documents: ClassifiedRegulatoryDocument[];
  segments: SegmentLike[];
  rules: StructuredUrbanRuleSource[];
  overlays: OverlayLike[];
  zoneSections?: ZoneSectionLike[];
}) : ZoneRegulatoryIndex {
  const normalizedZone = normalizeZoneCode(args.zoneCode);
  const subzoneCandidates = new Set<string>();
  const topicMap = new Map<string, IndexedTopicBundle>();
  const articleSourceMap = new Map<string, IndexedRegulatorySource[]>();
  const warnings: string[] = [];

  for (const doc of args.documents) {
    const bundleTopics = doc.structured_topics.length > 0 ? doc.structured_topics : ["conditions_particulieres"];
    const documentSource: IndexedRegulatorySource = {
      source_type: ["zoning_map", "height_map", "special_provisions_map", "heritage_map", "graphic_regulation"].includes(doc.canonical_type)
        ? "graphical_doc"
        : doc.set_role === "risk_overlay"
          ? "risk"
          : "document",
      source_id: doc.document_id,
      document_id: doc.document_id,
      document_title: doc.source_name,
      page_start: null,
      page_end: null,
      article_code: null,
      anchor_type: doc.canonical_type,
      anchor_label: doc.document_type,
      theme_code: null,
      summary: buildDocumentSummary(doc),
      raw_text: null,
      qualification: makeQualificationFromDocument(doc),
      confidence: doc.classifier_confidence >= 0.8 ? "high" : doc.classifier_confidence >= 0.45 ? "medium" : "low",
      signals: doc.detected_signals,
    };

    doc.zone_hints.forEach((hint: string) => {
      const normalizedHint = normalizeZoneCode(hint);
      if (normalizedHint.startsWith(normalizedZone) && normalizedHint.length > normalizedZone.length) {
        subzoneCandidates.add(hint);
      }
    });

    for (const topic of bundleTopics) {
      const topicCode = inferTopicCode({ themeCode: topic });
      const bundle = ensureTopicBundle(topicMap, topicCode);
      bundle.sources.push(documentSource);
      if (documentSource.source_type === "graphical_doc") {
        bundle.graphical_sources.push(documentSource);
      } else if (documentSource.source_type === "risk") {
        bundle.risk_sources.push(documentSource);
      } else {
        bundle.indirect_sources.push(documentSource);
      }
      bundle.cross_document_signals.push(...documentSource.signals);
    }
  }

  for (const segment of args.segments) {
    const topicCode = inferTopicCode({
      themeCode: segment.themeCode,
      anchorLabel: segment.anchorLabel,
      text: segment.sourceTextFull,
    });
    const articleCode = inferArticleCodeFromText(segment.anchorLabel, segment.sourceTextFull) || ARTICLE_HINT_BY_THEME.get(topicCode) || null;
    const segmentSignals = detectCrossDocumentSignalsFromText(segment.sourceTextFull);
    const source: IndexedRegulatorySource = {
      source_type: "segment",
      source_id: segment.id,
      document_id: segment.documentId,
      document_title: segment.documentTitle || null,
      page_start: segment.sourcePageStart,
      page_end: segment.sourcePageEnd,
      article_code: articleCode,
      anchor_type: segment.anchorType,
      anchor_label: segment.anchorLabel,
      theme_code: topicCode,
      summary: segment.sourceTextFull.replace(/\s+/g, " ").trim().slice(0, 500),
      raw_text: segment.sourceTextFull,
      qualification: segment.anchorType === "oap_clause"
        ? "orientation de projet"
        : ["graphic_prescription", "risk_clause", "servitude_clause"].includes(String(segment.anchorType || ""))
          ? "règle opposable indirecte"
          : "règle opposable directe",
      confidence: segment.anchorType === "article" ? "high" : "medium",
      signals: segmentSignals,
    };

    const bundle = ensureTopicBundle(topicMap, topicCode);
    bundle.sources.push(source);
    bundle.indirect_sources.push(source);
    if (articleCode && !bundle.relevant_articles.includes(articleCode)) bundle.relevant_articles.push(articleCode);
    bundle.cross_document_signals.push(...source.signals);
    if (articleCode) {
      articleSourceMap.set(articleCode, [...(articleSourceMap.get(articleCode) || []), source]);
    }
  }

  for (const rule of args.rules) {
    const topicCode = getRuleThemeCode(rule);
    const articleCode = getRuleArticleCode(rule) || ARTICLE_HINT_BY_THEME.get(topicCode) || null;
    const rawText = getRuleRawText(rule);
    const relationResolutionNote = getRuleRelationResolutionNote(rule);
    const signals = dedupeSignals([
      ...detectCrossDocumentSignalsFromText(rawText),
      ...(relationResolutionNote
        ? [{ kind: "document_referral" as const, label: "Résolution relationnelle", excerpt: String(relationResolutionNote), confidence: "medium" as const }]
        : []),
    ]);
    const source: IndexedRegulatorySource = {
      source_type: "published_rule",
      source_id: String((rule as any).id || `${topicCode}-${articleCode || "na"}`),
      document_id: getRuleDocumentId(rule),
      document_title: getRuleDocumentName(rule),
      page_start: getRuleSourcePage(rule),
      page_end: getRuleSourcePageEnd(rule),
      article_code: articleCode,
      anchor_type: getRuleAnchorType(rule),
      anchor_label: getRuleAnchorLabel(rule),
      theme_code: topicCode,
      summary: getRuleSummary(rule).replace(/\s+/g, " ").trim().slice(0, 500),
      raw_text: rawText,
      qualification: ["restrictive", "substitutive", "additive"].includes(getRuleNormativeEffect(rule))
        ? "règle opposable indirecte"
        : "règle opposable directe",
      confidence: getRuleReviewStatus(rule) === "published"
        ? "high"
        : getRuleReviewStatus(rule) === "validated"
          ? "medium"
          : "low",
      signals,
    };
    const bundle = ensureTopicBundle(topicMap, topicCode);
    bundle.sources.push(source);
    bundle.direct_rules.push(source);
    if (articleCode && !bundle.relevant_articles.includes(articleCode)) bundle.relevant_articles.push(articleCode);
    bundle.cross_document_signals.push(...signals);
    if (articleCode) {
      articleSourceMap.set(articleCode, [...(articleSourceMap.get(articleCode) || []), source]);
    }
    const zoneCode = getRuleZoneCode(rule);
    const normalizedRuleZone = normalizeZoneCode(zoneCode);
    if (normalizedRuleZone.startsWith(normalizedZone) && normalizedRuleZone.length > normalizedZone.length) {
      subzoneCandidates.add(zoneCode);
    }
  }

  for (const section of args.zoneSections || []) {
    const topicCode = inferTopicCode({
      anchorLabel: section.heading,
      text: section.sourceText,
      articleCode: inferArticleCodeFromText(section.heading, section.sourceText),
    });
    const articleCode = inferArticleCodeFromText(section.heading, section.sourceText) || ARTICLE_HINT_BY_THEME.get(topicCode) || null;
    const source: IndexedRegulatorySource = {
      source_type: "zone_section",
      source_id: section.id,
      document_id: section.townHallDocumentId || null,
      document_title: section.documentTitle || null,
      page_start: section.startPage,
      page_end: section.endPage,
      article_code: articleCode,
      anchor_type: "section",
      anchor_label: section.heading,
      theme_code: topicCode,
      summary: String(section.sourceText || "").replace(/\s+/g, " ").trim().slice(0, 500),
      raw_text: section.sourceText || null,
      qualification: "règle opposable directe",
      confidence: "medium",
      signals: detectCrossDocumentSignalsFromText(section.sourceText),
    };
    const bundle = ensureTopicBundle(topicMap, topicCode);
    bundle.sources.push(source);
    bundle.indirect_sources.push(source);
    if (articleCode && !bundle.relevant_articles.includes(articleCode)) bundle.relevant_articles.push(articleCode);
    bundle.cross_document_signals.push(...source.signals);
  }

  for (const overlay of args.overlays) {
    const qualification = ["SPR", "PSMV", "PVAP", "ABF", "PPRI", "PPRT", "servitude"].includes(String(overlay.overlayType || ""))
      ? "règle opposable indirecte"
      : "point à confirmer";
    const source: IndexedRegulatorySource = {
      source_type: ["PPRI", "PPRT", "servitude"].includes(String(overlay.overlayType || "")) ? "risk" : "overlay",
      source_id: overlay.id,
      document_id: null,
      document_title: overlay.overlayLabel || overlay.overlayCode,
      page_start: null,
      page_end: null,
      article_code: null,
      anchor_type: "overlay",
      anchor_label: overlay.overlayCode,
      theme_code: "risques",
      summary: `${overlay.overlayCode}${overlay.overlayType ? ` · ${overlay.overlayType}` : ""}${overlay.overlayLabel ? ` — ${overlay.overlayLabel}` : ""}`,
      raw_text: null,
      qualification,
      confidence: overlay.status === "published" ? "high" : "medium",
      signals: [],
    };
    const bundle = ensureTopicBundle(topicMap, "risques");
    bundle.sources.push(source);
    bundle.risk_sources.push(source);
  }

  const article_index = Array.from(new Set([
    ...Array.from(articleSourceMap.keys()),
    ...Array.from(ARTICLE_TITLE_BY_CODE.keys()),
  ]))
    .sort((left, right) => Number.parseInt(String(left), 10) - Number.parseInt(String(right), 10))
    .map((article) => {
      const sources = articleSourceMap.get(article) || [];
      const topic_codes = Array.from(new Set(
        Array.from(topicMap.values())
          .filter((bundle) => bundle.relevant_articles.includes(article))
          .map((bundle) => bundle.topic_code),
      ));
      return {
        article,
        title: ARTICLE_TITLE_BY_CODE.get(article) || `Article ${article}`,
        topic_codes,
        sources,
      };
    });

  const topic_index = Array.from(topicMap.values())
    .map((bundle) => ({
      ...bundle,
      relevant_articles: Array.from(new Set(bundle.relevant_articles)).sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10)),
      cross_document_signals: dedupeSignals(bundle.cross_document_signals),
    }))
    .sort((left, right) => {
      const leftArticle = Number.parseInt(left.relevant_articles[0] || "999", 10);
      const rightArticle = Number.parseInt(right.relevant_articles[0] || "999", 10);
      if (leftArticle !== rightArticle) return leftArticle - rightArticle;
      return left.topic_label.localeCompare(right.topic_label, "fr");
    });

  if (topic_index.length === 0) {
    warnings.push("Aucune matière réglementaire exploitable n’a été indexée pour cette zone malgré les documents disponibles.");
  }

  return {
    commune: args.commune,
    identified_zone: args.zoneCode,
    identified_subzone: Array.from(subzoneCandidates).sort((left, right) => right.length - left.length)[0] || null,
    document_set: args.documents,
    topic_index,
    article_index,
    warnings,
  };
}
