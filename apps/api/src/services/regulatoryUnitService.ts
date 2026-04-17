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

  const unitsToPersist = zoneScopedSources.flatMap((section) => {
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

  if (unitsToPersist.length === 0) {
    return { created: 0 };
  }

  await db.insert(regulatoryUnitsTable).values(unitsToPersist);

  return { created: unitsToPersist.length };
}

export async function loadRegulatoryUnits(args: LoadRegulatoryUnitsArgs): Promise<CanonicalRegulatoryUnit[]> {
  const aliases = Array.from(new Set([args.municipalityId, args.communeName].filter((value): value is string => !!value && value.trim().length > 0)));
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
        inArray(regulatoryUnitsTable.municipalityId, aliases),
        ...aliases.map((alias) => sql`lower(${regulatoryUnitsTable.municipalityId}) = lower(${alias})`)
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
