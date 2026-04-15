import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { townHallDocumentsTable } from "./townHallDocuments";
import { regulatoryCalibrationZonesTable } from "./regulatoryCalibrationZones";
import { regulatoryOverlaysTable } from "./regulatoryOverlays";

export const zoneThematicSegmentsTable = pgTable("zone_thematic_segments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  zoneId: uuid("zone_id").references(() => regulatoryCalibrationZonesTable.id, { onDelete: "cascade" }).notNull(),
  overlayId: uuid("overlay_id").references(() => regulatoryOverlaysTable.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => townHallDocumentsTable.id, { onDelete: "cascade" }).notNull(),
  sourcePageStart: integer("source_page_start").notNull(),
  sourcePageEnd: integer("source_page_end"),
  anchorType: text("anchor_type").notNull().default("section"),
  anchorLabel: text("anchor_label"),
  themeCode: text("theme_code").notNull(),
  sourceTextFull: text("source_text_full").notNull(),
  sourceTextNormalized: text("source_text_normalized"),
  visualAttachmentMeta: jsonb("visual_attachment_meta").default({}),
  derivedFromAi: boolean("derived_from_ai").notNull().default(false),
  status: text("status").notNull().default("suggested"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("zone_thematic_segments_commune_idx").on(table.communeId),
  zoneIdx: index("zone_thematic_segments_zone_idx").on(table.zoneId),
  overlayIdx: index("zone_thematic_segments_overlay_idx").on(table.overlayId),
  documentIdx: index("zone_thematic_segments_document_idx").on(table.documentId),
  themeIdx: index("zone_thematic_segments_theme_idx").on(table.themeCode),
  statusIdx: index("zone_thematic_segments_status_idx").on(table.status),
}));

export const selectZoneThematicSegmentSchema = createSelectSchema(zoneThematicSegmentsTable);
export const insertZoneThematicSegmentSchema = createInsertSchema(zoneThematicSegmentsTable);

export type ZoneThematicSegment = typeof zoneThematicSegmentsTable.$inferSelect;
export type InsertZoneThematicSegment = typeof zoneThematicSegmentsTable.$inferInsert;
