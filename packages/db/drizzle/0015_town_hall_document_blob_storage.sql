ALTER TABLE "town_hall_documents"
  ADD COLUMN IF NOT EXISTS "mime_type" text;

ALTER TABLE "town_hall_documents"
  ADD COLUMN IF NOT EXISTS "file_size" integer;

ALTER TABLE "town_hall_documents"
  ADD COLUMN IF NOT EXISTS "has_stored_blob" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "town_hall_document_files" (
  "document_id" uuid PRIMARY KEY NOT NULL,
  "mime_type" text,
  "file_size" integer,
  "file_base64" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "town_hall_document_files"
    ADD CONSTRAINT "town_hall_document_files_document_id_town_hall_documents_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "public"."town_hall_documents"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "town_hall_document_files_created_at_idx"
  ON "town_hall_document_files" ("created_at");
