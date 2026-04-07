CREATE TABLE IF NOT EXISTS "regulatory_calibration_zones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "zone_code" text NOT NULL,
  "zone_label" text,
  "parent_zone_code" text,
  "sector_code" text,
  "guidance_notes" text,
  "display_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_calibration_zones_commune_idx" ON "regulatory_calibration_zones" USING btree ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_calibration_zones_code_idx" ON "regulatory_calibration_zones" USING btree ("zone_code");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "regulatory_theme_taxonomy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "description" text,
  "article_hint" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_theme_taxonomy_sort_idx" ON "regulatory_theme_taxonomy" USING btree ("sort_order");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "calibrated_excerpts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "zone_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "article_code" text,
  "selection_label" text,
  "source_text" text NOT NULL,
  "normalized_source_text" text,
  "source_page" integer NOT NULL,
  "source_page_end" integer,
  "selection_start_offset" integer,
  "selection_end_offset" integer,
  "ai_suggested" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "review_note" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_by" text,
  "updated_by" text,
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "calibrated_excerpts" ADD CONSTRAINT "calibrated_excerpts_zone_id_regulatory_calibration_zones_id_fk"
  FOREIGN KEY ("zone_id") REFERENCES "public"."regulatory_calibration_zones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "calibrated_excerpts" ADD CONSTRAINT "calibrated_excerpts_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calibrated_excerpts_commune_idx" ON "calibrated_excerpts" USING btree ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calibrated_excerpts_zone_idx" ON "calibrated_excerpts" USING btree ("zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calibrated_excerpts_document_idx" ON "calibrated_excerpts" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calibrated_excerpts_status_idx" ON "calibrated_excerpts" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "indexed_regulatory_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "zone_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "excerpt_id" uuid NOT NULL,
  "article_code" text NOT NULL,
  "theme_code" text NOT NULL,
  "rule_label" text NOT NULL,
  "operator" text,
  "value_numeric" double precision,
  "value_text" text,
  "unit" text,
  "condition_text" text,
  "interpretation_note" text,
  "scope_type" text DEFAULT 'zone' NOT NULL,
  "source_text" text NOT NULL,
  "source_page" integer NOT NULL,
  "source_page_end" integer,
  "confidence_score" double precision DEFAULT 0,
  "conflict_flag" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "ai_suggested" boolean DEFAULT false NOT NULL,
  "published_at" timestamp,
  "published_by" text,
  "validation_note" text,
  "raw_suggestion" jsonb DEFAULT '{}'::jsonb,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "indexed_regulatory_rules" ADD CONSTRAINT "indexed_regulatory_rules_zone_id_regulatory_calibration_zones_id_fk"
  FOREIGN KEY ("zone_id") REFERENCES "public"."regulatory_calibration_zones"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "indexed_regulatory_rules" ADD CONSTRAINT "indexed_regulatory_rules_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "indexed_regulatory_rules" ADD CONSTRAINT "indexed_regulatory_rules_excerpt_id_calibrated_excerpts_id_fk"
  FOREIGN KEY ("excerpt_id") REFERENCES "public"."calibrated_excerpts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indexed_regulatory_rules_commune_idx" ON "indexed_regulatory_rules" USING btree ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indexed_regulatory_rules_zone_idx" ON "indexed_regulatory_rules" USING btree ("zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indexed_regulatory_rules_excerpt_idx" ON "indexed_regulatory_rules" USING btree ("excerpt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indexed_regulatory_rules_theme_idx" ON "indexed_regulatory_rules" USING btree ("theme_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indexed_regulatory_rules_status_idx" ON "indexed_regulatory_rules" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "regulatory_validation_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "from_status" text,
  "to_status" text,
  "action" text NOT NULL,
  "note" text,
  "user_id" text,
  "snapshot" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_validation_history_commune_idx" ON "regulatory_validation_history" USING btree ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_validation_history_entity_idx" ON "regulatory_validation_history" USING btree ("entity_type", "entity_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "regulatory_rule_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "zone_id" uuid,
  "left_rule_id" uuid NOT NULL,
  "right_rule_id" uuid NOT NULL,
  "theme_code" text NOT NULL,
  "conflict_type" text NOT NULL,
  "conflict_summary" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "resolution_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "regulatory_rule_conflicts" ADD CONSTRAINT "regulatory_rule_conflicts_zone_id_regulatory_calibration_zones_id_fk"
  FOREIGN KEY ("zone_id") REFERENCES "public"."regulatory_calibration_zones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "regulatory_rule_conflicts" ADD CONSTRAINT "regulatory_rule_conflicts_left_rule_id_indexed_regulatory_rules_id_fk"
  FOREIGN KEY ("left_rule_id") REFERENCES "public"."indexed_regulatory_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "regulatory_rule_conflicts" ADD CONSTRAINT "regulatory_rule_conflicts_right_rule_id_indexed_regulatory_rules_id_fk"
  FOREIGN KEY ("right_rule_id") REFERENCES "public"."indexed_regulatory_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_rule_conflicts_commune_idx" ON "regulatory_rule_conflicts" USING btree ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_rule_conflicts_zone_idx" ON "regulatory_rule_conflicts" USING btree ("zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_rule_conflicts_left_idx" ON "regulatory_rule_conflicts" USING btree ("left_rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_rule_conflicts_right_idx" ON "regulatory_rule_conflicts" USING btree ("right_rule_id");
