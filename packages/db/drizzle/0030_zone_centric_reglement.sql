ALTER TABLE "regulatory_calibration_zones" ADD COLUMN IF NOT EXISTS "zone_type" text;
ALTER TABLE "regulatory_calibration_zones" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "regulatory_calibration_zones" ADD COLUMN IF NOT EXISTS "geometry" jsonb;
ALTER TABLE "regulatory_calibration_zones" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft' NOT NULL;

CREATE TABLE IF NOT EXISTS "reglement_analysis" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "document_id" uuid,
  "source" text DEFAULT 'manual' NOT NULL,
  "raw_content" text NOT NULL,
  "structured_content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "zone_regulatory_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "zone_id" uuid NOT NULL,
  "article_number" integer,
  "article_title" text,
  "topic" text DEFAULT 'general' NOT NULL,
  "rule_text" text NOT NULL,
  "conditions" text,
  "exceptions" text,
  "source_document_id" uuid,
  "source_excerpt" text,
  "confidence_score" double precision DEFAULT 0.5,
  "validation_status" text DEFAULT 'draft' NOT NULL,
  "analysis_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "regulatory_controls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "zone_id" uuid NOT NULL,
  "control_type" text NOT NULL,
  "rule" text NOT NULL,
  "source_article" text,
  "source_document_id" uuid,
  "confidence_score" double precision DEFAULT 0.5,
  "validation_status" text DEFAULT 'draft' NOT NULL,
  "linked_overlay" text,
  "source_excerpt" text,
  "analysis_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "reglement_analysis" ADD CONSTRAINT "reglement_analysis_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "zone_regulatory_rules" ADD CONSTRAINT "zone_regulatory_rules_zone_id_regulatory_calibration_zones_id_fk"
  FOREIGN KEY ("zone_id") REFERENCES "public"."regulatory_calibration_zones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "zone_regulatory_rules" ADD CONSTRAINT "zone_regulatory_rules_source_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "regulatory_controls" ADD CONSTRAINT "regulatory_controls_zone_id_regulatory_calibration_zones_id_fk"
  FOREIGN KEY ("zone_id") REFERENCES "public"."regulatory_calibration_zones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "regulatory_controls" ADD CONSTRAINT "regulatory_controls_source_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "reglement_analysis_commune_idx" ON "reglement_analysis" USING btree ("commune_id");
CREATE INDEX IF NOT EXISTS "reglement_analysis_document_idx" ON "reglement_analysis" USING btree ("document_id");
CREATE INDEX IF NOT EXISTS "reglement_analysis_status_idx" ON "reglement_analysis" USING btree ("status");
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_zone_idx" ON "zone_regulatory_rules" USING btree ("zone_id");
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_article_idx" ON "zone_regulatory_rules" USING btree ("article_number");
CREATE INDEX IF NOT EXISTS "zone_regulatory_rules_status_idx" ON "zone_regulatory_rules" USING btree ("validation_status");
CREATE INDEX IF NOT EXISTS "regulatory_controls_zone_idx" ON "regulatory_controls" USING btree ("zone_id");
CREATE INDEX IF NOT EXISTS "regulatory_controls_type_idx" ON "regulatory_controls" USING btree ("control_type");
CREATE INDEX IF NOT EXISTS "regulatory_controls_status_idx" ON "regulatory_controls" USING btree ("validation_status");
