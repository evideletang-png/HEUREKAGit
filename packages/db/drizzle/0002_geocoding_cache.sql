CREATE TABLE IF NOT EXISTS "geocoding_cache" (
  "address_key"      text PRIMARY KEY,
  "original_address" text NOT NULL,
  "lat"              double precision NOT NULL,
  "lng"              double precision NOT NULL,
  "label"            text NOT NULL,
  "ban_id"           text,
  "insee_code"       text,
  "city_name"        text,
  "score"            double precision,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "expires_at"       timestamp
);--> statement-breakpoint

-- Index for TTL cleanup queries
CREATE INDEX IF NOT EXISTS "geocoding_cache_expires_idx"
  ON "geocoding_cache" ("expires_at")
  WHERE "expires_at" IS NOT NULL;
