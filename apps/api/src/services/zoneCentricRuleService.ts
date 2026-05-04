import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";
import { getControlsByZone, getRulesByZone, getZoneByParcel } from "./zoneExtractionService.js";

function familyFromTopic(topic: string | null | undefined, articleNumber: number | null | undefined) {
  const normalized = String(topic || "").toLowerCase();
  if (normalized.includes("hauteur")) return "height";
  if (normalized.includes("stationnement")) return "parking";
  if (normalized.includes("emprise")) return "footprint";
  if (normalized.includes("voie")) return "setback_public";
  if (normalized.includes("limite")) return "setback_side";
  if (normalized.includes("aspect")) return "facade_roof_aspect";
  if (normalized.includes("risque") || normalized.includes("servitude")) return "risk_restrictions";
  switch (articleNumber) {
    case 6: return "setback_public";
    case 7: return "setback_side";
    case 9: return "footprint";
    case 10: return "height";
    case 11: return "facade_roof_aspect";
    case 12: return "parking";
    case 13: return "green_space";
    default: return "specific_zone_rules";
  }
}

export async function loadZoneCentricRulesForAnalysis(args: {
  municipalityId: string;
  zoneCode?: string | null;
  parcelId?: string | null;
}): Promise<{ zone: Awaited<ReturnType<typeof getZoneByParcel>>; rules: StructuredUrbanRuleSource[]; controls: Awaited<ReturnType<typeof getControlsByZone>> }> {
  const zone = await getZoneByParcel({
    communeId: args.municipalityId,
    zoneCode: args.zoneCode,
    parcelId: args.parcelId,
  });
  if (!zone) return { zone: null, rules: [], controls: [] };

  const [zoneRules, controls] = await Promise.all([
    getRulesByZone(zone.id),
    getControlsByZone(zone.id),
  ]);

  const rules = zoneRules.map((rule) => ({
    id: rule.id,
    zoneCode: zone.zoneCode,
    zoneLabel: zone.zoneLabel,
    ruleFamily: familyFromTopic(rule.topic, rule.articleNumber),
    ruleTopic: rule.topic,
    ruleLabel: rule.articleTitle || rule.topic,
    ruleTextRaw: rule.ruleText,
    ruleSummary: rule.ruleText,
    ruleValueType: null,
    ruleValueMin: null,
    ruleValueMax: null,
    ruleValueExact: null,
    ruleUnit: null,
    ruleCondition: rule.conditions,
    ruleException: rule.exceptions,
    sourcePage: null,
    sourceArticle: rule.articleNumber ? String(rule.articleNumber) : null,
    sourceExcerpt: rule.sourceExcerpt || rule.ruleText,
    confidenceScore: rule.confidenceScore,
    reviewStatus: rule.validationStatus === "validated" ? "published" : rule.validationStatus,
    requiresManualValidation: rule.validationStatus !== "validated",
    ruleConflictFlag: false,
    sourceDocumentId: rule.sourceDocumentId,
    sourceDocumentKind: rule.sourceDocumentId ? "town_hall_document" : null,
    sourceDocumentName: null,
    visualCapture: null,
    visualSupportNote: null,
  })) as StructuredUrbanRuleSource[];

  return { zone, rules, controls };
}
