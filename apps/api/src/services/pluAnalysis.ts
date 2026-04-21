import { z } from "zod";
import { repairExtractedText } from "./textQualityService.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { loadPrompt } from "./promptLoader.js";
import { SYSTEM_PROMPTS, JurisdictionContext, GLOBAL_POOL_ID } from "@workspace/ai-core";
import { queryRelevantChunks } from "./embeddingService.js";
import { logger } from "../utils/logger.js";
import fs from "fs";
import { loadZoneSearchKeywords } from "./regulatoryCalibrationZoneHintsService.js";
import {
  buildRegulatorySinglePipeContext,
  loadRegulatorySinglePipePrompt,
  REGULATORY_SINGLE_PIPE_CORPUS_MAX_CHARS,
  REGULATORY_SINGLE_PIPE_DOCUMENT_MAX_CHARS,
  REGULATORY_SINGLE_PIPE_TIMEOUT_MS,
  truncateSinglePipeField,
} from "./regulatorySinglePipe.js";
import { resolveMunicipalityAliases, uniqueNonEmpty } from "./municipalityAliasService.js";

async function uniqueMunicipalityAliases(cityName?: string, jurisdictionContext?: JurisdictionContext): Promise<string[]> {
  const resolved = await resolveMunicipalityAliases(
    jurisdictionContext?.commune_insee || cityName,
    jurisdictionContext?.name || cityName,
  );
  return uniqueNonEmpty([
    resolved.municipalityId,
    ...resolved.aliases,
    jurisdictionContext?.commune_insee,
    cityName,
    jurisdictionContext?.name,
  ]);
}

async function queryChunksWithMunicipalityAliases(
  query: string,
  options: {
    cityName?: string;
    zoneCode?: string;
    articleId?: string;
    docTypes?: string[];
    jurisdictionContext?: JurisdictionContext;
    includeTrace?: boolean;
    limit?: number;
    minAuthority?: number;
    strictZone?: boolean;
  }
) {
  const aliases = await uniqueMunicipalityAliases(options.cityName, options.jurisdictionContext);
  const limit = options.limit || 15;
  const resultsById = new Map<string, any>();

  for (const municipalityId of aliases) {
    const chunks = await queryRelevantChunks(query, {
      municipalityId,
      zoneCode: options.zoneCode,
      articleId: options.articleId,
      docTypes: options.docTypes,
      jurisdictionContext: options.jurisdictionContext,
      includeTrace: options.includeTrace,
      limit,
      minAuthority: options.minAuthority,
      strictZone: options.strictZone,
    });

    for (const chunk of chunks) {
      if (!resultsById.has(chunk.id)) {
        resultsById.set(chunk.id, chunk);
      }
    }

    if (resultsById.size >= limit) break;
  }

  return Array.from(resultsById.values()).slice(0, limit);
}

async function collectPrioritizedRegulatoryChunks(
  queryStr: string,
  options: {
    cityName?: string;
    zoneCode?: string;
    jurisdictionContext?: JurisdictionContext;
    limit?: number;
  }
) {
  const limit = options.limit || 25;
  const zoneAliases = buildZoneCodeAliases(options.zoneCode);
  const plans = [
    { docTypes: ["plu_reglement"], strictZone: true, target: Math.min(limit, 15) },
    { docTypes: ["plu_annexe"], strictZone: true, target: Math.min(limit, 22) },
    { docTypes: ["plu_reglement"], strictZone: false, target: Math.min(limit, 25) },
    { docTypes: ["plu_annexe"], strictZone: false, target: Math.min(limit, 25) },
  ];

  const seen = new Set<string>();
  const chunks: any[] = [];

  for (const plan of plans) {
    for (const zoneAlias of zoneAliases) {
      const hits = await queryChunksWithMunicipalityAliases(queryStr, {
        cityName: options.cityName,
        zoneCode: zoneAlias,
        docTypes: plan.docTypes,
        minAuthority: 7,
        strictZone: plan.strictZone,
        limit: plan.target,
        jurisdictionContext: options.jurisdictionContext,
      });

      for (const hit of hits) {
        if (seen.has(hit.id)) continue;
        seen.add(hit.id);
        chunks.push(hit);
        if (chunks.length >= limit) return chunks;
      }
    }
  }

  return chunks;
}

/**
 * Estimation rapide du nombre de tokens (1 token ~ 4 caractères pour du français/anglais).
 * On vise une limite de sécurité de 25k tokens pour un quota TPM de 30k.
 */
function safeTruncate(text: string, maxTokens: number = 150000): string {
  const maxChars = Math.floor(maxTokens * 3.3); // ~500k chars
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n\n[TRONQUÉ - LIMITE EXTREME ATTEINTE (TOKEN QUOTA SAFE)]";
}

export function deriveZoneHierarchy(zoneCode: string) {
  const zoneCodeUpper = zoneCode.toUpperCase();
  const baseZoneMatch = zoneCode.match(/^([A-Z]+)/);
  const baseZone = baseZoneMatch && baseZoneMatch[1] ? baseZoneMatch[1].toUpperCase() : zoneCodeUpper;
  const suffix = zoneCodeUpper.startsWith(baseZone) ? zoneCodeUpper.slice(baseZone.length) : "";
  return {
    zoneCodeUpper,
    baseZone,
    suffix,
    hasSubZone: suffix.length > 0 && zoneCodeUpper !== baseZone,
  };
}

export function buildZoneCodeAliases(zoneCode?: string | null): string[] {
  if (!zoneCode || zoneCode.trim().length === 0) return [];
  const { zoneCodeUpper, baseZone, hasSubZone } = deriveZoneHierarchy(zoneCode.trim());
  return hasSubZone ? [zoneCodeUpper, baseZone] : [zoneCodeUpper];
}

/**
 * Filtre le texte pour ne garder que les sections pertinentes autour des mots-clés.
 */
