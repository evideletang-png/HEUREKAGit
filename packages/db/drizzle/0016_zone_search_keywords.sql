ALTER TABLE "regulatory_calibration_zones"
  ADD COLUMN IF NOT EXISTS "search_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;
