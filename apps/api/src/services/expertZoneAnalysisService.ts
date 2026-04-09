import { db } from "@workspace/db";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { regulatoryCalibrationZonesTable } from "../../../../packages/db/src/schema/regulatoryCalibrationZones.js";
import { regulatoryOverlaysTable } from "../../../../packages/db/src/schema/regulatoryOverlays.js";
import { townHallDocumentsTable } from "../../../../packages/db/src/schema/townHallDocuments.js";
import { zoneThematicSegmentsTable } from "../../../../packages/db/src/schema/zoneThematicSegments.js";
import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";
import { normalizeExtractedText } from "./textQualityService.js";
import { REGULATORY_ARTICLE_REFERENCE, REGULATORY_THEME_SEED, splitDocumentIntoCalibrationPages } from "./regulatoryCalibrationService.js";

type CalibrationZone = typeof regulatoryCalibrationZonesTable.$inferSelect;
type OverlayRow = typeof regulatoryOverlaysTable.$inferSelect;
type TownHallDocumentRow = typeof townHallDocumentsTable.$inferSelect;
type ZoneThematicSegmentRow = typeof zoneThematicSegmentsTable.$inferSelect;

type PageSlice = {
  pageNumber: number;
  text: string;
};

type SourceAnchorType =
  | "article"
  | "chapter"
  | "section"
  | "prescription"
  | "graphic_prescription"
  | "oap_clause"
  | "padd_orientation"
  | "report_justification"
  | "servitude_clause"
  | "risk_clause"
  | "free_text_block"
  | "legend"
  | "manual";

export type ExpertZoneArticleOrThemeBlock = {
  key: string;
  articleCode: string | null;
  themeCode: string;
  themeLabel: string;
  anchorType: SourceAnchorType;
  anchorLabel: string | null;
  documentTitle: string | null;
  ruleResumee: string;
  detailUtile: string;
  exceptionsConditions: string | null;
  effetConcretConstructibilite: string;
  niveauVigilance: "faible" | "moyen" | "fort";
  qualification:
    | "règle opposable directe"
    | "règle opposable indirecte"
    | "orientation de projet"
    | "justification / doctrine locale"
    | "information de contexte"
    | "point à confirmer";
  sources: Array<{
    documentTitle: string | null;
    pageStart: number | null;
    pageEnd: number | null;
    anchorType: string | null;
    anchorLabel: string | null;
    sourceType: "published_rule" | "segment";
  }>;
  supportingRuleIds: string[];
  segmentIds: string[];
};

export type ExpertZoneAnalysis = {
  analysisVersion: "expert_zone_analysis_v1";
  identification: {
    commune: string;
    zoneCode: string;
    zoneLabel: string | null;
    parentZoneCode: string | null;
    referenceDocument: {
      id: string;
      title: string | null;
      fileName: string | null;
      documentType: string | null;
    } | null;
    overlays: Array<{
      id: string;
      code: string;
      label: string | null;
      type: string | null;
      status: string | null;
    }>;
    complementaryDocuments: string[];
  };
  articleOrThemeBlocks: ExpertZoneArticleOrThemeBlock[];
  crossEffects: string[];
  otherDocuments: Array<{
    title: string;
    role: string;
    qualification:
      | "règle opposable directe"
      | "règle opposable indirecte"
      | "orientation de projet"
      | "justification / doctrine locale"
      | "information de contexte"
      | "point à confirmer";
    note: string;
  }>;
  professionalInterpretation: string;
  operationalConclusion: {
    zonePlutot: "très restrictive" | "restrictive" | "intermédiaire" | "souple" | "très souple";
    logiqueDominante: string;
    facteursLimitantsPrincipaux: string[];
    opportunitesPossibles: string[];
    pointsBloquantsPotentiels: string[];
    pointsAConfirmerSurPlanOuAnnexe: string[];
  };
};

export type ZoneThematicSegmentInput = {
  communeId: string;
  zoneId: string;
  overlayId?: string | null;
  documentId: string;
  sourcePageStart: number;
  sourcePageEnd?: number | null;
  anchorType: SourceAnchorType;
  anchorLabel?: string | null;
  themeCode: string;
  sourceTextFull: string;
  visualAttachmentMeta?: Record<string, unknown> | null;
  derivedFromAi: boolean;
  status: string;
  createdBy?: string | null;
  updatedBy?: string | null;
};

