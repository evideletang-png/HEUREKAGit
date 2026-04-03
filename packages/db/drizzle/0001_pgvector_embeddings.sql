-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

-- Drop old text[] column and replace with real vector column
-- Any existing text-array embeddings are incompatible and must be re-ingested
ALTER TABLE "base_ia_embeddings" DROP COLUMN IF EXISTS "embedding";--> statement-breakpoint
ALTER TABLE "base_ia_embeddings" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint

-- Remove any orphan rows that have no embedding (shouldn't exist, but safety net)
DELETE FROM "base_ia_embeddings" WHERE "embedding" IS NULL;--> statement-breakpoint

-- Apply NOT NULL constraint after backfill
ALTER TABLE "base_ia_embeddings" ALTER COLUMN "embedding" SET NOT NULL;--> statement-breakpoint

-- HNSW index for approximate nearest-neighbor cosine search.
-- Unlike IVFFlat, HNSW works on empty tables and doesn't require training.
CREATE INDEX IF NOT EXISTS "embedding_hnsw_cosine_idx"
  ON "base_ia_embeddings"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);--> statement-breakpoint
