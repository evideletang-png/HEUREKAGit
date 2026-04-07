export type UrbanRuleDescriptor = {
  family:
    | "zoning"
    | "height"
    | "parking"
    | "footprint"
    | "setback_public"
    | "setback_side"
    | "setback_rear"
    | "setback_between_buildings"
    | "green_space"
    | "materials"
    | "facade_roof_aspect"
    | "risk_restrictions"
    | "flood_risk"
    | "industrial_risk"
    | "protected_area"
    | "land_use_restrictions"
    | "access_roads"
    | "networks"
    | "specific_zone_rules";
  topic: string;
  label: string;
  priority: number;
};

export type ExtractedRuleValues = {
  valueType: "min" | "max" | "exact" | "range" | null;
  valueMin: number | null;
  valueMax: number | null;
  valueExact: number | null;
  unit: string | null;
  condition: string | null;
  exception: string | null;
};

function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(",", ".").trim();
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractSentence(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  if (!match) return null;
  const start = match.index ?? 0;
  const before = text.slice(0, start).split(/[.!?\n]/).pop() || "";
  const after = text.slice(start).split(/[.!?\n]/)[0] || "";
  const sentence = `${before} ${after}`.replace(/\s+/g, " ").trim();
  return sentence.length > 0 ? sentence : null;
}

export function confidenceToScore(level: string | null | undefined): number {
  switch ((level || "").toLowerCase()) {
    case "high":
      return 0.92;
    case "medium":
      return 0.7;
    case "low":
      return 0.42;
    default:
      return 0.25;
  }
}