export function extractRelevantPLUSections(text: string, zoneCode: string): string {
  const upperText = text.toUpperCase();
  const { zoneCodeUpper, baseZone, suffix, hasSubZone } = deriveZoneHierarchy(zoneCode);
  
  console.log(`[pluAnalysis] extractRelevantPLUSections: zoneCode=${zoneCode}, zoneCodeUpper=${zoneCodeUpper}, baseZone=${baseZone}, suffix=${suffix}`);

  const segments: { start: number; end: number; priority: number }[] = [];
  const inclusionRanges: { start: number; end: number }[] = [];

  // 1. DISPOSITIONS GÉNÉRALES (Always include)
  const genPattern = /DISPOSITIONS\s+G[ÉE]N[ÉE]RALES|DISPOSITIONS\s+COMMUNES/gi;
  const genMatch = genPattern.exec(text);
  if (genMatch) {
     const start = genMatch.index;
     const end = Math.min(text.length, genMatch.index + 20000);
     segments.push({ start, end, priority: 1 });
     inclusionRanges.push({ start, end });
  }

  // 2. FIND ZONE START (Critical)
  const zoneHeaderPatterns = [
    new RegExp(`DISPOSITIONS\\s+APPLICABLES\\s+([ÀA]\\s+)?LA\\s+ZONE\\s+${zoneCodeUpper}`, "i"),
    new RegExp(`DISPOSITIONS\\s+APPLICABLES\\s+([ÀA]\\s+)?LA\\s+ZONE\\s+${baseZone}`, "i"),
    new RegExp(`DISPOSITIONS\\s+APPLICABLES\\s+([ÀA]\\s+)?LA\\s+ZONE\\s+${baseZone}[^\\n]{0,80}${zoneCodeUpper}`, "i"),
    new RegExp(`ZONE\\s+${zoneCodeUpper}\\b`, "i"),
    new RegExp(`ZONE\\s+${baseZone}\\b`, "i"),
    new RegExp(`SECTEUR\\s+${zoneCodeUpper}\\b`, "i"),
    new RegExp(`SOUS[- ]ZONE\\s+${zoneCodeUpper}\\b`, "i"),
  ];
  
  let zoneStartIndex = -1;
  // Skip the first 10k chars to avoid Table of Contents matches
  const searchableText = text.substring(Math.min(text.length, 10000));
  const offset = Math.min(text.length, 10000);

  for (const rx of zoneHeaderPatterns) {
    const m = rx.exec(searchableText);
    if (m) {
      zoneStartIndex = m.index + offset;
      const start = Math.max(0, zoneStartIndex - 800);
      const end = Math.min(text.length, zoneStartIndex + 160000);
      segments.push({ start, end, priority: 2 });
      inclusionRanges.push({ start, end });
      break; 
    }
  }

  // 2b. If the target is a sub-zone (e.g. UDa), capture the base zone block AND local sub-zone mentions.
  if (hasSubZone) {
    const subZoneMentionPatterns = [
      new RegExp(`\\b${zoneCodeUpper}\\b`, "gi"),
      new RegExp(`SECTEUR\\s+${zoneCodeUpper}\\b`, "gi"),
      new RegExp(`${baseZone}[^\\n]{0,40}${suffix}`, "gi"),
    ];

    for (const rx of subZoneMentionPatterns) {
      let match: RegExpExecArray | null;
      let localCount = 0;
      while ((match = rx.exec(text)) !== null && localCount < 8) {
        const start = Math.max(0, match.index - 2500);
        const end = Math.min(text.length, match.index + 12000);
        segments.push({ start, end, priority: 0 });
        inclusionRanges.push({ start, end });
        localCount++;
      }
    }
  }

  // 3. KEYWORDS (ONLY if in inclusion ranges)
  const keywords = [
    "Art\\s+1", "Article\\s+1", "Art\\s+2", "Article\\s+2",
    "Art\\s+3", "Article\\s+3", "Art\\s+4", "Article\\s+4",
    "Art\\s+6", "Article\\s+6", "Art\\s+7", "Article\\s+7",
    "Art\\s+8", "Article\\s+8", "Art\\s+9", "Article\\s+9",
    "Art\\s+10", "Article\\s+10", "Art\\s+11", "Article\\s+11",
    "Art\\s+12", "Article\\s+12", "Stationnement",
    "Art\\s+13", "Article\\s+13", "CES", "Emprise\\s+au\\s+sol", "Hauteur",
    "Aspect\\s+extérieur", "Destination", "Usages?", "Réseaux", "Servitudes?",
    zoneCodeUpper, baseZone
  ];
  
  keywords.forEach(kw => {
    const rx = new RegExp(`\\b${kw}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = rx.exec(text)) !== null) {
      // ONLY include if it falls within a previously identified "General" or "Target Zone" range
      const inRange = inclusionRanges.some(r => match!.index >= r.start && match!.index <= r.end);
      if (inRange) { 
        segments.push({
          start: Math.max(0, match!.index - 500),
          end: Math.min(text.length, match!.index + 4000),
          priority: 0
        });
      }
    }
  });

  // 3. Extract and combine
  if (segments.length === 0) {
    console.warn(`[pluAnalysis] No matching sections found for ${zoneCode}. Returning no zone excerpt instead of broad fallback.`);
    return "";
  }

  // Sort and merge
  segments.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  if (segments.length > 0) {
    let current = segments[0];
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].start <= current.end + 500) {
        current.end = Math.max(current.end, segments[i].end);
      } else {
        merged.push(current);
        current = segments[i];
      }
    }
    merged.push(current);
  }

  const resultText = merged.map(m => text.substring(m.start, m.end)).join("\n\n--- DISCONTINUITÉ ---\n\n");

  // Never return the full document here: doing so causes the later OpenAI call to truncate the
  // beginning of the file instead of the relevant zone pages. We want targeted zone excerpts only.
  return safeTruncate(resultText, 300000); 
}

export interface ArticleAnalysis {
  articleNumber: number;
  title: string;
  sourceText: string;
  interpretation: string;
  summary: string;
  impactText: string;
  vigilanceText: string;
  confidence: "high" | "medium" | "low" | "unknown";
  structuredData?: Record<string, unknown>;
}

export interface ZoneAnalysisResult {
  zoneCode: string;
  zoneLabel: string;
  articles: ArticleAnalysis[];
  issues?: {
    article?: string;
    msg?: string;
    severity?: "bloquante" | "majeure" | "mineure";
    type?: string;
    code?: string;
    message?: string;
  }[];
  calculationVariables: {
    maxFootprintRatio?: number | null;
    maxHeightM?: number | null;
    minSetbackFromRoadM?: number | null;
    minSetbackFromBoundariesM?: number | null;
    parkingRules?: string | null;
    greenSpaceRatio?: number | null;
  };
  globalConstraints: string[];
}

function buildPluAvailabilityIssue(params: {
  zoneCode: string;
  cityName?: string;
  hasIndexedRegulatorySource: boolean;
}) {
  const target = params.cityName || params.zoneCode;
  if (params.hasIndexedRegulatorySource) {
    return {
      zoneLabel: `Zone ${params.zoneCode} — documents PLU présents, lecture à confirmer`,
      issue: {
        article: "GLOBAL",
        msg: `Des documents PLU sont bien indexés pour ${target}, mais la lecture réglementaire de la zone ${params.zoneCode} n'a pas encore pu être reconstituée assez fiablement.`,
        severity: "majeure" as const,
        type: "PLU_ZONE_READ_INSUFFICIENT",
        code: "PLU_ZONE_READ_INSUFFICIENT",
        message: `Des documents PLU sont indexés pour ${target}, mais les règles spécifiques à la zone ${params.zoneCode} n'ont pas encore pu être extraites de manière suffisamment fiable.`,
      },
    };
  }

  return {
    zoneLabel: `Zone ${params.zoneCode} — aucun document PLU indexé`,
    issue: {
      article: "GLOBAL",
      msg: `Aucun document PLU indexé pour ${target}. Importez les documents dans la Base IA mairie.`,
      severity: "bloquante" as const,
      type: "NO_PLU_DATA",
      code: "NO_PLU_DATA",
      message: `Aucun document PLU indexé pour ${target}. Importez les documents dans la Base IA mairie.`,
    },
  };
}

export interface ExtractedDocumentData {
  document_code: string;
  status: "ok" | "warning" | "error";
  confidence_score: number;
  extracted_data: Record<string, any>;
  regulatory_checks: {
    rule: string;
    compliance: "OK" | "NON_COMPLIANT" | "UNCERTAIN";
    source: string;
    analysis: string;
  }[];
  cross_document_issues: { target: string; issue: string; severity: string }[];
  missing_information: string[];
  recommendations: string[];
  analysis: {
    compliance: string;
    summary: string;
  };
  // Compatibility fields for old logic
  project_description?: string;
  project_address?: string;
  document_nature?: string;
  document_type?: string;
  expertise_notes?: string;
  raw_mentions?: string[];
}

export interface EngineResponse<T = any> {
  status: "ok" | "incomplete" | "error" | "warning";
  data: T;
  metrics?: {
    total_tokens: number;
    completion_tokens: number;
    prompt_tokens: number;
  };
  missing_elements?: string[];
  warnings?: string[];
  analysis?: any; // Re-adding the missing field
}

export interface ZoneDigest {
  dimensions: {
    maxFootprint?: string;
    maxHeight?: string;
    minSetbacks?: string;
    greenSpace?: string;
  };
  restrictions: string[];
  conditions: string[];
  summary: string;
}

type DeterministicRuleSeed = {
  articleNumber: number;
  title: string;
  patterns: RegExp[];
};

