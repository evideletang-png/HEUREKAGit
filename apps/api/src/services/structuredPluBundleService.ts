import path from "path";

export type StructuredPluRuleStatus =
  | "applicable"
  | "non_reglemente"
  | "non_applicable"
  | "not_found"
  | "unknown"
  | "conditional"
  | "cross_document_required";

export type StructuredPluRule = {
  id: string;
  zone_code: string;
  parent_zone_code: string | null;
  article_code: string;
  topic: string;
  label: string;
  status: StructuredPluRuleStatus;
  normative_effect: "primary" | "additive" | "restrictive" | "substitutive" | "procedural" | "informative";
  applies_to: "building" | "fence" | "wall" | "hedge" | "portal" | "annex" | "pool" | "parking" | "tree" | "parcel" | "project" | "other";
  excluded_from_buildability: boolean;
  value: number | null;
  unit: string | null;
  value_components: Array<{ label: string; value: number; unit: string }>;
  alternatives: Array<Record<string, unknown>>;
  condition: string | null;
  exception: string | null;
  source_text: string;
  source_document_id: string;
  source_label: string;
  source_locator: string | null;
  confidence: "high" | "medium" | "low";
};

export type StructuredPluArticle = {
  numero: string;
  titre: string;
  texte: string;
  non_reglemente: boolean;
  status: StructuredPluRuleStatus;
  parsed_rules: StructuredPluRule[];
  source_locator: string | null;
};

export type StructuredPluZone = {
  code: string;
  parent_zone_code: string | null;
  label: string | null;
  categorie: string | null;
  note: string | null;
  caractere: string | null;
  sous_secteurs: Array<Record<string, unknown>>;
  articles: StructuredPluArticle[];
};

export type StructuredPluBundle = {
  source: string;
  commune: string | null;
  insee_code: string | null;
  epci: string | null;
  modification: string | null;
  zones: StructuredPluZone[];
  effective_zone_rules: StructuredPluRule[];
};

const ARTICLE_LABELS: Record<string, string> = {
  "1": "Occupations et utilisations du sol interdites",
  "2": "Occupations et utilisations du sol soumises a conditions",
  "3": "Acces et voirie",
  "4": "Reseaux et desserte",
  "5": "Caracteristiques des terrains",
  "6": "Implantation par rapport aux voies",
  "7": "Implantation par rapport aux limites separatives",
  "8": "Implantation entre constructions",
  "9": "Emprise au sol",
  "10": "Hauteur maximale des constructions",
  "11": "Aspect exterieur",
  "12": "Stationnement",
  "13": "Espaces libres et plantations",
  "14": "Coefficient d'occupation du sol",
};

function normalizeWhitespace(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeMultiline(value: unknown) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeZoneCode(value: unknown) {
  return normalizeWhitespace(value).toUpperCase();
}

function parseFrenchNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toRatio(percent: number) {
  return Math.round((percent / 100) * 10000) / 10000;
}

function isNonReglemente(text: string) {
  return /^\s*non\s+r[eé]glement[ée]\s*\.?\s*$/i.test(text);
}

function articleArrayFromUnknown(rawArticles: unknown): Array<{ numero: string; titre: string; texte: string; source_locator: string | null }> {
  if (Array.isArray(rawArticles)) {
    return rawArticles
      .map((article) => {
        const data = article as Record<string, unknown>;
        const numero = normalizeWhitespace(data.numero ?? data.article_code ?? data.articleCode ?? data.code);
        if (!numero) return null;
        return {
          numero,
          titre: normalizeWhitespace(data.titre ?? data.title) || ARTICLE_LABELS[numero] || `Article ${numero}`,
          texte: normalizeMultiline(data.texte ?? data.source_text ?? data.text),
          source_locator: normalizeWhitespace(data.source_locator ?? data.sourceLocator) || null,
        };
      })
      .filter((value): value is { numero: string; titre: string; texte: string; source_locator: string | null } => !!value && !!value.texte);
  }

  if (rawArticles && typeof rawArticles === "object") {
    return Object.entries(rawArticles as Record<string, unknown>)
      .map(([numero, article]) => {
        const data = article && typeof article === "object" ? article as Record<string, unknown> : {};
        return {
          numero,
          titre: normalizeWhitespace(data.titre ?? data.title) || ARTICLE_LABELS[numero] || `Article ${numero}`,
          texte: normalizeMultiline(data.texte ?? data.source_text ?? data.text ?? article),
          source_locator: normalizeWhitespace(data.source_locator ?? data.sourceLocator) || null,
        };
      })
      .filter((article) => !!article.numero && !!article.texte)
      .sort((left, right) => Number(left.numero) - Number(right.numero));
  }

  return [];
}

function extractSentenceAround(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match) return null;
  const start = Math.max(0, text.lastIndexOf("\n", match.index - 1));
  const nextDot = text.indexOf(".", match.index + match[0].length);
  const nextNewline = text.indexOf("\n\n", match.index + match[0].length);
  const endCandidates = [nextDot >= 0 ? nextDot + 1 : -1, nextNewline >= 0 ? nextNewline : -1].filter((value) => value >= 0);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : Math.min(text.length, match.index + 420);
  return normalizeWhitespace(text.slice(start, end));
}

