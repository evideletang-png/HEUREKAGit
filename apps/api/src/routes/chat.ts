/**
 * AI Chat route — allows professionals to ask questions about a specific parcel analysis.
 * The AI has full context: GeoContext, PLU articles, buildability, constraints.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { analysesTable, parcelsTable, zoneAnalysesTable, ruleArticlesTable, buildabilityResultsTable, constraintsTable, analysisChatMessagesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { loadPrompt } from "../services/promptLoader.js";

const router: IRouter = Router();

async function buildSystemPrompt(analysis: any, parcel: any, zoneAnalysis: any, articles: any[], buildability: any, constraints: any[], geoContext: any): Promise<string> {
  const gc = geoContext ?? {};
  const pm = gc.parcel_metrics ?? {};
  const pb = gc.parcel_boundaries ?? {};
  const plu = gc.plu ?? {};
  const bld = gc.buildable ?? {};
  const tp = gc.topography ?? {};
  const nc = gc.neighbour_context ?? {};

  const articlesSafe = Array.isArray(articles) ? articles : [];
  const articlesSummary = articlesSafe.map(a =>
    `Art. ${a.articleNumber} — ${a.title}: ${a.summary ?? ""}${a.vigilanceText ? ` ⚠ ${a.vigilanceText}` : ""}`
  ).join("\n");

  const constraintsList = constraints.map(c =>
    `• [${c.severity?.toUpperCase()}] ${c.title}: ${c.description ?? ""}`
  ).join("\n");

  const customInstructions = await loadPrompt("chat_system");

  return `${customInstructions}

DONNÉES DE LA PARCELLE :
- Adresse : ${analysis.address}
- Référence cadastrale : ${parcel?.cadastralSection ?? ""}${parcel?.parcelNumber ?? ""} (IDU : ${gc.parcel?.id ?? "N/A"})
- Surface parcelle : ${parcel?.parcelSurfaceM2 ?? "N/D"} m²
- Périmètre : ${pm.perimeter_m ? Math.round(pm.perimeter_m) + " m" : "N/D"}
- Profondeur estimée : ${pm.depth_m ? Math.round(pm.depth_m) + " m" : "N/D"}
- Façade sur voie : ${pb.road_length_m ? Math.round(pb.road_length_m) + " m" : "N/D"} (Voie : ${pb.front_road_name ?? "N/D"})
- Parcelle d'angle : ${pm.is_corner_plot ? "Oui" : "Non"}
- Topographie : pente ${tp.slope_percent != null ? tp.slope_percent + "%" : "N/D"}, terrain ${tp.is_flat ? "plat" : "en pente"}
- Voisinage : hauteur moy. ${nc.avg_neighbour_height_m ?? "N/D"} m, typologie : ${nc.urban_typology ?? "N/D"}

ZONAGE PLU :
- Zone : ${zoneAnalysis?.zoneCode ?? analysis.zoneCode ?? "N/D"} — ${zoneAnalysis?.zoneLabel ?? ""}
- Document PLU : ${plu.document_title ?? "N/D"}
- CES max (emprise au sol) : ${plu.rules?.CES_max != null ? Math.round(plu.rules.CES_max * 100) + "%" : "N/D"}
- Hauteur maximale : ${plu.rules?.height_max_m ?? buildability?.maxHeightM ?? "N/D"} m
- Recul voie : ${plu.rules?.setback_road_m ?? buildability?.setbackRoadM ?? "N/D"} m
- Recul limites séparatives : ${plu.rules?.setback_side_min_m ?? buildability?.setbackBoundaryM ?? "N/D"} m min.
- Stationnement : ${plu.rules?.parking_requirements ?? buildability?.parkingRequirement ?? "N/D"}

ARTICLES PLU EXTRAITS :
${articlesSummary || "Aucun article extrait."}

CONSTRUCTIBILITÉ CALCULÉE :
- Emprise bâtie existante : ${(gc.buildings_on_parcel?.footprint_m2 ?? 0)} m² (taux de couverture : ${gc.buildings_on_parcel?.coverage_ratio != null ? Math.round(gc.buildings_on_parcel.coverage_ratio * 100) + "%" : "N/D"})
- Emprise max autorisée : ${buildability?.maxFootprintM2 ?? bld.max_footprint_allowed_m2 ?? "N/D"} m²
- Emprise restante constructible : ${buildability?.remainingFootprintM2 ?? bld.remaining_footprint_m2 ?? "N/D"} m²
- Hauteur max : ${buildability?.maxHeightM ?? "N/D"} m
- Volume constructible estimé : ${bld.volume_potential_m3 ? Math.round(bld.volume_potential_m3) + " m³" : "N/D"}
- Score de confiance IA : ${buildability?.confidenceScore != null ? Math.round(buildability.confidenceScore * 100) + "%" : "N/D"}

CONTRAINTES IDENTIFIÉES :
${constraintsList || "Aucune contrainte critique identifiée."}`;
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

    // Load full context
    const parcel = (await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, id)).limit(1))[0] ?? null;
    const zoneData = (await db.select().from(zoneAnalysesTable).where(eq(zoneAnalysesTable.analysisId, id)).limit(1))[0] ?? null;
    const articles = zoneData ? await db.select().from(ruleArticlesTable).where(eq(ruleArticlesTable.zoneAnalysisId, zoneData.id)) : [];
    const buildability = (await db.select().from(buildabilityResultsTable).where(eq(buildabilityResultsTable.analysisId, id)).limit(1))[0] ?? null;
    const constraints = await db.select().from(constraintsTable).where(eq(constraintsTable.analysisId, id));

    const geoContext = analysis.geoContextJson
      ? (() => { try { return JSON.parse(analysis.geoContextJson as string); } catch { return null; } })()
      : null;

    // Get chat history
    const history = await db.select().from(analysisChatMessagesTable)
      .where(eq(analysisChatMessagesTable.analysisId, id))
      .orderBy(asc(analysisChatMessagesTable.createdAt));

    // Save user message
    await db.insert(analysisChatMessagesTable).values({
      analysisId: id,
      role: "user",
      content: message,
    });

    // Build messages for OpenAI
    const systemPrompt = await buildSystemPrompt(analysis, parcel, zoneData, articles, buildability, constraints, geoContext);
    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ];

    // Stream response
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

    // Save assistant message
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
    } else {
      res.write(`data: ${JSON.stringify({ error: "Erreur IA, veuillez réessayer." })}\n\n`);
      return res.end();
    }
  }
});

export default router;