const DETERMINISTIC_RULE_SEEDS: DeterministicRuleSeed[] = [
  {
    articleNumber: 1,
    title: "Destination et usages",
    patterns: [/destination/i, /occupations?\s+du\s+sol/i, /usages?\s+adm(?:is|ises)|interdit/i],
  },
  {
    articleNumber: 6,
    title: "Implantation par rapport à la voie",
    patterns: [/implantation[^.\n]{0,140}(voie|alignement|emprise publique)/i, /recul[^.\n]{0,140}(voie|alignement)/i, /alignement/i],
  },
  {
    articleNumber: 7,
    title: "Implantation sur limites séparatives",
    patterns: [/limites?\s+s[ée]paratives/i, /prospect/i, /recul[^.\n]{0,140}limites?/i],
  },
  {
    articleNumber: 9,
    title: "Emprise au sol",
    patterns: [/emprise\s+au\s+sol/i, /\bCES\b/i, /coefficient\s+d['’]emprise/i],
  },
  {
    articleNumber: 10,
    title: "Hauteur",
    patterns: [/hauteur\s+des\s+constructions/i, /hauteur\s+maximale/i, /\bhauteur\b/i],
  },
  {
    articleNumber: 12,
    title: "Stationnement",
    patterns: [/stationnement/i, /places?\s+de\s+stationnement/i, /parking/i],
  },
  {
    articleNumber: 13,
    title: "Espaces verts et pleine terre",
    patterns: [/espaces?\s+verts/i, /pleine\s+terre/i, /plantations/i, /perm[ée]abilit[ée]/i],
  },
];

function extractRegulatorySnippet(text: string, index: number): string {
  const lookBehindStart = Math.max(0, index - 700);
  const lookAheadEnd = Math.min(text.length, index + 1000);
  const before = text.slice(lookBehindStart, index);
  const after = text.slice(index, lookAheadEnd);

  const paragraphStartOffset = Math.max(
    before.lastIndexOf("\n\n"),
    before.lastIndexOf(". "),
    before.lastIndexOf(" : ")
  );
  const paragraphEndCandidates = [
    after.indexOf("\n\n"),
    after.indexOf(". "),
    after.indexOf(" ; "),
  ].filter((value) => value >= 0);
  const paragraphEndOffset = paragraphEndCandidates.length > 0 ? Math.min(...paragraphEndCandidates) : -1;

  const start = paragraphStartOffset >= 0 ? lookBehindStart + paragraphStartOffset + 1 : lookBehindStart;
  const end = paragraphEndOffset >= 0 ? index + paragraphEndOffset + 1 : lookAheadEnd;

  return text
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim();
}

function summariseDeterministicSnippet(snippet: string): string {
  if (!snippet) return "";
  const sentenceBreak = snippet.search(/[.;](\s|$)/);
  const raw = sentenceBreak > 0 ? snippet.slice(0, sentenceBreak + 1) : snippet;
  return raw.length > 220 ? `${raw.slice(0, 217).trim()}...` : raw;
}

function extractDimensionFromSnippet(snippet: string, unitPattern: RegExp): string | undefined {
  const match = snippet.match(unitPattern);
  return match ? match[0].replace(/\s+/g, " ").trim() : undefined;
}

function inferRegulatoryTitleFromSnippet(snippet: string): string {
  const headingMatch = snippet.match(/(article\s+\d+[^\n.:;]{0,80}|art\.?\s*\d+[^\n.:;]{0,80})/i);
  if (headingMatch?.[0]) {
    return headingMatch[0].replace(/\s+/g, " ").trim();
  }

  const thematicTitle = (() => {
    const lower = snippet.toLowerCase();
    if (lower.includes("emprise") || lower.includes("ces")) return "Emprise & densité";
    if (lower.includes("hauteur") || lower.includes("gabarit")) return "Hauteur & gabarit";
    if (lower.includes("limite séparative") || lower.includes("limites séparatives") || lower.includes("recul") || lower.includes("prospect") || lower.includes("alignement") || lower.includes("voie")) {
      return "Implantation & reculs";
    }
    if (lower.includes("stationnement") || lower.includes("parking") || lower.includes("accès")) return "Accès & stationnement";
    if (lower.includes("pleine terre") || lower.includes("espace vert") || lower.includes("plantation") || lower.includes("perméabil")) return "Paysage & pleine terre";
    if (lower.includes("destination") || lower.includes("usage") || lower.includes("occupation du sol")) return "Usages & destination";
    if (lower.includes("aspect") || lower.includes("façade") || lower.includes("toiture") || lower.includes("matériau")) return "Aspect architectural";
    if (lower.includes("servitude") || lower.includes("risque") || lower.includes("argile")) return "Contraintes & servitudes";
    return null;
  })();

  if (thematicTitle) return thematicTitle;

  const compact = snippet.replace(/\s+/g, " ").trim();
  const firstSentence = compact.split(/[.;:]/)[0]?.trim() || compact;
  return firstSentence.length > 72 ? `${firstSentence.slice(0, 69).trim()}...` : firstSentence;
}

function isMeaningfulRegulatoryBlock(block: string): boolean {
  const compact = block.replace(/\s+/g, " ").trim();
  if (compact.length < 90) return false;
  if (/^\[base ia/i.test(compact)) return false;

  const lower = compact.toLowerCase();
  const keywords = [
    "article",
    "construction",
    "implantation",
    "recul",
    "limite séparative",
    "limites séparatives",
    "alignement",
    "voie",
    "emprise",
    "ces",
    "hauteur",
    "stationnement",
    "parking",
    "destination",
    "usage",
    "espace vert",
    "pleine terre",
    "plantation",
    "façade",
    "toiture",
    "aspect",
    "matériau",
    "clôture",
    "servitude",
    "argile",
    "risque",
    "pente",
    "réseau",
    "assainissement",
  ];

  return keywords.some((keyword) => lower.includes(keyword)) || /\d/.test(compact);
}

export function extractComprehensiveRegulatoryRules(text: string, zoneCode?: string): ArticleAnalysis[] {
  const repaired = repairExtractedText(text);
  if (repaired.trim().length < 200) return [];

  const blocks = repaired
    .split(/\n\s*\n|---+\s*[A-ZÀ-ÿ0-9 ()-]*---+|===+\s*[A-ZÀ-ÿ0-9 ()-]*===+/g)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const rules: ArticleAnalysis[] = [];

  for (const block of blocks) {
    if (!isMeaningfulRegulatoryBlock(block)) continue;

    const normalized = block.replace(/\s+/g, " ").trim();
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const title = inferRegulatoryTitleFromSnippet(normalized);
    const headingMatch = title.match(/article\s+(\d+)/i);
    const articleNumber = headingMatch?.[1] ? parseInt(headingMatch[1], 10) : rules.length + 1;
    const summary = summariseDeterministicSnippet(normalized);
    const confidence: ArticleAnalysis["confidence"] = /\d/.test(normalized) || /article\s+\d+/i.test(normalized)
      ? "medium"
      : "low";

    rules.push({
      articleNumber,
      title,
      sourceText: normalized,
      interpretation: summary,
      summary,
      impactText: zoneCode ? `Extrait identifié dans la matière réglementaire de la zone ${zoneCode}.` : "Extrait identifié dans la matière réglementaire indexée.",
      vigilanceText: "Extrait automatique à vérifier contre le règlement écrit intégral si le PDF est ancien ou mal structuré.",
      confidence,
      structuredData: {
        source: "comprehensive_text_fallback",
        zoneCode: zoneCode || null,
      },
    });
  }

  return rules;
}

export function extractDeterministicRegulatoryRules(text: string, zoneCode?: string): ArticleAnalysis[] {
  const normalizedText = repairExtractedText(text).replace(/\s+/g, " ").trim();
  if (normalizedText.length < 200) return [];

  const articles = DETERMINISTIC_RULE_SEEDS.map((seed): ArticleAnalysis | null => {
    const match = seed.patterns
      .map((pattern) => pattern.exec(normalizedText))
      .filter((candidate): candidate is RegExpExecArray => !!candidate)
      .sort((a, b) => a.index - b.index)[0];

    if (!match) return null;

    const snippet = extractRegulatorySnippet(normalizedText, match.index);
    if (snippet.length < 90) return null;

    const summary = summariseDeterministicSnippet(snippet);
    const confidence: ArticleAnalysis["confidence"] = /\d/.test(snippet) ? "medium" : "low";

    return {
      articleNumber: seed.articleNumber,
      title: seed.title,
      sourceText: snippet,
      interpretation: summary,
      summary,
      impactText: zoneCode ? `Extrait récupéré automatiquement pour la zone ${zoneCode}.` : "Extrait récupéré automatiquement depuis le texte réglementaire indexé.",
      vigilanceText: "Preuve reconstruite automatiquement à partir du texte indexé ; à confirmer si le document est très ancien ou mal structuré.",
      confidence,
      structuredData: {
        source: "deterministic_text_fallback",
        theme: seed.title,
        zoneCode: zoneCode || null,
      },
    };
  });

  return articles.filter((article): article is ArticleAnalysis => article !== null);
}

export function buildDeterministicZoneDigest(articles: ArticleAnalysis[], zoneCode?: string): ZoneDigest | null {
  if (!Array.isArray(articles) || articles.length === 0) return null;

  const byArticle = new Map<number, ArticleAnalysis>();
  for (const article of articles) {
    if (!byArticle.has(article.articleNumber)) {
      byArticle.set(article.articleNumber, article);
    }
  }

  const findByTheme = (keywords: string[]): ArticleAnalysis | undefined =>
    articles.find((article) => {
      const haystack = `${article.title} ${article.summary} ${article.sourceText}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    });

  const article6 = byArticle.get(6) || findByTheme(["voie", "alignement", "recul"]);
  const article7 = byArticle.get(7) || findByTheme(["limite séparative", "limites séparatives", "prospect"]);
  const article9 = byArticle.get(9) || findByTheme(["emprise", "ces", "coefficient d'emprise"]);
  const article10 = byArticle.get(10) || findByTheme(["hauteur", "gabarit", "faîtage", "faitage"]);
  const article13 = byArticle.get(13) || findByTheme(["pleine terre", "espace vert", "espaces verts", "plantation"]);

  const maxFootprint = article9
    ? extractDimensionFromSnippet(article9.sourceText, /\d+(?:[.,]\d+)?\s*(?:%|m²|m2)/i)
    : undefined;
  const maxHeight = article10
    ? extractDimensionFromSnippet(article10.sourceText, /\d+(?:[.,]\d+)?\s*m\b/i)
    : undefined;
  const roadSetback = article6
    ? extractDimensionFromSnippet(article6.sourceText, /\d+(?:[.,]\d+)?\s*m\b/i)
    : undefined;
  const boundarySetback = article7
    ? extractDimensionFromSnippet(article7.sourceText, /\d+(?:[.,]\d+)?\s*m\b/i)
    : undefined;
  const greenSpace = article13
    ? extractDimensionFromSnippet(article13.sourceText, /\d+(?:[.,]\d+)?\s*(?:%|m²|m2)/i) || article13.summary
    : undefined;

  const restrictions = [article6, article7, article9, article10]
    .filter((article): article is ArticleAnalysis => !!article)
    .map((article) => article.summary)
    .filter(Boolean)
    .slice(0, 4);

  const conditions = [byArticle.get(1) || findByTheme(["destination", "usage", "occupation du sol"]), byArticle.get(12) || findByTheme(["stationnement", "parking"]), article13]
    .filter((article): article is ArticleAnalysis => !!article)
    .map((article) => article.summary)
    .filter(Boolean)
    .slice(0, 4);

  const summary = `Lecture réglementaire partielle reconstituée automatiquement à partir des extraits indexés${zoneCode ? ` pour la zone ${zoneCode}` : ""}.`;

  return {
    dimensions: {
      maxFootprint,
      maxHeight,
      minSetbacks: [roadSetback, boundarySetback].filter(Boolean).join(" / ") || undefined,
      greenSpace,
    },
    restrictions,
    conditions,
    summary,
  };
}

function coerceArticleConfidence(raw: unknown): "high" | "medium" | "low" | "unknown" {
  if (typeof raw === "string") {
    const normalized = raw.toLowerCase();
    if (normalized === "high" || normalized === "medium" || normalized === "low" || normalized === "unknown") {
      return normalized;
    }
  }
  return "unknown";
}

function extractArticleCandidates(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.regulations)) return payload.regulations;
  if (Array.isArray(payload?.data?.regulations)) return payload.data.regulations;
  if (Array.isArray(payload?.content?.regulations)) return payload.content.regulations;
  if (Array.isArray(payload?.articles)) return payload.articles;
  if (Array.isArray(payload?.data?.articles)) return payload.data.articles;
  if (Array.isArray(payload?.data?.rules)) return payload.data.rules;
  if (Array.isArray(payload?.rules)) return payload.rules;
  if (Array.isArray(payload?.content?.rules)) return payload.content.rules;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.content?.articles)) return payload.content.articles;
  if (Array.isArray(payload?.content)) return payload.content;
  return [];
}

export function extractStructuredRuleCandidates(payload: any): any[] {
  return extractArticleCandidates(payload);
}

function coerceZoneArticles(payload: any): ArticleAnalysis[] {
  return extractArticleCandidates(payload).map((raw: any, index: number) => {
    const rawArticle = raw?.articleNumber ?? raw?.article ?? raw?.article_id ?? raw?.reference ?? raw?.title ?? raw?.theme ?? `${index + 1}`;
    const numericArticle = parseInt(String(rawArticle).replace(/[^0-9]/g, ""), 10);
    const articleNumber = Number.isFinite(numericArticle) && numericArticle > 0 ? numericArticle : index + 1;
    const sourceText = String(
      raw?.sourceText
      ?? raw?.source_text
      ?? raw?.texte_source
      ?? raw?.source
      ?? raw?.content
      ?? raw?.regulation
      ?? raw?.rule
      ?? raw?.operational_rule
      ?? ""
    );
    const summary = String(
      raw?.summary
      ?? raw?.description
      ?? raw?.regulation
      ?? raw?.rule
      ?? raw?.operational_rule
      ?? raw?.interpretation
      ?? raw?.analysis
      ?? sourceText
    );
    const interpretation = String(
      raw?.interpretation
      ?? raw?.operational_rule
      ?? raw?.analysis
      ?? summary
    );

    return {
      articleNumber,
      title: String(raw?.title ?? raw?.theme ?? raw?.section ?? `Article ${rawArticle}`),
      sourceText,
      interpretation,
      summary,
      impactText: String(raw?.impactText ?? raw?.impact ?? raw?.analysis ?? ""),
      vigilanceText: String(
        raw?.vigilanceText
        ?? raw?.vigilance
        ?? (Array.isArray(raw?.exceptions) ? raw.exceptions.join("; ") : "")
      ),
      confidence: coerceArticleConfidence(raw?.confidence),
      structuredData: raw && typeof raw === "object" ? raw : undefined,
    };
  });
}

/**
 * Triage Pass: Produces a structured digest of zone-wide constraints.
 */
export async function generateZoneDigest(text: string, zoneCode: string, cityName?: string): Promise<ZoneDigest> {
  const schema = z.object({
    dimensions: z.object({
      maxFootprint: z.string().optional(),
      maxHeight: z.string().optional(),
      minSetbacks: z.string().optional(),
      greenSpace: z.string().optional(),
    }),
    restrictions: z.array(z.string()),
    conditions: z.array(z.string()),
    summary: z.string(),
  });

  const systemPrompt = `Tu es l'Expert-Urbaniste HEUREKA. Analyse le règlement de la ZONE ${zoneCode} pour ${cityName || "la commune"} et produis un DIGEST STRUCTURE (Dimensions, Restrictions, Conditions) au format JSON.
  Focus: Emprise, Hauteur, Recul, Espaces Verts.
  Reste concis et factuel.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Texte de la zone ${zoneCode}:\n\n${text.substring(0, 50000)}\n\nIMPORTANT: Réponds uniquement avec un objet JSON.` }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const valid = schema.safeParse(result);
    return valid.success ? valid.data : { dimensions: {}, restrictions: [], conditions: [], summary: "Digest partiel disponible" };
  } catch (err) {
    console.error("[generateZoneDigest] Error:", err);
    return { dimensions: {}, restrictions: [], conditions: [], summary: "Digest indisponible" };
  }
}

/**
 * Relevance Engine: Ranks rules based on project specifics.
 */
export function rankRulesByRelevance(articles: ArticleAnalysis[], projectDescription: string, parcelData?: any): (ArticleAnalysis & { relevanceScore: number; relevanceReason: string })[] {
  const desc = (projectDescription || "").toLowerCase();
  
  return articles.map(art => {
    let score = 50; // Base score
    let reason = "Règle standard de la zone.";
    
    const title = (art.title || "").toLowerCase();
    const summary = (art.summary || "").toLowerCase();
    
    // Keyword Matching (Heuristic Boost)
    if (desc.includes("piscine") && (title.includes("piscine") || summary.includes("piscine") || title.includes("bassin"))) {
      score += 40;
      reason = "Directement lié à votre projet de piscine.";
    } else if (desc.includes("clôture") && (title.includes("clôture") || title.includes("cloture") || title.includes("mur") || title.includes("portail"))) {
      score += 40;
      reason = "Réglemente vos fermetures et limites de propriété.";
    } else if (desc.includes("abri") && (title.includes("annexe") || title.includes("abri") || title.includes("garage") || title.includes("carport"))) {
      score += 40;
      reason = "Définit les règles pour les constructions annexes.";
    } else if (desc.includes("extension") && (title.includes("emprise") || title.includes("hauteur") || title.includes("aspect") || title.includes("article 9") || title.includes("article 10"))) {
      score += 40;
      reason = "Règles critiques pour le gabarit de votre extension.";
    }

    if (art.vigilanceText && art.vigilanceText.length > 5) {
      score += 10;
    }

    return { ...art, relevanceScore: Math.min(score, 100), relevanceReason: reason };
  }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}

export async function analyzePLUZone(
  rawText: string, 
  zoneCode: string, 
  zoneLabel: string, 
  cityName?: string, 
  customPrompt?: string, 
  projectDescription?: string, 
  parcelData?: any,
  jurisdictionContext?: JurisdictionContext
): Promise<ZoneAnalysisResult & { digest?: ZoneDigest | null }> {
  const hasIndexedRegulatorySource = rawText.replace(/\s+/g, " ").trim().length >= 250;
  const articleSchema = z.object({
    articleNumber: z.coerce.number(),
    title: z.string(),
    sourceText: z.string(),
    interpretation: z.string(),
    summary: z.string(),
    impactText: z.string(),
    vigilanceText: z.string(),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
  });

  const resultSchema = z.object({
    zoneCode: z.string(),
    zoneLabel: z.string(),
    articles: z.array(articleSchema),
    issues: z.array(z.object({
      article: z.string(),
      msg: z.string(),
      severity: z.enum(["bloquante", "majeure", "mineure"]),
    })).optional(),
    calculationVariables: z.object({
      maxFootprintRatio: z.number().nullable().optional().default(null),
      maxHeightM: z.number().nullable().optional().default(null),
      minSetbackFromRoadM: z.number().nullable().optional().default(null),
      minSetbackFromBoundariesM: z.number().nullable().optional().default(null),
      parkingRules: z.string().nullable().optional().default(null),
      greenSpaceRatio: z.number().nullable().optional().default(null),
    }).optional().default({}),
    globalConstraints: z.array(z.string()),
  });

  try {
    const { baseZone, hasSubZone } = deriveZoneHierarchy(zoneCode);
    let relevantText = extractRelevantPLUSections(rawText, zoneCode);

    // Fallback: if rawText is absent or too short (<300 chars), query Base IA embeddings directly
    if (relevantText.length < 300 && cityName) {
      try {
        const fallbackQuery = hasSubZone
          ? `Zone ${baseZone} avec précisions ${zoneCode} règlement emprise hauteur recul stationnement implantation`
          : `Zone ${zoneCode} règlement emprise hauteur recul stationnement implantation`;
        let fallbackChunks = await queryChunksWithMunicipalityAliases(fallbackQuery, {
          cityName,
          zoneCode,
          jurisdictionContext,
          docTypes: ["plu_reglement", "plu_annexe"],
          minAuthority: 7,
          strictZone: true,
          limit: 20,
        });
        if (fallbackChunks.length === 0) {
          fallbackChunks = await queryChunksWithMunicipalityAliases(fallbackQuery, {
            cityName,
            zoneCode,
            jurisdictionContext,
            docTypes: ["plu_reglement", "plu_annexe"],
            minAuthority: 7,
            limit: 20,
          });
        }
        if (fallbackChunks.length === 0) {
          fallbackChunks = await queryRelevantChunks(fallbackQuery, {
            municipalityId: GLOBAL_POOL_ID,
            docTypes: ["plu_reglement", "plu_annexe"],
            minAuthority: 7,
            limit: 10,
          });
        }
        if (fallbackChunks.length > 0) {
          const embText = fallbackChunks.map(c => c.content).join("\n\n---\n\n");
          relevantText = relevantText.length > 0 ? `${relevantText}\n\n---\n\n${embText}` : embText;
          console.log(`[pluAnalysis/analyzePLUZone] ✅ ${fallbackChunks.length} Base IA chunks used for ${cityName} zone ${zoneCode}`);
        } else {
          console.warn(`[pluAnalysis/analyzePLUZone] No PLU content found for ${cityName} zone ${zoneCode} — skipping AI call`);
          const availability = buildPluAvailabilityIssue({ zoneCode, cityName, hasIndexedRegulatorySource });
          return {
            zoneCode,
            zoneLabel: availability.zoneLabel,
            articles: [],
            digest: null,
            calculationVariables: { maxFootprintRatio: null, maxHeightM: null, minSetbackFromRoadM: null, minSetbackFromBoundariesM: null, parkingRules: null, greenSpaceRatio: null },
            globalConstraints: [],
            issues: [availability.issue],
          };
        }
      } catch (embErr) {
        console.warn("[pluAnalysis/analyzePLUZone] Embedding fallback failed:", embErr);
      }
    }

    // Guard: if still no meaningful text after all fallbacks, skip AI entirely
    if (relevantText.trim().length < 200) {
      console.warn(`[pluAnalysis/analyzePLUZone] relevantText too short (${relevantText.length} chars) after all fallbacks — no AI call`);
      const availability = buildPluAvailabilityIssue({ zoneCode, cityName, hasIndexedRegulatorySource });
      return {
        zoneCode,
        zoneLabel: availability.zoneLabel,
        articles: [],
        digest: null,
        calculationVariables: { maxFootprintRatio: null, maxHeightM: null, minSetbackFromRoadM: null, minSetbackFromBoundariesM: null, parkingRules: null, greenSpaceRatio: null },
        globalConstraints: [],
        issues: [availability.issue],
      };
    }

    // 1. New Triage Pass: Generate Digest
    console.log(`[pluAnalysis] Generating Structured Digest for ${zoneCode}...`);
    const digest = await generateZoneDigest(relevantText, zoneCode, cityName);

    let systemContent = SYSTEM_PROMPTS.PLU_RULE_EXTRACTOR;
    if (customPrompt) {
      systemContent += `\n\n--- RÈGLES SPÉCIALES MAIRIE ---\nLa mairie de ${cityName || "la commune"} a défini ces instructions supplémentaires prioritaires :\n${customPrompt}`;
    }
    systemContent += `\n\nIMPORTANT: Ta réponse doit être uniquement au format JSON valide.`;

    const zoneScopingInstruction = hasSubZone
      ? `La parcelle est en sous-zone ${zoneCode}. Lis d'abord les règles générales de la zone mère ${baseZone}, puis ajoute toutes les précisions spécifiques ${zoneCode}. Si une précision ${zoneCode} existe, elle prime sur la règle générale ${baseZone}.`
      : `La parcelle est en zone ${zoneCode}. Extrais exhaustivement uniquement les règles applicables à la zone ${zoneCode}. Ignore les règles propres à d'autres sous-zones comme ${zoneCode}a, ${zoneCode}b, ${zoneCode}h, ${zoneCode}j, etc., sauf si le règlement dit explicitement qu'elles s'appliquent à toute la zone ${zoneCode}.`;

    console.log(`[pluAnalysis] Calling OpenAI for zone extraction: ${zoneCode} in ${cityName}...`);
    const truncatedText = (relevantText || "").substring(0, 40000);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 12288,
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `${zoneScopingInstruction}\n\nIMPORTANT: Si le texte contient des sous-secteurs ou sous-zones distinctes, n'extrais pas leurs règles sauf si la parcelle est explicitement dans cette sous-zone cible.\n\nTexte du règlement (Extrait):\n\n${truncatedText}\n\nIMPORTANT: Réponds uniquement avec un objet JSON contenant la clé "articles" (tableau).`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      seed: 123
    });

    const parsedString = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(parsedString);

    // 2. Relevance Scoring & Ranking
    let rawArticles = coerceZoneArticles(parsed);
    const hasSubstantiveArticles = rawArticles.some((article) =>
      article.sourceText.trim().length >= 40 || article.summary.trim().length >= 40
    );

    if (!hasSubstantiveArticles) {
      const fallbackRulesJson = await extractRelevantRules(relevantText, {
        zoneCode,
        cityName,
        docTypes: ["plu_reglement", "plu_annexe"],
        jurisdictionContext,
      });

      try {
        const fallbackParsed = JSON.parse(fallbackRulesJson);
        const fallbackArticles = coerceZoneArticles(fallbackParsed);
        if (fallbackArticles.some((article) => article.sourceText.trim().length >= 40 || article.summary.trim().length >= 40)) {
          rawArticles = fallbackArticles;
        }
      } catch {
        // Keep primary extraction output if fallback payload is not valid JSON.
      }
    }

    if (!rawArticles.some((article) => article.sourceText.trim().length >= 40 || article.summary.trim().length >= 40)) {
      const comprehensiveArticles = extractComprehensiveRegulatoryRules(relevantText, zoneCode);
      if (comprehensiveArticles.length > 0) {
        rawArticles = comprehensiveArticles;
      }
    }

    if (!rawArticles.some((article) => article.sourceText.trim().length >= 40 || article.summary.trim().length >= 40)) {
      const deterministicArticles = extractDeterministicRegulatoryRules(relevantText, zoneCode);
      if (deterministicArticles.length > 0) {
        rawArticles = deterministicArticles;
      }
    }

    const rankedArticles = rankRulesByRelevance(rawArticles, projectDescription || "", parcelData);
    const effectiveDigest = digest || buildDeterministicZoneDigest(rankedArticles, zoneCode);

    const result: any = {
      zoneCode: String(parsed.zoneCode || zoneCode),
      zoneLabel: String(parsed.zoneLabel || zoneLabel),
      articles: rankedArticles,
      digest: effectiveDigest,
      issues: Array.isArray(parsed.issues) ? parsed.issues : Array.isArray(parsed?.data?.issues) ? parsed.data.issues : [],
      calculationVariables: parsed.calculationVariables || parsed?.data?.calculationVariables || {
        maxFootprintRatio: null, maxHeightM: null, minSetbackFromRoadM: null,
        minSetbackFromBoundariesM: null, parkingRules: null, greenSpaceRatio: null 
      },
      globalConstraints: Array.isArray(parsed.globalConstraints) ? parsed.globalConstraints : Array.isArray(parsed?.data?.globalConstraints) ? parsed.data.globalConstraints : [],
    };

    return result;
  } catch (err) {
    console.error("[pluAnalysis] IA Extraction Failed:", err);
    return {
      zoneCode,
      zoneLabel,
      articles: [],
      calculationVariables: {
        maxFootprintRatio: null, maxHeightM: null, minSetbackFromRoadM: null,
        minSetbackFromBoundariesM: null, parkingRules: null, greenSpaceRatio: null,
      },
      globalConstraints: [],
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Document Review Analysis
// ────────────────────────────────────────────────────────────────────────────

/**
 * Classifies a document using SYSTEM_PROMPTS.CLASSIFIER.
 * Returns the detected class (e.g. "PCMI2", "cerfa_form", "plu_reglement", "other").
 */
export async function classifyDocument(text: string): Promise<{ document_class: string; sub_type?: string; is_ambiguous: boolean }> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.CLASSIFIER },
        { role: "user", content: text.substring(0, 4000) }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return {
      document_class: result.document_class || "other",
      sub_type: result.sub_type,
      is_ambiguous: result.is_ambiguous ?? true,
    };
  } catch (err) {
    logger.error("[classifyDocument] Error:", err);
    return { document_class: "other", is_ambiguous: true };
  }
}

/**
 * Multi-source Document Extraction.
 * Cross-references current document with dossier context and regulatory KB.
 */
export async function extractDocumentData(
  text: string,
  documentType: string,
  _piecePromptKey: string = "document_extract",
  context: {
    dossierDocs?: any[];
    regulatoryRules?: any[];
    commune?: string;
    zoneCode?: string;
  } = {}
): Promise<EngineResponse<ExtractedDocumentData>> {
  const { dossierDocs = [], regulatoryRules = [], commune = "", zoneCode = "" } = context;
  const systemPrompt = await loadRegulatorySinglePipePrompt();
  const userContent = buildRegulatorySinglePipeContext("extract_document_data", {
    document_type: documentType,
    context_scope: {
      commune: commune || null,
      zone_code: zoneCode || null,
    },
    document_text: truncateSinglePipeField(text, REGULATORY_SINGLE_PIPE_DOCUMENT_MAX_CHARS),
    dossier_context: dossierDocs,
    regulatory_context: regulatoryRules,
    expected_output: {
      format: "json_object",
      primary_contract: "ExtractedDocumentData",
      required_behavior: [
        "do_not_invent_articles",
        "do_not_promote_thematic_blocks_to_canonical_articles",
        "do_not_use_snippets_as_canonical_sources",
        "keep_cross_document_references_explicit",
      ],
    },
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    }, {
      timeout: REGULATORY_SINGLE_PIPE_TIMEOUT_MS,
    });

    const resultText = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(resultText);
    
    // Normalize data if it's wrapped in a 'data' field
    const extractedData = result.data || result;

    // Run additional client-side consistency checks
    const { checkCrossDocumentConsistency } = await import("./consistencyEngine.js");
    const consistencyIssues = checkCrossDocumentConsistency(extractedData, dossierDocs);
    
    if (consistencyIssues.length > 0) {
      extractedData.cross_document_issues = [
        ...(extractedData.cross_document_issues || []),
        ...consistencyIssues.map(i => ({ target: i.doc2, issue: i.message, severity: i.severity }))
      ];
      if (extractedData.status === "ok") extractedData.status = "warning";
    }

    return {
      status: "ok",
      data: extractedData,
      metrics: {
        total_tokens: response.usage?.total_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        prompt_tokens: response.usage?.prompt_tokens || 0
      }
    };
  } catch (err) {
    logger.error("[extractDocumentData] single pipe failed", err, {
      documentType,
      commune,
      zoneCode,
      textLength: text.length,
    });
    return {
      status: "warning",
      data: {
        document_code: documentType || "unknown",
        status: "warning",
        confidence_score: 0,
        extracted_data: {},
        regulatory_checks: [],
        cross_document_issues: [],
        missing_information: ["Extraction IA indisponible ou expirée."],
        recommendations: ["Relancer l'analyse ou réduire le périmètre documentaire si le contexte est très volumineux."],
        analysis: {
          compliance: "uncertain",
          summary: "Le pipe unique n'a pas pu répondre à temps. Les données du document restent non stabilisées.",
        },
        document_type: documentType || "unknown",
        document_nature: "indéterminé",
        expertise_notes: err instanceof Error ? err.message : "Erreur inconnue pendant l'extraction réglementaire.",
        raw_mentions: [],
      },
      warnings: [err instanceof Error ? err.message : "Erreur inconnue pendant l'extraction réglementaire."],
      missing_elements: ["Extraction structurée indisponible"],
    };
  }
}


/**
 * Trouve des segments de texte (fenêtres) autour des mots-clés et de la zone cible.
 * Permet de scanner des documents de plusieurs millions de caractères en restant "quota-safe".
 */
function findRelevantWindows(text: string, zoneCode: string, topics: string[] = []): string[] {
  const windows: { start: number, end: number }[] = [];
  const addWindowRange = (centerIndex: number, size: number) => {
    const start = Math.max(0, centerIndex - size / 2);
    const end = Math.min(text.length, centerIndex + size / 2);
    windows.push({ start, end });
  };

  const baseKeywords = ["L'EMPRISE AU SOL", "HAUTEUR DES CONSTRUCTIONS", "STATIONNEMENT", "ESPACES VERTS", "PLEINE TERRE"];
  const allKeywords = [...new Set([...baseKeywords, ...topics])];
  const baseZone = zoneCode.match(/^([A-Z]+)/i)?.[1] || zoneCode;
  
  const patterns = [
    `ZONE\\s+${baseZone}\\b`,
    `SECTION\\s+${baseZone}\\b`, // Some use Section
    `Art\\.?\\s+${baseZone}\\b`
  ];
  
  // 1. SCAN FOR ZONE (All occurrences)
  for (const pattern of patterns) {
    const zoneRegex = new RegExp(pattern, "gi");
    let match;
    while ((match = zoneRegex.exec(text)) !== null) {
      addWindowRange(match.index, 100000); // 100k char window
      if (windows.length > 3) break; 
    }
  }

  // 2. SCAN FOR KEYWORDS (First 3 occurrences of each)
  for (const kw of allKeywords) {
    const kwRegex = new RegExp(kw, "gi");
    let count = 0;
    let kwMatch;
    while ((kwMatch = kwRegex.exec(text)) !== null && count < 3) {
      addWindowRange(kwMatch.index, 30000); // 30k char window
      count++;
    }
  }

  // Fallback
  if (windows.length === 0) {
    return [text.substring(0, 100000)];
  }

  // Sort and Merge overlapping windows
  windows.sort((a, b) => a.start - b.start);
  const merged: { start: number, end: number }[] = [];
  if (windows.length > 0) {
    let current = windows[0];
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].start < current.end) {
        current.end = Math.max(current.end, windows[i].end);
      } else {
        merged.push(current);
        current = windows[i];
      }
    }
    merged.push(current);
  }

  return merged.map(w => text.substring(w.start, w.end));
}

