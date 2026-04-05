CREATE TABLE "town_hall_upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"commune" text,
	"title" text,
	"original_file_name" text NOT NULL,
	"stored_file_name" text NOT NULL,
	"mime_type" text,
	"file_size" integer NOT NULL,
	"received_bytes" integer DEFAULT 0 NOT NULL,
	"category" text,
	"sub_category" text,
	"document_type" text,
	"zone" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'uploading' NOT NULL,
	"error_message" text,
	"town_hall_document_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "town_hall_upload_sessions" ADD CONSTRAINT "town_hall_upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "town_hall_upload_sessions" ADD CONSTRAINT "town_hall_upload_sessions_town_hall_document_id_town_hall_documents_id_fk" FOREIGN KEY ("town_hall_document_id") REFERENCES "public"."town_hall_documents"("id") ON DELETE set null ON UPDATE no action;
