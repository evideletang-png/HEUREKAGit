import { pgTable, text, timestamp, uuid, boolean, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const regulatoryOverlaysTable = pgTable("regulatory_overlays", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  overlayCode: text("overlay_code").notNull(),
  overlayLabel: text("overlay_label"),
  overlayType: text("overlay_type").notNull(),
  geometryRef: text("geometry_ref"),
  guidanceNotes: text("guidance_notes"),
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("draft"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("regulatory_overlays_commune_idx").on(table.communeId),
  codeIdx: index("regulatory_overlays_code_idx").on(table.overlayCode),
  typeIdx: index("regulatory_overlays_type_idx").on(table.overlayType),
}));

export const selectRegulatoryOverlaySchema = createSelectSchema(regulatoryOverlaysTable);
export const insertRegulatoryOverlaySchema = createInsertSchema(regulatoryOverlaysTable);

export type RegulatoryOverlay = typeof regulatoryOverlaysTable.$inferSelect;
export type InsertRegulatoryOverlay = typeof regulatoryOverlaysTable.$inferInsert;
