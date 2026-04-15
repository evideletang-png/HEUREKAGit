ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "is_relational_rule" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "requires_cross_document_resolution" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "resolution_status" text DEFAULT 'standalone' NOT NULL;
--> statement-breakpoint
ALTER TABLE "indexed_regulatory_rules" ADD COLUMN IF NOT EXISTS "linked_rule_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rule_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_rule_id" uuid NOT NULL,
  "target_rule_id" uuid,
  "source_document_id" uuid NOT NULL,
  "target_document_id" uuid,
  "relation_type" text NOT NULL,
  "relation_scope" text DEFAULT 'rule' NOT NULL,
  "condition_text" text,
  "priority_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rule_relations" ADD CONSTRAINT "rule_relations_source_rule_id_indexed_regulatory_rules_id_fk"
  FOREIGN KEY ("source_rule_id") REFERENCES "public"."indexed_regulatory_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rule_relations" ADD CONSTRAINT "rule_relations_target_rule_id_indexed_regulatory_rules_id_fk"
  FOREIGN KEY ("target_rule_id") REFERENCES "public"."indexed_regulatory_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rule_relations" ADD CONSTRAINT "rule_relations_source_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rule_relations" ADD CONSTRAINT "rule_relations_target_document_id_town_hall_documents_id_fk"
  FOREIGN KEY ("target_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_relations_source_rule_idx" ON "rule_relations" USING btree ("source_rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_relations_target_rule_idx" ON "rule_relations" USING btree ("target_rule_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_relations_source_document_idx" ON "rule_relations" USING btree ("source_document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_relations_target_document_idx" ON "rule_relations" USING btree ("target_document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_relations_relation_type_idx" ON "rule_relations" USING btree ("relation_type");
