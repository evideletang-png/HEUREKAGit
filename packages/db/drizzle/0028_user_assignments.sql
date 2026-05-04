CREATE TABLE IF NOT EXISTS "user_assignments" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "actor_type" text NOT NULL,
  "role_key" text NOT NULL,
  "scope_type" text NOT NULL,
  "scope_id" text,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_assignments_user_id_idx" ON "user_assignments" ("user_id");
CREATE INDEX IF NOT EXISTS "user_assignments_scope_idx" ON "user_assignments" ("scope_type", "scope_id");
