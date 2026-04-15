ALTER TABLE "regulatory_units"
ADD COLUMN "review_status" text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE "regulatory_units"
ADD COLUMN "review_notes" text;
--> statement-breakpoint
ALTER TABLE "regulatory_units"
ADD COLUMN "reviewed_by" text;
--> statement-breakpoint
ALTER TABLE "regulatory_units"
ADD COLUMN "reviewed_at" timestamp;
