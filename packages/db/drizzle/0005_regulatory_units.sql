CREATE TABLE "regulatory_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_ia_document_id" uuid,
	"town_hall_document_id" uuid,
	"municipality_id" text NOT NULL,
	"zone_code" text,
	"document_type" text,
	"theme" text NOT NULL,
	"article_number" integer,
	"title" text NOT NULL,
	"source_text" text NOT NULL,
	"parsed_values" jsonb DEFAULT '{}'::jsonb,
	"confidence" text DEFAULT 'low' NOT NULL,
	"source_authority" integer DEFAULT 0 NOT NULL,
	"is_opposable" boolean DEFAULT true NOT NULL,
	"parser_version" text DEFAULT 'v2' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulatory_units" ADD CONSTRAINT "regulatory_units_base_ia_document_id_base_ia_documents_id_fk" FOREIGN KEY ("base_ia_document_id") REFERENCES "public"."base_ia_documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "regulatory_units" ADD CONSTRAINT "regulatory_units_town_hall_document_id_town_hall_documents_id_fk" FOREIGN KEY ("town_hall_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "regulatory_units_municipality_idx" ON "regulatory_units" ("municipality_id");
--> statement-breakpoint
CREATE INDEX "regulatory_units_zone_idx" ON "regulatory_units" ("zone_code");
