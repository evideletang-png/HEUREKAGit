import type { CalculationParameters } from "./normalizationService.js";
import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";

export type BuildabilityFieldKey =
  | "footprint"
  | "remainingFootprint"
  | "height"
  | "setbackRoad"
  | "setbackBoundary"
  | "parking"
  | "greenSpace";

export function pickMaxNumeric(values: number[] | null | undefined): number | null {
  const candidates = (values || []).filter((value) => Number.isFinite(value));
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export function pickMinPositiveNumeric(values: number[] | null | undefined): number | null {
  const candidates = (values || []).filter((value) => Number.isFinite(value) && value > 0);
  if (candidates.length === 0) {
    return (values || []).some((value) => value === 0) ? 0 : null;
  }
  return Math.min(...candidates);
}

export function summarizeRuleTexts(values: string[] | null | undefined, emptyLabel: string) {
  const normalized = Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").replace(/\s+/g, " ").trim())
        .filter((value) => value.length > 0),
    ),
  );
  if (normalized.length === 0) return emptyLabel;
  const summary = normalized.join("; ");
  return summary.length > 240 ? `${summary.slice(0, 237)}...` : summary;
}

export function resolveNormalizedBuildabilitySelections(normalizedRules: CalculationParameters) {
  return {
    footprintRule: pickMinPositiveNumeric(normalizedRules.max_footprint),
    greenSpaceRatio: pickMaxNumeric(normalizedRules.green_space_ratio),
    roadSetback: pickMaxNumeric(normalizedRules.road_setback),
    boundarySetback: pickMaxNumeric(normalizedRules.boundary_setback),
    internalSpacing: pickMaxNumeric(normalizedRules.internal_spacing),
    maxHeight: pickMinPositiveNumeric(normalizedRules.max_height),
    parkingRequirement: summarizeRuleTexts(normalizedRules.parking_requirements, "").trim() || null,
    landscapingRequirement: summarizeRuleTexts(normalizedRules.landscaping_requirements, "").trim() || null,
  };
}

function getRuleUpperBoundValue(rule: StructuredUrbanRuleSource) {
  if (typeof rule.ruleValueExact === "number" && Number.isFinite(rule.ruleValueExact)) return rule.ruleValueExact;
  if (typeof rule.ruleValueMax === "number" && Number.isFinite(rule.ruleValueMax)) return rule.ruleValueMax;
  if (typeof rule.ruleValueMin === "number" && Number.isFinite(rule.ruleValueMin)) return rule.ruleValueMin;
  return null;
}

function getRuleLowerBoundValue(rule: StructuredUrbanRuleSource) {
  if (typeof rule.ruleValueExact === "number" && Number.isFinite(rule.ruleValueExact)) return rule.ruleValueExact;
  if (typeof rule.ruleValueMin === "number" && Number.isFinite(rule.ruleValueMin)) return rule.ruleValueMin;
  if (typeof rule.ruleValueMax === "number" && Number.isFinite(rule.ruleValueMax)) return rule.ruleValueMax;
  return null;
}

function getRuleTextBlob(rule: StructuredUrbanRuleSource) {
  return [
    rule.ruleTextRaw,
    rule.sourceExcerpt,
    rule.ruleSummary,
    rule.ruleLabel,
    rule.ruleCondition,
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0)
    .join(" ");
}

