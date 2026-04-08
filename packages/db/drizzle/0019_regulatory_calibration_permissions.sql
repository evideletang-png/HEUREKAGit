CREATE TABLE IF NOT EXISTS "regulatory_calibration_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "commune_id" text NOT NULL,
  "user_id" text NOT NULL,
  "can_edit_calibration" boolean DEFAULT false NOT NULL,
  "can_publish_rules" boolean DEFAULT false NOT NULL,
  "can_manage_permissions" boolean DEFAULT false NOT NULL,
  "assigned_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "regulatory_calibration_permissions"
 ADD CONSTRAINT "reg_calibration_permissions_user_fk"
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "regulatory_calibration_permissions"
 ADD CONSTRAINT "reg_calibration_permissions_assigned_by_fk"
 FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "reg_calibration_permissions_commune_idx" ON "regulatory_calibration_permissions" USING btree ("commune_id");
CREATE INDEX IF NOT EXISTS "reg_calibration_permissions_user_idx" ON "regulatory_calibration_permissions" USING btree ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "reg_calibration_permissions_commune_user_uidx" ON "regulatory_calibration_permissions" USING btree ("commune_id", "user_id");
