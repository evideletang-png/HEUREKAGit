CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'mairie', 'citoyen', 'metropole', 'abf', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('draft', 'collecting_data', 'parsing_documents', 'extracting_rules', 'calculating', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."document_review_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('permis_de_construire', 'declaration_prealable', 'permis_amenager', 'certificat_urbanisme', 'autre');--> statement-breakpoint
CREATE TYPE "public"."piece_status" AS ENUM('valide', 'manquante', 'incorrecte');--> statement-breakpoint
CREATE TYPE "public"."timeline_step" AS ENUM('depot', 'analyse', 'instruction', 'pieces', 'decision');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'citoyen' NOT NULL,
	"communes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"address" text NOT NULL,
	"city" text,
	"postal_code" text,
	"parcel_ref" text,
	"zone_code" text,
	"zoning_label" text,
	"status" "analysis_status" DEFAULT 'draft' NOT NULL,
	"summary" text,
	"confidence_score" double precision,
	"geo_context_json" text,
	"global_score" integer DEFAULT 100,
	"severity_weights_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildability_results" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"max_footprint_m2" double precision,
	"remaining_footprint_m2" double precision,
	"max_height_m" double precision,
	"setback_road_m" double precision,
	"setback_boundary_m" double precision,
	"parking_requirement" text,
	"green_space_requirement" text,
	"assumptions_json" text,
	"confidence_score" double precision DEFAULT 0 NOT NULL,
	"result_summary" text
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"footprint_m2" double precision,
	"estimated_floor_area_m2" double precision,
	"avg_height_m" double precision,
	"avg_floors" double precision,
	"geometry_json" text,
	"metadata_json" text
);
--> statement-breakpoint
CREATE TABLE "constraints" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"step" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"payload_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"html_content" text,
	"pdf_path" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parcels" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"cadastral_section" text,
	"parcel_number" text,
	"parcel_surface_m2" double precision,
	"geometry_json" text,
	"centroid_lat" double precision,
	"centroid_lng" double precision,
	"road_frontage_length_m" double precision,
	"side_boundary_length_m" double precision,
	"metadata_json" text
);
--> statement-breakpoint
CREATE TABLE "planning_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"document_type" text,
	"title" text,
	"source_url" text,
	"file_path" text,
	"raw_text" text,
	"parsed_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"zone_analysis_id" text NOT NULL,
	"article_number" integer NOT NULL,
	"title" text NOT NULL,
	"source_text" text,
	"summary" text,
	"structured_json" text,
	"impact_text" text,
	"vigilance_text" text,
	"confidence" text DEFAULT 'unknown'
);
--> statement-breakpoint
CREATE TABLE "zone_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"zone_code" text,
	"zone_label" text,
	"source_excerpt" text,
	"structured_json" text,
	"issues_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"analysis_id" uuid,
	"dossier_id" uuid,
	"piece_code" text,
	"title" text NOT NULL,
	"document_type" "document_type" DEFAULT 'permis_de_construire' NOT NULL,
	"file_name" text,
	"raw_text" text,
	"extracted_data_json" text,
	"comparison_result_json" text,
	"status" "document_review_status" DEFAULT 'pending' NOT NULL,
	"piece_status" "piece_status" DEFAULT 'manquante',
	"is_requested" boolean DEFAULT false,
	"is_resolved" boolean DEFAULT false,
	"timeline_step" timeline_step DEFAULT 'depot' NOT NULL,
	"commune" text,
	"address" text,
	"parcel_ref" text,
	"zone_code" text,
	"zone_label" text,
	"document_nature" text,
	"expertise_notes" text,
	"failure_reason" text,
	"file_hash" text,
	"confidence_score" double precision,
	"citations_json" text,
	"geometry_json" text,
	"service_visibility" jsonb DEFAULT '["citoyen","mairie"]'::jsonb,
	"version" text DEFAULT '1',
	"parent_id" uuid,
	"has_vision_analysis" boolean DEFAULT false,
	"vision_result_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"from_role" text NOT NULL,
	"document_id" text,
	"content" text NOT NULL,
	"parent_id" integer,
	"mentions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "town_hall_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"commune" text,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"raw_text" text NOT NULL,
	"category" text,
	"sub_category" text,
	"document_type" text,
	"explanatory_note" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"zone" text,
	"is_regulatory" boolean DEFAULT true,
	"is_opposable" boolean DEFAULT true,
	"structured_content" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "town_hall_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commune" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "town_hall_prompts_commune_unique" UNIQUE("commune")
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commune" text NOT NULL,
	"zone_code" text NOT NULL,
	"article" text NOT NULL,
	"category" text NOT NULL,
	"operator" text DEFAULT '<=' NOT NULL,
	"rule_type" text DEFAULT 'numeric' NOT NULL,
	"expression" text,
	"parameters" jsonb,
	"source_citations" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"base_data" jsonb NOT NULL,
	"modified_data" jsonb NOT NULL,
	"score_delta" double precision,
	"recommendations" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipality_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commune" text NOT NULL,
	"strictness_map" jsonb,
	"common_issues" jsonb,
	"favorable_count" integer DEFAULT 0,
	"unfavorable_count" integer DEFAULT 0,
	"patterns" jsonb,
	"overrides" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "municipality_learnings_commune_unique" UNIQUE("commune")
);
--> statement-breakpoint
CREATE TABLE "base_ia_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_ia_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"municipality_id" text,
	"zone_code" text,
	"category" text,
	"sub_category" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"type" text DEFAULT 'plu' NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"error_message" text,
	"raw_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type_procedure" text NOT NULL,
	"status" text DEFAULT 'BROUILLON' NOT NULL,
	"dossier_number" text,
	"title" text NOT NULL,
	"address" text,
	"commune" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"assigned_metropole_id" text,
	"assigned_abf_id" text,
	"is_abf_concerned" boolean DEFAULT false,
	"instruction_started_at" timestamp,
	"timeline" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipality_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commune" text NOT NULL,
	"insee_code" text,
	"ta_rate_communal" double precision DEFAULT 0.05,
	"ta_rate_dept" double precision DEFAULT 0.025,
	"taxe_fonciere_rate" double precision DEFAULT 0.4,
	"teom_rate" double precision DEFAULT 0.12,
	"rap_rate" double precision DEFAULT 0.004,
	"valeur_forfaitaire_ta" integer DEFAULT 900,
	"valeur_forfaitaire_piscine" integer DEFAULT 250,
	"valeur_forfaitaire_stationnement" integer DEFAULT 2000,
	"prix_m2_maison" integer DEFAULT 2500,
	"prix_m2_collectif" integer DEFAULT 3000,
	"yield_maison" double precision DEFAULT 0.04,
	"yield_collectif" double precision DEFAULT 0.05,
	"abattement_rp" double precision DEFAULT 0.5,
	"surface_abattement" integer DEFAULT 100,
	"metropole_id" text,
	"epci_code" text,
	"epci_label" text,
	"formulas" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "municipality_settings_commune_unique" UNIQUE("commune")
);
--> statement-breakpoint
CREATE TABLE "global_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "global_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "base_ia_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"municipality_id" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"page_number" integer,
	"content" text NOT NULL,
	"embedding" text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dossier_id" uuid NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"insee_code" text NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"zip_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "communes_name_unique" UNIQUE("name"),
	CONSTRAINT "communes_insee_code_unique" UNIQUE("insee_code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"dossier_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildability_results" ADD CONSTRAINT "buildability_results_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constraints" ADD CONSTRAINT "constraints_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_documents" ADD CONSTRAINT "planning_documents_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_articles" ADD CONSTRAINT "rule_articles_zone_analysis_id_zone_analyses_id_fk" FOREIGN KEY ("zone_analysis_id") REFERENCES "public"."zone_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_analyses" ADD CONSTRAINT "zone_analyses_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_ia_embeddings" ADD CONSTRAINT "base_ia_embeddings_document_id_base_ia_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."base_ia_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_events" ADD CONSTRAINT "dossier_events_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_events" ADD CONSTRAINT "dossier_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."dossiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "municipality_idx" ON "base_ia_embeddings" USING btree ("municipality_id");--> statement-breakpoint
CREATE INDEX "metadata_idx" ON "base_ia_embeddings" USING btree ("metadata");