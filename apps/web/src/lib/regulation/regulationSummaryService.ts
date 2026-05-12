import type { RegulationRule } from "./zoningService";
import { MAJOR_RULE_THEMES, matchRuleTheme } from "./zoningService";

export type OperationalRuleSummary = {
  theme: string;
  summary: string;
  source?: string | null;
  page?: number | null;
  confidence: "source" | "partial" | "missing";
};

function formatRule(rule: RegulationRule) {
  const value = typeof rule.valueNumeric === "number"
    ? `${rule.operator || ""} ${rule.valueNumeric}${rule.unit ? ` ${rule.unit}` : ""}`.trim()
    : rule.valueText;
  return [rule.ruleLabel, value, rule.conditionText].filter(Boolean).join(" — ");
}

export function buildOperationalRuleSummaries(zoneCode: string | null | undefined, rules: RegulationRule[]): OperationalRuleSummary[] {
  const zoneRules = rules.filter((rule) => !zoneCode || rule.zoneCode === zoneCode);
  return MAJOR_RULE_THEMES.map((theme) => {
    const matches = zoneRules.filter((rule) => matchRuleTheme(rule) === theme);
    const first = matches[0];
    if (!first) {
      return {
        theme,
        summary: "Règle non encore structurée dans la base. Ouvrir le document source pour confirmer.",
        confidence: "missing" as const,
      };
    }
    return {
      theme,
      summary: formatRule(first) || first.ruleLabel || "Règle extraite mais à relire.",
      source: first.documentTitle,
      page: first.sourcePage,
      confidence: matches.length > 0 ? "source" as const : "partial" as const,
    };
  });
}
