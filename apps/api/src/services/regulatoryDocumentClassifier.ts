import { normalizeExtractedText } from "./textQualityService.js";
import type {
  ClassifiedRegulatoryDocument,
  CrossDocumentSignal,
  RegulatoryConfidence,
  RegulatoryDocumentCanonicalType,
  RegulatoryDocumentContentMode,
  RegulatoryNormativeWeight,
  RegulatorySetRole,
} from "./regulatoryInterpretationTypes.js";

type DocumentProfileLike = {
  id?: string | null;
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

const PRIORITY_TOPIC_TERMS: Array<{ topic: string; patterns: RegExp[] }> = [
  { topic: "hauteur", patterns: [/\bhauteur\b/i, /\bfa[iî]tage\b/i, /\b[ée]gout\b/i, /\bacrot[èe]re\b/i] },
  { topic: "emprise_sol", patterns: [/\bemprise au sol\b/i, /\bces\b/i, /\bcoefficient d['’ ]emprise\b/i] },
  { topic: "recul_voie", patterns: [/\bimplantation\b.{0,40}\bvoie/i, /\brecul\b.{0,40}\bvoie/i, /\balignement\b/i] },
  { topic: "recul_limite", patterns: [/\blimites? s[ée]paratives?\b/i, /\bprospect\b/i] },
  { topic: "stationnement", patterns: [/\bstationnement\b/i, /\bparking\b/i, /\bplaces?\b/i] },
  { topic: "espaces_verts", patterns: [/\bpleine terre\b/i, /\bespaces? verts?\b/i, /\bplantations?\b/i] },
  { topic: "interdictions", patterns: [/\binterdit/i, /\boccupations? interdites?\b/i] },
  { topic: "conditions_particulieres", patterns: [/\bsous conditions\b/i, /\bautoris[ée] sous r[ée]serve\b/i, /\bchangement de destination\b/i] },
  { topic: "risques", patterns: [/\bppri\b/i, /\bpprt\b/i, /\brisque\b/i, /\binondation\b/i, /\bal[ée]a\b/i] },
];

const CROSS_DOCUMENT_PATTERNS: Array<{ kind: CrossDocumentSignal["kind"]; label: string; pattern: RegExp }> = [
  { kind: "graphic_referral", label: "Renvoi au document graphique", pattern: /report[ée]?[es]?\s+aux?\s+documents?\s+graphiques?|figurant\s+aux?\s+documents?\s+graphiques?|cf\.?\s*plan|voir\s+plan/i },
  { kind: "annex_referral", label: "Renvoi vers annexe", pattern: /voir\s+annexe|cf\.?\s*annexe|dans\s+l['’]annexe/i },
  { kind: "overlay_referral", label: "Renvoi à une couche superposée", pattern: /au\s+titre\s+de|dans\s+le\s+p[ée]rim[èe]tre|dans\s+les\s+secteurs?\s+concern[ée]s?/i },
  { kind: "risk_referral", label: "Renvoi à un plan de risques", pattern: /\bppri\b|\bpprt\b|plan\s+de\s+pr[ée]vention|al[ée]a|zone\s+inondable/i },
  { kind: "document_referral", label: "Renvoi documentaire complémentaire", pattern: /dans\s+les\s+conditions\s+d[ée]finies?\s+[àa]|sous\s+r[ée]serve\s+de|doit\s+respecter/i },
  { kind: "subsector_referral", label: "Mention de sous-secteur", pattern: /sous[- ]zone|secteur\s+[a-z0-9-]+|secteurs?\s+particuliers?/i },
];

function normalizeLegacyCanonicalType(documentType: string | null | undefined, category?: string | null, subCategory?: string | null) {
  const hint = [documentType || "", category || "", subCategory || ""].join(" ").toLowerCase();
  if (hint.includes("padd")) return "other";
  if (hint.includes("oap") || hint.includes("orientation")) return "oap";
  if (hint.includes("plan") || hint.includes("graphique") || hint.includes("carte") || hint.includes("zonage") || hint.includes("annexe")) return "plu_annexe";
  if (hint.includes("reglement") || hint.includes("règlement") || hint.includes("plu")) return "plu_reglement";
  return "other";
}

function inferCanonicalType(input: {
  documentType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawText?: string | null;
  sourceName?: string | null;
}): RegulatoryDocumentCanonicalType {
  const hint = [input.documentType || "", input.category || "", input.subCategory || "", input.sourceName || "", input.rawText || ""]
    .join(" ")
    .toLowerCase();

  if (/\bppri\b/.test(hint)) return "ppri";
  if (/\bpprt\b/.test(hint)) return "pprt";
  if (/\bspr\b|\bavap\b|\bpsmv\b|\bpvap\b|abf|patrimoine|monuments?\s+historiques?/.test(hint)) return "spr_heritage";
  if (/servitudes?\s+d['’ ]utilit[ée]\s+publique|\bsup\b|servitude/.test(hint)) return "sup_servitude";
  if (/plan\s+des?\s+hauteurs?|hauteurs?\s+maximales?\s+report[ée]es?|epannelage|[ée]pannelage/.test(hint)) return "height_map";
  if (/plan\s+des?\s+dispositions?\s+particuli[èe]res?|marges?\s+de\s+recul|prescriptions?\s+graphiques?/.test(hint)) return "special_provisions_map";
  if (/plan\s+patrimonial|plan\s+de\s+protection|patrimonial|secteur\s+prot[ée]g[ée]/.test(hint)) return "heritage_map";
  if (/plan\s+de\s+zonage|zonage|document\s+graphique|planche\s+de\s+zonage/.test(hint)) return "zoning_map";
  if (/r[ée]glement\s+graphique|prescription\s+graphique/.test(hint)) return "graphic_regulation";
  if (/\boap\b|orientation(?:s)?\s+d['’]am[ée]nagement(?:\s+et\s+de\s+programmation)?/.test(hint)) return "oap";
  if (/\bpadd\b|projet\s+d['’]am[ée]nagement\s+et\s+de\s+d[ée]veloppement\s+durables/.test(hint)) return "padd";
  if (/rapport\s+de\s+pr[ée]sentation/.test(hint)) return "report";
  if (/modalit[ée]s?\s+de\s+calcul|d[ée]finitions?|lexique/.test(hint)) return "definitions_calculation";
  if (/annexes?\s+r[ée]glementaires?|annexe\s+r[ée]glementaire/.test(hint)) return "annex_regulatory";
  if (/annexe\s+de\s+calcul/.test(hint)) return "annex_calculation";
  if (/risques?|cavit[ée]s?|retrait-gonflement|bruit|inondation|al[ée]a/.test(hint)) return "risk_plan";
  if (/r[ée]glement/.test(hint) || /article\s+(?:1|2|3|4|6|7|8|9|10|11|12|13|14)\b/.test(hint)) return "written_regulation";
  if (/note|information|diagnostic|synth[èe]se/.test(hint)) return "informative";
  return "unknown";
}

function inferNormativeWeight(canonicalType: RegulatoryDocumentCanonicalType): RegulatoryNormativeWeight {
  if (["written_regulation", "graphic_regulation", "zoning_map", "height_map", "special_provisions_map", "annex_regulatory", "sup_servitude", "ppri", "pprt", "risk_plan"].includes(canonicalType)) {
    return canonicalType === "written_regulation" ? "opposable_direct" : "opposable_indirect";
  }
  if (canonicalType === "oap" || canonicalType === "padd") return "orientation";
  if (canonicalType === "report") return "justification";
  return "context";
}

function inferContentMode(args: { canonicalType: RegulatoryDocumentCanonicalType; rawText?: string | null; documentType?: string | null }) : RegulatoryDocumentContentMode {
  const normalizedText = normalizeExtractedText(args.rawText || "");
  const documentHint = String(args.documentType || "").toLowerCase();
  const hasVisualMarker = normalizedText.includes(normalizeExtractedText("--- ANALYSE VISUELLE REGLEMENTAIRE ---"));

  if (["zoning_map", "height_map", "special_provisions_map", "heritage_map"].includes(args.canonicalType)) {
    return normalizedText.length > 400 || hasVisualMarker ? "mixed" : "graphical";
  }
  if (args.canonicalType === "graphic_regulation") return hasVisualMarker ? "mixed" : "graphical";
  if (documentHint.includes("graphique") || documentHint.includes("map")) return normalizedText.length > 500 ? "mixed" : "graphical";
  return hasVisualMarker ? "mixed" : "text";
}

function parseStringArray(input: unknown) {
  if (Array.isArray(input)) return input.map((value) => String(value || "").trim()).filter(Boolean);
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed.map((value) => String(value || "").trim()).filter(Boolean) : [];
    } catch {
      return input.split(",").map((value) => value.trim()).filter(Boolean);
    }
  }
  return [];
}

function extractZoneHints(profile: DocumentProfileLike | null | undefined, doc: TownHallDocumentLike) {
  const hints = new Set<string>();
  parseStringArray((profile?.detectedZones as any) || []).forEach((value) => hints.add(value));
  const rawDetectedZones = Array.isArray(profile?.detectedZones) ? profile?.detectedZones : [];
  for (const item of rawDetectedZones) {
    if (typeof item === "string") hints.add(item.trim());
    if (item && typeof item === "object" && "zoneCode" in item) {
      const zoneCode = String((item as any).zoneCode || "").trim();
      if (zoneCode) hints.add(zoneCode);
    }
  }
  const explicitZone = String((doc as any).zone || "").trim();
  if (explicitZone) hints.add(explicitZone);
  const combinedText = [doc.title || "", doc.fileName || "", doc.rawText || ""].join(" ");
  for (const match of combinedText.matchAll(/\b(?:zone|secteur|sous-zone)\s+([A-Z]{1,3}[A-Z0-9-]*)\b/g)) {
    const zoneCode = String(match[1] || "").trim();
    if (zoneCode.length > 0 && zoneCode.length <= 8) hints.add(zoneCode);
  }
  return Array.from(hints);
}

function extractTopicHints(profile: DocumentProfileLike | null | undefined, doc: TownHallDocumentLike) {
  const hints = new Set<string>();
  const rawTopics = Array.isArray(profile?.structuredTopics) ? profile?.structuredTopics : [];
  for (const item of rawTopics) {
    if (typeof item === "string") hints.add(item.trim());
    if (item && typeof item === "object") {
      const family = String((item as any).family || "").trim();
      const topic = String((item as any).topic || "").trim();
      if (family) hints.add(family);
      if (topic) hints.add(topic);
    }
  }

  const haystack = [doc.title || "", doc.fileName || "", doc.documentType || "", doc.rawText || ""].join(" ");
  for (const entry of PRIORITY_TOPIC_TERMS) {
    if (entry.patterns.some((pattern) => pattern.test(haystack))) {
      hints.add(entry.topic);
    }
  }

  return Array.from(hints);
}

function toConfidence(score: number): RegulatoryConfidence {
  if (score >= 0.8) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function detectSignals(text: string | null | undefined) {
  const normalized = String(text || "");
  return CROSS_DOCUMENT_PATTERNS.flatMap((entry) => {
    const match = normalized.match(entry.pattern);
    if (!match) return [];
    return [{
      kind: entry.kind,
      label: entry.label,
      excerpt: match[0] || null,
      confidence: match[0] && match[0].length > 25 ? "high" : "medium",
    } satisfies CrossDocumentSignal];
  });
}

function computeSetRole(args: {
  canonicalType: RegulatoryDocumentCanonicalType;
  normativeWeight: RegulatoryNormativeWeight;
  zoneHints: string[];
  structuredTopics: string[];
  zoneCode?: string | null;
}) : RegulatorySetRole {
  const normalizedZone = normalizeExtractedText(args.zoneCode || "").replace(/\s+/g, "");
  const matchesZone = normalizedZone.length > 0
    && args.zoneHints.some((hint) => normalizeExtractedText(hint).replace(/\s+/g, "") === normalizedZone);

  if (["ppri", "pprt", "risk_plan", "sup_servitude", "spr_heritage"].includes(args.canonicalType)) return "risk_overlay";
  if (["zoning_map", "height_map", "special_provisions_map", "graphic_regulation", "heritage_map"].includes(args.canonicalType)) return "graphical_dependency";
  if (matchesZone || args.normativeWeight === "opposable_direct" || args.structuredTopics.length > 0) return "primary";
  if (args.normativeWeight === "opposable_indirect") return "secondary";
  return "context";
}

function buildReasoningNote(args: {
  canonicalType: RegulatoryDocumentCanonicalType;
  normativeWeight: RegulatoryNormativeWeight;
  zoneHints: string[];
  structuredTopics: string[];
  signals: CrossDocumentSignal[];
}) {
  const parts = [
    `Type ${args.canonicalType.replace(/_/g, " ")}`,
    `poids ${args.normativeWeight.replace(/_/g, " ")}`,
  ];
  if (args.zoneHints.length > 0) parts.push(`zones détectées: ${args.zoneHints.slice(0, 3).join(", ")}`);
  if (args.structuredTopics.length > 0) parts.push(`thèmes: ${args.structuredTopics.slice(0, 4).join(", ")}`);
  if (args.signals.length > 0) parts.push(`renvois: ${args.signals.map((signal) => signal.label).join(", ")}`);
  return parts.join(" · ");
}

function computeRelevanceScore(args: {
  canonicalType: RegulatoryDocumentCanonicalType;
  normativeWeight: RegulatoryNormativeWeight;
  setRole: RegulatorySetRole;
  classifierConfidence: number;
  zoneHints: string[];
  zoneCode?: string | null;
  structuredTopics: string[];
  signals: CrossDocumentSignal[];
}) {
  let score = args.classifierConfidence * 40;
  if (args.normativeWeight === "opposable_direct") score += 25;
  if (args.normativeWeight === "opposable_indirect") score += 18;
  if (args.setRole === "primary") score += 18;
  if (args.setRole === "graphical_dependency") score += 15;
  if (args.setRole === "risk_overlay") score += 16;
  if (args.zoneHints.length > 0 && args.zoneCode) {
    const normalizedZone = normalizeExtractedText(args.zoneCode).replace(/\s+/g, "");
    if (args.zoneHints.some((hint) => normalizeExtractedText(hint).replace(/\s+/g, "") === normalizedZone)) {
      score += 18;
    }
  }
  if (args.structuredTopics.length > 0) score += Math.min(12, args.structuredTopics.length * 2);
  if (args.signals.length > 0) score += Math.min(10, args.signals.length * 3);
  if (["height_map", "special_provisions_map", "zoning_map", "written_regulation"].includes(args.canonicalType)) score += 10;
  return score;
}

export function classifyRegulatoryDocument(args: {
  doc: TownHallDocumentLike;
  profile?: DocumentProfileLike | null;
  zoneCode?: string | null;
}): ClassifiedRegulatoryDocument {
  const profile = args.profile || null;
  const rawClassification = profile?.rawClassification && typeof profile.rawClassification === "object"
    ? profile.rawClassification as Record<string, unknown>
    : {};
  const category = String((rawClassification.category as string) || profile?.documentType || args.doc.category || "").trim() || null;
  const subCategory = String((rawClassification.subCategory as string) || profile?.documentSubtype || args.doc.subCategory || "").trim() || null;
  const documentType = String((rawClassification.resolvedDocumentType as string) || args.doc.documentType || profile?.documentSubtype || "").trim() || null;
  const canonicalType = inferCanonicalType({
    documentType,
    category,
    subCategory,
    rawText: args.doc.rawText,
    sourceName: args.doc.title || args.doc.fileName || profile?.sourceName || null,
  });
  const legacyCanonicalType = normalizeLegacyCanonicalType(documentType, category, subCategory);
  const classifierConfidence = Number(profile?.classifierConfidence ?? rawClassification.suggestionConfidence ?? 0.6);
  const zoneHints = extractZoneHints(profile, args.doc);
  const structuredTopics = extractTopicHints(profile, args.doc);
  const detectedSignals = detectSignals([args.doc.title || "", args.doc.fileName || "", args.doc.rawText || ""].join("\n"));
  const normativeWeight = inferNormativeWeight(canonicalType);
  const contentMode = inferContentMode({
    canonicalType,
    rawText: args.doc.rawText,
    documentType,
  });
  const setRole = computeSetRole({
    canonicalType,
    normativeWeight,
    zoneHints,
    structuredTopics,
    zoneCode: args.zoneCode,
  });
  const relevanceScore = computeRelevanceScore({
    canonicalType,
    normativeWeight,
    setRole,
    classifierConfidence,
    zoneHints,
    zoneCode: args.zoneCode,
    structuredTopics,
    signals: detectedSignals,
  });

  return {
    document_id: args.doc.id,
    profile_id: profile?.id || null,
    source_name: args.doc.title || args.doc.fileName || profile?.sourceName || "Document réglementaire",
    canonical_type: canonicalType,
    legacy_canonical_type: legacyCanonicalType,
    category,
    sub_category: subCategory,
    document_type: documentType,
    content_mode: contentMode,
    normative_weight: normativeWeight,
    set_role: setRole,
    is_opposable: Boolean(profile?.opposable ?? args.doc.isOpposable ?? normativeWeight !== "orientation"),
    classifier_confidence: classifierConfidence,
    source_authority: Number(profile?.sourceAuthority ?? 0),
    extraction_mode: profile?.extractionMode || null,
    extraction_reliability: profile?.extractionReliability ?? null,
    manual_review_required: Boolean(profile?.manualReviewRequired ?? false),
    zone_hints: zoneHints,
    structured_topics: structuredTopics,
    detected_signals: detectedSignals,
    relevance_score: relevanceScore,
    reasoning_note: buildReasoningNote({
      canonicalType,
      normativeWeight,
      zoneHints,
      structuredTopics,
      signals: detectedSignals,
    }),
  };
}

export function classifyRegulatoryDocumentSet(args: {
  docs: TownHallDocumentLike[];
  profiles?: DocumentProfileLike[];
  zoneCode?: string | null;
}) {
  const profileByDocId = new Map<string, DocumentProfileLike>();
  for (const profile of args.profiles || []) {
    const docId = String((profile as any)?.townHallDocumentId || "");
    if (docId) profileByDocId.set(docId, profile);
  }

  return args.docs
    .map((doc) => classifyRegulatoryDocument({
      doc,
      profile: profileByDocId.get(doc.id) || null,
      zoneCode: args.zoneCode,
    }))
    .sort((left, right) => right.relevance_score - left.relevance_score);
}

export function confidenceFromRelevance(score: number): RegulatoryConfidence {
  return toConfidence(score / 100);
}

export function detectCrossDocumentSignalsFromText(text: string | null | undefined) {
  return detectSignals(text);
}

export function inferLegacyCanonicalTypeForDocument(documentType: string | null | undefined, category?: string | null, subCategory?: string | null) {
  return normalizeLegacyCanonicalType(documentType, category, subCategory);
}

export function inferCanonicalRegulatoryDocumentType(args: {
  documentType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawText?: string | null;
  sourceName?: string | null;
}) {
  return inferCanonicalType(args);
}
