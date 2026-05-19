/**
 * reglementParser — Tolerant parser for externally-produced PLU analyses
 * (NotebookLM, manual paste, free-form AI output).
 *
 * Design principles:
 *   - **Never throw.** Return a partial result + warnings instead.
 *   - **Heuristic-first.** No external dep, no LLM call. Pure regex + keyword.
 *   - **Fallback graceful.** If no zone can be detected, return a single
 *     synthetic "UNKNOWN" zone wrapping the entire content.
 *
 * Output is consumed by `zoneExtractionService` (Phase 2) which upserts
 * zones / rules / controls into the new schema.
 */

export type ParsedRule = {
  articleNumber?: string;
  articleTitle?: string;
  topic: string;
  ruleText: string;
  conditions: Record<string, unknown>;
  exceptions: Record<string, unknown>;
  confidence: number;          // 0..1
  operator?: string;           // <=, >=, ==
  valueNumeric?: number;
  valueText?: string;
  unit?: string;
};

export type ParsedZone = {
  zoneCode: string;            // e.g., "UA"
  zoneLabel?: string;
  zoneType?: string;           // U | AU | A | N | derived from code
  rawSection: string;
  rules: ParsedRule[];
};

export type ParsedTransversalRule = {
  topic: string;
  ruleText: string;
  appliesTo: string[];         // zone codes, or ['all']
};

export type ParsedDocumentRelation = {
  source: string;
  target: string;
  relation: string;            // cite | overrides | complements | depends_on
};

export type ParsedNotebookAnalysis = {
  zones: ParsedZone[];
  transversalRules: ParsedTransversalRule[];
  documentRelations: ParsedDocumentRelation[];
  parserVersion: string;
  warnings: string[];
};

const PARSER_VERSION = "notebook-v1";

// ── Topic taxonomy ───────────────────────────────────────────────────────────

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["hauteur",       /\b(hauteurs?|h\.?\s?max|hauteur\s+maximales?)\b/i],
  ["emprise",       /\b(emprise|coefficient\s+d['']emprise|\bces\b|footprint)\b/i],
  ["recul",         /\b(reculs?|retraits?|prospect|implantation\s+par\s+rapport|alignement)\b/i],
  ["stationnement", /\b(stationnements?|parkings?|place\s+de\s+stationnement)\b/i],
  ["espaces_verts", /\b(espaces?\s+verts?|espaces?\s+libres?|pleine[\s\-]terre|coefficient\s+v[ée]g[ée]tal|biodiversit[ée])\b/i],
  ["toiture",       /\b(toitures?|toits?|pentes?\s+de\s+toit)\b/i],
  ["facade",        /\b(fa[çc]ades?|enduits?|mat[ée]riaux\s+de\s+fa[çc]ade|aspect\s+ext[ée]rieur)\b/i],
  ["destination",   /\b(destinations?|sous[\s\-]destinations?|usages?\s+autoris[ée]s?|usages?\s+interdits?)\b/i],
  ["cos",           /\b(\bcos\b|coefficient\s+d['']occupation\s+des\s+sols?)\b/i],
  ["surface",       /\b(surfaces?\s+de\s+plancher|surfaces?\s+minimales?|sp\b)\b/i],
  ["voirie",        /\b(voiries?|acc[èe]s|desserte|chauss[ée]e)\b/i],
  ["reseaux",       /\b(r[ée]seaux?|assainissement|eau\s+potable|[ée]lectricit[ée])\b/i],
  ["cloture",       /\b(cl[ôo]tures?|murets?\s+de\s+cl[ôo]ture)\b/i],
];

function detectTopic(text: string): string {
  for (const [topic, regex] of TOPIC_PATTERNS) {
    if (regex.test(text)) return topic;
  }
  return "general";
}

// ── Operator + value extraction ──────────────────────────────────────────────

const VALUE_REGEX = /(\d+(?:[.,]\d+)?)\s*(m²|m2|m\b|%|m[èe]tres?|places?)/i;

const OPERATOR_PATTERNS: Array<[string, RegExp]> = [
  ["<=", /\b(maximales?|maximums?|max\.?|au\s+plus|plafonn[ée]e?\s+(?:à|a)|inf[ée]rieur(?:e)?\s+(?:à|a)|ne\s+(?:peut|doit)\s+(?:d[ée]passer|exc[ée]der|[êe]tre\s+sup[ée]rieur))\b/i],
  [">=", /\b(minimales?|minimums?|min\.?|au\s+moins|au\s+minimum|sup[ée]rieur(?:e)?\s+(?:à|a)|ne\s+(?:peut|doit)\s+(?:[êe]tre\s+inf[ée]rieur))\b/i],
  ["==", /\b([ée]gal(?:e)?\s+(?:à|a)|exactement|fix[ée]e?\s+(?:à|a))\b/i],
];

