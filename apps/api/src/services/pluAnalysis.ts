import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { zodResponseFormat } from "openai/helpers/zod";
import { loadPrompt } from "./promptLoader.js";
import { SYSTEM_PROMPTS, CerfaExtractionSchema, EvidenceBundle, EvidenceChunk, JurisdictionContext, GLOBAL_POOL_ID } from "@workspace/ai-core";
import { queryRelevantChunks } from "./embeddingService.js";
import { logger } from "../utils/logger.js";
import fs from "fs";

/**
 * Estimation rapide du nombre de tokens (1 token ~ 4 caractères pour du français/anglais).
 * On vise une limite de sécurité de 25k tokens pour un quota TPM de 30k.
 */
function safeTruncate(text: string, maxTokens: number = 150000): string {
  const maxChars = Math.floor(maxTokens * 3.3); // ~500k chars
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n\n[TRONQUÉ - LIMITE EXTREME ATTEINTE (TOKEN QUOTA SAFE)]";
}

/**
 * Filtre le texte pour ne garder que les sections pertinentes autour des mots-clés.
 */
export function extractRelevantPLUSections(text: string, zoneCode: string): string {
  const upperText = text.toUpperCase();
  const zoneCodeUpper = zoneCode.toUpperCase();
  const baseZoneMatch = zoneCode.match(/^([A-Z]+)/); // No case-insensitive flag here
  const baseZone = baseZoneMatch && baseZoneMatch[1] ? baseZoneMatch[1].toUpperCase() : zoneCodeUpper;
  
  console.log(`[pluAnalysis] extractRelevantPLUSections: zoneCode=${zoneCode}, zoneCodeUpper=${zoneCodeUpper}, baseZone=${baseZone}`);

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
    new RegExp(`ZONE\\s+${zoneCodeUpper}\\b`, "i"),
    new RegExp(`ZONE\\s+${baseZone}\\b`, "i")
  ];
  
  let zoneStartIndex = -1;
  // Skip the first 10k chars to avoid Table of Contents matches
  const searchableText = text.substring(Math.min(text.length, 10000));
  const offset = Math.min(text.length, 10000);

  for (const rx of zoneHeaderPatterns) {
    const m = rx.exec(searchableText);
    if (m) {
      zoneStartIndex = m.index + offset;
      const start = Math.max(0, zoneStartIndex - 500);
      const end = Math.min(text.length, zoneStartIndex + 120000);
      segments.push({ start, end, priority: 2 });
      inclusionRanges.push({ start, end });
      inclusionRanges.push({ start, end });
      break; 
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
    "Art\\s+13", "Article\\s+13", "CES", "Emprise\\s+au\\s+sol", "Hauteur"
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
  
  // If the document is small enough for the model, just return it all
  if (text.length < 900000) return text; 

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
  parcelData?: any
): Promise<ZoneAnalysisResult & { digest?: ZoneDigest | null }> {
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
    let relevantText = extractRelevantPLUSections(rawText, zoneCode);

    // Fallback: if rawText is absent or too short (<300 chars), query Base IA embeddings directly
    if (relevantText.length < 300 && cityName) {
      try {
        const fallbackQuery = `Zone ${zoneCode} règlement emprise hauteur recul stationnement implantation`;
        let fallbackChunks = await queryRelevantChunks(fallbackQuery, {
          municipalityId: cityName,
          zoneCode,
          limit: 20,
        });
        if (fallbackChunks.length === 0) {
          fallbackChunks = await queryRelevantChunks(fallbackQuery, {
            municipalityId: GLOBAL_POOL_ID,
            limit: 10,
          });
        }
        if (fallbackChunks.length > 0) {
          const embText = fallbackChunks.map(c => c.content).join("\n\n---\n\n");
          relevantText = relevantText.length > 0 ? `${relevantText}\n\n---\n\n${embText}` : embText;
          console.log(`[pluAnalysis/analyzePLUZone] ✅ ${fallbackChunks.length} Base IA chunks used for ${cityName} zone ${zoneCode}`);
        } else {
          console.warn(`[pluAnalysis/analyzePLUZone] No PLU content found for ${cityName} zone ${zoneCode} — skipping AI call`);
          return {
            zoneCode,
            zoneLabel: `Zone ${zoneCode} — aucun document PLU indexé`,
            articles: [],
            digest: null,
            calculationVariables: { maxFootprintRatio: null, maxHeightM: null, minSetbackFromRoadM: null, minSetbackFromBoundariesM: null, parkingRules: null, greenSpaceRatio: null },
            globalConstraints: [],
            issues: [{
              article: "GLOBAL",
              msg: `Aucun document PLU indexé pour ${cityName}. Importez les documents dans la Base IA mairie.`,
              severity: "bloquante",
              type: "NO_PLU_DATA",
              code: "NO_PLU_DATA",
              message: `Aucun document PLU indexé pour ${cityName}. Importez les documents dans la Base IA mairie.`,
            }],
          };
        }
      } catch (embErr) {
        console.warn("[pluAnalysis/analyzePLUZone] Embedding fallback failed:", embErr);
      }
    }

    // Guard: if still no meaningful text after all fallbacks, skip AI entirely
    if (relevantText.trim().length < 200) {
      console.warn(`[pluAnalysis/analyzePLUZone] relevantText too short (${relevantText.length} chars) after all fallbacks — no AI call`);
      return {
        zoneCode,
        zoneLabel: `Zone ${zoneCode} — aucun document PLU indexé`,
        articles: [],
        digest: null,
        calculationVariables: { maxFootprintRatio: null, maxHeightM: null, minSetbackFromRoadM: null, minSetbackFromBoundariesM: null, parkingRules: null, greenSpaceRatio: null },
        globalConstraints: [],
        issues: [{
          article: "GLOBAL",
          msg: `Aucun document PLU indexé pour ${cityName || zoneCode}. Importez les documents dans la Base IA mairie.`,
          severity: "bloquante",
          type: "NO_PLU_DATA",
          code: "NO_PLU_DATA",
          message: `Aucun document PLU indexé pour ${cityName || zoneCode}. Importez les documents dans la Base IA mairie.`,
        }],
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

    console.log(`[pluAnalysis] Calling OpenAI for zone extraction: ${zoneCode} in ${cityName}...`);
    const truncatedText = (relevantText || "").substring(0, 40000);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 12288,
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `Texte du règlement (Extrait):\n\n${truncatedText}\n\nIMPORTANT: Réponds uniquement avec un objet JSON contenant la clé "articles" (tableau).`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      seed: 123
    });

    const parsedString = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(parsedString);
    
    // 2. Relevance Scoring & Ranking
    let rawArticles = Array.isArray(parsed.articles) ? parsed.articles : [];
    const rankedArticles = rankRulesByRelevance(rawArticles, projectDescription || "", parcelData);

    const result: any = {
      zoneCode: String(parsed.zoneCode || zoneCode),
      zoneLabel: String(parsed.zoneLabel || zoneLabel),
      articles: rankedArticles,
      digest,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      calculationVariables: parsed.calculationVariables || { 
        maxFootprintRatio: null, maxHeightM: null, minSetbackFromRoadM: null,
        minSetbackFromBoundariesM: null, parkingRules: null, greenSpaceRatio: null 
      },
      globalConstraints: Array.isArray(parsed.globalConstraints) ? parsed.globalConstraints : [],
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

/** Map documentType to the appropriate SYSTEM_PROMPTS key */
const PCMI_PROMPT_MAP: Record<string, string> = {
  PCMI1: "PCMI1_EXTRACTOR",
  PCMI2: "PCMI2_EXTRACTOR",
  PCMI3: "PCMI3_EXTRACTOR",
  PCMI4: "PCMI4_EXTRACTOR",
  PCMI5: "PCMI5_EXTRACTOR",
  cerfa: "CERFA_EXTRACTOR",
  CERFA: "CERFA_EXTRACTOR",
};

/**
 * Multi-source Document Extraction.
 * Cross-references current document with dossier context and regulatory KB.
 */
export async function extractDocumentData(
  text: string,
  documentType: string,
  piecePromptKey: string = "document_extract",
  context: {
    dossierDocs?: any[];
    regulatoryRules?: any[];
    commune?: string;
    zoneCode?: string;
  } = {}
): Promise<EngineResponse<ExtractedDocumentData>> {
  const { dossierDocs = [], regulatoryRules = [], commune = "", zoneCode = "" } = context;

  // Resolve prompt: 1) PCMI/CERFA routing, 2) ai-core prompts, 3) DB/legacy fallback
  let systemPrompt: string;
  const pcmiKey = Object.keys(PCMI_PROMPT_MAP).find(k => documentType.toUpperCase().includes(k));
  if (pcmiKey) {
    systemPrompt = (SYSTEM_PROMPTS as any)[PCMI_PROMPT_MAP[pcmiKey]];
  } else if (piecePromptKey in SYSTEM_PROMPTS) {
    systemPrompt = (SYSTEM_PROMPTS as any)[piecePromptKey];
  } else {
    systemPrompt = await loadPrompt(piecePromptKey);
  }
  
  const basePrompt = await loadPrompt("engine_modular_system");

  const dossierSummary = dossierDocs.map(d => 
    `- ${d.document_code || d.documentType}: ${JSON.stringify(d.extracted_data || d)}`
  ).join("\n");

  const rulesSummary = regulatoryRules.map(r => 
    `- Article ${r.articleNumber || r.category || "Rule"}: ${r.content || r.value || r.summary}`
  ).join("\n");

  const fullSystemPrompt = `${basePrompt}\n\n${systemPrompt}`;
  
  const userContent = `
DOCUMENT CONTENT:
---
${text.substring(0, 100000)}
---

DOSSIER CONTEXT (Other documents already processed):
${dossierSummary || "No other documents processed yet."}

REGULATORY CONTEXT (PLU Articles for ${commune} zone ${zoneCode}):
${rulesSummary || "No specific rules provided in KB."}
`;

  try {
    const isCerfa = documentType.toLowerCase().includes("cerfa");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: isCerfa ? zodResponseFormat(CerfaExtractionSchema, "cerfa_extraction") : { type: "json_object" },
      temperature: 0
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
    console.error("[extractDocumentData] IA Error:", err);
    throw err;
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
  
  let combinedText = "";
  const { jurisdictionContext } = context;

  // Primary: Base IA semantic search — always run for any identified commune
  // This is the canonical PLU knowledge source; rawText is supplementary
  if (cityName) {
    try {
      const queryStr = `Règles d'urbanisme zone ${zoneCode}${topics.length > 0 ? `. Thématiques: ${topics.join(", ")}` : ""}`;
      console.log(`[pluAnalysis] Base IA semantic search: "${queryStr}" (${cityName})`);

      let chunks = await queryRelevantChunks(queryStr, {
        municipalityId: cityName,
        limit: 25,
        docTypes: docTypes.length > 0 ? docTypes : undefined,
        jurisdictionContext,
      });

      // Fallback: GLOBAL_POOL_ID if the commune isn't yet indexed in Base IA
      if (chunks.length === 0) {
        console.warn(`[pluAnalysis] No Base IA chunks for ${cityName} zone ${zoneCode} — retrying with global pool`);
        chunks = await queryRelevantChunks(queryStr, {
          municipalityId: GLOBAL_POOL_ID,
          limit: 15,
          jurisdictionContext,
        });
      }

      if (chunks.length > 0) {
        combinedText = chunks
          .map(c => `[Base IA — Score: ${typeof c.similarity === "number" ? c.similarity.toFixed(2) : c.similarity}]\n${c.content}`)
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
    const relevantWindows = findRelevantWindows(rawText, zoneCode, topics);
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
    text: combinedText.substring(0, 400000), // Stay under TPM
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

    const finalData = result?.data || result?.content || result?.articles || resultText || "Aucune règle extraite.";
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

  const desc = (extractedData.project_description || "").toLowerCase();
  const topics: string[] = [];
  if (desc.includes("clôture") || desc.includes("cloture") || desc.includes("portail")) topics.push("CLÔTURE", "MUR", "PORTAIL", "CLAYETTE");
  if (desc.includes("piscine") || desc.includes("bassin")) topics.push("PISCINE", "LOCAL TECHNIQUE", "BASSIN");
  if (desc.includes("abri") || desc.includes("jardin") || desc.includes("carport")) topics.push("ANNEXE", "ABRI", "CARPORT", "GARAGE");
  if (desc.includes("extension") || desc.includes("surélévation")) topics.push("EXTENSION", "SURÉLÉVATION", "EMPRISE", "HAUTEUR");
  if (desc.includes("division") || desc.includes("lot")) topics.push("DIVISION", "LOTISSEMENT", "PROVENANCE");

  const articlesSafe = Array.isArray(articles) ? articles : [];
  const articlesSummary = articlesSafe.map(a =>
    `Art. ${a.articleNumber} — ${a.title}: ${a.summary ?? ""}`
  ).join("\n");

  const pluRulesText = [
    `- CES max : ${plu.rules?.CES_max != null ? Math.round(plu.rules.CES_max * 100) + "%" : "Non spécifié"}`,
    `- Hauteur max : ${plu.rules?.height_max_m ?? buildability?.maxHeightM ?? "Non spécifié"} m`,
    `- Recul voie : ${plu.rules?.setback_road_m ?? buildability?.setbackRoadM ?? "Non spécifié"} m`,
    `- Recul limites séparatives : ${plu.rules?.setback_side_min_m ?? buildability?.setbackBoundaryM ?? "Non spécifié"} m`,
    `- Stationnement : ${plu.rules?.parking_requirements ?? buildability?.parkingRequirement ?? "Non spécifié"}`,
    `- Surface parcelle : ${parcel?.parcelSurfaceM2 ?? "N/D"} m²`,
    `- Emprise restante constructible : ${buildability?.remainingFootprintM2 ?? "N/D"} m²`,
  ].join("\n");

  const distilledRules = townHallDocumentsText 
    ? await extractRelevantRules(townHallDocumentsText, { zoneCode, cityName, topics, jurisdictionContext })
    : "";

  const filenameSignal = (extractedData as any).file_name || (extractedData as any).title || "";
  const isNoticeDescriptive = (extractedData.document_nature || "").toLowerCase().includes("notice") || 
                              (extractedData.project_description || "").toLowerCase().includes("notice descriptive") ||
                              (filenameSignal || "").toLowerCase().includes("notice") ||
                              (extractedData.expertise_notes || "").toLowerCase().includes("notice");
  
  const systemPromptKey = "engine_modular_system";
  console.log(`[pluAnalysis/compare] Using modular engine for comparison (Signal: ${filenameSignal})`);
  
  const schemaInstructions = `
IMPORTANT : Tu es l'Expert-Urbaniste HEUREKA. Pour chaque point de comparaison, tu DOIS fournir la preuve juridique.
Structure du champ "data" (ET NON "analysis") :
{
  "summary": "Résumé global de la conformité",
  "global_status": "conforme" | "non_conforme" | "partiellement_conforme" | "indéterminé",
  "conformities": [
    { 
      "category": "Thématique", 
      "article": "Article X", 
      "document_value": "Valeur extraite du projet", 
      "plu_rule": "Règle extraite du PLU", 
      "texte_source": "Citation intégrale de l'article source",
      "interpretation": "Interprétation juridique appliquée au cas",
      "status": "conforme", 
      "analysis": "Explication du match", 
      "severity": "ok" 
    }
  ],
  "inconsistencies": [...même structure que conformities...],
  "points_attention": [...même structure que conformities...],
  "recommendations": ["Conseil 1"]
}
`;

  const systemPrompt = (await loadPrompt(systemPromptKey)) + "\n\n" + schemaInstructions;
  
  // 3.8 BUILD EVIDENCE BUNDLES FOR KEY TOPICS
  logger.info(`[pluAnalysis] Building EvidenceBundles for ${cityName} zone ${zoneCode}...`);
  const evidenceBundles: EvidenceBundle[] = [];

  for (const topic of topics) {
    // Determine target article based on common PLU structure
    const articleIdMap: Record<string, string> = {
      "HAUTEUR": "10",
      "EMPRISE": "9",
      "STATIONNEMENT": "12",
      "CLÔTURE": "11",
      "ESPACES VERTS": "13",
      "PISCINE": "9"
    };
    
    const targetArticle = articleIdMap[topic];
    const chunks = await queryRelevantChunks(topic, {
      municipalityId: cityName || "UNKNOWN",
      zoneCode,
      articleId: targetArticle,
      jurisdictionContext,
      includeTrace, // PROPAGATE TRACE FLAG
      limit: 5
    });

    const supportChunks: EvidenceChunk[] = chunks.map(c => ({
      id: c.id,
      content: c.content,
      similarity: c.similarity,
      authority_score: (c as any).finalScore || 0,
      metadata: c.metadata as any
    }));

    evidenceBundles.push({
      target_field: topic,
      authoritative_rule: supportChunks.find(c => c.metadata.source_authority >= 8)?.content,
      support_chunks: supportChunks,
      conflicts: [], // Conflict detection could be added here in V2
      overall_authority_rank: Math.max(...supportChunks.map(c => c.metadata.source_authority), 0),
      recommendation_manual_review: false
    });
  }

  const input = {
    task: "analyze",
    document_type: "permit",
    content: JSON.stringify(extractedData),
    context: {
      zoneCode,
      zoneLabel,
      pluRules: pluRulesText,
      articles: articlesSummary,
      evidence_bundles: evidenceBundles, // THE GROUNDED INPUT
      customInstructions: townHallCustomPrompt,
      cityName,
      territorialContext: (territorialContext || []).join(", ")
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
    console.error("[compareWithPLU] Modular Engine Error:", err);
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
