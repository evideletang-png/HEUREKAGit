/**
 * regulatory_zones — unified zone table (Phase 1 of zone-centric refactor)
 *
 * Replaces the role of `regulatory_calibration_zones` with a cleaner shape.
 * The legacy table is kept in parallel during Phase 1; data is mirrored via
 * migration. Phase 2 will switch the orchestrator and rename legacy.
 *
 * `legacyZoneId` allows joining back to `regulatory_calibration_zones`
 * during the transition period.
 */
import { pgTable, text, timestamp, uuid, jsonb, index, doublePrecision } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const regulatoryZonesTable = pgTable("regulatory_zones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  zoneCode: text("zone_code").notNull(),
  zoneLabel: text("zone_label"),
  zoneType: text("zone_type"), // U | AU | A | N | derived
  summary: text("summary"),
  geometry: jsonb("geometry"), // GeoJSON, nullable
  status: text("status").notNull().default("draft"), // draft | validated
  confidenceScore: doublePrecision("confidence_score"),
  legacyZoneId: uuid("legacy_zone_id"), // → regulatory_calibration_zones.id (no FK to avoid coupling)
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx:    index("regulatory_zones_commune_idx").on(table.communeId),
  codeIdx:       index("regulatory_zones_code_idx").on(table.zoneCode),
  statusIdx:     index("regulatory_zones_status_idx").on(table.status),
  legacyIdx:     index("regulatory_zones_legacy_idx").on(table.legacyZoneId),
  communeCodeIdx: index("regulatory_zones_commune_code_idx").on(table.communeId, table.zoneCode),
}));

export const selectRegulatoryZoneSchema = createSelectSchema(regulatoryZonesTable);
export const insertRegulatoryZoneSchema = createInsertSchema(regulatoryZonesTable);

export type RegulatoryZone = typeof regulatoryZonesTable.$inferSelect;
export type InsertRegulatoryZone = typeof regulatoryZonesTable.$inferInsert;
