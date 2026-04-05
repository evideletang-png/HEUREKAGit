/**
 * AI Chat route — allows professionals to ask questions about a specific parcel analysis.
 * The assistant now grounds answers on structured analysis data, dossier documents,
 * town hall documents, Base IA chunks, and municipality learning signals.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  analysesTable,
  parcelsTable,
  zoneAnalysesTable,
  ruleArticlesTable,
  buildabilityResultsTable,
  constraintsTable,
  analysisChatMessagesTable,
  documentReviewsTable,
  townHallDocumentsTable,
} from "@workspace/db";
import { eq, and, asc, or, sql } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { loadPrompt } from "../services/promptLoader.js";
import { queryRelevantChunks } from "../services/embeddingService.js";
import { resolveJurisdictionContext } from "../services/orchestrator.js";
import { getTerritorialPattern, recordInteractionSignal, type TerritorialPattern } from "../services/learningService.js";

const router: IRouter = Router();

type RetrievedSource = {
  id: string;
  citation: string;
  label: string;
  content: string;
  priority: number;
};

const QUERY_STOPWORDS = new Set([
  "alors", "avec", "cette", "comment", "dans", "des", "elle", "elles", "est", "etre",
  "faut", "font", "mais", "pour", "plus", "peut", "quand", "quel", "quelle", "quelles",
  "sont", "sur", "tout", "tous", "une", "que", "qui", "quoi", "ville", "zone", "projet",
]);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCompact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractQueryTerms(question: string): string[] {
  return Array.from(new Set(
    normalizeCompact(question)
      .toLowerCase()
      .split(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]+/i)
      .map(word => word.trim())
      .filter(word => word.length >= 4 && !QUERY_STOPWORDS.has(word))
  )).slice(0, 8);
}

function scoreSnippet(text: string, question: string): number {
  const lowered = text.toLowerCase();
  const terms = extractQueryTerms(question);
  if (terms.length === 0) return lowered.length > 0 ? 1 : 0;
  return terms.reduce((score, term) => score + (lowered.includes(term) ? 1 : 0), 0);
}

function buildSnippet(text: string, question: string, maxChars: number = 900): string {
  const clean = normalizeCompact(text);
  if (!clean) return "";

  const lowered = clean.toLowerCase();
  const terms = extractQueryTerms(question);
  const firstMatch = terms
    .map(term => lowered.indexOf(term))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch == null) {
    return clean.slice(0, maxChars);
  }

  const start = Math.max(0, firstMatch - 220);
  const end = Math.min(clean.length, start + maxChars);
  return clean.slice(start, end);
}

function buildSourceBlock(source: RetrievedSource): string {
  return `${source.citation} ${source.label}\n${source.content}`;
}

function dedupeSources(sources: RetrievedSource[]): RetrievedSource[] {
  const seen = new Set<string>();
  const deduped: RetrievedSource[] = [];

  for (const source of sources.sort((a, b) => b.priority - a.priority)) {
    const key = `${source.label}::${source.content.slice(0, 280)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return deduped;
}

function getCommuneSignals(analysis: any, geoContext: any, zoneAnalysis: any): { communeKey: string; communeAliases: string[]; zoneCode: string } {
  const municipality = normalizeText(geoContext?.municipality);
  const city = normalizeText(analysis.city);
  const zoneCode = normalizeText(zoneAnalysis?.zoneCode) || normalizeText(analysis.zoneCode);

  const communeAliases = Array.from(new Set(
    [city, municipality]
      .map(value => value.trim())
      .filter(Boolean)
  ));

  return {
    communeKey: municipality || city,
    communeAliases,
    zoneCode,
  };
}

async function collectTownHallSources(communeAliases: string[], question: string): Promise<RetrievedSource[]> {
  if (communeAliases.length === 0) return [];

  const loweredAliases = communeAliases.map(alias => alias.toLowerCase());
  const whereClause = or(...loweredAliases.map(alias => eq(sql`lower(${townHallDocumentsTable.commune})`, alias)));
  if (!whereClause) return [];

  const docs = await db.select({
    id: townHallDocumentsTable.id,
    title: townHallDocumentsTable.title,
    commune: townHallDocumentsTable.commune,
    documentType: townHallDocumentsTable.documentType,
    category: townHallDocumentsTable.category,
    rawText: townHallDocumentsTable.rawText,
  }).from(townHallDocumentsTable).where(whereClause);

  return docs
    .map((doc, index) => {
      const rawText = normalizeText(doc.rawText);
      const snippet = buildSnippet(rawText, question);
      const relevance = scoreSnippet(snippet || rawText, question);
      if (!snippet || relevance === 0) return null;

      return {
        id: `town-hall-${doc.id}`,
        citation: `[S${index + 1}]`,
        label: `Document mairie${doc.commune ? ` ${doc.commune}` : ""} — ${doc.title}${doc.documentType ? ` (${doc.documentType})` : ""}`,
        content: snippet,
        priority: 45 + relevance,
      } satisfies RetrievedSource;
    })
    .filter((source): source is RetrievedSource => Boolean(source))
    .slice(0, 5);
}

async function collectDossierSources(analysisId: string, question: string): Promise<RetrievedSource[]> {
  const docs = await db.select({
    id: documentReviewsTable.id,
    title: documentReviewsTable.title,
    documentType: documentReviewsTable.documentType,
    rawText: documentReviewsTable.rawText,
    status: documentReviewsTable.status,
  }).from(documentReviewsTable).where(eq(documentReviewsTable.analysisId, analysisId));

  return docs
    .map((doc, index) => {
      const rawText = normalizeText(doc.rawText);
      const snippet = buildSnippet(rawText, question);
      const relevance = scoreSnippet(snippet || rawText, question);
      if (!snippet || relevance === 0) return null;

      return {
        id: `dossier-${doc.id}`,
        citation: `[D${index + 1}]`,
        label: `Document du dossier — ${doc.title}${doc.documentType ? ` (${doc.documentType})` : ""}`,
        content: snippet,
        priority: 55 + relevance,
      } satisfies RetrievedSource;
    })
    .filter((source): source is RetrievedSource => Boolean(source))
    .slice(0, 5);
}

function collectArticleSources(articles: any[], question: string): RetrievedSource[] {
  return (Array.isArray(articles) ? articles : [])
    .map((article, index) => {
      const sourceText = normalizeCompact([
        normalizeText(article.title),
        normalizeText(article.summary),
        normalizeText(article.sourceText),
        normalizeText(article.vigilanceText),
      ].filter(Boolean).join(" "));
      const snippet = buildSnippet(sourceText, question, 750);
      const relevance = scoreSnippet(snippet || sourceText, question);
      if (!snippet || relevance === 0) return null;

      return {
        id: `article-${article.id || index}`,
        citation: `[A${index + 1}]`,
        label: `Article PLU ${article.articleNumber ?? "N/A"} — ${article.title ?? "Sans titre"}`,
        content: snippet,
        priority: 75 + relevance,
      } satisfies RetrievedSource;
    })
    .filter((source): source is RetrievedSource => Boolean(source))
    .slice(0, 6);
}

async function collectBaseIASources(communeKey: string, zoneCode: string, question: string): Promise<RetrievedSource[]> {
  if (!communeKey) return [];

  try {
    const jurisdictionContext = /^\d{5}$/.test(communeKey)
      ? await resolveJurisdictionContext(communeKey)
      : undefined;

    const query = [question, zoneCode ? `zone ${zoneCode}` : ""].filter(Boolean).join(" ");
    const chunks = await queryRelevantChunks(query, {
      municipalityId: communeKey,
      zoneCode: zoneCode || undefined,
      jurisdictionContext,
      limit: 8,
    });

    return chunks.map((chunk, index) => {
      const metadata = (chunk.metadata || {}) as Record<string, any>;
      return {
        id: `base-ia-${chunk.id}`,
        citation: `[B${index + 1}]`,
        label: `Base IA${metadata.zone ? ` zone ${metadata.zone}` : ""}${metadata.article_id ? ` — article ${metadata.article_id}` : ""}`,
        content: buildSnippet(String(chunk.content || ""), question, 850),
        priority: 80 + Math.round(Number(chunk.similarity || 0) * 10),
      } satisfies RetrievedSource;
    }).filter(source => Boolean(source.content));
  } catch (err) {
    console.error("[chat/base-ia] Retrieval failed:", err);
    return [];
  }
}

function collectTerritorialSources(pattern: TerritorialPattern | null): RetrievedSource[] {
  if (!pattern) return [];

  const lines: string[] = [];
  if (pattern.topReasons?.length) {
    lines.push(`Points frequemment bloques ou sensibles: ${pattern.topReasons.join(", ")}`);
  }
  if (pattern.frequentChatTopics?.length) {
    lines.push(`Themes recurrents dans les echanges: ${pattern.frequentChatTopics.map(item => `${item.topic} (${item.count})`).join(", ")}`);
  }
  if ((pattern.interactionCount || 0) > 0) {
    lines.push(`Volume d'interactions memorisees: ${pattern.interactionCount}`);
  }

  if (lines.length === 0) return [];

  return [{
    id: `memory-${pattern.commune}`,
    citation: "[M1]",
    label: `Memoire territoriale ${pattern.commune} (non opposable, a confirmer)`,
    content: lines.join(" "),
    priority: 20,
  }];
}

async function collectRetrievedSources(args: {
  analysisId: string;
  analysis: any;
  zoneAnalysis: any;
  articles: any[];
  geoContext: any;
  question: string;
}): Promise<RetrievedSource[]> {
  const { analysisId, analysis, zoneAnalysis, articles, geoContext, question } = args;
  const { communeKey, communeAliases, zoneCode } = getCommuneSignals(analysis, geoContext, zoneAnalysis);
  const pattern = communeKey ? await getTerritorialPattern(communeKey) : null;

  const [dossierSources, townHallSources, baseIASources] = await Promise.all([
    collectDossierSources(analysisId, question),
    collectTownHallSources(communeAliases, `${question} ${zoneCode}`),
    collectBaseIASources(communeKey, zoneCode, question),
  ]);

  const articleSources = collectArticleSources(articles, `${question} ${zoneCode}`);
  const territorialSources = collectTerritorialSources(pattern);

  return dedupeSources([
    ...articleSources,
    ...dossierSources,
    ...townHallSources,
    ...baseIASources,
    ...territorialSources,
  ]).slice(0, 12);
}

async function buildSystemPrompt(args: {
  analysis: any;
  parcel: any;
  zoneAnalysis: any;
  articles: any[];
  buildability: any;
  constraints: any[];
  geoContext: any;
  retrievedSources: RetrievedSource[];
  territorialPattern: TerritorialPattern | null;
}): Promise<string> {
  const { analysis, parcel, zoneAnalysis, articles, buildability, constraints, geoContext, retrievedSources, territorialPattern } = args;
  const gc = geoContext ?? {};
  const pm = gc.parcel_metrics ?? {};
  const pb = gc.parcel_boundaries ?? {};
  const plu = gc.plu ?? {};
  const bld = gc.buildable ?? {};
  const tp = gc.topography ?? {};
  const nc = gc.neighbour_context ?? {};

  const articlesSafe = Array.isArray(articles) ? articles : [];
  const articlesSummary = articlesSafe.map(a =>
    `Art. ${a.articleNumber} — ${a.title}: ${a.summary ?? ""}${a.vigilanceText ? ` | Vigilance: ${a.vigilanceText}` : ""}`
  ).join("\n");

  const constraintsList = constraints.map(c =>
    `• [${c.severity?.toUpperCase()}] ${c.title}: ${c.description ?? ""}${c.source ? ` (source: ${c.source})` : ""}`
  ).join("\n");

  const contextualSources = retrievedSources.map(buildSourceBlock).join("\n\n");
  const memoryBlock = territorialPattern
    ? [
        territorialPattern.topReasons?.length ? `Points sensibles: ${territorialPattern.topReasons.join(", ")}` : "",
        territorialPattern.frequentChatTopics?.length ? `Themes recurrents: ${territorialPattern.frequentChatTopics.map(item => `${item.topic} (${item.count})`).join(", ")}` : "",
      ].filter(Boolean).join("\n")
    : "Aucune memoire territoriale disponible.";

  const customInstructions = await loadPrompt("chat_system");

  return `${customInstructions}

REGLES DE REPONSE :
- Reponds uniquement a partir du contexte fourni ci-dessous.
- Toute affirmation factuelle doit citer au moins une source entre crochets, par exemple [A1] ou [B2].
- Toute interpretation doit mentionner les elements factuels qui la soutiennent dans la meme phrase ou juste apres, avec citations.
- Distingue toujours clairement : Faits etablis, Interpretation, Points a confirmer.
- Si une information manque ou si les sources se contredisent, dis-le explicitement.
- La memoire territoriale [M1] n'est jamais opposable seule : elle sert seulement de contexte local.

DONNEES DE LA PARCELLE :
- Adresse : ${analysis.address}
- Reference cadastrale : ${parcel?.cadastralSection ?? ""}${parcel?.parcelNumber ?? ""} (IDU : ${gc.parcel?.id ?? "N/A"})
- Surface parcelle : ${parcel?.parcelSurfaceM2 ?? "N/D"} m2
- Perimetre : ${pm.perimeter_m ? Math.round(pm.perimeter_m) + " m" : "N/D"}
- Profondeur estimee : ${pm.depth_m ? Math.round(pm.depth_m) + " m" : "N/D"}
- Facade sur voie : ${pb.road_length_m ? Math.round(pb.road_length_m) + " m" : "N/D"} (Voie : ${pb.front_road_name ?? "N/D"})
- Parcelle d'angle : ${pm.is_corner_plot ? "Oui" : "Non"}
- Topographie : pente ${tp.slope_percent != null ? tp.slope_percent + "%" : "N/D"}, terrain ${tp.is_flat ? "plat" : "en pente"}
- Voisinage : hauteur moy. ${nc.avg_neighbour_height_m ?? "N/D"} m, typologie : ${nc.urban_typology ?? "N/D"}

ZONAGE ET CONSTRUCTIBILITE :
- Zone : ${zoneAnalysis?.zoneCode ?? analysis.zoneCode ?? "N/D"} — ${zoneAnalysis?.zoneLabel ?? ""}
- Document PLU : ${plu.document_title ?? "N/D"}
- CES max : ${plu.rules?.CES_max != null ? Math.round(plu.rules.CES_max * 100) + "%" : "N/D"}
- Hauteur maximale : ${plu.rules?.height_max_m ?? buildability?.maxHeightM ?? "N/D"} m
- Recul voie : ${plu.rules?.setback_road_m ?? buildability?.setbackRoadM ?? "N/D"} m
- Recul limites separatives : ${plu.rules?.setback_side_min_m ?? buildability?.setbackBoundaryM ?? "N/D"} m min.
- Stationnement : ${plu.rules?.parking_requirements ?? buildability?.parkingRequirement ?? "N/D"}
- Emprise batie existante : ${(gc.buildings_on_parcel?.footprint_m2 ?? 0)} m2
- Emprise max autorisee : ${buildability?.maxFootprintM2 ?? bld.max_footprint_allowed_m2 ?? "N/D"} m2
- Emprise restante constructible : ${buildability?.remainingFootprintM2 ?? bld.remaining_footprint_m2 ?? "N/D"} m2
- Score de confiance IA : ${buildability?.confidenceScore != null ? Math.round(buildability.confidenceScore * 100) + "%" : "N/D"}

ARTICLES PLU STRUCTURES :
${articlesSummary || "Aucun article structure disponible."}

CONTRAINTES IDENTIFIEES :
${constraintsList || "Aucune contrainte critique identifiee."}

MEMOIRE TERRITORIALE :
${memoryBlock}

SOURCES RETRIEVEES A UTILISER EN PRIORITE :
${contextualSources || "Aucune source textuelle supplementaire disponible."}`;
}

// GET /api/analyses/:id/chat — history
router.get("/:id/chat", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as { id: string };
    const [analysis] = await db.select().from(analysesTable)
      .where(and(eq(analysesTable.id, id), eq(analysesTable.userId, req.user!.userId))).limit(1);
    if (!analysis) { return res.status(404).json({ error: "NOT_FOUND" }); }

    const messages = await db.select().from(analysisChatMessagesTable)
      .where(eq(analysisChatMessagesTable.analysisId, id))
      .orderBy(asc(analysisChatMessagesTable.createdAt));

    return res.json({ messages });
  } catch (err) {
    console.error("[chat/history]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// POST /api/analyses/:id/chat — send message, get streaming response
router.post("/:id/chat", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as { id: string };
    const { message } = req.body as { message: string };

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message requis." });
    }

    const [analysis] = await db.select().from(analysesTable)
      .where(and(eq(analysesTable.id, id), eq(analysesTable.userId, req.user!.userId))).limit(1);
    if (!analysis) { return res.status(404).json({ error: "NOT_FOUND" }); }

    const parcel = (await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, id)).limit(1))[0] ?? null;
    const zoneData = (await db.select().from(zoneAnalysesTable).where(eq(zoneAnalysesTable.analysisId, id)).limit(1))[0] ?? null;
    const articles = zoneData ? await db.select().from(ruleArticlesTable).where(eq(ruleArticlesTable.zoneAnalysisId, zoneData.id)) : [];
    const buildability = (await db.select().from(buildabilityResultsTable).where(eq(buildabilityResultsTable.analysisId, id)).limit(1))[0] ?? null;
    const constraints = await db.select().from(constraintsTable).where(eq(constraintsTable.analysisId, id));

    const geoContext = analysis.geoContextJson
      ? (() => { try { return JSON.parse(analysis.geoContextJson as string); } catch { return null; } })()
      : null;

    const { communeKey } = getCommuneSignals(analysis, geoContext, zoneData);
    if (communeKey) {
      await recordInteractionSignal(communeKey, message);
    }

    const territorialPattern = communeKey ? await getTerritorialPattern(communeKey) : null;
    const retrievedSources = await collectRetrievedSources({
      analysisId: id,
      analysis,
      zoneAnalysis: zoneData,
      articles,
      geoContext,
      question: message,
    });

    const history = await db.select().from(analysisChatMessagesTable)
      .where(eq(analysisChatMessagesTable.analysisId, id))
      .orderBy(asc(analysisChatMessagesTable.createdAt));

    await db.insert(analysisChatMessagesTable).values({
      analysisId: id,
      role: "user",
      content: message,
    });

    const systemPrompt = await buildSystemPrompt({
      analysis,
      parcel,
      zoneAnalysis: zoneData,
      articles,
      buildability,
      constraints,
      geoContext,
      retrievedSources,
      territorialPattern,
    });

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...history
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: chatMessages as any,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    await db.insert(analysisChatMessagesTable).values({
      analysisId: id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    return res.end();
  } catch (err) {
    console.error("[chat/stream]", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
    res.write(`data: ${JSON.stringify({ error: "Erreur IA, veuillez reessayer." })}\n\n`);
    return res.end();
  }
});

export default router;
