ALTER TABLE "document_knowledge_profiles"
  ADD COLUMN IF NOT EXISTS "reasoning_summary" text,
  ADD COLUMN IF NOT EXISTS "reasoning_json" jsonb DEFAULT '{}'::jsonb;