/**
 * Filtre intelligemment le texte brut d'un PLU pour n'en extraire que ce qui est pertinent
 * pour une zone donnée et pour un projet de construction. 
 * Supporte les documents de 1800+ pages via un scan par fenêtrage, OU via RAG Vectoriel si configuré.
 */
export async function extractRelevantRules(
  rawText: string, 
  context: { 
    zoneCode: string; 
    cityName?: string; 
    topics?: string[]; 
    docTypes?: string[];
    jurisdictionContext?: JurisdictionContext;
  }
): Promise<string> {
  const { zoneCode, cityName, topics = [], docTypes = [] } = context;
  const regulatoryDocTypes = docTypes.length > 0 ? docTypes : ["plu_reglement", "plu_annexe"];
  const zoneAliases = buildZoneCodeAliases(zoneCode);
  
  let combinedText = "";
  const { jurisdictionContext } = context;

  // Primary: Base IA semantic search — always run for any identified commune
  // This is the canonical PLU knowledge source; rawText is supplementary
  if (cityName) {
    try {
      const municipalityAliases = uniqueMunicipalityAliases(cityName, jurisdictionContext);
      const zoneSearchKeywords = await loadZoneSearchKeywords({ municipalityAliases, zoneCode });
      const queryStr = [
        `Règles d'urbanisme zone ${zoneCode}`,
        topics.length > 0 ? `Thématiques: ${topics.join(", ")}` : null,
        zoneSearchKeywords.length > 0 ? `Mots-clés ciblés: ${zoneSearchKeywords.join(", ")}` : null,
      ].filter(Boolean).join(". ");
      console.log(`[pluAnalysis] Base IA semantic search: "${queryStr}" (${cityName})`);

      let chunks = await collectPrioritizedRegulatoryChunks(queryStr, {
        cityName,
        zoneCode,
        jurisdictionContext,
        limit: 25,
      });

      if (chunks.length > 0 && chunks.length < 5) {
        const broaderChunks: any[] = [];
        const seenBroader = new Set<string>();
        for (const zoneAlias of zoneAliases.length > 0 ? zoneAliases : [zoneCode]) {
          const aliasChunks = await queryChunksWithMunicipalityAliases(queryStr, {
            cityName,
            zoneCode: zoneAlias,
            docTypes: regulatoryDocTypes,
            limit: 25,
            jurisdictionContext,
          });
          for (const chunk of aliasChunks) {
            if (seenBroader.has(chunk.id)) continue;
            seenBroader.add(chunk.id);
            broaderChunks.push(chunk);
          }
        }
        const seen = new Set(chunks.map((chunk) => chunk.id));
        for (const chunk of broaderChunks) {
          if (seen.has(chunk.id)) continue;
          seen.add(chunk.id);
          chunks.push(chunk);
          if (chunks.length >= 12) break;
        }
      }

      // Fallback: GLOBAL_POOL_ID if the commune isn't yet indexed in Base IA
      if (chunks.length === 0) {
        console.warn(`[pluAnalysis] No Base IA chunks for ${cityName} zone ${zoneCode} — retrying with global pool`);
        chunks = await queryRelevantChunks(queryStr, {
          municipalityId: GLOBAL_POOL_ID,
          docTypes: regulatoryDocTypes,
          minAuthority: 7,
          limit: 15,
          jurisdictionContext,
        });
      }

      if (chunks.length === 0) {
        console.warn(`[pluAnalysis] Strict regulatory retrieval returned no chunks for ${cityName} zone ${zoneCode} — falling back to legacy metadata.`);
        const legacyChunks: any[] = [];
        const seenLegacy = new Set<string>();
        for (const zoneAlias of zoneAliases.length > 0 ? zoneAliases : [zoneCode]) {
          const aliasChunks = await queryChunksWithMunicipalityAliases(queryStr, {
            cityName,
            zoneCode: zoneAlias,
            limit: 15,
            jurisdictionContext,
          });
          for (const chunk of aliasChunks) {
            if (seenLegacy.has(chunk.id)) continue;
            seenLegacy.add(chunk.id);
            legacyChunks.push(chunk);
          }
        }
        chunks = legacyChunks;
      }

      if (chunks.length > 0) {
        const writtenChunks = chunks.filter((chunk) => chunk.metadata?.document_type === "plu_reglement");
        const annexChunks = chunks.filter((chunk) => chunk.metadata?.document_type === "plu_annexe");
        const orderedChunks = [...writtenChunks, ...annexChunks, ...chunks.filter((chunk) => {
          const docType = chunk.metadata?.document_type;
          return docType !== "plu_reglement" && docType !== "plu_annexe";
        })];

        combinedText = orderedChunks
          .map(c => {
            const prefix = c.metadata?.document_type === "plu_reglement"
              ? "Base IA — Règlement écrit"
              : c.metadata?.document_type === "plu_annexe"
                ? "Base IA — Annexe opposable"
                : "Base IA";
            return `[${prefix} — Score: ${typeof c.similarity === "number" ? c.similarity.toFixed(2) : c.similarity}]\n${c.content}`;
          })
          .join("\n\n---\n\n");
        console.log(`[pluAnalysis] ✅ ${chunks.length} Base IA chunks retrieved for ${cityName} zone ${zoneCode}`);
      } else {
        console.warn(`[pluAnalysis] ⚠️  Base IA has no indexed content for ${cityName} zone ${zoneCode}`);
      }
    } catch (err) {
      console.error("[pluAnalysis] Base IA search failed — will fall back to raw document text:", err);
    }
  }

  // Supplement / fallback: regex windowing on full raw document text
  if (rawText.length > 0) {
    const relevantWindows = findRelevantWindows(repairExtractedText(rawText), zoneCode, topics);
    const windowText = relevantWindows.join("\n\n--- NOUVEAU SEGMENT ---\n\n");
    if (!combinedText) {
      // No embedding results — use raw text only
      combinedText = windowText;
    } else if (windowText.length > 0) {
      // Enrich embedding results with raw sections (first 3 windows to avoid token bloat)
      combinedText += "\n\n--- DOCUMENTS BRUTS ---\n\n" + relevantWindows.slice(0, 3).join("\n\n---\n\n");
    }
  }

  if (combinedText.trim().length < 200) {
    console.warn(`[pluAnalysis] No meaningful PLU source text for ${cityName || "commune inconnue"} zone ${zoneCode} — returning empty ruleset.`);
    return "[]";
  }

  const systemContent = `Tu es l'Expert-Documentaliste en Urbanisme. Ton rôle est de LIRE des extraits d'un règlement PLU complet (potentiellement issu de recherche sémantique) et d'en EXTRAIRE les règles applicables d'articles de la zone **${zoneCode}**${cityName ? ` pour la commune de **${cityName}**` : ""}.
  
CONSIGNES DE FILTRAGE :
1. EXTRACTION FLEXIBLE : Certains PLU n'utilisent pas le mot "Article". Extrais toute règle pertinente, qu'elle soit sous forme d'Articles, de Sections (I, II, III), de Paragraphes (1, 2, 3), ou de sous-catégories (1.1, 1.2).
2. EXTRACTION EXHAUSTIVE : Liste tous les points de règlement pour la zone ${zoneCode}. Ne te limite pas seulement à Stationnement ou Espaces Verts s'il y a d'autres contraintes importantes.
3. CONSERVATION DU TEXTE LÉGAL : Garde les valeurs chiffrées (mètres, carres, %) exactement telles qu'elles sont écrites. NE PARAPHRASE PAS les seuils.
4. MAPPING : Si une règle est dans une section comme "I. Destination", mappe-là à un numéro d'article logique (ex: 1 pour I, 2 pour II) ou utilise le titre de la section. Le format final JSON doit être une liste d'objets.
5. ÉLIMINATION : Ignore totalmente todo lo que concierne a otras zonas o comunas.`;

  const input = {
    task: "extract",
    context: { zone: zoneCode, commune: cityName },
    text: repairExtractedText(combinedText).substring(0, 400000), // Stay under TPM
  };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: `Texte du règlement (Extrait):\n\n${JSON.stringify(input)}\n\nIMPORTANT: Réponds uniquement avec un objet JSON.` }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      seed: 123
    });

    const resultText = response.choices[0]?.message?.content;
    const result = resultText ? JSON.parse(resultText) : null;
    
    // Debug Log
    const rawData = result?.data || result?.content || result?.articles || resultText || "[]";
    console.log(`[pluAnalysis] [${cityName}] Extraction Result (first 500 chars): ${JSON.stringify(rawData).substring(0, 500)}...`);

    const finalData =
      result?.data?.articles
      || result?.data?.rules
      || result?.articles
      || result?.rules
      || result?.content?.articles
      || result?.content?.rules
      || result?.content
      || result?.data
      || resultText
      || "Aucune règle extraite.";
    return typeof finalData === "string" ? finalData : JSON.stringify(finalData);
  } catch (err) {
    console.error("[extractRelevantRules] IA Error:", err);
    return combinedText.substring(0, 50000); // Fallback
  }
}


