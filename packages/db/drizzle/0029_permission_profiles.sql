CREATE TABLE IF NOT EXISTS "permission_profiles" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "key" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "description" text,
  "actor_type" text NOT NULL,
  "role_key" text NOT NULL,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "permission_profiles_actor_role_idx" ON "permission_profiles" ("actor_type", "role_key");

ALTER TABLE "user_assignments" ADD COLUMN IF NOT EXISTS "profile_key" text;
