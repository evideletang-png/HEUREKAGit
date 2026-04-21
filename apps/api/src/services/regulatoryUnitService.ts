import { db } from "@workspace/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  buildDeterministicZoneDigest,
  buildZoneCodeAliases,
  deriveZoneHierarchy,
  type ArticleAnalysis,
  type ZoneDigest,
} from "./pluAnalysis.js";
import { extractRegulatoryZoneSections } from "./regulatoryZoneSectionService.js";
import { buildMunicipalityTextFilter, resolveMunicipalityAliases, uniqueNonEmpty } from "./municipalityAliasService.js";
import { regulatoryUnitsTable } from "../../../../packages/db/src/schema/regulatoryUnits.js";

type PersistRegulatoryUnitsArgs = {
  baseIADocumentId?: string | null;
  townHallDocumentId?: string | null;
  municipalityId: string;
  zoneCode?: string | null;
  documentType?: string | null;
  sourceAuthority?: number;
  isOpposable?: boolean;
  rawText: string;
};

type LoadRegulatoryUnitsArgs = {
  municipalityId: string;
  communeName?: string | null;
  zoneCode?: string | null;
  minAuthority?: number;
  includeNonOpposable?: boolean;
  documentTypes?: string[];
};

export type CanonicalRegulatoryUnit = typeof regulatoryUnitsTable.$inferSelect;

const ARTICLE_THEME_LABELS: Record<number, string> = {
  1: "Usages & destinations",
  2: "Usages & destinations",
  3: "Voirie & accès",
  4: "Réseaux & desserte",
  5: "Caractéristiques du terrain",
  6: "Implantation par rapport à la voie",
  7: "Implantation sur limites séparatives",
  8: "Implantation entre constructions",
  9: "Emprise & densité",
  10: "Hauteur & gabarit",
  11: "Aspect architectural",
  12: "Stationnement",
  13: "Espaces verts & pleine terre",
  14: "Performance environnementale",
};

