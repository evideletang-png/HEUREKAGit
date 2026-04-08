import { pgTable, text, timestamp, uuid, boolean, integer, index, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const regulatoryCalibrationZonesTable = pgTable("regulatory_calibration_zones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  zoneCode: text("zone_code").notNull(),
  zoneLabel: text("zone_label"),
  parentZoneCode: text("parent_zone_code"),
  sectorCode: text("sector_code"),
  guidanceNotes: text("guidance_notes"),
  searchKeywords: jsonb("search_keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("regulatory_calibration_zones_commune_idx").on(table.communeId),
  codeIdx: index("regulatory_calibration_zones_code_idx").on(table.zoneCode),
}));

export const selectRegulatoryCalibrationZoneSchema = createSelectSchema(regulatoryCalibrationZonesTable);
export const insertRegulatoryCalibrationZoneSchema = createInsertSchema(regulatoryCalibrationZonesTable);

export type RegulatoryCalibrationZone = typeof regulatoryCalibrationZonesTable.$inferSelect;
export type InsertRegulatoryCalibrationZone = typeof regulatoryCalibrationZonesTable.$inferInsert;
