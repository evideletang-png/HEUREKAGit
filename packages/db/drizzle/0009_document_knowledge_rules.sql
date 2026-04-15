CREATE TABLE "document_knowledge_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "base_ia_document_id" uuid,
  "town_hall_document_id" uuid,
  "municipality_id" text NOT NULL,
  "document_type" text NOT NULL,
  "document_subtype" text,
  "source_name" text NOT NULL,
  "source_url" text,
  "version_date" text,
  "opposable" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "text_extractable" boolean DEFAULT false NOT NULL,
  "ocr_status" text DEFAULT 'pending' NOT NULL,
  "extraction_mode" text DEFAULT 'manual_only' NOT NULL,
  "extraction_reliability" double precision DEFAULT 0,
  "manual_review_required" boolean DEFAULT false NOT NULL,
  "classifier_confidence" double precision DEFAULT 0,
  "source_authority" integer DEFAULT 0 NOT NULL,
  "raw_classification" jsonb DEFAULT '{}'::jsonb,
  "detected_zones" jsonb DEFAULT '[]'::jsonb,
  "structured_topics" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_knowledge_profiles" ADD CONSTRAINT "document_knowledge_profiles_base_ia_document_id_base_ia_documents_id_fk"
FOREIGN KEY ("base_ia_document_id") REFERENCES "public"."base_ia_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_knowledge_profiles" ADD CONSTRAINT "document_knowledge_profiles_town_hall_document_id_town_hall_documents_id_fk"
FOREIGN KEY ("town_hall_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "document_knowledge_profiles_municipality_idx" ON "document_knowledge_profiles" USING btree ("municipality_id");
--> statement-breakpoint
CREATE INDEX "document_knowledge_profiles_base_doc_idx" ON "document_knowledge_profiles" USING btree ("base_ia_document_id");
--> statement-breakpoint
CREATE INDEX "document_knowledge_profiles_town_hall_doc_idx" ON "document_knowledge_profiles" USING btree ("town_hall_document_id");
--> statement-breakpoint

CREATE TABLE "urban_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "base_ia_document_id" uuid,
  "town_hall_document_id" uuid,
  "source_document_id" text,
  "source_document_kind" text,
  "municipality_id" text NOT NULL,
  "zone_code" text,
  "subzone_code" text,
  "sector_code" text,
  "rule_family" text NOT NULL,
  "rule_topic" text NOT NULL,
  "rule_label" text NOT NULL,
  "rule_text_raw" text NOT NULL,
  "rule_summary" text,
  "rule_value_type" text,
  "rule_value_min" double precision,
  "rule_value_max" double precision,
  "rule_value_exact" double precision,
  "rule_unit" text,
  "rule_condition" text,
  "rule_exception" text,
  "rule_priority" integer DEFAULT 0 NOT NULL,
  "source_page" integer,
  "source_article" text,
  "source_excerpt" text,
  "source_authority" integer DEFAULT 0 NOT NULL,
  "is_opposable" boolean DEFAULT true NOT NULL,
  "confidence_score" double precision DEFAULT 0,
  "extraction_mode" text,
  "requires_manual_validation" boolean DEFAULT false NOT NULL,
  "review_status" text DEFAULT 'auto' NOT NULL,
  "validated_by_user" text,
  "validation_note" text,
  "rule_conflict_flag" boolean DEFAULT false NOT NULL,
  "raw_metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "urban_rules" ADD CONSTRAINT "urban_rules_base_ia_document_id_base_ia_documents_id_fk"
FOREIGN KEY ("base_ia_document_id") REFERENCES "public"."base_ia_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "urban_rules" ADD CONSTRAINT "urban_rules_town_hall_document_id_town_hall_documents_id_fk"
FOREIGN KEY ("town_hall_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "urban_rules_municipality_idx" ON "urban_rules" USING btree ("municipality_id");
--> statement-breakpoint
CREATE INDEX "urban_rules_zone_idx" ON "urban_rules" USING btree ("zone_code");
--> statement-breakpoint
CREATE INDEX "urban_rules_family_idx" ON "urban_rules" USING btree ("rule_family");
--> statement-breakpoint
CREATE INDEX "urban_rules_document_idx" ON "urban_rules" USING btree ("source_document_id");
--> statement-breakpoint

CREATE TABLE "urban_rule_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "municipality_id" text NOT NULL,
  "zone_code" text,
  "rule_family" text NOT NULL,
  "rule_topic" text NOT NULL,
  "left_rule_id" uuid NOT NULL,
  "right_rule_id" uuid NOT NULL,
  "conflict_type" text NOT NULL,
  "conflict_summary" text NOT NULL,
  "requires_manual_validation" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "resolution_note" text,
  "resolved_by" text,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "urban_rule_conflicts" ADD CONSTRAINT "urban_rule_conflicts_left_rule_id_urban_rules_id_fk"
FOREIGN KEY ("left_rule_id") REFERENCES "public"."urban_rules"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "urban_rule_conflicts" ADD CONSTRAINT "urban_rule_conflicts_right_rule_id_urban_rules_id_fk"
FOREIGN KEY ("right_rule_id") REFERENCES "public"."urban_rules"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "urban_rule_conflicts_municipality_idx" ON "urban_rule_conflicts" USING btree ("municipality_id");
--> statement-breakpoint
CREATE INDEX "urban_rule_conflicts_zone_idx" ON "urban_rule_conflicts" USING btree ("zone_code");
--> statement-breakpoint
CREATE INDEX "urban_rule_conflicts_left_rule_idx" ON "urban_rule_conflicts" USING btree ("left_rule_id");
--> statement-breakpoint
CREATE INDEX "urban_rule_conflicts_right_rule_idx" ON "urban_rule_conflicts" USING btree ("right_rule_id");
