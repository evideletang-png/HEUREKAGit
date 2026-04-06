ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "review_status" text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "reviewed_start_page" integer;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "reviewed_end_page" integer;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "reviewed_parent_zone_code" text;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "reviewed_is_sub_zone" boolean;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "review_notes" text;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "reviewed_by" text;
--> statement-breakpoint
ALTER TABLE "regulatory_zone_sections"
ADD COLUMN "reviewed_at" timestamp;
