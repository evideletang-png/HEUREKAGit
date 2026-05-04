CREATE TABLE IF NOT EXISTS "town_hall_upload_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "start" integer NOT NULL,
  "size" integer NOT NULL,
  "chunk_base64" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "town_hall_upload_chunks" ADD CONSTRAINT "town_hall_upload_chunks_session_id_town_hall_upload_sessions_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."town_hall_upload_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "town_hall_upload_chunks_session_start_idx"
ON "town_hall_upload_chunks" USING btree ("session_id", "start");
