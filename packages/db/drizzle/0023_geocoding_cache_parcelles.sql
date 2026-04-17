-- Add parcelles column to geocoding_cache to store BAN cadastral IDUs
ALTER TABLE "geocoding_cache"
  ADD COLUMN IF NOT EXISTS "parcelles" text;