function extractValueOperator(text: string): {
  operator?: string; valueNumeric?: number; valueText?: string; unit?: string;
} {
  const out: { operator?: string; valueNumeric?: number; valueText?: string; unit?: string } = {};
  const v = text.match(VALUE_REGEX);
  if (v) {
    const num = Number(v[1].replace(",", "."));
    if (Number.isFinite(num)) {
      out.valueNumeric = num;
      out.unit = v[2].toLowerCase().replace("metres", "m").replace("mètre", "m").replace("m2", "m²");
    }
  }
  for (const [op, regex] of OPERATOR_PATTERNS) {
    if (regex.test(text)) { out.operator = op; break; }
  }
  // Free-text qualitative value (only when no numeric value)
  if (out.valueNumeric == null) {
    const interdit = /\b(interdits?|prohib[ée]s?)\b/i.test(text);
    const autorise = /\b(autoris[ée]s?|admis(?:es)?)\b/i.test(text);
    if (interdit) out.valueText = "interdit";
    else if (autorise) out.valueText = "autorisé";
  }
  return out;
}

// ── Article extraction ──────────────────────────────────────────────────────

const ARTICLE_INLINE_REGEX = /\b(?:article|art\.?)\s+([\w\d][\w\d\-.]{0,12})\b/i;

function extractArticle(text: string): { articleNumber?: string; articleTitle?: string } {
  const m = text.match(ARTICLE_INLINE_REGEX);
  if (!m) return {};
  return { articleNumber: m[1] };
}

// ── Zone splitting ──────────────────────────────────────────────────────────

const ZONE_HEADING_REGEX = /^\s*#{1,6}?\s*(?:zone|secteur|sous[\s\-]secteur)\s+([A-Z][A-Z0-9a-z\-_]{0,8})\s*[:\-—–]?\s*(.*)$/im;
const ZONE_INLINE_REGEX  = /^\s*([A-Z]{1,3}[a-z0-9]{0,3})\s*[—–\-]\s+(.{4,})$/m;

function inferZoneType(zoneCode: string): string | undefined {
  const upper = zoneCode.toUpperCase();
  if (upper.startsWith("UA") || upper.startsWith("UB") || upper.startsWith("UC") || upper.startsWith("UD") || upper.startsWith("UE") || upper.startsWith("UH") || upper.startsWith("UV") || upper.startsWith("UI") || upper.startsWith("UY") || /^U[A-Z0-9]/.test(upper)) return "U";
  if (upper.startsWith("AU")) return "AU";
  if (upper.startsWith("N"))  return "N";
  if (upper.startsWith("A"))  return "A";
  return undefined;
}

function splitIntoZoneSections(content: string): Array<{ zoneCode: string; zoneLabel?: string; body: string }> {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ zoneCode: string; zoneLabel?: string; body: string }> = [];
  let currentZone: string | null = null;
  let currentLabel: string | undefined;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentZone) {
      sections.push({ zoneCode: currentZone, zoneLabel: currentLabel, body: currentBody.join("\n").trim() });
    }
  };

  for (const line of lines) {
    const heading = line.match(ZONE_HEADING_REGEX);
    if (heading) {
      flush();
      currentZone = heading[1].toUpperCase();
      const labelRest = (heading[2] || "").trim();
      currentLabel = labelRest.length > 0 ? labelRest.replace(/^[—–\-:.\s]+/, "").trim() : undefined;
      currentBody = [];
      continue;
    }
    // Inline zone declaration: "UA — Zone urbaine ancienne"
    const inline = line.match(ZONE_INLINE_REGEX);
    if (inline && !currentZone) {
      currentZone = inline[1].toUpperCase();
      currentLabel = inline[2].trim();
      currentBody = [];
      continue;
    }
    if (currentZone) currentBody.push(line);
  }
  flush();
  return sections;
}

// ── Rule extraction within a zone body ──────────────────────────────────────

const BULLET_REGEX = /^\s*[-*•·▪]\s+(.+)$/;
const NUMBERED_REGEX = /^\s*\d+[.)]\s+(.+)$/;

