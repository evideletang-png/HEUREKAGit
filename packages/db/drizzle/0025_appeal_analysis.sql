CREATE TABLE IF NOT EXISTS "appeal_document_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "appeal_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "status" text DEFAULT 'processing' NOT NULL,
  "summary" text,
  "extracted_text" text,
  "analysis_json" jsonb DEFAULT '{}'::jsonb,
  "global_admissibility_score" double precision,
  "warnings" jsonb DEFAULT '[]'::jsonb,
  "failure_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "appeal_ground_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "appeal_id" uuid NOT NULL,
  "document_analysis_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "title" text NOT NULL,
  "category" text DEFAULT 'autre' NOT NULL,
  "source_text" text NOT NULL,
  "claimant_argument" text,
  "procedural_assessment" jsonb DEFAULT '{}'::jsonb,
  "substantive_assessment" jsonb DEFAULT '{}'::jsonb,
  "admissibility_label" text DEFAULT 'a_confirmer' NOT NULL,
  "opposability_label" text DEFAULT 'a_confirmer' NOT NULL,
  "confidence" text DEFAULT 'low' NOT NULL,
  "seriousness_score" double precision,
  "required_checks" jsonb DEFAULT '[]'::jsonb,
  "sources" jsonb DEFAULT '[]'::jsonb,
  "response_draft" text,
  "status" text DEFAULT 'suggested' NOT NULL,
  "accepted_ground_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "appeal_document_analyses" ADD CONSTRAINT "appeal_document_analyses_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "appeals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "appeal_document_analyses" ADD CONSTRAINT "appeal_document_analyses_document_id_appeal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "appeal_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "appeal_ground_suggestions" ADD CONSTRAINT "appeal_ground_suggestions_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "appeals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "appeal_ground_suggestions" ADD CONSTRAINT "appeal_ground_suggestions_document_analysis_id_appeal_document_analyses_id_fk" FOREIGN KEY ("document_analysis_id") REFERENCES "appeal_document_analyses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "appeal_ground_suggestions" ADD CONSTRAINT "appeal_ground_suggestions_document_id_appeal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "appeal_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "appeal_ground_suggestions" ADD CONSTRAINT "appeal_ground_suggestions_accepted_ground_id_appeal_grounds_id_fk" FOREIGN KEY ("accepted_ground_id") REFERENCES "appeal_grounds"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "appeal_document_analyses_appeal_idx" ON "appeal_document_analyses" USING btree ("appeal_id");
CREATE INDEX IF NOT EXISTS "appeal_document_analyses_document_idx" ON "appeal_document_analyses" USING btree ("document_id");
CREATE INDEX IF NOT EXISTS "appeal_document_analyses_status_idx" ON "appeal_document_analyses" USING btree ("status");
CREATE INDEX IF NOT EXISTS "appeal_ground_suggestions_appeal_idx" ON "appeal_ground_suggestions" USING btree ("appeal_id");
CREATE INDEX IF NOT EXISTS "appeal_ground_suggestions_document_idx" ON "appeal_ground_suggestions" USING btree ("document_id");
CREATE INDEX IF NOT EXISTS "appeal_ground_suggestions_analysis_idx" ON "appeal_ground_suggestions" USING btree ("document_analysis_id");
CREATE INDEX IF NOT EXISTS "appeal_ground_suggestions_status_idx" ON "appeal_ground_suggestions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "appeal_ground_suggestions_admissibility_idx" ON "appeal_ground_suggestions" USING btree ("admissibility_label");
