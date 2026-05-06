export interface ProjectPluRuleCheck {
  article: string;
  rule: string;
  compliant: boolean;
  explanation: string;
}

export interface AnalyzeProjectInput {
  parcel?: unknown;
  zone?: unknown;
  projectDetails?: unknown;
}

export interface ProjectPluAnalysis {
  rulesChecked: ProjectPluRuleCheck[];
}

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function resultFrom(value: Record<string, unknown>): boolean | null {
  if (typeof value.compliant === "boolean") return value.compliant;
  if (typeof value.isCompliant === "boolean") return value.isCompliant;

  const status = normalize(value.result || value.status || value.statut || value.conclusion);
  if (!status) return null;
  if (status.includes("non conforme") || status.includes("non-compliant") || status.includes("refus") || status.includes("fail")) {
    return false;
  }
  if (status.includes("conforme") || status.includes("compliant") || status === "ok" || status.includes("valid")) {
    return true;
  }
  return null;
}

function ruleCheckFrom(candidate: unknown): ProjectPluRuleCheck | null {
  const item = asRecord(candidate);
  const compliant = resultFrom(item);
  if (compliant === null) return null;

  const article = firstString(
    item.article,
    item.sourceArticle,
    item.articleNumber ? `Article ${item.articleNumber}` : "",
    item.numero ? `Article ${item.numero}` : "",
  );
  const rule = firstString(item.rule, item.ruleText, item.regle, item.point, item.articleTitle, item.topic, item.categorie);
  if (!article || !rule) return null;

  return {
    article,
    rule,
    compliant,
    explanation: firstString(
      item.explanation,
      item.explication,
      item.justification,
      item.reason,
      item.message,
      item.comment,
      item.details,
      "Résultat issu de l'analyse PLU fournie.",
    ),
  };
}

function collectCandidates(input: AnalyzeProjectInput) {
  const project = asRecord(input.projectDetails);
  const pluAnalysis = asRecord(project.pluAnalysis);
  const zone = asRecord(input.zone);

  return [
    ...asArray(project.rulesChecked),
    ...asArray(pluAnalysis.rulesChecked),
    ...asArray(pluAnalysis.controles),
    ...asArray(pluAnalysis.controls),
    ...asArray(pluAnalysis.rules),
    ...asArray(pluAnalysis.articles),
    ...asArray(zone.rulesChecked),
    ...asArray(zone.controles),
    ...asArray(zone.controls),
    ...asArray(zone.rules),
    ...asArray(zone.regulatoryRules),
  ];
}

export function analyzeProject(input: AnalyzeProjectInput): ProjectPluAnalysis {
  const seen = new Set<string>();
  const rulesChecked: ProjectPluRuleCheck[] = [];

  for (const candidate of collectCandidates(input)) {
    const check = ruleCheckFrom(candidate);
    if (!check) continue;

    const key = `${normalize(check.article)}:${normalize(check.rule)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rulesChecked.push(check);
  }

  return { rulesChecked };
}