const THEME_KEYWORD_MAP: Record<string, string[]> = {
  interdictions: ["interdit", "interdite", "interdictions", "occupation du sol interdit", "usage interdit"],
  conditions_particulieres: ["sous conditions", "condition", "admis", "admise", "autorisé sous réserve", "changement de destination"],
  acces_voirie: ["accès", "voirie", "desserte", "voie", "visibilité", "manœuvre", "manoeuvre", "secours"],
  reseaux: ["réseau", "reseau", "eau potable", "eaux usées", "eaux usees", "eaux pluviales", "assainissement", "raccordement"],
  recul_voie: ["recul", "alignement", "voie", "emprise publique", "à l'alignement", "emprises publiques"],
  recul_limite: ["limite séparative", "limites séparatives", "mitoyennet", "fond de parcelle", "distance aux limites"],
  distance_entre_batiments: ["même propriété", "meme propriété", "distance entre bâtiments", "distance entre batiments"],
  emprise_sol: ["emprise au sol", "ces", "coefficient d'emprise", "emprise"],
  hauteur: ["hauteur", "faîtage", "faitage", "égout", "egout", "acrotère", "acrotere", "niveaux"],
  aspect_exterieur: ["aspect extérieur", "aspect exterieur", "insertion", "architecture", "volumétrie", "volumetrie"],
  stationnement: ["stationnement", "parking", "place", "vélo", "velo", "recharge électrique", "recharge electrique"],
  espaces_verts: ["espaces libres", "espaces verts", "plantations", "arbres", "paysager"],
  materiaux: ["matériaux", "materiaux", "teinte", "toiture", "façade", "facade", "clôture", "cloture"],
  risques: ["risque", "inondation", "argile", "cavité", "cavite", "bruit", "sécurité", "securite"],
  servitudes: ["servitude", "abf", "spr", "psmv", "ppri", "pprt", "monument historique", "mh"],
  destination: ["destination", "sous-destination", "usage", "occupation", "utilisation du sol"],
  pleine_terre: ["pleine terre", "perméable", "permeable", "surface végétalisée", "surface vegetalisee"],
  coefficient_biotope: ["biotope", "coefficient"],
  clotures: ["clôture", "cloture", "portail"],
  toiture: ["toiture", "pente", "couverture"],
  facades: ["façade", "facade", "ouverture", "menuiserie"],
  plantations: ["plantation", "arbre", "alignement arboré", "alignement arbore"],
  acces_pompiers: ["pompiers", "incendie", "secours"],
  eaux_pluviales: ["eaux pluviales", "infiltration", "rétention", "retention", "débit", "debit de fuite"],
  assainissement: ["assainissement", "eaux usées", "eaux usees", "collectif", "non collectif"],
};

const THEME_LABEL_MAP = new Map<string, { label: string; articleHint: string | null }>(
  REGULATORY_THEME_SEED.map(([code, label, , articleHint]) => [code, { label, articleHint }]),
);
const ARTICLE_TO_THEME_MAP = new Map(
  REGULATORY_THEME_SEED
    .filter(([, , , articleHint]) => !!articleHint)
    .map(([code, , , articleHint]) => [String(articleHint), code]),
);