const THEMATIC_FALLBACKS: Array<{
  key: string;
  title: string;
  articleNumber?: number;
  patterns: RegExp[];
}> = [
  {
    key: "usages_destination",
    title: "Usages & destinations",
    articleNumber: 1,
    patterns: [/destination/gi, /usage/gi, /occupation du sol/gi, /interdit/gi, /autorisé/gi],
  },
  {
    key: "voirie_acces",
    title: "Voirie & accès",
    articleNumber: 3,
    patterns: [/acc[eè]s/gi, /voirie/gi, /desserte/gi, /voie publique/gi],
  },
  {
    key: "implantation_voie",
    title: "Implantation par rapport à la voie",
    articleNumber: 6,
    patterns: [/voie/gi, /alignement/gi, /recul/gi, /emprise publique/gi],
  },
  {
    key: "implantation_limites",
    title: "Implantation sur limites séparatives",
    articleNumber: 7,
    patterns: [/limite s[eé]parative/gi, /limites s[eé]paratives/gi, /prospect/gi, /fonds voisin/gi],
  },
  {
    key: "emprise_densite",
    title: "Emprise & densité",
    articleNumber: 9,
    patterns: [/emprise/gi, /\bces\b/gi, /coefficient d[' ]emprise/gi],
  },
  {
    key: "hauteur_gabarit",
    title: "Hauteur & gabarit",
    articleNumber: 10,
    patterns: [/hauteur/gi, /gabarit/gi, /fa[iî]tage/gi, /\begout\b/gi],
  },
  {
    key: "stationnement",
    title: "Stationnement",
    articleNumber: 12,
    patterns: [/stationnement/gi, /parking/gi, /garage/gi],
  },
  {
    key: "espaces_verts",
    title: "Espaces verts & pleine terre",
    articleNumber: 13,
    patterns: [/pleine terre/gi, /espace vert/gi, /espaces verts/gi, /plantation/gi],
  },
];

function testAnyPattern(patterns: RegExp[], haystack: string): boolean {
  return patterns.some((pattern) => new RegExp(pattern.source, pattern.flags.replace(/g/g, "")).test(haystack));
}

function dedupeArticles(articles: ArticleAnalysis[]): ArticleAnalysis[] {
  const seen = new Set<string>();
  const deduped: ArticleAnalysis[] = [];

  for (const article of articles) {
    const key = `${article.articleNumber}|${article.title}|${article.sourceText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(article);
  }

  return deduped;
}

function parseValuesFromArticle(article: ArticleAnalysis) {
  const text = `${article.title} ${article.sourceText}`.toLowerCase();
  const percentages = Array.from(article.sourceText.matchAll(/\d+(?:[.,]\d+)?\s*%/g)).map((match) => match[0]);
  const distances = Array.from(article.sourceText.matchAll(/\d+(?:[.,]\d+)?\s*m\b/gi)).map((match) => match[0]);

  return {
    percentages,
    distances,
    inferred_theme: article.title,
    mentions_height: text.includes("hauteur"),
    mentions_footprint: text.includes("emprise") || text.includes("ces"),
    mentions_stationing: text.includes("stationnement") || text.includes("parking"),
    mentions_greenery: text.includes("pleine terre") || text.includes("espace vert"),
  };
}

function cleanBlockText(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function inferThemeFromBlock(articleNumber: number | null, title: string, sourceText: string) {
  if (articleNumber != null && ARTICLE_THEME_LABELS[articleNumber]) {
    return {
      title: ARTICLE_THEME_LABELS[articleNumber],
      articleNumber,
    };
  }

  const haystack = `${title} ${sourceText}`.toLowerCase();
  for (const fallback of THEMATIC_FALLBACKS) {
    if (testAnyPattern(fallback.patterns, haystack)) {
      return {
        title: fallback.title,
        articleNumber: fallback.articleNumber ?? null,
      };
    }
  }

  return {
    title: title.trim().length > 0 ? title.trim() : "Règle de zone",
    articleNumber,
  };
}

function extractArticleBlocksFromZoneText(rawText: string): ArticleAnalysis[] {
  const articlePattern = /(?:^|\n)\s*(?:article|art\.?)\s*([0-9]{1,2})\s*(?:[:.\-–]\s*([^\n]{0,140}))?/gim;
  const matches: Array<{ articleNumber: number; heading: string; start: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = articlePattern.exec(rawText)) !== null) {
    const articleNumber = Number.parseInt(match[1] || "", 10);
    if (!Number.isFinite(articleNumber)) continue;
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    matches.push({
      articleNumber,
      heading: String(match[2] || "").trim(),
      start,
    });
  }

  if (matches.length === 0) return [];

  const articles: ArticleAnalysis[] = [];
  for (let index = 0; index < matches.length; index++) {
    const current = matches[index];
    const next = matches[index + 1];
    const sourceText = cleanBlockText(rawText.slice(current.start, next ? next.start : rawText.length));
    if (sourceText.length < 80) continue;
    const theme = inferThemeFromBlock(current.articleNumber, current.heading, sourceText);
    const summary = sourceText.slice(0, 500);
    articles.push({
      articleNumber: theme.articleNumber ?? current.articleNumber,
      title: theme.title,
      sourceText,
      interpretation: summary,
      summary,
      impactText: "Règle extraite depuis le chapitre de zone du règlement écrit.",
      vigilanceText: "Source opposable issue du règlement segmenté par zone.",
      confidence: "high",
      structuredData: {
        heading: current.heading || null,
        extraction_kind: "zone_article_block",
      },
    });
  }

  return articles;
}

function buildArticleCandidates(rawText: string, zoneCode?: string | null): ArticleAnalysis[] {
  const zoneArticleBlocks = extractArticleBlocksFromZoneText(rawText);
  if (zoneArticleBlocks.length === 0) {
    return [];
  }

  return dedupeArticles(zoneArticleBlocks);
}

function cleanMarkdownCell(raw: string | null | undefined) {
  return String(raw || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitMarkdownRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|").map(cleanMarkdownCell);
}

function isMarkdownSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function hasSubstantiveRuleCell(value: string | null | undefined) {
  const normalized = cleanMarkdownCell(value).toLowerCase();
  if (!normalized || normalized === "—" || normalized === "-" || normalized === "n/a") return false;
  return true;
}

function buildSynthesisArticle(args: {
  zoneCode: string;
  articleNumber: number;
  title: string;
  value: string;
  sourceLabel: string;
}) {
  const sourceText = cleanBlockText([
    `Zone ${args.zoneCode} — Article ${args.articleNumber} — ${args.title}`,
    `${args.sourceLabel} : ${args.value}`,
  ].join("\n"));

  return {
    articleNumber: args.articleNumber,
    title: args.title,
    sourceText,
    interpretation: sourceText,
    summary: sourceText,
    impactText: "Règle issue d'un tableau de synthèse réglementaire consolidé par zone.",
    vigilanceText: "Source consolidée : la règle est exploitable, mais le détail article complet doit rester consultable dans le document d'origine si nécessaire.",
    confidence: "medium" as const,
    structuredData: {
      extraction_kind: "markdown_zone_synthesis_table",
      source_label: args.sourceLabel,
      zone_code: args.zoneCode,
    },
  };
}

function extractMarkdownZoneSynthesisArticles(rawText: string): ArticleAnalysis[] {
  if (!/tableau de synth[eè]se des r[eè]gles opposables par zone/i.test(rawText)) return [];

  const lines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const tableStart = lines.findIndex((line) => /\|\s*Zone\s*\|\s*Vocation dominante\s*\|\s*Emprise max/i.test(line));
  if (tableStart < 0) return [];

  const articles: ArticleAnalysis[] = [];
  for (let index = tableStart + 1; index < lines.length; index++) {
    const cells = splitMarkdownRow(lines[index] || "");
    if (cells.length === 0) break;
    if (isMarkdownSeparatorRow(cells)) continue;
    if (cells.length < 7) continue;

    const zoneCode = cleanMarkdownCell(cells[0]).toUpperCase();
    if (!zoneCode || !/^(?:\d{1,2}AU[A-Z0-9-]*|[UNA][A-Z0-9-]*|[UNA])$/.test(zoneCode)) continue;

    const [, , footprint, height, greenSpace, socialHousing, roadSetback] = cells;

    if (hasSubstantiveRuleCell(footprint)) {
      articles.push(buildSynthesisArticle({
        zoneCode,
        articleNumber: 9,
        title: ARTICLE_THEME_LABELS[9],
        value: footprint,
        sourceLabel: "Emprise maximale",
      }));
    }

    if (hasSubstantiveRuleCell(height)) {
      articles.push(buildSynthesisArticle({
        zoneCode,
        articleNumber: 10,
        title: ARTICLE_THEME_LABELS[10],
        value: height,
        sourceLabel: "Hauteur maximale",
      }));
    }

    if (hasSubstantiveRuleCell(greenSpace)) {
      articles.push(buildSynthesisArticle({
        zoneCode,
        articleNumber: 13,
        title: ARTICLE_THEME_LABELS[13],
        value: greenSpace,
        sourceLabel: "Pleine terre",
      }));
    }

    if (hasSubstantiveRuleCell(socialHousing)) {
      articles.push(buildSynthesisArticle({
        zoneCode,
        articleNumber: 2,
        title: "Conditions particulières & mixité sociale",
        value: socialHousing,
        sourceLabel: "Logements locatifs sociaux",
      }));
    }

    if (hasSubstantiveRuleCell(roadSetback)) {
      articles.push(buildSynthesisArticle({
        zoneCode,
        articleNumber: 6,
        title: ARTICLE_THEME_LABELS[6],
        value: roadSetback,
        sourceLabel: "Recul par rapport aux voies",
      }));
    }
  }

  return dedupeArticles(articles);
}

function extractMarkdownCommonRuleBlock(rawText: string, headingPattern: RegExp): string | null {
  const match = headingPattern.exec(rawText);
  if (!match || typeof match.index !== "number") return null;
  const start = match.index;
  const rest = rawText.slice(start);
  const nextHeading = rest.slice(1).search(/\n\*\*[^*\n]+\*\*/i);
  const end = nextHeading >= 0 ? start + 1 + nextHeading : rawText.length;
  return cleanBlockText(rawText.slice(start, end));
}

function extractMarkdownCommonArticles(rawText: string, synthesisArticles: ArticleAnalysis[]): ArticleAnalysis[] {
  const zoneCodes = Array.from(new Set(synthesisArticles.map((article) => {
    const zoneCode = String(article.structuredData?.zone_code || "").trim();
    return zoneCode || null;
  }).filter((value): value is string => !!value)));
  if (zoneCodes.length === 0) return [];

  const articles: ArticleAnalysis[] = [];
  const parkingBlock = extractMarkdownCommonRuleBlock(rawText, /\*\*Stationnement\s*\(art\.\s*12\)[^*\n]*\*\*/i);
  if (parkingBlock) {
    for (const zoneCode of zoneCodes.filter((code) => ["UA", "UB", "UC"].includes(code))) {
      articles.push({
        articleNumber: 12,
        title: ARTICLE_THEME_LABELS[12],
        sourceText: cleanBlockText(`Zone ${zoneCode} — Article 12 — ${ARTICLE_THEME_LABELS[12]}\n${parkingBlock}`),
        interpretation: parkingBlock,
        summary: parkingBlock,
        impactText: "Règle commune de stationnement issue du règlement consolidé.",
        vigilanceText: "Règle commune : vérifier les exceptions éventuelles propres à la zone ou au projet.",
        confidence: "medium",
        structuredData: {
          extraction_kind: "markdown_common_rule_block",
          zone_code: zoneCode,
          source_label: "Stationnement commun UA/UB/UC",
        },
      });
    }
  }

  const greenBlock = extractMarkdownCommonRuleBlock(rawText, /\*\*Espaces libres\s*\(art\.\s*13\)[^*\n]*\*\*/i);
  if (greenBlock) {
    for (const zoneCode of zoneCodes.filter((code) => /^U/.test(code) || /^1AU/.test(code))) {
      articles.push({
        articleNumber: 13,
        title: ARTICLE_THEME_LABELS[13],
        sourceText: cleanBlockText(`Zone ${zoneCode} — Article 13 — ${ARTICLE_THEME_LABELS[13]} — dispositions communes\n${greenBlock}`),
        interpretation: greenBlock,
        summary: greenBlock,
        impactText: "Complément commun aux règles d'espaces libres / plantations.",
        vigilanceText: "Complément transversal : il ne remplace pas le taux de pleine terre propre à la zone.",
        confidence: "medium",
        structuredData: {
          extraction_kind: "markdown_common_rule_block",
          zone_code: zoneCode,
          source_label: "Espaces libres communs",
        },
      });
    }
  }

  return dedupeArticles(articles);
}

export async function persistRegulatoryUnitsForDocument(args: PersistRegulatoryUnitsArgs) {
  if (!args.documentType || !["plu_reglement", "plu_annexe", "oap"].includes(args.documentType)) {
    if (args.baseIADocumentId) {
      await db.delete(regulatoryUnitsTable).where(eq(regulatoryUnitsTable.baseIADocumentId, args.baseIADocumentId));
    } else if (args.townHallDocumentId) {
      await db.delete(regulatoryUnitsTable).where(eq(regulatoryUnitsTable.townHallDocumentId, args.townHallDocumentId));
    }
    return { created: 0 };
  }

  if (args.baseIADocumentId) {
    await db.delete(regulatoryUnitsTable).where(eq(regulatoryUnitsTable.baseIADocumentId, args.baseIADocumentId));
  } else if (args.townHallDocumentId) {
    await db.delete(regulatoryUnitsTable).where(eq(regulatoryUnitsTable.townHallDocumentId, args.townHallDocumentId));
  }

  const zoneScopedSources = (() => {
    if (args.zoneCode) {
      const hierarchy = deriveZoneHierarchy(args.zoneCode);
      return [{
        zoneCode: hierarchy.zoneCodeUpper,
        parentZoneCode: hierarchy.baseZone !== hierarchy.zoneCodeUpper ? hierarchy.baseZone : null,
        heading: `Zone ${hierarchy.zoneCodeUpper}`,
        sourceText: args.rawText,
        startPage: null,
        endPage: null,
        isSubZone: hierarchy.hasSubZone,
      }];
    }

    if (["plu_reglement", "plu_annexe"].includes(args.documentType || "")) {
      return extractRegulatoryZoneSections(args.rawText);
    }

    return [];
  })();

  const markdownSynthesisArticles = extractMarkdownZoneSynthesisArticles(args.rawText);
  const markdownCommonArticles = extractMarkdownCommonArticles(args.rawText, markdownSynthesisArticles);
  const markdownArticles = [...markdownSynthesisArticles, ...markdownCommonArticles];

  const unitsFromZoneSections = zoneScopedSources.flatMap((section) => {
    const articles = buildArticleCandidates(section.sourceText, section.zoneCode);
    return articles.map((article) => ({
      baseIADocumentId: args.baseIADocumentId || null,
      townHallDocumentId: args.townHallDocumentId || null,
      municipalityId: args.municipalityId,
      zoneCode: section.zoneCode || null,
      documentType: args.documentType || null,
      theme: article.title,
      articleNumber: article.articleNumber,
      title: article.title,
      sourceText: article.sourceText,
      parsedValues: {
        ...parseValuesFromArticle(article),
        structuredData: article.structuredData || {},
        zone_code: section.zoneCode,
        parent_zone_code: section.parentZoneCode,
        section_heading: section.heading,
        start_page: section.startPage ?? null,
        end_page: section.endPage ?? null,
        extraction_scope: "zone_section",
      },
      confidence: article.confidence,
      sourceAuthority: args.sourceAuthority ?? 0,
      isOpposable: args.isOpposable ?? true,
      parserVersion: "v3",
      updatedAt: new Date(),
    }));
  });

  const unitsFromMarkdownSynthesis = markdownArticles.map((article) => {
    const zoneCode = String(article.structuredData?.zone_code || "").trim() || null;
    const hierarchy = zoneCode ? deriveZoneHierarchy(zoneCode) : null;
    return {
      baseIADocumentId: args.baseIADocumentId || null,
      townHallDocumentId: args.townHallDocumentId || null,
      municipalityId: args.municipalityId,
      zoneCode,
      documentType: args.documentType || null,
      theme: article.title,
      articleNumber: article.articleNumber,
      title: article.title,
      sourceText: article.sourceText,
      parsedValues: {
        ...parseValuesFromArticle(article),
        structuredData: article.structuredData || {},
        zone_code: zoneCode,
        parent_zone_code: hierarchy && hierarchy.baseZone !== hierarchy.zoneCodeUpper ? hierarchy.baseZone : null,
        section_heading: `Zone ${zoneCode}`,
        start_page: null,
        end_page: null,
        extraction_scope: article.structuredData?.extraction_kind || "markdown_synthesis",
      },
      confidence: article.confidence,
      sourceAuthority: args.sourceAuthority ?? 0,
      isOpposable: args.isOpposable ?? true,
      parserVersion: "v3-markdown-synthesis",
      updatedAt: new Date(),
    };
  });

  const unitsToPersist = [...unitsFromZoneSections, ...unitsFromMarkdownSynthesis];

  if (unitsToPersist.length === 0) {
    return { created: 0 };
  }

  await db.insert(regulatoryUnitsTable).values(unitsToPersist);

  return { created: unitsToPersist.length };
}

export async function loadRegulatoryUnits(args: LoadRegulatoryUnitsArgs): Promise<CanonicalRegulatoryUnit[]> {
  const resolved = await resolveMunicipalityAliases(args.municipalityId, args.communeName);
  const aliases = uniqueNonEmpty([resolved.municipalityId, ...resolved.aliases, args.municipalityId, args.communeName]);
  const zoneAliases = buildZoneCodeAliases(args.zoneCode);
  if (aliases.length === 0) return [];
  const zoneFilter = args.zoneCode
    ? inArray(regulatoryUnitsTable.zoneCode, zoneAliases)
    : sql`TRUE`;
  const zonePriorityOrder = args.zoneCode
    ? zoneAliases.length > 1
      ? sql`CASE
          WHEN ${regulatoryUnitsTable.zoneCode} = ${zoneAliases[0]} THEN 0
          WHEN ${regulatoryUnitsTable.zoneCode} = ${zoneAliases[1]} THEN 1
          ELSE 2
        END`
      : sql`CASE
          WHEN ${regulatoryUnitsTable.zoneCode} = ${zoneAliases[0]} THEN 0
          ELSE 1
        END`
    : sql`0`;

  const rows = await db.select().from(regulatoryUnitsTable)
    .where(and(
      or(
        buildMunicipalityTextFilter(regulatoryUnitsTable.municipalityId, aliases)
      ),
      zoneFilter,
      typeof args.minAuthority === "number"
        ? sql`${regulatoryUnitsTable.sourceAuthority} >= ${args.minAuthority}`
        : sql`TRUE`,
      args.documentTypes && args.documentTypes.length > 0
        ? inArray(regulatoryUnitsTable.documentType, args.documentTypes)
        : sql`TRUE`,
      args.includeNonOpposable ? sql`TRUE` : eq(regulatoryUnitsTable.isOpposable, true)
    ))
    .orderBy(
      zonePriorityOrder,
      desc(regulatoryUnitsTable.sourceAuthority),
      desc(regulatoryUnitsTable.updatedAt)
    );

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.articleNumber || "x"}|${row.title}|${row.sourceText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildParsedRulesFromRegulatoryUnits(units: CanonicalRegulatoryUnit[]) {
  return units.map((unit) => ({
    article: unit.articleNumber ?? undefined,
    articleNumber: unit.articleNumber ?? undefined,
    title: unit.title,
    section: unit.theme,
    rule: unit.sourceText,
    sourceText: unit.sourceText,
    summary: unit.sourceText,
    confidence: unit.confidence,
    structuredData: unit.parsedValues || {},
  }));
}

export function buildArticlesFromRegulatoryUnits(units: CanonicalRegulatoryUnit[]): ArticleAnalysis[] {
  return units.map((unit) => ({
    articleNumber: unit.articleNumber || 0,
    title: unit.title,
    sourceText: unit.sourceText,
    interpretation: unit.sourceText,
    summary: unit.sourceText,
    impactText: `Règle canonique issue du document ${unit.documentType || "réglementaire"}.`,
    vigilanceText: "Source canonique déterministe reconstruite depuis le texte indexé.",
    confidence: (unit.confidence as ArticleAnalysis["confidence"]) || "low",
    structuredData: typeof unit.parsedValues === "object" ? (unit.parsedValues as Record<string, unknown>) : undefined,
  }));
}

export function buildDigestFromRegulatoryUnits(units: CanonicalRegulatoryUnit[], zoneCode?: string | null): ZoneDigest | null {
  return buildDeterministicZoneDigest(buildArticlesFromRegulatoryUnits(units), zoneCode || undefined);
}
