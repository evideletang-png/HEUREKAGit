import { openai } from "@workspace/integrations-openai-ai-server";
import { db, baseIAEmbeddingsTable } from "@workspace/db";
import { sql, eq, and, desc, or, ilike, inArray, notInArray } from "drizzle-orm";
import { KnowledgeMetadata, JurisdictionContext, GLOBAL_POOL_ID, ScoringTrace } from "@workspace/ai-core";

export interface SearchFilter {
  municipalityId: string;
  zoneCode?: string;
  docTypes?: string[];
  provenances?: string[];
  limit?: number;
  articleId?: string; // Optional exact article target
  jurisdictionContext?: JurisdictionContext; // Mandatory for strict scoping
  includeTrace?: boolean; // Flag to enable detailed debug tracing
  minAuthority?: number;
  strictZone?: boolean;
}

export type ChunkMetadata = KnowledgeMetadata;

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.replace(/\n/g, " "),
    dimensions: 1536,
  });
  return result.data[0].embedding;
}

export async function insertChunk(
  documentId: string,
  municipalityId: string,
  content: string,
  chunkIndex: number,
  pageNumber: number | null,
  metadata: ChunkMetadata
) {
  const embedding = await generateEmbedding(content);
  
  await db.insert(baseIAEmbeddingsTable).values({
    documentId,
    municipalityId,
    content,
    chunkIndex,
    pageNumber,
    embedding: embedding, // pgvector number[] — stored as vector(1536)
    metadata
  });
}

/**
 * Executes a hybrid search combining Vector Similarity and Lexical Keyword matching.
 */
