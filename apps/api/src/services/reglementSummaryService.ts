import { eq, inArray } from "drizzle-orm";
import {
  db,
  regulatoryCalibrationZonesTable,
  regulatoryControlsTable,
  zoneRegulatoryRulesTable,
  type RegulatoryControl,
  type ZoneRegulatoryRule,
} from "@workspace/db";

export async function buildReglementSummary(communeId: string) {
  const zones = await db.select().from(regulatoryCalibrationZonesTable)
    .where(eq(regulatoryCalibrationZonesTable.communeId, communeId));
  const zoneIds = zones.map((zone) => zone.id);
  const [rules, controls] = await Promise.all([
    zoneIds.length > 0
      ? db.select().from(zoneRegulatoryRulesTable).where(inArray(zoneRegulatoryRulesTable.zoneId, zoneIds))
      : Promise.resolve([] as ZoneRegulatoryRule[]),
    zoneIds.length > 0
      ? db.select().from(regulatoryControlsTable).where(inArray(regulatoryControlsTable.zoneId, zoneIds))
      : Promise.resolve([] as RegulatoryControl[]),
  ]);

  const topicCounts = rules.reduce((map, rule) => {
    map.set(rule.topic, (map.get(rule.topic) || 0) + 1);
    return map;
  }, new Map<string, number>());

  const dominantTopics = Array.from(topicCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([topic, count]) => ({ topic, count }));

  const conflicts = controls
    .filter((control) => /conflit|contradiction|renvoi|à vérifier|a verifier|incertain/i.test(`${control.rule} ${control.validationStatus}`))
    .slice(0, 12)
    .map((control) => ({
      controlType: control.controlType,
      rule: control.rule,
      sourceArticle: control.sourceArticle,
    }));

  const confidenceValues = [
    ...rules.map((rule) => rule.confidenceScore),
    ...controls.map((control) => control.confidenceScore),
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const confidenceScore = confidenceValues.length > 0
    ? Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100)
    : 0;

  return {
    globalSummary: `${zones.length} zone(s), ${rules.length} règle(s) par zone et ${controls.length} contrôle(s) réglementaire(s) structurés.`,
    dominantRules: dominantTopics,
    conflicts,
    confidenceScore,
    counts: {
      zones: zones.length,
      validatedZones: zones.filter((zone) => zone.status === "validated").length,
      rules: rules.length,
      controls: controls.length,
    },
  };
}