export function inferUrbanRuleDescriptor(args: {
  theme?: string | null;
  articleNumber?: number | null;
  sourceText?: string | null;
}): UrbanRuleDescriptor {
  const articleNumber = args.articleNumber ?? null;
  const haystack = `${args.theme || ""} ${args.sourceText || ""}`.toLowerCase();

  if (/ppri|inond|crue|submersion|zone rouge|zone bleue/.test(haystack)) {
    return { family: "flood_risk", topic: "flood_risk", label: "Risque inondation", priority: 95 };
  }

  if (/pprt|seveso|industriel|zone de danger|effet thermique|surpression/.test(haystack)) {
    return { family: "industrial_risk", topic: "industrial_risk", label: "Risque industriel", priority: 95 };
  }

  if (/abf|spr|avap|patrimoine|monument historique|site patrimonial/.test(haystack)) {
    return { family: "protected_area", topic: "protected_area", label: "Périmètre protégé", priority: 90 };
  }

  if (/servitude|canalisation|cavit|argile|mouvement de terrain|retrait-gonflement|al[eé]a|ebc/.test(haystack)) {
    return { family: "risk_restrictions", topic: "risk_restrictions", label: "Risques & servitudes", priority: 90 };
  }

  switch (articleNumber) {
    case 1:
    case 2:
      return { family: "land_use_restrictions", topic: "land_use", label: "Usages & destinations", priority: 100 };
    case 3:
      return { family: "access_roads", topic: "access_roads", label: "Accès & voirie", priority: 90 };
    case 4:
      return { family: "networks", topic: "networks", label: "Réseaux & desserte", priority: 80 };
    case 6:
      return { family: "setback_public", topic: "setback_public", label: "Recul par rapport à la voie", priority: 100 };
    case 7:
      if (/fond|arri[eè]re/.test(haystack)) {
        return { family: "setback_rear", topic: "setback_rear", label: "Recul de fond de parcelle", priority: 95 };
      }
      return { family: "setback_side", topic: "setback_side", label: "Recul sur limites séparatives", priority: 100 };
    case 8:
      return { family: "setback_between_buildings", topic: "setback_between_buildings", label: "Distance entre constructions", priority: 85 };
    case 9:
      return { family: "footprint", topic: "footprint", label: "Emprise & densité", priority: 100 };
    case 10:
      return { family: "height", topic: "height", label: "Hauteur", priority: 100 };
    case 11:
      if (/mat[eé]riaux|bardage|enduit|teinte|couleur/.test(haystack)) {
        return { family: "materials", topic: "materials", label: "Matériaux & teintes", priority: 70 };
      }
      return { family: "facade_roof_aspect", topic: "facade_roof_aspect", label: "Aspect extérieur", priority: 70 };
    case 12:
      return { family: "parking", topic: "parking", label: "Stationnement", priority: 100 };
    case 13:
      return { family: "green_space", topic: "green_space", label: "Espaces verts & pleine terre", priority: 90 };
  }

  if (/hauteur|gabarit|fa[iî]tage|acrot[eè]re|[ée]gout/.test(haystack)) {
    return { family: "height", topic: "height", label: "Hauteur", priority: 95 };
  }
  if (/emprise|\bces\b|coefficient d[' ]emprise/.test(haystack)) {
    return { family: "footprint", topic: "footprint", label: "Emprise & densité", priority: 95 };
  }
  if (/stationnement|parking|garage|v[eé]lo/.test(haystack)) {
    return { family: "parking", topic: "parking", label: "Stationnement", priority: 95 };
  }
  if (/pleine terre|espace vert|espaces verts|plantation|perm[eé]able/.test(haystack)) {
    return { family: "green_space", topic: "green_space", label: "Espaces verts & pleine terre", priority: 85 };
  }
  if (/alignement|voie publique|recul sur voie|emprise publique/.test(haystack)) {
    return { family: "setback_public", topic: "setback_public", label: "Recul par rapport à la voie", priority: 90 };
  }
  if (/limite s[eé]parative|prospect|mitoyen/.test(haystack)) {
    return { family: "setback_side", topic: "setback_side", label: "Recul sur limites séparatives", priority: 90 };
  }
  if (/mat[eé]riaux|enduit|couleur|bardage|tuile|ardoise/.test(haystack)) {
    return { family: "materials", topic: "materials", label: "Matériaux & teintes", priority: 65 };
  }
  if (/cl[oô]ture|fa[cç]ade|toiture|menuiserie/.test(haystack)) {
    return { family: "facade_roof_aspect", topic: "facade_roof_aspect", label: "Aspect extérieur", priority: 65 };
  }
  if (/zone |secteur |sous-zone|sous zone/.test(haystack)) {
    return { family: "zoning", topic: "zoning", label: "Zone & secteur", priority: 85 };
  }

  return { family: "specific_zone_rules", topic: "specific_zone_rules", label: args.theme?.trim() || "Spécificités de zone", priority: 50 };
}

export function extractRuleValues(sourceText: string, descriptor: UrbanRuleDescriptor): ExtractedRuleValues {
  const text = sourceText || "";
  const percentageMatches = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g));
  const meterMatches = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*m(?:[èe]tre)?s?\b/gi));
  const placeMatches = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:place|places)\b/gi));

  const condition = extractSentence(text, /(?:à condition|sous réserve|à défaut|lorsque|si\b)/i);
  const exception = extractSentence(text, /(?:sauf|except[eé]|hors|dérogation)/i);

  let valueType: ExtractedRuleValues["valueType"] = null;
  let valueMin: number | null = null;
  let valueMax: number | null = null;
  let valueExact: number | null = null;
  let unit: string | null = null;

  if (descriptor.family === "parking" && placeMatches.length > 0) {
    valueExact = parseNumber(placeMatches[0]?.[1]) ?? null;
    valueType = valueExact != null ? "exact" : null;
    unit = valueExact != null ? "places" : null;
  } else if ((descriptor.family === "footprint" || descriptor.family === "green_space") && percentageMatches.length > 0) {
    const value = parseNumber(percentageMatches[0]?.[1]);
    if (/(au moins|minim|minimum|sup[eé]rieur ou [ée]gal)/i.test(text)) {
      valueMin = value;
      valueType = value != null ? "min" : null;
    } else if (/(au plus|maxim|maximum|inf[eé]rieur ou [ée]gal|ne peut exc[eé]der)/i.test(text)) {
      valueMax = value;
      valueType = value != null ? "max" : null;
    } else {
      valueExact = value;
      valueType = value != null ? "exact" : null;
    }
    unit = value != null ? "%" : null;
  } else if (meterMatches.length > 0) {
    const first = parseNumber(meterMatches[0]?.[1]);
    const second = parseNumber(meterMatches[1]?.[1]);
    if (/(entre|compris entre|de .* à)/i.test(text) && first != null && second != null) {
      valueMin = Math.min(first, second);
      valueMax = Math.max(first, second);
      valueType = "range";
      unit = "m";
    } else if (/(au moins|minim|minimum|sup[eé]rieur ou [ée]gal)/i.test(text)) {
      valueMin = first;
      valueType = first != null ? "min" : null;
      unit = first != null ? "m" : null;
    } else if (/(au plus|maxim|maximum|inf[eé]rieur ou [ée]gal|ne peut exc[eé]der)/i.test(text)) {
      valueMax = first;
      valueType = first != null ? "max" : null;
      unit = first != null ? "m" : null;
    } else {
      valueExact = first;
      valueType = first != null ? "exact" : null;
      unit = first != null ? "m" : null;
    }
  }

  return {
    valueType,
    valueMin,
    valueMax,
    valueExact,
    unit,
    condition,
    exception,
  };
}

export function buildRuleSummary(sourceText: string, descriptor: UrbanRuleDescriptor): string {
  const sentence = sourceText
    .replace(/\s+/g, " ")
    .trim()
    .split(/[.!?]/)
    .map((part) => part.trim())
    .find((part) => part.length > 30);

  if (sentence) {
    return sentence.length > 260 ? `${sentence.slice(0, 257)}...` : sentence;
  }

  return descriptor.label;
}