export async function queryRelevantChunks(query: string, filters: SearchFilter) {
  const queryEmbedding = await generateEmbedding(query);
  const limit = filters.limit || 15;
  const { jurisdictionContext, includeTrace } = filters;

  // 1. Vector Similarity Score using pgvector cosine distance (<=>)
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  const similarityScore = sql<number>`1 - (${baseIAEmbeddingsTable.embedding} <=> ${vectorLiteral}::vector)`;
  
  // 2. Lexical / Keyword matching for Grounding (BOOSTED)
  const lexicalMatchWeight = 5.0; 
  const isLexicalMatch = or(
    ilike(baseIAEmbeddingsTable.content, `%${filters.articleId || query}%`),
    sql`${baseIAEmbeddingsTable.metadata}->>'article_id' = ${filters.articleId || query}`
  );

  const lexicalScore = sql<number>`CASE WHEN ${isLexicalMatch} THEN ${lexicalMatchWeight} ELSE 0 END`;

  // 3. Authority Score
  const authorityScoreJson = sql<number>`COALESCE((${baseIAEmbeddingsTable.metadata}->>'source_authority')::numeric, 1)`;

  // 4. Document type and zone boosts to prioritize written regulations over complementary planning docs.
  const documentTypeScore = sql<number>`CASE
    WHEN ${baseIAEmbeddingsTable.metadata}->>'document_type' = 'plu_reglement' THEN 1.0
    WHEN ${baseIAEmbeddingsTable.metadata}->>'document_type' = 'plu_annexe' THEN 0.6
    WHEN ${baseIAEmbeddingsTable.metadata}->>'document_type' = 'oap' THEN 0.15
    ELSE 0.0
  END`;

  const zoneScore = filters.zoneCode
    ? sql<number>`CASE
        WHEN ${baseIAEmbeddingsTable.metadata}->>'zone' = ${filters.zoneCode} THEN 1.0
        WHEN ${baseIAEmbeddingsTable.metadata}->>'zone' IS NULL THEN 0.2
        ELSE 0.0
      END`
    : sql<number>`0.0`;

  // 5. Combined Score
  // Written regulation and exact-zone chunks should outrank OAP/PADD-like material even when
  // semantic similarity is close, because buildability must be grounded in opposable text first.
  const finalScore = sql<number>`
    (${similarityScore} * 0.42) +
    ((${authorityScoreJson} / 10.0) * 0.23) +
    (${lexicalScore} * 0.15) +
    (${documentTypeScore} * 0.15) +
    (${zoneScore} * 0.05)
  `;

  // 6. BOUNDARY FILTERING
  const poolIds = jurisdictionContext 
    ? [...jurisdictionContext.active_pool_ids, GLOBAL_POOL_ID]
    : [GLOBAL_POOL_ID];

  const baseConditions = [
    sql`${baseIAEmbeddingsTable.metadata}->>'status' = 'active'`,
    or(
      inArray(sql`${baseIAEmbeddingsTable.metadata}->>'pool_id'`, poolIds),
      eq(baseIAEmbeddingsTable.municipalityId, filters.municipalityId) // Legacy fallback
    ),
    filters.docTypes && filters.docTypes.length > 0
      ? inArray(sql`${baseIAEmbeddingsTable.metadata}->>'document_type'`, filters.docTypes)
      : undefined,
    typeof filters.minAuthority === "number"
      ? sql`COALESCE((${baseIAEmbeddingsTable.metadata}->>'source_authority')::numeric, 1) >= ${filters.minAuthority}`
      : undefined,
  ];

  const zoneCondition = filters.zoneCode
    ? (
      filters.strictZone
        ? sql`${baseIAEmbeddingsTable.metadata}->>'zone' = ${filters.zoneCode}`
        : sql`(${baseIAEmbeddingsTable.metadata}->>'zone' = ${filters.zoneCode} OR ${baseIAEmbeddingsTable.metadata}->>'zone' IS NULL)`
    )
    : undefined;

  const whereClause = and(...baseConditions, zoneCondition);

  // 7. EXECUTE SEARCH
  const rawResults = await db
    .select({
      id: baseIAEmbeddingsTable.id,
      documentId: baseIAEmbeddingsTable.documentId,
      content: baseIAEmbeddingsTable.content,
      metadata: baseIAEmbeddingsTable.metadata,
      similarity: similarityScore,
      authority: authorityScoreJson,
      documentTypeScore: documentTypeScore,
      zoneScore: zoneScore,
      lexical: lexicalScore,
      finalScore: finalScore
    })
    .from(baseIAEmbeddingsTable)
    .where(whereClause)
    .orderBy(desc(finalScore))
    .limit(limit);

  // 8. NEAR MISS DETECTION (Only if trace requested)
  let nearMisses: any[] = [];
  if (includeTrace && jurisdictionContext) {
    // Find documents from WRONG pool or WRONG status in the same municipality
    nearMisses = await db
      .select({
        id: baseIAEmbeddingsTable.id,
        content: baseIAEmbeddingsTable.content,
        metadata: baseIAEmbeddingsTable.metadata,
        similarity: similarityScore,
        authority: authorityScoreJson,
        finalScore: finalScore
      })
      .from(baseIAEmbeddingsTable)
      .where(and(
        eq(baseIAEmbeddingsTable.municipalityId, filters.municipalityId),
        or(
          sql`${baseIAEmbeddingsTable.metadata}->>'status' != 'active'`,
          notInArray(sql`${baseIAEmbeddingsTable.metadata}->>'pool_id'`, poolIds)
        )
      ))
      .orderBy(desc(finalScore))
      .limit(5);
  }

  // 9. FORMAT OUTPUT WITH TRACE
  const finalResults = rawResults.map(r => ({
     id: r.id,
     content: r.content,
     metadata: r.metadata as ChunkMetadata,
     similarity: r.similarity,
     authority_score: r.authority,
     trace: includeTrace ? {
        lexical_score: r.lexical,
        semantic_score: r.similarity,
        authority_score: r.authority / 10.0,
        document_type_score: r.documentTypeScore,
        zone_score: r.zoneScore,
        final_rank_score: r.finalScore,
        was_boosted: r.lexical > 0,
        exclusion_reason: undefined
     } as ScoringTrace : undefined
  }));

  // Append specialized traces for near misses if requested
  if (includeTrace && nearMisses.length > 0) {
    nearMisses.forEach(nm => {
      const meta = nm.metadata as any;
      const reason = meta.status !== 'active' ? 'status:archived' : 'wrong jurisdiction pool';
      finalResults.push({
        id: nm.id,
        content: nm.content,
        metadata: meta,
        similarity: nm.similarity,
        authority_score: nm.authority,
        trace: {
          lexical_score: 0,
          semantic_score: nm.similarity,
          authority_score: nm.authority / 10.0,
          final_rank_score: nm.finalScore,
          was_boosted: false,
          exclusion_reason: reason
        }
      });
    });
  }

  // Provenance filter (post-retrieval fallback for now, as it is in jsonb)
  if (filters.provenances && filters.provenances.length > 0) {
      return finalResults.filter(r => {
         const meta = r.metadata as any;
         return meta.provenance && filters.provenances!.includes(meta.provenance);
      });
  }

  return finalResults;
}
