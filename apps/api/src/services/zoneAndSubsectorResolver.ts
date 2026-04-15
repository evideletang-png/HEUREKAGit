import { normalizeExtractedText } from "./textQualityService.js";
import type {
  ClassifiedRegulatoryDocument,
  RegulatoryConfidence,
  ZoneAndSubsectorResolution,
} from "./regulatoryInterpretationTypes.js";
import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";

type SegmentLike = {
  anchorLabel: string | null;
  sourceTextFull: string;
  documentTitle?: string | null;
};

type ZoneSectionLike = {
  heading: string | null;
  sourceText: string | null;
  documentTitle?: string | null;
};

type CandidateSupport = {
  label: string;
  reason: string;
  confidence: RegulatoryConfidence;
};

type CandidateState = {
  display: string;
  score: number;
  supports: CandidateSupport[];
};

const ZONE_TOKEN_REGEX = /\b([1-9]?[A-Z]{1,4}[A-Z0-9-]{0,6})\b/g;
const ZONE_PREFIX_REGEX = /\b(?:zone|secteur|sous-zone|sous secteur)\s+([1-9]?[A-Z]{1,4}[A-Z0-9-]{0,6})\b/gi;

function normalizeCode(value: string | null | undefined) {
  return normalizeExtractedText(value || "").replace(/\s+/g, "");
}

function isLikelyZoneCode(candidate: string) {
  const normalized = normalizeCode(candidate);
  if (!normalized) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (normalized.length < 2 || normalized.length > 10) return false;
  return /[A-Z]/.test(normalized);
}

function registerCandidate(
  map: Map<string, CandidateState>,
  rawCandidate: string | null | undefined,
  weight: number,
  support: CandidateSupport,
) {
  const display = String(rawCandidate || "").trim();
  const normalized = normalizeCode(display);
  if (!isLikelyZoneCode(normalized)) return;
  const existing = map.get(normalized) || {
    display,
    score: 0,
    supports: [],
  };
  existing.score += weight;
  existing.display = existing.display || display;
  existing.supports.push(support);
  map.set(normalized, existing);
}

function collectCandidatesFromText(
  rawText: string | null | undefined,
  weight: number,
  supportFactory: (candidate: string) => CandidateSupport,
  target: Map<string, CandidateState>,
) {
  const text = String(rawText || "");
  if (!text.trim()) return;

  for (const match of text.matchAll(ZONE_PREFIX_REGEX)) {
    registerCandidate(target, match[1], weight + 2, supportFactory(String(match[1] || "")));
  }

  for (const match of text.matchAll(ZONE_TOKEN_REGEX)) {
    const token = String(match[1] || "");
    if (!isLikelyZoneCode(token)) continue;
    registerCandidate(target, token, weight, supportFactory(token));
  }
}

function getRuleZoneCode(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { zoneCode?: string | null };
  return typedRule.zoneCode || null;
}

function getRuleAnchorLabel(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & { ruleAnchorLabel?: string | null };
  return typedRule.ruleAnchorLabel || null;
}

function getRuleRawText(rule: StructuredUrbanRuleSource) {
  const typedRule = rule as Partial<StructuredUrbanRuleSource> & {
    ruleTextRaw?: string | null;
    sourceText?: string | null;
    sourceExcerpt?: string | null;
  };
  return typedRule.ruleTextRaw || typedRule.sourceText || typedRule.sourceExcerpt || null;
}