export interface ComparisonPoint {
  category: string;
  article?: string;
  document_value: string;
  plu_rule: string;
  texte_source?: string;
  interpretation?: string;
  status: "conforme" | "non_conforme" | "incertain" | "information";
  analysis: string;
  severity: "ok" | "warning" | "critical" | "info";
  citation?: string;
}

export interface ComparisonResult {
  summary: string;
  global_status: "conforme" | "non_conforme" | "partiellement_conforme" | "indéterminé";
  conformities: ComparisonPoint[];
  inconsistencies: ComparisonPoint[];
  points_attention: ComparisonPoint[];
  recommendations: string[];
}

export async function compareWithPLU(
  extractedData: ExtractedDocumentData,
  pluContext: {
    zoneCode: string;
    zoneLabel: string;
    articles: any[];
    buildability: any;
    parcel: any;
    geoContext: any;
    townHallDocumentsText?: string;
    townHallCustomPrompt?: string;
    cityName?: string;
    territorialContext?: string[];
    jurisdictionContext?: JurisdictionContext;
    includeTrace?: boolean;
  }
): Promise<EngineResponse<ComparisonResult>> {
  const { zoneCode, zoneLabel, articles, buildability, parcel, geoContext, townHallDocumentsText, townHallCustomPrompt, cityName, territorialContext, jurisdictionContext, includeTrace } = pluContext;

  // PERSISTENT DEBUG LOGGING
  try {
    const logData = {
      timestamp: new Date().toISOString(),
      type: "compareWithPLU",
      zoneCode,
      cityName,
      articlesCount: articles?.length || 0,
      hasTownHallDocs: !!townHallDocumentsText,
      townHallDocsLength: townHallDocumentsText?.length || 0
    };
    fs.writeFileSync("/tmp/plu_compare_last_run.log", JSON.stringify(logData, null, 2));
  } catch (e) {}

  const plu = geoContext?.plu ?? {};
  const systemPrompt = await loadRegulatorySinglePipePrompt();
  const input = buildRegulatorySinglePipeContext("compare_with_plu", {
    project_document: extractedData,
    regulatory_context: {
      zone_code: zoneCode,
      zone_label: zoneLabel,
      city_name: cityName || null,
      buildability,
      parcel,
      geo_context: geoContext,
      articles: Array.isArray(articles) ? articles : [],
      synthetic_rules: {
        ces_max: plu.rules?.CES_max ?? null,
        height_max_m: plu.rules?.height_max_m ?? buildability?.maxHeightM ?? null,
        setback_road_m: plu.rules?.setback_road_m ?? buildability?.setbackRoadM ?? null,
        setback_side_min_m: plu.rules?.setback_side_min_m ?? buildability?.setbackBoundaryM ?? null,
        parking_requirements: plu.rules?.parking_requirements ?? buildability?.parkingRequirement ?? null,
        remaining_footprint_m2: buildability?.remainingFootprintM2 ?? null,
      },
      regulatory_corpus: truncateSinglePipeField(townHallDocumentsText || "", REGULATORY_SINGLE_PIPE_CORPUS_MAX_CHARS),
      commune_custom_instructions: townHallCustomPrompt || null,
      territorial_context: territorialContext || [],
      jurisdiction_context: jurisdictionContext || null,
      include_trace: !!includeTrace,
    },
    expected_output: {
      format: "json_object",
      primary_contract: "ComparisonResult",
      comparison_status_values: ["compliant", "non_compliant", "uncertain", "not_enough_data"],
      required_behavior: [
        "do_not_reinject_snippets_as_canonical_sources",
        "compare_only_when_project_and_rule_are_both_demonstrated",
        "surface_missing_or_cross_document_dependency_as_uncertain",
      ],
    },
  });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input }
      ],
      response_format: { type: "json_object" },
    }, {
      timeout: REGULATORY_SINGLE_PIPE_TIMEOUT_MS,
    });

    const resultText = response.choices[0]?.message?.content;

    // UPDATE PERSISTENT DEBUG LOGGING
    try {
      const current = JSON.parse(fs.readFileSync("/tmp/plu_compare_last_run.log", "utf-8"));
      current.rawAIResponseSnippet = resultText?.substring(0, 500);
      fs.writeFileSync("/tmp/plu_compare_last_run.log", JSON.stringify(current, null, 2));
    } catch (e) {
      // Ignore logging errors
    }

    if (!resultText) throw new Error("Réponse vide de l'IA lors de l'analyse.");
    
    let result = JSON.parse(resultText) as EngineResponse<ComparisonResult>;
    
    // Ensure we return the standardized EngineResponse format
    if (result.status && result.data) {
      return result;
    }

    // Fallback if AI returned raw data
    return {
      status: "ok",
      data: result as any,
      missing_elements: [],
      warnings: [],
      analysis: { compliance: (result as any).global_status || "uncertain", issues: [], risks: [], opportunities: [] }
    };
  } catch (err) {
    logger.error("[compareWithPLU] single pipe failed", err, {
      zoneCode,
      cityName,
      articlesCount: Array.isArray(articles) ? articles.length : 0,
      hasRegulatoryCorpus: !!townHallDocumentsText,
    });
    return {
      status: "error",
      data: { summary: "Erreur", global_status: "indéterminé", conformities: [], inconsistencies: [], points_attention: [], recommendations: [] },
      missing_elements: ["Toute l'analyse a échoué"],
      warnings: [err instanceof Error ? err.message : "Erreur inconnue"],
      analysis: { compliance: "uncertain", issues: [], risks: [], opportunities: [] }
    };
  }
}

