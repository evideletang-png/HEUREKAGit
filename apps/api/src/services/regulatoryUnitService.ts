import { db } from "@workspace/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  extractComprehensiveRegulatoryRules,
  extractDeterministicRegulatoryRules,
  buildDeterministicZoneDigest,
  buildZoneCodeAliases,
  type ArticleAnalysis,
  type ZoneDigest,
} from "./pluAnalysis.js";
import { smartArticleChunking } from "./baseIAIngestion.js";
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

function buildArticleCandidates(rawText: string, zoneCode?: string | null): ArticleAnalysis[] {
  const comprehensiveArticles = extractComprehensiveRegulatoryRules(rawText, zoneCode || undefined);
  const wholeTextArticles = extractDeterministicRegulatoryRules(rawText, zoneCode || undefined);

  const chunkArticles = smartArticleChunking(rawText)
    .flatMap((chunk) => extractDeterministicRegulatoryRules(chunk.content, zoneCode || undefined));

  return dedupeArticles([...comprehensiveArticles, ...wholeTextArticles, ...chunkArticles]);
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

  const articles = buildArticleCandidates(args.rawText, args.zoneCode);

  if (args.baseIADocumentId) {
    await db.delete(regulatoryUnitsTable).where(eq(regulatoryUnitsTable.baseIADocumentId, args.baseIADocumentId));
  } else if (args.townHallDocumentId) {
    await db.delete(regulatoryUnitsTable).where(eq(regulatoryUnitsTable.townHallDocumentId, args.townHallDocumentId));
  }

  if (articles.length === 0) {
    return { created: 0 };
  }

  await db.insert(regulatoryUnitsTable).values(
    articles.map((article) => ({
      baseIADocumentId: args.baseIADocumentId || null,
      townHallDocumentId: args.townHallDocumentId || null,
      municipalityId: args.municipalityId,
      zoneCode: args.zoneCode || null,
      documentType: args.documentType || null,
      theme: article.title,
      articleNumber: article.articleNumber,
      title: article.title,
      sourceText: article.sourceText,
      parsedValues: {
        ...parseValuesFromArticle(article),
        structuredData: article.structuredData || {},
      },
      confidence: article.confidence,
      sourceAuthority: args.sourceAuthority ?? 0,
      isOpposable: args.isOpposable ?? true,
      parserVersion: "v2",
      updatedAt: new Date(),
    }))
  );

  return { created: articles.length };
}

export async function loadRegulatoryUnits(args: LoadRegulatoryUnitsArgs): Promise<CanonicalRegulatoryUnit[]> {
  const aliases = Array.from(new Set([args.municipalityId, args.communeName].filter((value): value is string => !!value && value.trim().length > 0)));
  const zoneAliases = buildZoneCodeAliases(args.zoneCode);
  if (aliases.length === 0) return [];
  const zoneFilter = args.zoneCode
    ? or(
        inArray(regulatoryUnitsTable.zoneCode, zoneAliases),
        sql`${regulatoryUnitsTable.zoneCode} IS NULL`
      )
    : sql`TRUE`;
  const zonePriorityOrder = args.zoneCode
    ? zoneAliases.length > 1
      ? sql`CASE
          WHEN ${regulatoryUnitsTable.zoneCode} = ${zoneAliases[0]} THEN 0
          WHEN ${regulatoryUnitsTable.zoneCode} = ${zoneAliases[1]} THEN 1
          WHEN ${regulatoryUnitsTable.zoneCode} IS NULL THEN 2
          ELSE 3
        END`
      : sql`CASE
          WHEN ${regulatoryUnitsTable.zoneCode} = ${zoneAliases[0]} THEN 0
          WHEN ${regulatoryUnitsTable.zoneCode} IS NULL THEN 1
          ELSE 2
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
