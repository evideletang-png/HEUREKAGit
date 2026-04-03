import { db, baseIADocumentsTable, rulesTable, townHallDocumentsTable, communesTable } from "@workspace/db";
import { eq, and, sql, or, inArray } from "drizzle-orm";
import { JurisdictionContext, GLOBAL_POOL_ID } from "@workspace/ai-core";
import { queryRelevantChunks } from "./embeddingService.js";

export interface AnalysisContext {
  commune: string;
  zoneCode: string;
  jurisdictionContext: JurisdictionContext;
  relevantDocs: any[];
  relevantRules: any[];
}

/**
 * Context Builder Service.
 * Selects only relevant documents and rules for analysis using strict Jurisdiction Scoping.
 */
export async function buildAnalysisContext(
  commune: string, // INSEE Code
  zoneCode: string,
  jurisdictionContext: JurisdictionContext
): Promise<AnalysisContext> {
  console.log(`[ContextBuilder] Building context for ${jurisdictionContext.name} (${zoneCode})...`);

  // 1. Resolve Commune Name (Mismatch fix for town_hall_documents)
  let communeName = "";
  try {
    const [c] = await db.select().from(communesTable).where(eq(communesTable.inseeCode, commune)).limit(1);
    if (c) communeName = c.name;
    console.log(`[ContextBuilder] Resolved INSEE ${commune} to name: ${communeName}`);
  } catch (e) {
    console.warn(`[ContextBuilder] Failed to resolve commune name for ${commune}`);
  }

  // 2. Fetch relevant documents from Base IA
  const poolIds = [...jurisdictionContext.active_pool_ids, GLOBAL_POOL_ID];
  
  const baseIADocs = await db.select().from(baseIADocumentsTable)
    .where(
      and(
        or(
          eq(baseIADocumentsTable.municipalityId, commune),
          communeName ? eq(baseIADocumentsTable.municipalityId, communeName) : sql`FALSE`,
          inArray(baseIADocumentsTable.municipalityId, [GLOBAL_POOL_ID, "NATIONAL"])
        ),
        eq(baseIADocumentsTable.status, "indexed")
      )
    );

  // 3. Zone-level Collection from Town Hall (PLU PDFs, etc.)
  // We fetch ALL documents for the commune, then filter or triage them based on zone keywords in Step 4
  const townHallDocs = await db.select().from(townHallDocumentsTable)
    .where(
      and(
        or(
          eq(townHallDocumentsTable.commune, commune),
          communeName ? eq(townHallDocumentsTable.commune, communeName) : sql`FALSE`,
          // Zone-specific matches if pre-filtered in DB
          eq(townHallDocumentsTable.zone, zoneCode)
        ),
        eq(townHallDocumentsTable.isOpposable, true)
      )
    );

  // Combine static document sources
  const relevantDocs = [...baseIADocs, ...townHallDocs];

  // 3b. ALWAYS run semantic search against base_ia_embeddings for zone-specific PLU chunks.
  // This is the primary knowledge source — it returns the most relevant indexed PLU text
  // even when no full-document record exists for the commune.
  const embeddingQuery = `Règlement zone ${zoneCode} occupation sol hauteur emprise recul stationnement espaces verts`;
  try {
    let chunks = await queryRelevantChunks(embeddingQuery, {
      municipalityId: commune,
      zoneCode,
      jurisdictionContext,
      limit: 30,
    });

    // Fallback: try with commune name (some documents are indexed by name, not INSEE)
    if (chunks.length === 0 && communeName) {
      chunks = await queryRelevantChunks(embeddingQuery, {
        municipalityId: communeName,
        zoneCode,
        jurisdictionContext,
        limit: 30,
      });
    }

    if (chunks.length > 0) {
      const embeddingText = chunks
        .map(c => `[Base IA — Score: ${typeof c.similarity === "number" ? c.similarity.toFixed(2) : c.similarity}]\n${c.content}`)
        .join("\n\n---\n\n");
      // Prepend as the highest-priority synthetic document
      relevantDocs.unshift({
        id: `BASE_IA_${commune}_${zoneCode}`,
        rawText: embeddingText,
        municipalityId: commune,
        status: "indexed",
        documentType: "plu",
        title: `Base IA — Zone ${zoneCode} — ${jurisdictionContext.name || commune}`,
      });
      console.log(`[ContextBuilder] ✅ ${chunks.length} Base IA embedding chunks injected for zone ${zoneCode} in ${jurisdictionContext.name || commune}`);
    } else {
      console.warn(`[ContextBuilder] ⚠️  No Base IA chunks found for zone ${zoneCode} in ${commune} / ${communeName || "?"} — analysis will rely on static documents only.`);
    }
  } catch (embErr) {
    console.error("[ContextBuilder] Embedding search failed — continuing without Base IA chunks:", embErr);
  }

  // 4. Fetch relevant formal rules (Structured DB rules)
  const relevantRules = await db.select().from(rulesTable)
    .where(
      and(
        or(
          eq(rulesTable.commune, commune),
          communeName ? eq(rulesTable.commune, communeName) : sql`FALSE`
        ),
        eq(rulesTable.zoneCode, zoneCode)
      )
    );

  console.log(`[ContextBuilder] [Jurisdiction: ${jurisdictionContext.name}] Collected ${relevantDocs.length} documents for Zone ${zoneCode}.`);

  return {
    commune,
    zoneCode,
    jurisdictionContext,
    relevantDocs,
    relevantRules
  };
}
