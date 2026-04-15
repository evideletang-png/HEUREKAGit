CREATE TABLE IF NOT EXISTS "regulatory_overlays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "overlay_code" text NOT NULL,
  "overlay_label" text,
  "overlay_type" text NOT NULL,
  "geometry_ref" text,
  "guidance_notes" text,
  "priority" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_overlays_commune_idx" ON "regulatory_overlays" USING btree ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_overlays_code_idx" ON "regulatory_overlays" USING btree ("overlay_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regulatory_overlays_type_idx" ON "regulatory_overlays" USING btree ("overlay_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "overlay_document_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "overlay_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "role" text DEFAULT 'supporting' NOT NULL,
  "structure_mode" text DEFAULT 'mixed' NOT NULL,
  "source_priority" integer DEFAULT 0 NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "overlay_document_bindings" ADD CONSTRAINT "overlay_document_bindings_overlay_id_regulatory_overlays_id_fk"
  FOREIGN KEY ("overlay_id") REFERENCES "public"."regulatory_overlays"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "overlay_document_bindings" ADD CONSTRAINT "overlay_document_bindings_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "overlay_document_bindings_commune_idx" ON "overlay_document_bindings" USING btree ("commune_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "overlay_document_bindings_overlay_idx" ON "overlay_document_bindings" USING btree ("overlay_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "overlay_document_bindings_document_idx" ON "overlay_document_bindings" USING btree ("document_id");
--> statement-breakpoint

ALTER TABLE "calibrated_excerpts" ALTER COLUMN "zone_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "calibrated_excerpts" ADD COLUMN IF NOT EXISTS "overlay_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "calibrated_excerpts" ADD CONSTRAINT "calibrated_excerpts_overlay_id_regulatory_overlays_id_fk"
  FOREIGN KEY ("overlay_id") REFERENCES "public"."regulatory_overlays"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calibrated_excerpts_overlay_idx" ON "calibrated_excerpts" USING btree ("overlay_id");
--> statement-breakpoint

ALTER TABLE "indexed_regulatory_rules" ALTER COLUMN "zone_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "overlay_id" uuid;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "overlay_type" text;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "normative_effect" text DEFAULT 'primary' NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "procedural_effect" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "applicability_scope" text DEFAULT 'main_zone' NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "rule_anchor_type" text DEFAULT 'article' NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "rule_anchor_label" text;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "conflict_resolution_status" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "indexed_regulatory_rules" ADD CONSTRAINT "indexed_regulatory_rules_overlay_id_regulatory_overlays_id_fk"
  FOREIGN KEY ("overlay_id") REFERENCES "public"."regulatory_overlays"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indexed_regulatory_rules_overlay_idx" ON "indexed_regulatory_rules" USING btree ("overlay_id");