function buildRuleId(source: string, zoneCode: string, articleCode: string, topic: string, suffix?: string) {
  const sourcePrefix = normalizeWhitespace(source).replace(/\W+/g, "-").replace(/^-|-$/g, "") || "PLU";
  return [sourcePrefix, zoneCode, articleCode, topic, suffix].filter(Boolean).join("-");
}

function baseRule(args: {
  source: string;
  zoneCode: string;
  parentZoneCode: string | null;
  articleCode: string;
  topic: string;
  label: string;
  text: string;
  sourceText: string;
  status?: StructuredPluRuleStatus;
  appliesTo?: StructuredPluRule["applies_to"];
  excluded?: boolean;
  value?: number | null;
  unit?: string | null;
  components?: StructuredPluRule["value_components"];
  alternatives?: StructuredPluRule["alternatives"];
  condition?: string | null;
  exception?: string | null;
  sourceLocator?: string | null;
  confidence?: "high" | "medium" | "low";
  suffix?: string;
}): StructuredPluRule {
  return {
    id: buildRuleId(args.source, args.zoneCode, args.articleCode, args.topic, args.suffix),
    zone_code: args.zoneCode,
    parent_zone_code: args.parentZoneCode,
    article_code: args.articleCode,
    topic: args.topic,
    label: args.label,
    status: args.status || "applicable",
    normative_effect: "primary",
    applies_to: args.appliesTo || "building",
    excluded_from_buildability: args.excluded ?? false,
    value: args.value ?? null,
    unit: args.unit || null,
    value_components: args.components || [],
    alternatives: args.alternatives || [],
    condition: args.condition || null,
    exception: args.exception || null,
    source_text: args.sourceText || args.text,
    source_document_id: args.source,
    source_label: `Zone ${args.zoneCode} — Article ${args.articleCode}`,
    source_locator: args.sourceLocator || null,
    confidence: args.confidence || "high",
  };
}

function parseArticle6Rules(args: { source: string; zoneCode: string; parentZoneCode: string | null; text: string; sourceLocator: string | null }) {
  const alternatives: StructuredPluRule["alternatives"] = [];
  const rangeMatch = args.text.match(/recul\s+compris\s+entre\s+(\d+(?:[,.]\d+)?)\s+et\s+(\d+(?:[,.]\d+)?)\s*m[èe]tre/i);
  if (rangeMatch) {
    alternatives.push({
      type: "range",
      min_m: parseFrenchNumber(rangeMatch[1]),
      max_m: parseFrenchNumber(rangeMatch[2]),
      display: `recul compris entre ${rangeMatch[1]} et ${rangeMatch[2]} m`,
    });
  }
  if (/align/i.test(args.text)) {
    alternatives.push({ type: "alignment", display: "alignement ou alignement sur construction voisine" });
  }
  const minMatch = args.text.match(/recul\s+minimal\s+de\s+(\d+(?:[,.]\d+)?)\s*m/i);
  if (minMatch) {
    alternatives.push({
      type: "minimum",
      min_m: parseFrenchNumber(minMatch[1]),
      display: `recul minimal de ${minMatch[1].replace(".", ",")} m`,
    });
  }
  if (alternatives.length === 0) return [];

  return [baseRule({
    source: args.source,
    zoneCode: args.zoneCode,
    parentZoneCode: args.parentZoneCode,
    articleCode: "6",
    topic: "road_setback",
    label: "Implantation par rapport aux voies",
    text: args.text,
    sourceText: extractSentenceAround(args.text, /Les constructions doivent être implantées/i) || args.text,
    alternatives,
    value: null,
    unit: "m",
    sourceLocator: args.sourceLocator,
  })];
}