function extractRulesFromBody(body: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const lines = body.split(/\r?\n/);
  let currentArticle: string | undefined;
  let currentArticleTitle: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Article header line: "Article UA-7 — Implantation par rapport aux limites"
    const articleHeading = line.match(/^(?:#{1,6}\s+)?(?:article|art\.?)\s+([\w\d][\w\d\-.]{0,12})\s*[:\-—–]?\s*(.*)$/i);
    if (articleHeading) {
      currentArticle = articleHeading[1];
      currentArticleTitle = articleHeading[2]?.trim() || undefined;
      // The article line itself may carry a rule
      if (currentArticleTitle && currentArticleTitle.length > 5) {
        rules.push(buildRule(currentArticleTitle, currentArticle, currentArticleTitle));
      }
      continue;
    }

    let candidate: string | null = null;
    const bullet = line.match(BULLET_REGEX);
    const numbered = line.match(NUMBERED_REGEX);
    if (bullet)        candidate = bullet[1];
    else if (numbered) candidate = numbered[1];
    else if (line.length > 30 && /[.;:]/.test(line)) candidate = line; // long sentence

    if (candidate) {
      const inlineArticle = extractArticle(candidate);
      rules.push(buildRule(candidate, inlineArticle.articleNumber || currentArticle, currentArticleTitle));
    }
  }
  return rules;
}

function buildRule(text: string, articleNumber?: string, articleTitle?: string): ParsedRule {
  const topic = detectTopic(text);
  const v = extractValueOperator(text);
  let confidence = 0.5;
  if (topic !== "general") confidence += 0.2;
  if (v.valueNumeric != null) confidence += 0.2;
  if (articleNumber)          confidence += 0.1;
  return {
    articleNumber,
    articleTitle,
    topic,
    ruleText: text.trim(),
    conditions: {},
    exceptions: {},
    confidence: Math.min(1, confidence),
    ...v,
  };
}

// ── Transversal & document-relation detection (best-effort) ─────────────────

function extractTransversalRules(rawHead: string): ParsedTransversalRule[] {
  // Heuristic: paragraphs above the first zone heading that contain rule
  // keywords are considered transversal (apply to all zones).
  const rules: ParsedTransversalRule[] = [];
  const candidates = rawHead.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const para of candidates) {
    const topic = detectTopic(para);
    if (topic === "general") continue;
    rules.push({ topic, ruleText: para.length > 600 ? para.slice(0, 600) + "…" : para, appliesTo: ["all"] });
  }
  return rules;
}

const DOC_REF_REGEX = /\b(plu|pos|sup|servitude\s+\w+|dt-?ad-?dr|oap|sdage|sage|prif|ppri|pprt|pprn)\b/gi;

function extractDocumentRelations(content: string): ParsedDocumentRelation[] {
  const found = new Set<string>();
  const out: ParsedDocumentRelation[] = [];
  const matches = content.matchAll(DOC_REF_REGEX);
  for (const m of matches) {
    const tag = m[1].toUpperCase();
    if (found.has(tag)) continue;
    found.add(tag);
    out.push({ source: "PLU", target: tag, relation: "cite" });
  }
  return out;
}

// ── Public entry point ─────────────────────────────────────────────────────

export function parseNotebookAnalysis(content: string): ParsedNotebookAnalysis {
  const warnings: string[] = [];
  const safeContent = (content || "").trim();
  if (!safeContent) {
    return {
      zones: [],
      transversalRules: [],
      documentRelations: [],
      parserVersion: PARSER_VERSION,
      warnings: ["empty_content"],
    };
  }

  let zones: ParsedZone[] = [];
  try {
    const sections = splitIntoZoneSections(safeContent);
    zones = sections.map((s) => ({
      zoneCode:  s.zoneCode,
      zoneLabel: s.zoneLabel,
      zoneType:  inferZoneType(s.zoneCode),
      rawSection: s.body,
      rules:     extractRulesFromBody(s.body),
    }));
  } catch (err) {
    warnings.push(`zone_split_failed:${(err as Error).message}`);
  }

  // Fallback : no zone detected → wrap the whole content in a synthetic zone
  if (zones.length === 0) {
    warnings.push("no_zone_detected_fallback_unknown");
    let rules: ParsedRule[] = [];
    try { rules = extractRulesFromBody(safeContent); } catch { /* tolerant */ }
    zones = [{
      zoneCode:  "UNKNOWN",
      zoneLabel: "Zone non identifiée (à classer manuellement)",
      zoneType:  undefined,
      rawSection: safeContent.slice(0, 4000),
      rules,
    }];
  }

  // Transversal rules: text before the first zone heading
  const firstZoneIdx = (() => {
    const m = safeContent.match(ZONE_HEADING_REGEX);
    return m ? safeContent.indexOf(m[0]) : -1;
  })();
  let transversal: ParsedTransversalRule[] = [];
  try {
    transversal = firstZoneIdx > 0 ? extractTransversalRules(safeContent.slice(0, firstZoneIdx)) : [];
  } catch (err) {
    warnings.push(`transversal_failed:${(err as Error).message}`);
  }

  let documentRelations: ParsedDocumentRelation[] = [];
  try { documentRelations = extractDocumentRelations(safeContent); }
  catch (err) { warnings.push(`document_relations_failed:${(err as Error).message}`); }

  return {
    zones,
    transversalRules: transversal,
    documentRelations,
    parserVersion: PARSER_VERSION,
    warnings,
  };
}
