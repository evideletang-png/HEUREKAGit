CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linked_urbanism_case_id" uuid,
	"appeal_type" text DEFAULT 'signalement' NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"claimant_role" text NOT NULL,
	"claimant_identity" jsonb DEFAULT '{}'::jsonb,
	"beneficiary_identity" jsonb DEFAULT '{}'::jsonb,
	"authority_identity" jsonb DEFAULT '{}'::jsonb,
	"project_address" text,
	"decision_reference" text,
	"permit_type" text,
	"posting_start_date" timestamp,
	"posting_evidence_status" text DEFAULT 'a_confirmer',
	"filing_date" timestamp,
	"notification_to_authority_date" timestamp,
	"notification_to_beneficiary_date" timestamp,
	"admissibility_score" double precision,
	"urban_risk_score" double precision,
	"summary" text,
	"commune" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"party_role" text NOT NULL,
	"identity" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_grounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"linked_plu_article" text,
	"linked_document_id" text,
	"linked_extracted_metric" text,
	"seriousness_score" double precision,
	"response_draft" text,
	"status" text DEFAULT 'a_qualifier' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"uploaded_by" text,
	"title" text NOT NULL,
	"category" text,
	"file_name" text NOT NULL,
	"original_file_name" text,
	"mime_type" text,
	"file_size" integer,
	"extracted_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'a_envoyer' NOT NULL,
	"target_role" text,
	"target_user_id" text,
	"due_at" timestamp,
	"sent_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" text DEFAULT 'a_surveiller' NOT NULL,
	"completed_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appeal_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appeal_id" uuid NOT NULL,
	"from_user_id" text NOT NULL,
	"from_role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_linked_urbanism_case_id_dossiers_id_fk" FOREIGN KEY ("linked_urbanism_case_id") REFERENCES "public"."dossiers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_parties" ADD CONSTRAINT "appeal_parties_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_grounds" ADD CONSTRAINT "appeal_grounds_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_documents" ADD CONSTRAINT "appeal_documents_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_documents" ADD CONSTRAINT "appeal_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_events" ADD CONSTRAINT "appeal_events_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_events" ADD CONSTRAINT "appeal_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_notifications" ADD CONSTRAINT "appeal_notifications_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_notifications" ADD CONSTRAINT "appeal_notifications_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_deadlines" ADD CONSTRAINT "appeal_deadlines_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_messages" ADD CONSTRAINT "appeal_messages_appeal_id_appeals_id_fk" FOREIGN KEY ("appeal_id") REFERENCES "public"."appeals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appeal_messages" ADD CONSTRAINT "appeal_messages_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
