import { pgTable, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";

export const geocodingCacheTable = pgTable("geocoding_cache", {
  // Normalized address is the primary key — lowercased, trimmed
  addressKey: text("address_key").primaryKey(),
  // Original address as submitted
  originalAddress: text("original_address").notNull(),
  // BAN API result fields
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  label: text("label").notNull(),
  banId: text("ban_id"),
  inseeCode: text("insee_code"),
  cityName: text("city_name"),
  score: doublePrecision("score"),
  /** JSON-serialised string[] of cadastral IDUs from BAN (e.g. '["75056000AB0042"]') */
  parcelles: text("parcelles"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Allow TTL-based expiry (null = never expires)
  expiresAt: timestamp("expires_at"),
});

export type GeocodingCache = typeof geocodingCacheTable.$inferSelect;
export type InsertGeocodingCache = typeof geocodingCacheTable.$inferInsert;
