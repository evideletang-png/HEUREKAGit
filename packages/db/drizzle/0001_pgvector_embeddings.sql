CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "base_ia_embeddings" DROP COLUMN IF EXISTS "embedding";--> statement-breakpoint
ALTER TABLE "base_ia_embeddings" ADD COLUMN "embedding" vector(1536) NOT NULL DEFAULT '[0]';--> statement-breakpoint
ALTER TABLE "base_ia_embeddings" ALTER COLUMN "embedding" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_ivfflat_idx" ON "base_ia_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);--> statement-breakpoint