function normalizeSpacing(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isLikelyHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(?:[A-Z0-9]{0,8}[-–— ]*)?ARTICLE\s+\d+\b/i.test(trimmed)) return true;
  if (/^(?:chapitre|section|sous-section|orientation|prescription|servitude|annexe|oap|padd)\b/i.test(trimmed)) return true;
  if (trimmed.length > 120) return false;
  if (/[.;!?]$/.test(trimmed)) return false;
  if (/^[A-ZÀ-ÿ0-9][A-ZÀ-ÿ0-9 '\-–—:/()]+$/.test(trimmed)) return true;
  return false;
}

function inferAnchorType(label: string): SourceAnchorType {
  const normalized = normalizeSpacing(label).toLowerCase();
  if (/article\s+\d+/.test(normalized)) return "article";
  if (normalized.startsWith("chapitre")) return "chapter";
  if (normalized.startsWith("section") || normalized.startsWith("sous-section")) return "section";
  if (normalized.startsWith("oap") || normalized.includes("orientation d'aménagement") || normalized.includes("orientation d’amenagement")) return "oap_clause";
  if (normalized.includes("padd")) return "padd_orientation";
  if (normalized.includes("servitude") || normalized.includes("abf") || normalized.includes("spr") || normalized.includes("psmv") || normalized.includes("ppri") || normalized.includes("pprt")) return "servitude_clause";
  if (normalized.includes("risque") || normalized.includes("inondation") || normalized.includes("argile")) return "risk_clause";
  if (normalized.includes("légende") || normalized.includes("legende")) return "legend";
  if (normalized.startsWith("prescription")) return "prescription";
  return "section";
}

function inferArticleCode(anchorLabel: string | null | undefined, text: string | null | undefined) {
  const merged = `${anchorLabel || ""}\n${text || ""}`;
  const match = merged.match(/(?:article|art\.)\s*(\d{1,2})\b/i);
  return match?.[1] || null;
}

function detectThemeCode(args: {
  anchorLabel?: string | null;
  text: string;
}): string {
  const normalizedAnchor = normalizeExtractedText(args.anchorLabel || "");
  const normalizedText = normalizeExtractedText(args.text || "");
  const articleCode = inferArticleCode(args.anchorLabel, args.text);
  if (articleCode && ARTICLE_TO_THEME_MAP.has(articleCode)) {
    return ARTICLE_TO_THEME_MAP.get(articleCode)!;
  }

  let bestTheme = "conditions_particulieres";
  let bestScore = -1;
  for (const [themeCode, keywords] of Object.entries(THEME_KEYWORD_MAP)) {
    let score = 0;
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeExtractedText(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedAnchor.includes(normalizedKeyword)) score += 4;
      if (normalizedText.includes(normalizedKeyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTheme = themeCode;
    }
  }
  return bestTheme;
}

function buildSegmentPreview(text: string) {
  const normalized = normalizeSpacing(text);
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function buildPageOffsetRanges(pages: PageSlice[]) {
  const separator = "\n\f\n";
  const ranges: Array<{ pageNumber: number; start: number; end: number }> = [];
  let cursor = 0;

  pages.forEach((page, index) => {
    const text = String(page.text || "").trim();
    ranges.push({
      pageNumber: page.pageNumber,
      start: cursor,
      end: cursor + text.length,
    });
    cursor += text.length;
    if (index < pages.length - 1) {
      cursor += separator.length;
    }
  });

  return ranges;
}

function resolvePageNumberAtOffset(
  ranges: Array<{ pageNumber: number; start: number; end: number }>,
  offset: number,
) {
  for (const range of ranges) {
    if (offset >= range.start && offset <= range.end) {
      return range.pageNumber;
    }
  }

  let fallback = ranges[0]?.pageNumber || 1;
  for (const range of ranges) {
    if (offset >= range.start) {
      fallback = range.pageNumber;
    }
  }
  return fallback;
}

function buildArticleBoundedBlocks(pages: PageSlice[]) {
  const separator = "\n\f\n";
  const combinedText = pages.map((page) => String(page.text || "").trim()).join(separator);
  if (!combinedText.trim()) return [] as Array<{
    sourcePageStart: number;
    sourcePageEnd: number;
    anchorLabel: string | null;
    anchorType: SourceAnchorType;
    text: string;
  }>;

  const ranges = buildPageOffsetRanges(pages);
  const markers = Array.from(
    combinedText.matchAll(/(^|\n)\s*((?:[A-Z0-9]{1,8}\s*[-–—]\s*)?ARTICLE\s*\d{1,2}\b[^\n]*)/gim),
  ).map((match) => ({
    start: (match.index || 0) + (match[1]?.length || 0),
    label: normalizeSpacing(match[2] || ""),
  })).filter((marker) => marker.label.length > 0);

  if (markers.length === 0) return [];

  return markers.map((marker, index) => {
    const next = markers[index + 1];
    const end = next ? next.start : combinedText.length;
    const start = marker.start;
    const text = normalizeSpacing(combinedText.slice(start, end));
    return {
      sourcePageStart: resolvePageNumberAtOffset(ranges, start),
      sourcePageEnd: resolvePageNumberAtOffset(ranges, Math.max(start, end - 1)),
      anchorLabel: marker.label,
      anchorType: "article" as const,
      text,
    };
  }).filter((block) => block.text.length >= 40);
}

function buildSegmentBlocks(pages: PageSlice[]) {
  const articleBlocks = buildArticleBoundedBlocks(pages);
  if (articleBlocks.length > 0) {
    return articleBlocks;
  }

  const blocks: Array<{
    sourcePageStart: number;
    sourcePageEnd: number;
    anchorLabel: string | null;
    anchorType: SourceAnchorType;
    text: string;
  }> = [];

  let current: {
    sourcePageStart: number;
    sourcePageEnd: number;
    anchorLabel: string | null;
    anchorType: SourceAnchorType;
    lines: string[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const text = normalizeSpacing(current.lines.join("\n\n"));
    if (text.length >= 40) {
      blocks.push({
        sourcePageStart: current.sourcePageStart,
        sourcePageEnd: current.sourcePageEnd,
        anchorLabel: current.anchorLabel,
        anchorType: current.anchorType,
        text,
      });
    }
    current = null;
  };

  for (const page of pages) {
    const rawBlocks = String(page.text || "")
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);

    for (const rawBlock of rawBlocks) {
      const firstLine = rawBlock.split("\n").map((line) => line.trim()).find(Boolean) || "";
      const nextAnchorLabel = isLikelyHeading(firstLine) ? firstLine : null;
      const nextAnchorType = nextAnchorLabel ? inferAnchorType(nextAnchorLabel) : "free_text_block";

      if (!current) {
        current = {
          sourcePageStart: page.pageNumber,
          sourcePageEnd: page.pageNumber,
          anchorLabel: nextAnchorLabel,
          anchorType: nextAnchorType,
          lines: [rawBlock],
        };
        continue;
      }

      const currentTheme = detectThemeCode({ anchorLabel: current.anchorLabel, text: current.lines.join("\n") });
      const nextTheme = detectThemeCode({ anchorLabel: nextAnchorLabel, text: rawBlock });
      const shouldSplit =
        !!nextAnchorLabel
        || (
          !current.anchorLabel
          && nextTheme !== currentTheme
          && rawBlock.length > 220
          && firstLine.length <= 120
          && !/[.;!?]$/.test(firstLine)
        );

      if (shouldSplit) {
        flush();
        current = {
          sourcePageStart: page.pageNumber,
          sourcePageEnd: page.pageNumber,
          anchorLabel: nextAnchorLabel,
          anchorType: nextAnchorType,
          lines: [rawBlock],
        };
        continue;
      }

      current.sourcePageEnd = page.pageNumber;
      current.lines.push(rawBlock);
    }
  }

  flush();
  return blocks;
}

function mergeSegmentBlocks(blocks: Array<{
  sourcePageStart: number;
  sourcePageEnd: number;
  anchorLabel: string | null;
  anchorType: SourceAnchorType;
  text: string;
}>) {
  const merged: typeof blocks = [];

  for (const block of blocks) {
    const themeCode = detectThemeCode({ anchorLabel: block.anchorLabel, text: block.text });
    const previous = merged[merged.length - 1];
    if (
      previous
      && detectThemeCode({ anchorLabel: previous.anchorLabel, text: previous.text }) === themeCode
      && previous.anchorType === block.anchorType
      && normalizeSpacing(previous.anchorLabel || "") === normalizeSpacing(block.anchorLabel || "")
      && block.sourcePageStart <= previous.sourcePageEnd + 1
    ) {
      previous.sourcePageEnd = Math.max(previous.sourcePageEnd, block.sourcePageEnd);
      previous.text = normalizeSpacing(`${previous.text}\n\n${block.text}`);
      continue;
    }
    merged.push({ ...block });
  }

  return merged;
}

export function buildZoneThematicSegmentsFromPages(args: {
  communeId: string;
  zoneId: string;
  overlayId?: string | null;
  documentId: string;
  pages: PageSlice[];
}) {
  const blocks = mergeSegmentBlocks(buildSegmentBlocks(args.pages));
  return blocks
    .map((block, index) => {
      const themeCode = detectThemeCode({ anchorLabel: block.anchorLabel, text: block.text });
      return {
        communeId: args.communeId,
        zoneId: args.zoneId,
        overlayId: args.overlayId || null,
        documentId: args.documentId,
        sourcePageStart: block.sourcePageStart,
        sourcePageEnd: block.sourcePageEnd,
        anchorType: block.anchorType,
        anchorLabel: block.anchorLabel,
        themeCode,
        sourceTextFull: block.text,
        sourceTextNormalized: normalizeExtractedText(block.text),
        visualAttachmentMeta: {},
        derivedFromAi: true,
        status: "suggested",
        createdBy: null,
        updatedBy: null,
        sortKey: `${String(block.sourcePageStart).padStart(4, "0")}-${String(index).padStart(4, "0")}`,
      };
    })
    .filter((segment) => segment.sourceTextFull.length >= 40)
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(({ sortKey: _sortKey, ...segment }) => segment);
}

function normalizeQualificationFromAnchor(anchorType: string | null | undefined, documentTitle: string | null | undefined) {
  const normalizedAnchor = String(anchorType || "").trim();
  const normalizedDoc = normalizeExtractedText(documentTitle || "");
  if (normalizedAnchor === "oap_clause") return "orientation de projet" as const;
  if (normalizedAnchor === "padd_orientation") return "orientation de projet" as const;
  if (normalizedAnchor === "report_justification") return "justification / doctrine locale" as const;
  if (normalizedAnchor === "servitude_clause" || normalizedAnchor === "risk_clause" || normalizedAnchor === "graphic_prescription") return "règle opposable indirecte" as const;
  if (normalizedDoc.includes("padd")) return "orientation de projet" as const;
  if (normalizedDoc.includes("rapport")) return "justification / doctrine locale" as const;
  return "règle opposable directe" as const;
}

function buildRuleValueSummary(rule: Pick<
  StructuredUrbanRuleSource,
  | "ruleLabel"
  | "ruleValueExact"
  | "ruleValueMin"
  | "ruleValueMax"
  | "ruleUnit"
  | "ruleCondition"
  | "ruleSummary"
  | "ruleTextRaw"
  | "sourceExcerpt"
>) {
  if (typeof rule.ruleValueExact === "number" && Number.isFinite(rule.ruleValueExact)) {
    return `${rule.ruleLabel}: ${rule.ruleValueExact}${rule.ruleUnit ? ` ${rule.ruleUnit}` : ""}`;
  }
  if (typeof rule.ruleValueMax === "number" && Number.isFinite(rule.ruleValueMax)) {
    return `${rule.ruleLabel}: maximum ${rule.ruleValueMax}${rule.ruleUnit ? ` ${rule.ruleUnit}` : ""}`;
  }
  if (typeof rule.ruleValueMin === "number" && Number.isFinite(rule.ruleValueMin)) {
    return `${rule.ruleLabel}: minimum ${rule.ruleValueMin}${rule.ruleUnit ? ` ${rule.ruleUnit}` : ""}`;
  }
  return normalizeSpacing(rule.ruleSummary || rule.sourceExcerpt || rule.ruleTextRaw || rule.ruleLabel);
}

function inferThemeEffect(themeCode: string, hasPublishedRule: boolean) {
  switch (themeCode) {
    case "recul_voie":
      return hasPublishedRule
        ? "Cette règle borne directement la profondeur constructive disponible depuis la voie ou l’alignement."
        : "Même sans valeur chiffrée stabilisée, ce thème encadre la façade constructible et la lecture de l’alignement.";
    case "recul_limite":
      return "Cette règle pilote l’implantation latérale et arrière, donc l’emprise réellement mobilisable sur la parcelle.";
    case "emprise_sol":
      return "Cette règle agit directement sur la surface bâtissable et sur la capacité de densification de la parcelle.";
    case "hauteur":
      return "Cette règle borne le gabarit autorisé, donc la volumétrie et les possibilités de surélévation.";
    case "stationnement":
      return "Cette règle peut consommer une part importante de la parcelle et devenir un verrou pour une densification ou un changement de destination.";
    case "pleine_terre":
    case "espaces_verts":
      return "Cette règle réduit indirectement l’emprise disponible en imposant une part de pleine terre, de plantations ou d’espaces libres.";
    case "aspect_exterieur":
    case "materiaux":
    case "toiture":
    case "facades":
      return "Cette règle ne change pas toujours la surface constructible, mais peut neutraliser une faisabilité théorique par l’insertion, les matériaux ou le traitement des volumes.";
    case "acces_voirie":
    case "acces_pompiers":
      return "Cette règle peut bloquer un projet si l’accès, la sécurité incendie ou les manœuvres ne sont pas compatibles avec la configuration de la parcelle.";
    default:
      return hasPublishedRule
        ? "Cette règle complète directement le cadre opposable de la zone."
        : "Ce thème complète la lecture opérationnelle de la zone et doit être recoupé avec les autres pièces.";
  }
}

function inferVigilance(themeCode: string, sourceCount: number, unresolvedRuleCount: number): "faible" | "moyen" | "fort" {
  if (unresolvedRuleCount > 0) return "fort";
  if (["stationnement", "acces_voirie", "recul_voie", "recul_limite", "risques", "servitudes"].includes(themeCode)) return "fort";
  if (sourceCount <= 1) return "moyen";
  return "faible";
}

function sortThemeBlocks(left: ExpertZoneArticleOrThemeBlock, right: ExpertZoneArticleOrThemeBlock) {
  const leftArticle = Number.parseInt(String(left.articleCode || "").replace(/\D+/g, ""), 10);
  const rightArticle = Number.parseInt(String(right.articleCode || "").replace(/\D+/g, ""), 10);
  if (Number.isFinite(leftArticle) || Number.isFinite(rightArticle)) {
    const normalizedLeft = Number.isFinite(leftArticle) ? leftArticle : Number.POSITIVE_INFINITY;
    const normalizedRight = Number.isFinite(rightArticle) ? rightArticle : Number.POSITIVE_INFINITY;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
  }
  return left.themeLabel.localeCompare(right.themeLabel, "fr");
}

export function buildExpertZoneAnalysis(args: {
  commune: string;
  zone: Pick<CalibrationZone, "zoneCode" | "zoneLabel" | "parentZoneCode">;
  referenceDocument: Pick<TownHallDocumentRow, "id" | "title" | "fileName" | "documentType"> | null;
  overlays: Array<Pick<OverlayRow, "id" | "overlayCode" | "overlayLabel" | "overlayType" | "status">>;
  segments: Array<Pick<ZoneThematicSegmentRow, "id" | "documentId" | "sourcePageStart" | "sourcePageEnd" | "anchorType" | "anchorLabel" | "themeCode" | "sourceTextFull"> & {
    documentTitle?: string | null;
  }>;
  rules: StructuredUrbanRuleSource[];
}): ExpertZoneAnalysis {
  const themeGroups = new Map<string, {
    themeCode: string;
    themeLabel: string;
    articleCode: string | null;
    segments: Array<(typeof args.segments)[number]>;
    rules: StructuredUrbanRuleSource[];
  }>();

  for (const segment of args.segments) {
    const meta = THEME_LABEL_MAP.get(segment.themeCode as string) || { label: String(segment.themeCode), articleHint: null };
    const articleCode = meta.articleHint || inferArticleCode(segment.anchorLabel, segment.sourceTextFull);
    const entry = themeGroups.get(segment.themeCode) || {
      themeCode: segment.themeCode,
      themeLabel: meta.label,
      articleCode,
      segments: [],
      rules: [],
    };
    entry.segments.push(segment);
    if (!entry.articleCode && articleCode) entry.articleCode = articleCode;
    themeGroups.set(segment.themeCode, entry);
  }

  for (const rule of args.rules) {
    const themeCode = "themeCode" in rule && rule.themeCode ? String(rule.themeCode) : "conditions_particulieres";
    const meta = THEME_LABEL_MAP.get(themeCode as string) || { label: String(themeCode), articleHint: null };
    const articleCode = "sourceArticle" in rule && rule.sourceArticle
      ? String(rule.sourceArticle).replace(/\D+/g, "") || null
      : ("articleCode" in rule ? String(rule.articleCode || "").replace(/\D+/g, "") || null : null);
    const entry = themeGroups.get(themeCode) || {
      themeCode,
      themeLabel: meta.label,
      articleCode: articleCode || meta.articleHint || null,
      segments: [],
      rules: [],
    };
    entry.rules.push(rule);
    if (!entry.articleCode && articleCode) entry.articleCode = articleCode;
    themeGroups.set(themeCode, entry);
  }

  const articleOrThemeBlocks = Array.from(themeGroups.values())
    .map((group): ExpertZoneArticleOrThemeBlock => {
      const firstSegment = [...group.segments].sort((left, right) => left.sourcePageStart - right.sourcePageStart)[0];
      const firstRule = group.rules[0];
      const hasPublishedRule = group.rules.length > 0;
      const directSourceRules = group.rules.filter((rule) => {
        const status = "reviewStatus" in rule ? String(rule.reviewStatus || "") : "";
        return status === "published" || status === "validated" || status === "auto" || status === "structured";
      });
      const unresolvedRuleCount = group.rules.filter((rule) => "resolutionStatus" in rule && rule.resolutionStatus === "unresolved").length;
      const qualification = hasPublishedRule
        ? "règle opposable directe"
        : normalizeQualificationFromAnchor(firstSegment?.anchorType, firstSegment?.documentTitle || args.referenceDocument?.title || null);

      const sourceSummaries = directSourceRules.length > 0
        ? directSourceRules.slice(0, 3).map((rule) => buildRuleValueSummary(rule))
        : group.segments.slice(0, 2).map((segment) => buildSegmentPreview(segment.sourceTextFull));
      const detailText = [
        ...directSourceRules.slice(0, 2).map((rule) => normalizeSpacing(rule.ruleTextRaw || rule.sourceExcerpt || rule.ruleSummary || rule.ruleLabel)),
        ...group.segments.slice(0, 2).map((segment) => buildSegmentPreview(segment.sourceTextFull)),
      ]
        .filter(Boolean)
        .join(" ");
      const conditions = directSourceRules
        .map((rule) => normalizeSpacing(rule.ruleCondition))
        .filter((value) => value.length > 0);

      return {
        key: `${group.themeCode}-${group.articleCode || "na"}`,
        articleCode: group.articleCode,
        themeCode: group.themeCode,
        themeLabel: group.themeLabel,
        anchorType: (firstSegment?.anchorType as SourceAnchorType | undefined)
          || (("ruleAnchorType" in (firstRule || {})) ? (String((firstRule as any).ruleAnchorType || "article") as SourceAnchorType) : "free_text_block"),
        anchorLabel: firstSegment?.anchorLabel
          || (firstRule && "ruleAnchorLabel" in firstRule ? String((firstRule as any).ruleAnchorLabel || "") || null : null)
          || (group.articleCode ? `Article ${group.articleCode}` : null),
        documentTitle: firstSegment?.documentTitle || ("sourceDocumentName" in (firstRule || {}) ? (firstRule as any).sourceDocumentName || null : args.referenceDocument?.title || null),
        ruleResumee: sourceSummaries.join(" · ") || "Aucune règle structurée ferme n’a encore été stabilisée pour ce thème.",
        detailUtile: detailText || "Aucune matière textuelle exploitable n’a encore été stabilisée pour ce thème.",
        exceptionsConditions: conditions.length > 0 ? conditions.join(" ; ") : null,
        effetConcretConstructibilite: inferThemeEffect(group.themeCode, hasPublishedRule),
        niveauVigilance: inferVigilance(group.themeCode, group.segments.length + group.rules.length, unresolvedRuleCount),
        qualification,
        sources: [
          ...group.rules.slice(0, 3).map((rule) => ({
            documentTitle: "sourceDocumentName" in rule ? (rule.sourceDocumentName || null) : args.referenceDocument?.title || null,
            pageStart: "sourcePage" in rule ? rule.sourcePage : null,
            pageEnd: null,
            anchorType: "ruleAnchorType" in rule ? String((rule as any).ruleAnchorType || "") || null : null,
            anchorLabel: "ruleAnchorLabel" in rule ? String((rule as any).ruleAnchorLabel || "") || null : null,
            sourceType: "published_rule" as const,
          })),
          ...group.segments.slice(0, 3).map((segment) => ({
            documentTitle: segment.documentTitle || args.referenceDocument?.title || null,
            pageStart: segment.sourcePageStart,
            pageEnd: segment.sourcePageEnd,
            anchorType: segment.anchorType,
            anchorLabel: segment.anchorLabel,
            sourceType: "segment" as const,
          })),
        ],
        supportingRuleIds: group.rules.map((rule) => String((rule as any).id || "")).filter(Boolean),
        segmentIds: group.segments.map((segment) => segment.id),
      };
    })
    .sort(sortThemeBlocks);

  const crossEffects: string[] = [];
  const themeSet = new Set(articleOrThemeBlocks.map((block) => block.themeCode));
  if (!themeSet.has("emprise_sol") && (themeSet.has("recul_voie") || themeSet.has("recul_limite")) && (themeSet.has("hauteur") || themeSet.has("stationnement") || themeSet.has("pleine_terre") || themeSet.has("espaces_verts"))) {
    crossEffects.push("Absence de plafond d’emprise explicite, mais retraits, hauteur, stationnement et/ou pleine terre encadrent tout de même fortement l’emprise réelle.");
  }
  if (themeSet.has("stationnement") && themeSet.has("acces_voirie")) {
    crossEffects.push("Le couple accès / stationnement peut devenir le verrou opérationnel principal, même si d’autres paramètres restent théoriquement favorables.");
  }
  if ((themeSet.has("aspect_exterieur") || themeSet.has("materiaux") || themeSet.has("toiture") || themeSet.has("facades")) && args.overlays.some((overlay) => ["SPR", "PSMV", "PVAP", "ABF"].includes(String(overlay.overlayType || "")))) {
    crossEffects.push("Les prescriptions d’aspect et les couches patrimoniales superposées peuvent neutraliser une faisabilité volumétrique pourtant théoriquement admissible.");
  }
  if (articleOrThemeBlocks.some((block) => block.niveauVigilance === "fort" && block.qualification !== "orientation de projet")) {
    crossEffects.push("Plusieurs thèmes restent juridiquement sensibles ou partiellement résolus : la faisabilité doit être lue par combinaison de règles, pas article par article isolément.");
  }

  const complementaryDocuments = Array.from(new Set([
    ...(args.referenceDocument?.title ? [args.referenceDocument.title] : []),
    ...args.overlays.map((overlay) => `${overlay.overlayCode}${overlay.overlayType ? ` (${overlay.overlayType})` : ""}`),
  ]));
  const otherDocuments = [
    ...args.overlays.map((overlay) => ({
      title: `${overlay.overlayCode}${overlay.overlayLabel ? ` · ${overlay.overlayLabel}` : ""}`,
      role: overlay.overlayType || "overlay",
      qualification: (["SPR", "PSMV", "PVAP", "PPRI", "PPRT", "ABF", "servitude"].includes(String(overlay.overlayType || "")) ? "règle opposable indirecte" : "point à confirmer") as ExpertZoneAnalysis["otherDocuments"][number]["qualification"],
      note: "Couche réglementaire complémentaire à croiser avec la zone principale pour apprécier les restrictions, compléments ou effets procéduraux.",
    })),
  ];

  const restrictiveSignals = [
    themeSet.has("recul_voie"),
    themeSet.has("recul_limite"),
    themeSet.has("stationnement"),
    themeSet.has("pleine_terre") || themeSet.has("espaces_verts"),
    themeSet.has("risques") || themeSet.has("servitudes"),
    args.overlays.length > 0,
  ].filter(Boolean).length;
  const zonePlutot =
    restrictiveSignals >= 5 ? "très restrictive"
      : restrictiveSignals >= 4 ? "restrictive"
        : restrictiveSignals >= 2 ? "intermédiaire"
          : restrictiveSignals >= 1 ? "souple"
            : "très souple";

  const logicDominante = args.overlays.some((overlay) => ["SPR", "PSMV", "PVAP", "ABF"].includes(String(overlay.overlayType || "")))
    ? "patrimoniale"
    : themeSet.has("recul_voie") && themeSet.has("recul_limite") && !themeSet.has("emprise_sol")
      ? "logique morphologique de zone"
      : themeSet.has("stationnement") || themeSet.has("acces_voirie")
        ? "maîtrise par accès et stationnement"
        : "règles de zone principales";

  return {
    analysisVersion: "expert_zone_analysis_v1",
    identification: {
      commune: args.commune,
      zoneCode: args.zone.zoneCode,
      zoneLabel: args.zone.zoneLabel,
      parentZoneCode: args.zone.parentZoneCode,
      referenceDocument: args.referenceDocument ? {
        id: args.referenceDocument.id,
        title: args.referenceDocument.title,
        fileName: args.referenceDocument.fileName,
        documentType: args.referenceDocument.documentType,
      } : null,
      overlays: args.overlays.map((overlay) => ({
        id: overlay.id,
        code: overlay.overlayCode,
        label: overlay.overlayLabel,
        type: overlay.overlayType,
        status: overlay.status,
      })),
      complementaryDocuments,
    },
    articleOrThemeBlocks,
    crossEffects,
    otherDocuments,
    professionalInterpretation: [
      `La zone ${args.zone.zoneCode} est désormais lue à partir de blocs thématiques cohérents plutôt qu’à partir de phrases isolées.`,
      articleOrThemeBlocks.length > 0
        ? `Les thèmes les plus structurants sont ${articleOrThemeBlocks.slice(0, 4).map((block) => block.themeLabel.toLowerCase()).join(", ")}.`
        : "Aucun thème réglementaire suffisamment solide n’a encore été stabilisé.",
      crossEffects[0] || "La lecture opérationnelle doit rester prudente tant que certaines pièces complémentaires n’ont pas été confirmées graphiquement.",
    ].join(" "),
    operationalConclusion: {
      zonePlutot,
      logiqueDominante: logicDominante,
      facteursLimitantsPrincipaux: articleOrThemeBlocks
        .filter((block) => block.niveauVigilance !== "faible")
        .slice(0, 4)
        .map((block) => block.themeLabel),
      opportunitesPossibles: articleOrThemeBlocks
        .filter((block) => ["hauteur", "emprise_sol", "destination"].includes(block.themeCode) && block.qualification !== "orientation de projet")
        .slice(0, 3)
        .map((block) => `${block.themeLabel} : ${block.ruleResumee}`),
      pointsBloquantsPotentiels: [
        ...articleOrThemeBlocks
          .filter((block) => block.niveauVigilance === "fort")
          .slice(0, 4)
          .map((block) => `${block.themeLabel} — ${block.effetConcretConstructibilite}`),
      ],
      pointsAConfirmerSurPlanOuAnnexe: [
        ...args.overlays.map((overlay) => `${overlay.overlayCode}${overlay.overlayType ? ` (${overlay.overlayType})` : ""}`),
        ...(themeSet.has("recul_voie") || themeSet.has("recul_limite")
          ? ["Vérifier les retraits graphiques, marges de recul et prescriptions localisées sur le plan."]
          : []),
      ].filter(Boolean),
    },
  };
}

export async function listZoneThematicSegments(zoneId: string) {
  return db.select()
    .from(zoneThematicSegmentsTable)
    .where(and(eq(zoneThematicSegmentsTable.zoneId, zoneId), sql`${zoneThematicSegmentsTable.status} <> 'archived'`))
    .orderBy(
      asc(zoneThematicSegmentsTable.sourcePageStart),
      asc(zoneThematicSegmentsTable.themeCode),
      asc(zoneThematicSegmentsTable.createdAt),
    );
}

export async function rebuildThematicSegmentsForZone(args: {
  zone: CalibrationZone;
  referenceDocument: TownHallDocumentRow | null;
  pages?: PageSlice[];
  userId?: string | null;
}) {
  if (!args.referenceDocument?.id || !args.referenceDocument.rawText) {
    return { archivedCount: 0, createdCount: 0, segments: [] as ZoneThematicSegmentInput[] };
  }

  const rawPages = args.pages
    ? args.pages
    : splitDocumentIntoCalibrationPages(args.referenceDocument.rawText)
        .filter((page) => {
          if (args.zone.referenceStartPage && page.pageNumber < args.zone.referenceStartPage) return false;
          if (args.zone.referenceEndPage && page.pageNumber > args.zone.referenceEndPage) return false;
          return true;
        })
        .map((page) => ({ pageNumber: page.pageNumber, text: page.text }));

  const generatedSegments = buildZoneThematicSegmentsFromPages({
    communeId: args.zone.communeId,
    zoneId: args.zone.id,
    documentId: args.referenceDocument.id,
    pages: rawPages,
  });

  const existingAiSegments = await db.select({ id: zoneThematicSegmentsTable.id })
    .from(zoneThematicSegmentsTable)
    .where(and(
      eq(zoneThematicSegmentsTable.zoneId, args.zone.id),
      eq(zoneThematicSegmentsTable.derivedFromAi, true),
      sql`${zoneThematicSegmentsTable.status} <> 'archived'`,
    ));

  if (existingAiSegments.length > 0) {
    await db.update(zoneThematicSegmentsTable)
      .set({
        status: "archived",
        updatedBy: args.userId || null,
        updatedAt: new Date(),
      })
      .where(inArray(zoneThematicSegmentsTable.id, existingAiSegments.map((segment) => segment.id)));
  }

  if (generatedSegments.length > 0) {
    await db.insert(zoneThematicSegmentsTable).values(
      generatedSegments.map((segment) => ({
        ...segment,
        createdBy: args.userId || null,
        updatedBy: args.userId || null,
      })),
    );
  }

  return {
    archivedCount: existingAiSegments.length,
    createdCount: generatedSegments.length,
    segments: generatedSegments,
  };
}

export async function loadZoneSegmentsForCommuneZone(args: {
  communeAliases: string[];
  commune: string;
  zoneCode: string;
  structuredRules: StructuredUrbanRuleSource[];
}) {
  const normalizedZoneCode = normalizeExtractedText(args.zoneCode).replace(/\s+/g, "");
  const [zone] = await db.select()
    .from(regulatoryCalibrationZonesTable)
    .where(and(
      or(
        inArray(regulatoryCalibrationZonesTable.communeId, args.communeAliases),
        ...args.communeAliases.map((alias) => eq(regulatoryCalibrationZonesTable.communeId, alias)),
      )!,
      sql`regexp_replace(lower(${regulatoryCalibrationZonesTable.zoneCode}), '\s+', '', 'g') = ${normalizedZoneCode}`,
    ))
    .limit(1);

  if (!zone) {
    return {
      zone: null,
      referenceDocument: null,
      segments: [] as Array<ZoneThematicSegmentRow & { documentTitle: string | null }>,
      overlays: [] as OverlayRow[],
      expertAnalysis: null as ExpertZoneAnalysis | null,
    };
  }

  const referenceDocument = zone.referenceDocumentId
    ? await db.select()
      .from(townHallDocumentsTable)
      .where(eq(townHallDocumentsTable.id, zone.referenceDocumentId))
      .limit(1)
      .then((rows) => rows[0] || null)
    : null;

  let segments = await db.select({
    id: zoneThematicSegmentsTable.id,
    communeId: zoneThematicSegmentsTable.communeId,
    zoneId: zoneThematicSegmentsTable.zoneId,
    overlayId: zoneThematicSegmentsTable.overlayId,
    documentId: zoneThematicSegmentsTable.documentId,
    sourcePageStart: zoneThematicSegmentsTable.sourcePageStart,
    sourcePageEnd: zoneThematicSegmentsTable.sourcePageEnd,
    anchorType: zoneThematicSegmentsTable.anchorType,
    anchorLabel: zoneThematicSegmentsTable.anchorLabel,
    themeCode: zoneThematicSegmentsTable.themeCode,
    sourceTextFull: zoneThematicSegmentsTable.sourceTextFull,
    sourceTextNormalized: zoneThematicSegmentsTable.sourceTextNormalized,
    visualAttachmentMeta: zoneThematicSegmentsTable.visualAttachmentMeta,
    derivedFromAi: zoneThematicSegmentsTable.derivedFromAi,
    status: zoneThematicSegmentsTable.status,
    createdBy: zoneThematicSegmentsTable.createdBy,
    updatedBy: zoneThematicSegmentsTable.updatedBy,
    createdAt: zoneThematicSegmentsTable.createdAt,
    updatedAt: zoneThematicSegmentsTable.updatedAt,
    documentTitle: townHallDocumentsTable.title,
  })
    .from(zoneThematicSegmentsTable)
    .leftJoin(townHallDocumentsTable, eq(zoneThematicSegmentsTable.documentId, townHallDocumentsTable.id))
    .where(and(
      eq(zoneThematicSegmentsTable.zoneId, zone.id),
      sql`${zoneThematicSegmentsTable.status} <> 'archived'`,
    ))
    .orderBy(asc(zoneThematicSegmentsTable.sourcePageStart), asc(zoneThematicSegmentsTable.createdAt));

  if (segments.length === 0 && referenceDocument?.rawText) {
    const rebuilt = await rebuildThematicSegmentsForZone({ zone, referenceDocument });
    if (rebuilt.createdCount > 0) {
      segments = await db.select({
        id: zoneThematicSegmentsTable.id,
        communeId: zoneThematicSegmentsTable.communeId,
        zoneId: zoneThematicSegmentsTable.zoneId,
        overlayId: zoneThematicSegmentsTable.overlayId,
        documentId: zoneThematicSegmentsTable.documentId,
        sourcePageStart: zoneThematicSegmentsTable.sourcePageStart,
        sourcePageEnd: zoneThematicSegmentsTable.sourcePageEnd,
        anchorType: zoneThematicSegmentsTable.anchorType,
        anchorLabel: zoneThematicSegmentsTable.anchorLabel,
        themeCode: zoneThematicSegmentsTable.themeCode,
        sourceTextFull: zoneThematicSegmentsTable.sourceTextFull,
        sourceTextNormalized: zoneThematicSegmentsTable.sourceTextNormalized,
        visualAttachmentMeta: zoneThematicSegmentsTable.visualAttachmentMeta,
        derivedFromAi: zoneThematicSegmentsTable.derivedFromAi,
        status: zoneThematicSegmentsTable.status,
        createdBy: zoneThematicSegmentsTable.createdBy,
        updatedBy: zoneThematicSegmentsTable.updatedBy,
        createdAt: zoneThematicSegmentsTable.createdAt,
        updatedAt: zoneThematicSegmentsTable.updatedAt,
        documentTitle: townHallDocumentsTable.title,
      })
        .from(zoneThematicSegmentsTable)
        .leftJoin(townHallDocumentsTable, eq(zoneThematicSegmentsTable.documentId, townHallDocumentsTable.id))
        .where(and(
          eq(zoneThematicSegmentsTable.zoneId, zone.id),
          sql`${zoneThematicSegmentsTable.status} <> 'archived'`,
        ))
        .orderBy(asc(zoneThematicSegmentsTable.sourcePageStart), asc(zoneThematicSegmentsTable.createdAt));
    }
  }

  const overlaysByRules = Array.from(new Set(
    args.structuredRules
      .map((rule) => ("overlayId" in rule ? rule.overlayId : null))
      .filter((value): value is string => !!value),
  ));
  const overlays = overlaysByRules.length > 0
    ? await db.select()
      .from(regulatoryOverlaysTable)
      .where(inArray(regulatoryOverlaysTable.id, overlaysByRules))
    : [];

  const expertAnalysis = buildExpertZoneAnalysis({
    commune: args.commune,
    zone,
    referenceDocument,
    overlays,
    segments,
    rules: args.structuredRules,
  });

  return {
    zone,
    referenceDocument,
    segments,
    overlays,
    expertAnalysis,
  };
}