function extractDistanceValues(text: string) {
  return Array.from(
    text.matchAll(/(?:\b(?:recul|retrait|distance|implantation|au moins|minimum|min\.)[^.\n:;]{0,40}?)?(\d+(?:[.,]\d+)?)\s*(?:m(?:\b|[èe]tre(?:s)?\b))/gi),
  )
    .map((match) => Number.parseFloat(String(match[1] || "").replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function extractPercentageValues(text: string) {
  return Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g))
    .map((match) => Number.parseFloat(String(match[1] || "").replace(",", ".")))
    .filter((value) => Number.isFinite(value))
    .map((value) => (value > 1 ? value / 100 : value));
}

function deriveComparableFieldValue(rule: StructuredUrbanRuleSource, field: BuildabilityFieldKey) {
  const explicitUpper = getRuleUpperBoundValue(rule);
  const explicitLower = getRuleLowerBoundValue(rule);
  if (field === "footprint" || field === "remainingFootprint" || field === "height") {
    if (field === "height" && explicitUpper != null && !isPlausibleBuildingHeight(explicitUpper, getRuleTextBlob(rule))) {
      return null;
    }
    if (explicitUpper != null) return explicitUpper;
  } else if (field === "setbackRoad" || field === "setbackBoundary" || field === "greenSpace") {
    if (explicitLower != null) return explicitLower;
  }

  const text = getRuleTextBlob(rule);
  if (!text) return null;

  if (field === "height") {
    const values = extractDistanceValues(text).filter((value) => isPlausibleBuildingHeight(value, text));
    return values.length > 0 ? Math.max(...values) : null;
  }

  if (field === "setbackRoad") {
    if (/(?:à l['’]alignement|en alignement|alignement obligatoire|sans recul)/i.test(text)) return 0;
    const values = extractDistanceValues(text);
    return values.length > 0 ? Math.max(...values) : null;
  }

  if (field === "setbackBoundary") {
    if (/(?:en limite s[ée]parative|sur limite s[ée]parative|implantation en limite|en mitoyennet[eé])/i.test(text)) return 0;
    const values = extractDistanceValues(text);
    return values.length > 0 ? Math.max(...values) : null;
  }

  if (field === "greenSpace") {
    const values = extractPercentageValues(text);
    return values.length > 0 ? Math.max(...values) : null;
  }

  if (field === "footprint" || field === "remainingFootprint") {
    const percentageValues = extractPercentageValues(text);
    if (percentageValues.length > 0) return Math.min(...percentageValues);
    const values = extractDistanceValues(text);
    return values.length > 0 ? Math.min(...values) : null;
  }

  return null;
}

function isPlausibleBuildingHeight(value: number, text: string) {
  if (!Number.isFinite(value)) return false;
  if (value <= 0 || value > 80) return false;
  if (value >= 1900 && value <= 2099) return false;
  return !/\bngf\b|altitude|cote altim[eé]trique/i.test(text);
}

function getSourcePageWeight(rule: StructuredUrbanRuleSource) {
  return typeof rule.sourcePage === "number" && Number.isFinite(rule.sourcePage)
    ? rule.sourcePage
    : Number.MAX_SAFE_INTEGER;
}

function getCandidateRules(rules: StructuredUrbanRuleSource[], field: BuildabilityFieldKey) {
  switch (field) {
    case "footprint":
    case "remainingFootprint":
      return rules.filter((rule) => rule.ruleFamily === "footprint");
    case "height":
      return rules.filter((rule) => rule.ruleFamily === "height");
    case "setbackRoad":
      return rules.filter((rule) => rule.ruleFamily === "setback_public");
    case "setbackBoundary":
      return rules.filter((rule) => rule.ruleFamily === "setback_side" || rule.ruleFamily === "setback_rear");
    case "parking":
      return rules.filter((rule) => rule.ruleFamily === "parking");
    case "greenSpace":
      return rules.filter((rule) => rule.ruleFamily === "green_space");
    default:
      return [];
  }
}

export function selectRuleForBuildabilityField(
  rules: StructuredUrbanRuleSource[],
  field: BuildabilityFieldKey,
): StructuredUrbanRuleSource | null {
  const candidates = getCandidateRules(rules, field);
  if (candidates.length === 0) return null;

  if (field === "parking") {
    return candidates[0] ?? null;
  }

  const comparator = field === "footprint" || field === "remainingFootprint" || field === "height"
    ? (left: StructuredUrbanRuleSource, right: StructuredUrbanRuleSource) => {
        const leftValue = deriveComparableFieldValue(left, field);
        const rightValue = deriveComparableFieldValue(right, field);
        if (leftValue == null && rightValue == null) return getSourcePageWeight(left) - getSourcePageWeight(right);
        if (leftValue == null) return 1;
        if (rightValue == null) return -1;
        if (Math.abs(leftValue - rightValue) > 0.0001) return leftValue - rightValue;
        return getSourcePageWeight(left) - getSourcePageWeight(right);
      }
    : (left: StructuredUrbanRuleSource, right: StructuredUrbanRuleSource) => {
        const leftValue = deriveComparableFieldValue(left, field);
        const rightValue = deriveComparableFieldValue(right, field);
        if (leftValue == null && rightValue == null) return getSourcePageWeight(left) - getSourcePageWeight(right);
        if (leftValue == null) return 1;
        if (rightValue == null) return -1;
        if (Math.abs(leftValue - rightValue) > 0.0001) return rightValue - leftValue;
        return getSourcePageWeight(left) - getSourcePageWeight(right);
      };

  return [...candidates].sort(comparator)[0] ?? null;
}
