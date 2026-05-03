ALTER TABLE "dossiers" ADD COLUMN IF NOT EXISTS "instruction_status" text DEFAULT 'depose' NOT NULL;
ALTER TABLE "dossiers" ADD COLUMN IF NOT EXISTS "date_depot" timestamp;
ALTER TABLE "dossiers" ADD COLUMN IF NOT EXISTS "date_completude" timestamp;
ALTER TABLE "dossiers" ADD COLUMN IF NOT EXISTS "date_limite_instruction" timestamp;
ALTER TABLE "dossiers" ADD COLUMN IF NOT EXISTS "is_tacite" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "instruction_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dossier_id" uuid NOT NULL REFERENCES "dossiers"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
