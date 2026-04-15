ALTER TABLE "municipality_settings"
  ADD COLUMN IF NOT EXISTS "citizen_portal_town_hall_name" text,
  ADD COLUMN IF NOT EXISTS "citizen_portal_address_line1" text,
  ADD COLUMN IF NOT EXISTS "citizen_portal_address_line2" text,
  ADD COLUMN IF NOT EXISTS "citizen_portal_postal_code" text,
  ADD COLUMN IF NOT EXISTS "citizen_portal_city" text,
  ADD COLUMN IF NOT EXISTS "citizen_portal_phone" text,
  ADD COLUMN IF NOT EXISTS "citizen_portal_email" text,
  ADD COLUMN IF NOT EXISTS "citizen_portal_hours" text;
