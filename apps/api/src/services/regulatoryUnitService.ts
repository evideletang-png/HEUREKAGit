import { db } from "@workspace/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { extractDeterministicRegulatoryRules, buildDeterministicZoneDigest, type ArticleAnalysis, type ZoneDigest } from "./pluAnalysis.js";
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
  const wholeTextArticles = extractDeterministicRegulatoryRules(rawText, zoneCode || undefined);

  const chunkArticles = smartArticleChunking(rawText)
    .flatMap((chunk) => extractDeterministicRegulatoryRules(chunk.content, zoneCode || undefined));

  return dedupeArticles([...wholeTextArticles, ...chunkArticles]);
}

export async function persistRegulatoryUnitsForDocument(args: PersistRegulatoryUnitsArgs) {
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
  if (aliases.length === 0) return [];

  const rows = await db.select().from(regulatoryUnitsTable)
    .where(and(
      or(
        inArray(regulatoryUnitsTable.municipalityId, aliases),
        ...aliases.map((alias) => sql`lower(${regulatoryUnitsTable.municipalityId}) = lower(${alias})`)
      ),
      args.zoneCode
        ? sql`(${regulatoryUnitsTable.zoneCode} = ${args.zoneCode} OR ${regulatoryUnitsTable.zoneCode} IS NULL)`
        : sql`TRUE`,
      typeof args.minAuthority === "number"
        ? sql`${regulatoryUnitsTable.sourceAuthority} >= ${args.minAuthority}`
        : sql`TRUE`,
      args.includeNonOpposable ? sql`TRUE` : eq(regulatoryUnitsTable.isOpposable, true)
    ))
    .orderBy(desc(regulatoryUnitsTable.sourceAuthority), desc(regulatoryUnitsTable.updatedAt));

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
