CREATE TABLE IF NOT EXISTS "messaging_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dossier_id" uuid NOT NULL,
  "subject" text,
  "visibility" text DEFAULT 'INTERNAL' NOT NULL,
  "created_by" text,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "messaging_conversation_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "role" text DEFAULT 'PARTICIPANT' NOT NULL,
  "can_see_internal" boolean DEFAULT false NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "left_at" timestamp
);

CREATE TABLE IF NOT EXISTS "messaging_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "author_actor_type" text NOT NULL,
  "author_id" text NOT NULL,
  "body" text NOT NULL,
  "visibility" text DEFAULT 'INTERNAL' NOT NULL,
  "parent_message_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp,
  "edited_at" timestamp
);

CREATE TABLE IF NOT EXISTS "messaging_message_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "mentioned_actor_type" text NOT NULL,
  "mentioned_actor_id" text NOT NULL,
  "notified_at" timestamp
);

CREATE TABLE IF NOT EXISTS "messaging_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_key" text NOT NULL,
  "scan_status" text DEFAULT 'PENDING' NOT NULL,
  "scan_completed_at" timestamp,
  "scan_details" jsonb DEFAULT '{}'::jsonb,
  "uploaded_by_actor_type" text NOT NULL,
  "uploaded_by_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "messaging_notification_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_actor_type" text NOT NULL,
  "recipient_id" text NOT NULL,
  "event_type" text NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message_id" uuid,
  "read_at" timestamp,
  "sent_channels" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_dossier_id_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "dossiers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_conversation_participants" ADD CONSTRAINT "messaging_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_message_mentions" ADD CONSTRAINT "messaging_mentions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messaging_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_attachments" ADD CONSTRAINT "messaging_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messaging_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_notification_events" ADD CONSTRAINT "messaging_notification_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "messaging_notification_events" ADD CONSTRAINT "messaging_notification_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "messaging_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "messaging_conversations_dossier_idx" ON "messaging_conversations" USING btree ("dossier_id");
CREATE INDEX IF NOT EXISTS "messaging_conversations_visibility_idx" ON "messaging_conversations" USING btree ("visibility");
CREATE INDEX IF NOT EXISTS "messaging_participants_conversation_idx" ON "messaging_conversation_participants" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "messaging_participants_actor_idx" ON "messaging_conversation_participants" USING btree ("actor_type", "actor_id");
CREATE INDEX IF NOT EXISTS "messaging_messages_conversation_idx" ON "messaging_messages" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "messaging_messages_visibility_idx" ON "messaging_messages" USING btree ("visibility");
CREATE INDEX IF NOT EXISTS "messaging_messages_created_at_idx" ON "messaging_messages" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "messaging_mentions_message_idx" ON "messaging_message_mentions" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "messaging_mentions_actor_idx" ON "messaging_message_mentions" USING btree ("mentioned_actor_type", "mentioned_actor_id");
CREATE INDEX IF NOT EXISTS "messaging_attachments_message_idx" ON "messaging_attachments" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "messaging_attachments_scan_status_idx" ON "messaging_attachments" USING btree ("scan_status");
CREATE INDEX IF NOT EXISTS "messaging_notification_events_recipient_idx" ON "messaging_notification_events" USING btree ("recipient_actor_type", "recipient_id");
CREATE INDEX IF NOT EXISTS "messaging_notification_events_conversation_idx" ON "messaging_notification_events" USING btree ("conversation_id");
