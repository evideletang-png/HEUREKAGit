export type ParsedReglementRule = {
  topic: string;
  ruleText: string;
  condition: string | null;
  exceptions: string | null;
  sourceDocument?: string | null;
  sourcePage?: number | null;
  confidence?: "high" | "medium" | "low" | number | null;
};

export type ParsedReglementArticle = {
  articleNumber: number | null;
  articleTitle: string;
  summary: string;
  rules: ParsedReglementRule[];
};

export type ParsedReglementZone = {
  zoneCode: string;
  zoneLabel: string | null;
  zoneType: string;
  summary: string;
  articles: ParsedReglementArticle[];
  controls: Array<{
    controlType: string;
    rule: string;
    sourceArticle: string | null;
    sourceDocument?: string | null;
    confidence?: "high" | "medium" | "low" | number | null;
  }>;
  linkedDocuments: Array<{ documentType: string; effect: string }>;
  warnings: string[];
};

export type ParsedReglementAnalysis = {
  municipalityId?: string | null;
  globalSummary: string;
  zones: ParsedReglementZone[];
  transversalRules: Array<Record<string, unknown>>;
  documentRelations: Array<Record<string, unknown>>;
  warnings: string[];
};

const ARTICLE_TITLES: Record<number, string> = {
  1: "Occupations interdites",
  2: "Occupations soumises à conditions",
  3: "Accès et voirie",
  4: "Réseaux",
  5: "Caractéristiques des terrains",
  6: "Implantation par rapport aux voies",
  7: "Implantation par rapport aux limites séparatives",
  8: "Implantation entre constructions",
  9: "Emprise au sol",
  10: "Hauteur",
  11: "Aspect extérieur",
  12: "Stationnement",
  13: "Espaces libres",
  14: "Coefficient d'occupation du sol",
};

function normalizeText(value: unknown) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function normalizeZoneCode(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "");
}

function confidenceToScore(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
  const text = normalizeText(value).toLowerCase();
  if (text === "high" || text === "haute" || text === "élevée") return 0.85;
  if (text === "medium" || text === "moyenne") return 0.65;
  if (text === "low" || text === "faible") return 0.35;
  return 0.5;
}

export function reglementConfidenceToScore(value: unknown) {
  return confidenceToScore(value);
}

function zoneTypeFromCode(zoneCode: string) {
  if (/^\d*AU/.test(zoneCode)) return "future_urban";
  if (zoneCode.startsWith("U")) return "urban";
  if (zoneCode.startsWith("A")) return "agricultural";
  if (zoneCode.startsWith("N")) return "natural";
  return "unknown";
}

