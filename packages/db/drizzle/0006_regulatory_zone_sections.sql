CREATE TABLE "regulatory_zone_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_ia_document_id" uuid,
	"town_hall_document_id" uuid,
	"municipality_id" text NOT NULL,
	"zone_code" text NOT NULL,
	"parent_zone_code" text,
	"heading" text NOT NULL,
	"source_text" text NOT NULL,
	"start_offset" integer,
	"end_offset" integer,
	"start_page" integer,
	"end_page" integer,
	"is_sub_zone" boolean DEFAULT false NOT NULL,
	"document_type" text,
	"source_authority" integer DEFAULT 0 NOT NULL,
	"is_opposable" boolean DEFAULT true NOT NULL,
	"parser_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections" ADD CONSTRAINT "regulatory_zone_sections_base_ia_document_id_base_ia_documents_id_fk" FOREIGN KEY ("base_ia_document_id") REFERENCES "public"."base_ia_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections" ADD CONSTRAINT "regulatory_zone_sections_town_hall_document_id_town_hall_documents_id_fk" FOREIGN KEY ("town_hall_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "regulatory_zone_sections_municipality_idx" ON "regulatory_zone_sections" ("municipality_id");
--> statement-breakpoint
CREATE INDEX "regulatory_zone_sections_zone_idx" ON "regulatory_zone_sections" ("zone_code");
--> statement-breakpoint
CREATE INDEX "regulatory_zone_sections_document_idx" ON "regulatory_zone_sections" ("base_ia_document_id");