function parseArticle7Rules(args: { source: string; zoneCode: string; parentZoneCode: string | null; text: string; sourceLocator: string | null }) {
  const rules: StructuredPluRule[] = [];
  if (/limite\(s\)\s+s[ée]parative|limites\s+s[ée]paratives/i.test(args.text)) {
    const minMatch = args.text.match(/minimum\s+de\s+(\d+(?:[,.]\d+)?)\s*m/i);
    const min = parseFrenchNumber(minMatch?.[1]);
    rules.push(baseRule({
      source: args.source,
      zoneCode: args.zoneCode,
      parentZoneCode: args.parentZoneCode,
      articleCode: "7",
      topic: "boundary_setback",
      label: "Implantation par rapport aux limites séparatives",
      text: args.text,
      sourceText: extractSentenceAround(args.text, /moiti[ée]\s+de\s+leur\s+hauteur|min(?:imum)?\s+de/i) || args.text,
      value: min,
      unit: "m",
      alternatives: [
        { type: "on_boundary", display: "implantation en limite(s) séparative(s)" },
        { type: "formula", formula: "H/2", min_m: min, display: min ? `distance >= H/2 avec minimum ${min} m` : "distance >= H/2" },
      ],
      sourceLocator: args.sourceLocator,
    }));
  }

  const poolMatch = args.text.match(/piscines?\s+non\s+couvertes?[\s\S]{0,160}?au\s+moins\s+(\d+(?:[,.]\d+)?)\s*m/i);
  const poolMin = parseFrenchNumber(poolMatch?.[1]);
  if (poolMin != null) {
    rules.push(baseRule({
      source: args.source,
      zoneCode: args.zoneCode,
      parentZoneCode: args.parentZoneCode,
      articleCode: "7",
      topic: "pool_boundary_setback",
      label: "Implantation des piscines par rapport aux limites",
      text: args.text,
      sourceText: poolMatch?.[0] || args.text,
      value: poolMin,
      unit: "m",
      appliesTo: "pool",
      excluded: true,
      suffix: "pool",
      sourceLocator: args.sourceLocator,
    }));
  }

  return rules;
}

function parseArticle9Rules(args: { source: string; zoneCode: string; parentZoneCode: string | null; text: string; sourceLocator: string | null }) {
  if (isNonReglemente(args.text)) {
    return [baseRule({
      source: args.source,
      zoneCode: args.zoneCode,
      parentZoneCode: args.parentZoneCode,
      articleCode: "9",
      topic: "max_footprint",
      label: "Emprise au sol",
      text: args.text,
      sourceText: args.text,
      status: "non_reglemente",
      value: null,
      unit: null,
      sourceLocator: args.sourceLocator,
    })];
  }

  const percent = parseFrenchNumber(args.text.match(/(\d+(?:[,.]\d+)?)\s*%/)?.[1]);
  if (percent == null) return [];
  return [baseRule({
    source: args.source,
    zoneCode: args.zoneCode,
    parentZoneCode: args.parentZoneCode,
    articleCode: "9",
    topic: "max_footprint",
    label: "Emprise au sol maximale",
    text: args.text,
    sourceText: extractSentenceAround(args.text, /emprise/i) || `${percent}%`,
    value: toRatio(percent),
    unit: "%",
    sourceLocator: args.sourceLocator,
  })];
}