function findJsonObject(content: string) {
  const trimmed = content.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coerceArticle(raw: any): ParsedReglementArticle | null {
  const articleNumber = Number.parseInt(String(raw?.articleNumber ?? raw?.article ?? raw?.numero ?? raw?.number ?? ""), 10);
  const safeArticleNumber = Number.isFinite(articleNumber) ? articleNumber : null;
  const articleTitle = normalizeText(raw?.articleTitle ?? raw?.title ?? raw?.titre)
    || (safeArticleNumber ? ARTICLE_TITLES[safeArticleNumber] : "")
    || "Article non identifié";
  const summary = normalizeText(raw?.summary ?? raw?.resume ?? raw?.résumé ?? raw?.text ?? raw?.texte);
  const rawRules = asArray(raw?.rules ?? raw?.regles ?? raw?.règles);
  const rules = rawRules.map((rule: any) => ({
    topic: normalizeText(rule?.topic ?? rule?.theme ?? rule?.controlType) || "general",
    ruleText: normalizeText(rule?.ruleText ?? rule?.rule ?? rule?.text ?? rule?.texte),
    condition: normalizeText(rule?.condition ?? rule?.conditions) || null,
    exceptions: normalizeText(rule?.exceptions ?? rule?.exception) || null,
    sourceDocument: normalizeText(rule?.sourceDocument ?? rule?.document) || null,
    sourcePage: typeof rule?.sourcePage === "number" ? rule.sourcePage : null,
    confidence: rule?.confidence ?? null,
  })).filter((rule) => rule.ruleText);
  if (!summary && rules.length === 0) return null;
  return { articleNumber: safeArticleNumber, articleTitle, summary, rules };
}

function coerceZone(raw: any): ParsedReglementZone | null {
  const zoneCode = normalizeZoneCode(raw?.zoneCode ?? raw?.code ?? raw?.zone);
  if (!zoneCode) return null;
  const articles = asArray(raw?.articles).map(coerceArticle).filter((article): article is ParsedReglementArticle => !!article);
  const controls = asArray(raw?.controls ?? raw?.controles ?? raw?.contrôles).map((control: any) => ({
    controlType: normalizeText(control?.controlType ?? control?.type ?? control?.topic) || "general",
    rule: normalizeText(control?.rule ?? control?.ruleText ?? control?.texte),
    sourceArticle: normalizeText(control?.sourceArticle ?? control?.article) || null,
    sourceDocument: normalizeText(control?.sourceDocument ?? control?.document) || null,
    confidence: control?.confidence ?? null,
  })).filter((control) => control.rule);

  return {
    zoneCode,
    zoneLabel: normalizeText(raw?.zoneLabel ?? raw?.label ?? raw?.libelle ?? raw?.libellé) || null,
    zoneType: normalizeText(raw?.zoneType ?? raw?.type) || zoneTypeFromCode(zoneCode),
    summary: normalizeText(raw?.summary ?? raw?.resume ?? raw?.résumé),
    articles,
    controls,
    linkedDocuments: asArray(raw?.linkedDocuments ?? raw?.documentsLies ?? raw?.documentsLiés).map((doc: any) => ({
      documentType: normalizeText(doc?.documentType ?? doc?.type) || "document",
      effect: normalizeText(doc?.effect ?? doc?.effet) || "complète la règle de zone",
    })),
    warnings: asArray(raw?.warnings ?? raw?.alertes).map(normalizeText).filter(Boolean),
  };
}

function parseHeuristicZones(content: string): ParsedReglementZone[] {
  const zones: ParsedReglementZone[] = [];
  const zoneRegex = /(?:^|\n)\s*(?:zone|secteur)\s+([0-9]?[A-Z]{1,3}[a-zA-Z0-9-]*)\b([^\n]*)/gi;
  const matches = Array.from(content.matchAll(zoneRegex));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const zoneCode = normalizeZoneCode(match[1]);
    if (!zoneCode) continue;
    const block = content.slice(match.index || 0, next?.index ?? content.length).trim();
    const articles = Array.from(block.matchAll(/(?:article|art\.?)\s*(\d{1,2})\s*[:.\-–]?\s*([^\n]*)\n?([\s\S]*?)(?=\n\s*(?:article|art\.?)\s*\d{1,2}\b|$)/gi))
      .map((articleMatch) => coerceArticle({
        articleNumber: articleMatch[1],
        articleTitle: articleMatch[2],
        summary: articleMatch[3],
        rules: [{ topic: "general", ruleText: articleMatch[3], confidence: "low" }],
      }))
      .filter((article): article is ParsedReglementArticle => !!article);
    zones.push({
      zoneCode,
      zoneLabel: normalizeText(match[2]) || null,
      zoneType: zoneTypeFromCode(zoneCode),
      summary: block.slice(0, 900),
      articles,
      controls: [],
      linkedDocuments: [],
      warnings: ["Analyse importée hors JSON : structure heuristique à valider."],
    });
  }
  return zones;
}

export function parseNotebookAnalysis(content: string): ParsedReglementAnalysis {
  try {
    const json = findJsonObject(content);
    if (json) {
      const zones = asArray(json?.zones).map(coerceZone).filter((zone): zone is ParsedReglementZone => !!zone);
      return {
        municipalityId: normalizeText(json?.municipalityId) || null,
        globalSummary: normalizeText(json?.globalSummary ?? json?.summary),
        zones,
        transversalRules: asArray(json?.transversalRules) as Array<Record<string, unknown>>,
        documentRelations: asArray(json?.documentRelations) as Array<Record<string, unknown>>,
        warnings: zones.length === 0 ? ["Aucune zone détectée dans le JSON importé. L'ancien système restera utilisé en fallback."] : [],
      };
    }

    const zones = parseHeuristicZones(content);
    return {
      globalSummary: normalizeText(content).slice(0, 2000),
      zones,
      transversalRules: [],
      documentRelations: [],
      warnings: zones.length === 0
        ? ["Aucune zone détectée. L'import est conservé comme version d'analyse, sans impact sur les validations humaines."]
        : ["Structure détectée par heuristique : validation humaine recommandée."],
    };
  } catch (err) {
    return {
      globalSummary: normalizeText(content).slice(0, 2000),
      zones: [],
      transversalRules: [],
      documentRelations: [],
      warnings: [`Parser tolérant : import conservé malgré une erreur (${err instanceof Error ? err.message : "inconnue"}).`],
    };
  }
}
