ALTER TABLE "regulatory_calibration_zones"
  ADD COLUMN IF NOT EXISTS "reference_start_page" integer;

ALTER TABLE "regulatory_calibration_zones"
  ADD COLUMN IF NOT EXISTS "reference_end_page" integer;
