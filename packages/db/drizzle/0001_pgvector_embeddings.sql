-- Try to enable pgvector; skip gracefully if the extension isn't installed on this host
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector extension not available (%). Vector similarity will be disabled.', SQLERRM;
END; $$;--> statement-breakpoint

-- Only proceed with vector column if pgvector is actually installed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Drop old text[] column (existing text-array embeddings must be re-ingested)
    ALTER TABLE "base_ia_embeddings" DROP COLUMN IF EXISTS "embedding";
    -- Add real vector column (nullable so existing rows don't violate NOT NULL)
    ALTER TABLE "base_ia_embeddings" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
    -- Remove any rows that have no embedding
    DELETE FROM "base_ia_embeddings" WHERE "embedding" IS NULL;
    -- Apply NOT NULL after cleanup
    ALTER TABLE "base_ia_embeddings" ALTER COLUMN "embedding" SET NOT NULL;
    -- HNSW index: works on empty tables, no training needed, better than IVFFlat
    CREATE INDEX IF NOT EXISTS "embedding_hnsw_cosine_idx"
      ON "base_ia_embeddings"
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    RAISE NOTICE 'pgvector column and HNSW index created successfully.';
  ELSE
    RAISE WARNING 'Skipping vector column migration — pgvector not installed.';
  END IF;
END; $$;--> statement-breakpoint
