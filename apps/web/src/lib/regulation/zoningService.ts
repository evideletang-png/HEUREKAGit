export type RegulationZone = {
  id: string;
  zoneCode?: string | null;
  zoneLabel?: string | null;
  parentZoneCode?: string | null;
  sectorCode?: string | null;
  guidanceNotes?: string | null;
  summary?: string | null;
  ruleCount?: number | null;
  documentCount?: number | null;
  status?: string | null;
  referenceDocument?: {
    id: string;
    title?: string | null;
    fileName?: string | null;
    documentType?: string | null;
  } | null;
};

export type RegulationRule = {
  id: string;
  zoneCode?: string | null;
  zoneLabel?: string | null;
  articleCode?: string | null;
  themeLabel?: string | null;
  ruleLabel?: string | null;
  valueText?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  operator?: string | null;
  conditionText?: string | null;
  sourcePage?: number | null;
  documentTitle?: string | null;
};

export const MAJOR_RULE_THEMES = [
  "Destinations",
  "Implantation voie",
  "Limites séparatives",
  "Hauteur",
  "Emprise au sol",
  "Stationnement",
  "Espaces verts",
  "Clôtures",
  "Toitures / façades",
  "Aspect architectural",
  "Réseaux",
  "Densité",
];

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function matchRuleTheme(rule: Pick<RegulationRule, "themeLabel" | "ruleLabel" | "articleCode">) {
  const text = normalize(`${rule.themeLabel} ${rule.ruleLabel} ${rule.articleCode}`);
  if (text.includes("destination") || text.includes("usage")) return "Destinations";
  if (text.includes("voie") || text.includes("alignement") || text.includes("recul")) return "Implantation voie";
  if (text.includes("limite") || text.includes("separative")) return "Limites séparatives";
  if (text.includes("hauteur")) return "Hauteur";
  if (text.includes("emprise")) return "Emprise au sol";
  if (text.includes("stationnement")) return "Stationnement";
  if (text.includes("vert") || text.includes("pleine terre") || text.includes("espace libre")) return "Espaces verts";
  if (text.includes("cloture")) return "Clôtures";
  if (text.includes("toiture") || text.includes("facade")) return "Toitures / façades";
  if (text.includes("aspect") || text.includes("architect")) return "Aspect architectural";
  if (text.includes("reseau") || text.includes("assainissement") || text.includes("eau")) return "Réseaux";
  if (text.includes("densite") || text.includes("ces") || text.includes("cos")) return "Densité";
  return rule.themeLabel || "Autre règle";
}

export function summarizeZoneRules(zoneCode: string | null | undefined, rules: RegulationRule[]) {
  const zoneRules = rules.filter((rule) => !zoneCode || rule.zoneCode === zoneCode);
  const grouped = new Map<string, RegulationRule[]>();
  zoneRules.forEach((rule) => {
    const theme = matchRuleTheme(rule);
    grouped.set(theme, [...(grouped.get(theme) || []), rule]);
  });
  return MAJOR_RULE_THEMES.map((theme) => ({
    theme,
    rules: grouped.get(theme) || [],
  })).filter((entry) => entry.rules.length > 0);
}

export function buildZoneCards(zones: RegulationZone[], rules: RegulationRule[]) {
  return zones.map((zone) => {
    const zoneRules = rules.filter((rule) => rule.zoneCode === zone.zoneCode);
    const themes = Array.from(new Set(zoneRules.map((rule) => matchRuleTheme(rule))));
    return {
      ...zone,
      ruleCount: zone.ruleCount ?? zoneRules.length,
      themes,
      summary: zone.summary || zone.guidanceNotes || `${themes.slice(0, 4).join(", ") || "Règles majeures à consolider"}.`,
    };
  });
}
