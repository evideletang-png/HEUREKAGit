CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "address" text,
  "parcel_references" jsonb DEFAULT '[]'::jsonb,
  "latitude" double precision,
  "longitude" double precision,
  "commune" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "project_type" text DEFAULT 'urbanisme',
  "progress" integer DEFAULT 0 NOT NULL,
  "detected_constraints" jsonb DEFAULT '[]'::jsonb,
  "main_plu_zone" text,
  "used_modules" jsonb DEFAULT '[]'::jsonb,
  "alerts" jsonb DEFAULT '[]'::jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "projects_user_updated_idx"
ON "projects" USING btree ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "project_timeline_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "actor_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "project_timeline_events" ADD CONSTRAINT "project_timeline_events_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "project_timeline_events" ADD CONSTRAINT "project_timeline_events_actor_id_users_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "project_timeline_events_project_created_idx"
ON "project_timeline_events" USING btree ("project_id", "created_at");
