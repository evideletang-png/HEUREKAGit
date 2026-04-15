CREATE TABLE IF NOT EXISTS "zone_thematic_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "zone_id" uuid NOT NULL,
  "overlay_id" uuid,
  "document_id" uuid NOT NULL,
  "source_page_start" integer NOT NULL,
  "source_page_end" integer,
  "anchor_type" text DEFAULT 'section' NOT NULL,
  "anchor_label" text,
  "theme_code" text NOT NULL,
  "source_text_full" text NOT NULL,
  "source_text_normalized" text,
  "visual_attachment_meta" jsonb DEFAULT '{}'::jsonb,
  "derived_from_ai" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'suggested' NOT NULL,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "zone_thematic_segments" ADD CONSTRAINT "zone_thematic_segments_zone_id_regulatory_calibration_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."regulatory_calibration_zones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "zone_thematic_segments" ADD CONSTRAINT "zone_thematic_segments_overlay_id_regulatory_overlays_id_fk" FOREIGN KEY ("overlay_id") REFERENCES "public"."regulatory_overlays"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "zone_thematic_segments" ADD CONSTRAINT "zone_thematic_segments_document_id_town_hall_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "zone_thematic_segments_commune_idx" ON "zone_thematic_segments" USING btree ("commune_id");
CREATE INDEX IF NOT EXISTS "zone_thematic_segments_zone_idx" ON "zone_thematic_segments" USING btree ("zone_id");
CREATE INDEX IF NOT EXISTS "zone_thematic_segments_overlay_idx" ON "zone_thematic_segments" USING btree ("overlay_id");
CREATE INDEX IF NOT EXISTS "zone_thematic_segments_document_idx" ON "zone_thematic_segments" USING btree ("document_id");
CREATE INDEX IF NOT EXISTS "zone_thematic_segments_theme_idx" ON "zone_thematic_segments" USING btree ("theme_code");
CREATE INDEX IF NOT EXISTS "zone_thematic_segments_status_idx" ON "zone_thematic_segments" USING btree ("status");

ALTER TABLE "calibrated_excerpts" ADD COLUMN IF NOT EXISTS "segment_id" uuid;
DO $$ BEGIN
 ALTER TABLE "calibrated_excerpts" ADD CONSTRAINT "calibrated_excerpts_segment_id_zone_thematic_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."zone_thematic_segments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "calibrated_excerpts_segment_idx" ON "calibrated_excerpts" USING btree ("segment_id");

ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "segment_id" uuid;
DO $$ BEGIN
 ALTER TABLE "indexed_regulatory_rules" ADD CONSTRAINT "indexed_regulatory_rules_segment_id_zone_thematic_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."zone_thematic_segments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "indexed_regulatory_rules_segment_idx" ON "indexed_regulatory_rules" USING btree ("segment_id");