function parseArticle10Rules(args: { source: string; zoneCode: string; parentZoneCode: string | null; text: string; sourceLocator: string | null }) {
  if (isNonReglemente(args.text)) {
    return [baseRule({
      source: args.source,
      zoneCode: args.zoneCode,
      parentZoneCode: args.parentZoneCode,
      articleCode: "10",
      topic: "building_height",
      label: "Hauteur maximale des constructions",
      text: args.text,
      sourceText: args.text,
      status: "non_reglemente",
      value: null,
      unit: null,
      sourceLocator: args.sourceLocator,
    })];
  }

  const egout = parseFrenchNumber(args.text.match(/(\d+(?:[,.]\d+)?)\s*m[èe]tres?\s+[aà]\s+l[’']?[ée]gout/i)?.[1]);
  const acrotere = parseFrenchNumber(args.text.match(/(\d+(?:[,.]\d+)?)\s*m[èe]tres?.{0,80}acrot[èe]re/i)?.[1]);
  const faitage = parseFrenchNumber(args.text.match(/(\d+(?:[,.]\d+)?)\s*m[èe]tres?\s+au\s+fa[iî]tage/i)?.[1]);
  const values = [egout, acrotere, faitage].filter((value): value is number => typeof value === "number");
  if (values.length === 0) return [];

  const components: StructuredPluRule["value_components"] = [];
  if (egout != null) components.push({ label: "égout", value: egout, unit: "m" });
  if (acrotere != null && acrotere !== egout) components.push({ label: "acrotère", value: acrotere, unit: "m" });
  if (faitage != null) components.push({ label: "faîtage", value: faitage, unit: "m" });

  const display = components.length >= 2
    ? components.map((component) => `${String(component.value).replace(".", ",")} m ${component.label}`).join(" / ")
    : `${Math.max(...values)} m`;

  return [baseRule({
    source: args.source,
    zoneCode: args.zoneCode,
    parentZoneCode: args.parentZoneCode,
    articleCode: "10",
    topic: "building_height",
    label: "Hauteur maximale des constructions",
    text: args.text,
    sourceText: display,
    value: Math.max(...values),
    unit: "m",
    components,
    condition: /b[âa]timent voisin/i.test(args.text) ? "Une hauteur differente peut etre admise si elle n'excede pas celle du batiment voisin le plus proche." : null,
    exception: /services publics|int[ée]r[êe]t collectif/i.test(args.text) ? "Pas de hauteur maximale fixee pour les constructions et installations necessaires aux services publics ou d'interet collectif." : null,
    sourceLocator: args.sourceLocator,
  })];
}

function parseArticle11Rules(args: { source: string; zoneCode: string; parentZoneCode: string | null; text: string; sourceLocator: string | null }) {
  const fenceMatch = args.text.match(/hauteur\s+maximale\s+de\s+la\s+cl[oô]ture[\s\S]{0,180}?(\d+(?:[,.]\d+)?)\s*m[èe]tre/i);
  const fenceHeight = parseFrenchNumber(fenceMatch?.[1]);
  if (fenceHeight == null) return [];
  return [baseRule({
    source: args.source,
    zoneCode: args.zoneCode,
    parentZoneCode: args.parentZoneCode,
    articleCode: "11",
    topic: "fence_height",
    label: "Hauteur maximale des clôtures",
    text: args.text,
    sourceText: fenceMatch?.[0] || `Hauteur maximale de la clôture : ${fenceHeight} m`,
    appliesTo: "fence",
    excluded: true,
    value: fenceHeight,
    unit: "m",
    exception: /mur existant/i.test(fenceMatch?.[0] || "") ? "Sauf reconstruction ou prolongement d'un mur existant." : null,
    sourceLocator: args.sourceLocator,
  })];
}

function parseArticle13Rules(args: { source: string; zoneCode: string; parentZoneCode: string | null; text: string; sourceLocator: string | null }) {
  const rules: StructuredPluRule[] = [];
  const greenMatch = args.text.match(/au\s+moins\s+(\d+(?:[,.]\d+)?)\s*%\s+d[’']?espaces\s+libres\s+en\s+pleine\s+terre/i);
  const percent = parseFrenchNumber(greenMatch?.[1]);
  if (percent != null) {
    rules.push(baseRule({
      source: args.source,
      zoneCode: args.zoneCode,
      parentZoneCode: args.parentZoneCode,
      articleCode: "13",
      topic: "green_space",
      label: "Espaces libres en pleine terre minimum",
      text: args.text,
      sourceText: greenMatch?.[0] || `${percent}% d'espaces libres en pleine terre`,
      value: toRatio(percent),
      unit: "%",
      appliesTo: "parcel",
      condition: /ne s[’']applique pas aux extensions/i.test(args.text)
        ? "Ne s'applique pas aux extensions des constructions deja presentes a la date indiquee dans le reglement."
        : null,
      sourceLocator: args.sourceLocator,
    }));
  }

  const treeMatch = args.text.match(/un\s+arbre\s+de\s+haute\s+tige\s+pour\s+(\d+(?:[,.]\d+)?)\s*m2/i);
  const treeRatio = parseFrenchNumber(treeMatch?.[1]);
  if (treeRatio != null) {
    rules.push(baseRule({
      source: args.source,
      zoneCode: args.zoneCode,
      parentZoneCode: args.parentZoneCode,
      articleCode: "13",
      topic: "tree_planting",
      label: "Plantations d'arbres de haute tige",
      text: args.text,
      sourceText: treeMatch?.[0] || `1 arbre pour ${treeRatio} m2`,
      value: treeRatio,
      unit: "m2/tree",
      appliesTo: "tree",
      excluded: true,
      suffix: "trees",
      sourceLocator: args.sourceLocator,
    }));
  }

  return rules;
}

function parseArticleRules(args: {
  source: string;
  zoneCode: string;
  parentZoneCode: string | null;
  articleCode: string;
  text: string;
  sourceLocator: string | null;
}): StructuredPluRule[] {
  switch (args.articleCode) {
    case "6":
      return parseArticle6Rules(args);
    case "7":
      return parseArticle7Rules(args);
    case "9":
      return parseArticle9Rules(args);
    case "10":
      return parseArticle10Rules(args);
    case "11":
      return parseArticle11Rules(args);
    case "13":
      return parseArticle13Rules(args);
    default:
      if (isNonReglemente(args.text)) {
        return [baseRule({
          source: args.source,
          zoneCode: args.zoneCode,
          parentZoneCode: args.parentZoneCode,
          articleCode: args.articleCode,
          topic: "article_status",
          label: ARTICLE_LABELS[args.articleCode] || `Article ${args.articleCode}`,
          text: args.text,
          sourceText: args.text,
          status: "non_reglemente",
          appliesTo: "other",
          excluded: true,
          sourceLocator: args.sourceLocator,
        })];
      }
      return [];
  }
}

function deriveParentZoneCode(code: string, rawParent: unknown) {
  const explicitParent = normalizeZoneCode(rawParent);
  if (explicitParent && explicitParent !== code) return explicitParent;
  const match = code.match(/^([A-Z]+)([a-z0-9]+)$/);
  return match ? match[1].toUpperCase() : null;
}

function inferInseeCodeFromBundle(data: Record<string, unknown>) {
  const direct = normalizeWhitespace(data.insee_code ?? data.inseeCode ?? (data.meta as Record<string, unknown> | undefined)?.insee_code ?? (data.meta as Record<string, unknown> | undefined)?.inseeCode);
  if (direct) return direct;
  const commune = normalizeWhitespace(data.commune ?? (data.meta as Record<string, unknown> | undefined)?.commune).toLowerCase();
  return commune.includes("ballan") ? "37018" : null;
}

export function isStructuredPluJsonUpload(fileName: string | null | undefined, mimeType: string | null | undefined) {
  return /\.json$/i.test(fileName || "") || /(^|\/|\+)json$/i.test(mimeType || "");
}

export function parseStructuredPluBundle(rawText: string, sourceFileName?: string | null): StructuredPluBundle | null {
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const rawZones = root.zones;
  if (!Array.isArray(rawZones) || rawZones.length === 0) return null;

  const source = normalizeWhitespace(root.source ?? (root.meta as Record<string, unknown> | undefined)?.source ?? sourceFileName) || path.basename(sourceFileName || "PLU-structure.json");
  const commune = normalizeWhitespace(root.commune ?? (root.meta as Record<string, unknown> | undefined)?.commune) || null;
  const bundle: StructuredPluBundle = {
    source,
    commune,
    insee_code: inferInseeCodeFromBundle(root),
    epci: normalizeWhitespace(root.epci ?? (root.meta as Record<string, unknown> | undefined)?.epci) || null,
    modification: normalizeWhitespace(root.modification ?? (root.meta as Record<string, unknown> | undefined)?.modification) || null,
    zones: [],
    effective_zone_rules: [],
  };

  for (const rawZone of rawZones) {
    if (!rawZone || typeof rawZone !== "object") continue;
    const zoneData = rawZone as Record<string, unknown>;
    const code = normalizeZoneCode(zoneData.code ?? zoneData.zone_code ?? zoneData.zoneCode);
    if (!code) continue;
    const parentZoneCode = deriveParentZoneCode(code, zoneData.parent_zone_code ?? zoneData.parentZoneCode);
    const rawArticles = articleArrayFromUnknown(zoneData.articles);
    const articles: StructuredPluArticle[] = rawArticles.map((rawArticle) => {
      const nonReglemente = isNonReglemente(rawArticle.texte);
      const status: StructuredPluRuleStatus = nonReglemente ? "non_reglemente" : "applicable";
      const parsedRules = parseArticleRules({
        source,
        zoneCode: code,
        parentZoneCode,
        articleCode: rawArticle.numero,
        text: rawArticle.texte,
        sourceLocator: rawArticle.source_locator,
      });
      return {
        numero: rawArticle.numero,
        titre: rawArticle.titre,
        texte: rawArticle.texte,
        non_reglemente: nonReglemente,
        status,
        parsed_rules: parsedRules,
        source_locator: rawArticle.source_locator,
      };
    });

    const zone: StructuredPluZone = {
      code,
      parent_zone_code: parentZoneCode,
      label: normalizeWhitespace(zoneData.label ?? zoneData.libelle) || null,
      categorie: normalizeWhitespace(zoneData.categorie ?? zoneData.category) || null,
      note: normalizeWhitespace(zoneData.note) || null,
      caractere: normalizeMultiline(zoneData.caractere ?? zoneData.character) || null,
      sous_secteurs: Array.isArray(zoneData.sous_secteurs)
        ? zoneData.sous_secteurs.filter((value): value is Record<string, unknown> => !!value && typeof value === "object")
        : [],
      articles,
    };
    bundle.zones.push(zone);
    bundle.effective_zone_rules.push(...articles.flatMap((article) => article.parsed_rules));
  }

  const zonesByCode = new Map(bundle.zones.map((zone) => [zone.code, zone]));
  for (const zone of bundle.zones) {
    if (!zone.parent_zone_code || zone.parent_zone_code === zone.code) continue;
    const parent = zonesByCode.get(zone.parent_zone_code);
    if (!parent) continue;
    const alreadyKnown = parent.sous_secteurs.some((subsector) => normalizeZoneCode(subsector.code ?? subsector.zone_code) === zone.code);
    if (!alreadyKnown) {
      parent.sous_secteurs.push({
        code: zone.code,
        parent_zone_code: zone.parent_zone_code,
        label: zone.label,
        derogations: [],
      });
    }
  }

  return bundle.zones.length > 0 ? bundle : null;
}

export function renderStructuredPluBundleText(bundle: StructuredPluBundle) {
  const lines = [
    `# PLU structure — ${bundle.commune || "commune non renseignee"}`,
    bundle.epci ? `EPCI: ${bundle.epci}` : null,
    bundle.modification ? `Version: ${bundle.modification}` : null,
    "",
  ].filter((value): value is string => value != null);

  for (const zone of bundle.zones) {
    lines.push(`## Zone ${zone.code}`);
    if (zone.categorie) lines.push(`Categorie: ${zone.categorie}`);
    if (zone.note) lines.push(`Note: ${zone.note}`);
    if (zone.caractere) lines.push(`Caractere: ${zone.caractere}`);
    for (const article of zone.articles) {
      lines.push("", `### Zone ${zone.code} — Article ${article.numero} — ${article.titre}`, article.texte);
      if (article.parsed_rules.length > 0) {
        lines.push("Regles structurees:");
        for (const rule of article.parsed_rules) {
          const display = rule.value_components.length > 0
            ? rule.value_components.map((component) => `${component.label}: ${component.value} ${component.unit}`).join(" / ")
            : rule.value != null
              ? `${rule.value} ${rule.unit || ""}`.trim()
              : rule.status;
          lines.push(`- ${rule.topic}: ${display}${rule.excluded_from_buildability ? " (hors constructibilite)" : ""}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildStructuredPluBundleStructuredContent(bundle: StructuredPluBundle, sourceFileName: string) {
  return {
    sourceFormat: "structured_plu_json",
    sourceFileName,
    commune: bundle.commune,
    inseeCode: bundle.insee_code,
    source: bundle.source,
    zoneCount: bundle.zones.length,
    articleCount: bundle.zones.reduce((sum, zone) => sum + zone.articles.length, 0),
    parsedRuleCount: bundle.effective_zone_rules.length,
    effectiveZoneRules: bundle.effective_zone_rules.map((rule) => ({
      id: rule.id,
      zone_code: rule.zone_code,
      parent_zone_code: rule.parent_zone_code,
      article_code: rule.article_code,
      topic: rule.topic,
      label: rule.label,
      status: rule.status,
      value: rule.value,
      unit: rule.unit,
      applies_to: rule.applies_to,
      excluded_from_buildability: rule.excluded_from_buildability,
      alternatives: rule.alternatives,
      source_label: rule.source_label,
      confidence: rule.confidence,
    })),
    zones: bundle.zones.map((zone) => ({
      code: zone.code,
      parentZoneCode: zone.parent_zone_code,
      label: zone.label,
      articleCount: zone.articles.length,
      parsedRuleCount: zone.articles.reduce((sum, article) => sum + article.parsed_rules.length, 0),
    })),
  };
}
