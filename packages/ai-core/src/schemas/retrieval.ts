import { z } from "zod";

/**
 * Standard authority levels for HEUREKA urbanism documents.
 * Higher values = Higher legal weight.
 */
export const AuthorityLevelSchema = z.number().min(1).max(10).describe(
  "1-2: Informative/User Sketches, 3-4: Descriptive Notices, 5-7: Complementary/Annexes, 8-9: PLU/PLUi Rules, 10: State Law/National Regulations"
);

export type AuthorityLevel = z.infer<typeof AuthorityLevelSchema>;

/**
 * Priority policy definitions for ranking.
 */
export const AUTHORITY_POLICY = {
  LAW_NATIONAL: 10,       // RNU, Code de l'Urbanisme
  REGULATION_LOCAL: 9,    // PLU, PLUi, Règlement écrit
  PLANNING_OAP: 8,        // OAP (Orientations d'Aménagement)
  ANNEX_PATRIMOINE: 7,    // ABF, Secteurs sauvegardés
  ANNEX_RISK: 6,          // PPRN, PPRT
  ANNEX_TECHNICAL: 5,     // Infrastructures, Assainissement
  NOTICE_DESCRIPTIVE: 4,  // Project description from architect
  ADMIN_GUIDE: 3,         // Municipality internal guides
  USER_SKETCH: 2,         // Rough drawings or descriptions
  UNKNOWN: 1
} as const;

/**
 * Canonical Metadata Schema for all Knowledge Base entries (Embeddings).
 * This structure is used for both indexing and hybrid filtering.
 */
export const KnowledgeMetadataSchema = z.object({
  document_id: z.string().uuid(),
  pool_id: z.string().describe("Stable ID of the document collection (e.g. 94000-PLU-ACTIVE)"),
  jurisdiction_id: z.string().describe("Stable ID of the owning municipality or intercommunal authority"),
  status: z.enum(["active", "archived", "draft"]).default("active"),
  document_type: z.enum([
    "plu_reglement",
    "plu_annexe",
    "oap",
    "cerfa",
    "note_descriptive",
    "ppr",
    "other"
  ]),
  commune: z.string().describe("Commune name or INSEE code"),
  zone: z.string().optional().describe("Urbanism zone (e.g. UA, UC, N)"),
  article_id: z.string().optional().describe("Exact article number or identifier (e.g. '10', 'art-12')"),
  section_title: z.string().optional().describe("Title of the section or chapter"),
  page_number: z.number().int().optional(),
  version_date: z.string().optional().describe("ISO date of the document version"),
  provenance: z.enum([
    "base_ia_plu",
    "government_mcp",
    "official_api",
    "gpu_official",
    "web_fallback"
  ]).default("base_ia_plu").describe("Origin of the regulatory data"),
  source_authority: AuthorityLevelSchema.default(AUTHORITY_POLICY.UNKNOWN),
  topic_tags: z.array(z.string()).default([]),
  language: z.string().default("fr")
});

export type KnowledgeMetadata = z.infer<typeof KnowledgeMetadataSchema>;

/**
 * Scoring Trace: Internal breakdown of ranking decisions for a chunk.
 * Used for debugging and observability.
 */
export const ScoringTraceSchema = z.object({
  lexical_score: z.number().describe("Grounding boost from keyword/article match"),
  semantic_score: z.number().describe("Raw vector cosine similarity"),
  authority_score: z.number().describe("Normalized legal authority weight (0-1)"),
  final_rank_score: z.number().describe("Final weighted score used for ranking"),
  was_boosted: z.boolean().default(false).describe("True if exact article match found"),
  exclusion_reason: z.string().optional().describe("Reason why this near-miss was excluded (if applicable)")
});

export type ScoringTrace = z.infer<typeof ScoringTraceSchema>;

/**
 * Standard structure for a retrieved evidence chunk.
 */
export const EvidenceChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  similarity: z.number(), // Vector distance/score
  authority_score: z.number(), // Computed ranking including authority
  metadata: KnowledgeMetadataSchema,
  trace: ScoringTraceSchema.optional().describe("Detailed scoring breakdown for debug mode")
});

export type EvidenceChunk = z.infer<typeof EvidenceChunkSchema>;

/**
 * EVIDENCE BUNDLE: A grounded set of sources for one specific comparison point.
 * This is what the AI Reasoning logic should consume.
 */
export const EvidenceBundleSchema = z.object({
  target_field: z.string().describe("What we are comparing (e.g. 'Height', 'Art. 10')"),
  authoritative_rule: z.string().optional().describe("The primary governing rule text if found"),
  support_chunks: z.array(EvidenceChunkSchema),
  conflicts: z.array(z.object({
    chunk_ids: z.array(z.string()),
    description: z.string()
  })).default([]),
  overall_authority_rank: z.number().min(0).max(10),
  recommendation_manual_review: z.boolean().default(false)
});

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