function confidenceFromScore(score: number): RegulatoryConfidence {
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function sortCandidates(map: Map<string, CandidateState>) {
  return Array.from(map.entries()).sort((left, right) => {
    if (left[1].score !== right[1].score) return right[1].score - left[1].score;
    return right[0].length - left[0].length;
  });
}

export function resolveZoneAndSubsector(args: {
  requestedZoneCode: string;
  documents: ClassifiedRegulatoryDocument[];
  segments: SegmentLike[];
  rules: StructuredUrbanRuleSource[];
  zoneSections?: ZoneSectionLike[];
}): ZoneAndSubsectorResolution {
  const requestedZone = String(args.requestedZoneCode || "").trim();
  const normalizedRequestedZone = normalizeCode(requestedZone);
  const zoneCandidates = new Map<string, CandidateState>();
  const subzoneCandidates = new Map<string, CandidateState>();

  registerCandidate(zoneCandidates, requestedZone, 3, {
    label: `Zone demandee ${requestedZone}`,
    reason: "Zone de travail demandee comme point de depart.",
    confidence: "medium",
  });

  for (const document of args.documents) {
    for (const zoneHint of document.zone_hints || []) {
      const normalizedHint = normalizeCode(zoneHint);
      const target = normalizedHint.startsWith(normalizedRequestedZone) && normalizedHint !== normalizedRequestedZone
        ? subzoneCandidates
        : zoneCandidates;
      registerCandidate(target, zoneHint, 5, {
        label: document.source_name,
        reason: "Indice de zone ou sous-secteur detecte dans la qualification documentaire.",
        confidence: document.classifier_confidence >= 0.75 ? "high" : "medium",
      });
    }

    for (const signal of document.detected_signals || []) {
      const target = signal.kind === "subsector_referral" ? subzoneCandidates : zoneCandidates;
      collectCandidatesFromText(signal.excerpt || signal.label, signal.confidence === "high" ? 4 : 2, () => ({
        label: document.source_name,
        reason: `Renvoi detecte (${signal.kind}) dans le document.`,
        confidence: signal.confidence,
      }), target);
    }

    collectCandidatesFromText(document.reasoning_note, 1, () => ({
      label: document.source_name,
      reason: "Mention de zone ou de secteur reperee dans la note de classification.",
      confidence: "low",
    }), zoneCandidates);
  }

  for (const segment of args.segments) {
    const merged = [segment.anchorLabel, segment.sourceTextFull, segment.documentTitle].filter(Boolean).join(" ");
    collectCandidatesFromText(merged, 3, () => ({
      label: segment.documentTitle || segment.anchorLabel || "Segment",
      reason: "Bloc thematique borne dans la fenetre de pages de la zone.",
      confidence: "medium",
    }), subzoneCandidates);
  }

  for (const section of args.zoneSections || []) {
    const merged = [section.heading, section.sourceText, section.documentTitle].filter(Boolean).join(" ");
    collectCandidatesFromText(merged, 2, () => ({
      label: section.documentTitle || section.heading || "Section de zone",
      reason: "Section de zone reperee dans le document de reference ou une piece complementaire.",
      confidence: "medium",
    }), subzoneCandidates);
  }

  for (const rule of args.rules) {
    const zoneCode = getRuleZoneCode(rule);
    const merged = [zoneCode, getRuleAnchorLabel(rule), getRuleRawText(rule)].filter(Boolean).join(" ");
    collectCandidatesFromText(merged, zoneCode ? 4 : 2, () => ({
      label: getRuleAnchorLabel(rule) || "Regle publiee",
      reason: "Regle publiee ou interpretee deja rattachee a un secteur apparent.",
      confidence: zoneCode ? "high" : "medium",
    }), zoneCode ? subzoneCandidates : zoneCandidates);
  }

  const sortedZones = sortCandidates(zoneCandidates);
  const sortedSubzones = sortCandidates(subzoneCandidates).filter(([candidate]) => candidate.startsWith(normalizedRequestedZone));
  const bestZone = sortedZones[0];
  const bestSubzone = sortedSubzones[0];
  const secondSubzone = sortedSubzones[1];

  const identifiedZone = (() => {
    if (!bestZone) return requestedZone;
    if (bestZone[0] === normalizedRequestedZone) return requestedZone;
    if (bestZone[0].startsWith(normalizedRequestedZone)) return requestedZone;
    if ((bestZone[1].score || 0) >= 7) return bestZone[1].display;
    return requestedZone;
  })();

  const identifiedSubzone = bestSubzone?.[1].display || null;
  const confidence = confidenceFromScore(Math.max(bestZone?.[1].score || 0, bestSubzone?.[1].score || 0));
  const warnings: string[] = [];

  if (identifiedZone !== requestedZone) {
    warnings.push(`La lecture multi-documents pointe davantage vers ${identifiedZone} que vers ${requestedZone} : verification humaine recommandee.`);
  }
  if (bestSubzone && secondSubzone && bestSubzone[1].score - secondSubzone[1].score <= 1) {
    warnings.push("Plusieurs sous-secteurs proches ont ete detectes dans les pieces : la zone peut etre heterogene ou dependre d’un plan complementaire.");
  }
  if (!bestSubzone) {
    warnings.push("Aucun sous-secteur robuste n’a ete stabilise automatiquement a ce stade.");
  }

  const supporting_sources = [
    ...(bestZone?.[1].supports || []),
    ...(bestSubzone?.[1].supports || []),
  ].slice(0, 6);

  return {
    requested_zone: requestedZone,
    identified_zone: identifiedZone,
    identified_subzone: identifiedSubzone,
    confidence,
    warnings,
    supporting_sources,
  };
}