export async function generateGlobalSynthesis(
  documents: { title: string; type: string; extractedData: ExtractedDocumentData; analysis: any }[],
  pluContext: {
    zoneCode: string;
    zoneLabel: string;
    cityName?: string;
    townHallCustomPrompt?: string;
    pieceChecklist?: any;
  }
): Promise<EngineResponse<any>> {
  const { zoneCode, zoneLabel, cityName, townHallCustomPrompt, pieceChecklist } = pluContext;

  const docsSummary = documents.map(d => 
    `### DOCUMENT: ${d.title} (${d.type})
    DATA: ${JSON.stringify(d.extractedData, null, 2)}
    ANALYSIS_COMPLIANCE: ${d.analysis?.analysis?.compliance || "N/D"}`
  ).join("\n\n---\n\n");

  const systemPrompt = await loadPrompt("engine_modular_system");
  
  const input = {
    task: "validate",
    document_type: "permit",
    content: docsSummary,
    context: {
      zoneCode,
      zoneLabel,
      cityName,
      customInstructions: townHallCustomPrompt,
      pieceChecklist: pluContext.pieceChecklist
    }
  };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(input) }
      ],
      response_format: { type: "json_object" },
    });

    const resultText = response.choices[0]?.message?.content;
    if (!resultText) throw new Error("Réponse vide de l'IA lors de la validation.");

    return JSON.parse(resultText) as EngineResponse<any>;
  } catch (err) {
    console.error("[generateGlobalSynthesis] Modular Engine Error:", err);
    return {
      status: "error",
      data: {},
      missing_elements: [],
      warnings: [err instanceof Error ? err.message : "Erreur inconnue"],
      analysis: { compliance: "uncertain", issues: [], risks: [], opportunities: [] }
    };
  }
}
