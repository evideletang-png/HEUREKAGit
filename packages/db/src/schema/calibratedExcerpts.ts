import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { townHallDocumentsTable } from "./townHallDocuments";
import { regulatoryCalibrationZonesTable } from "./regulatoryCalibrationZones";
import { regulatoryOverlaysTable } from "./regulatoryOverlays";
import { zoneThematicSegmentsTable } from "./zoneThematicSegments";

export const calibratedExcerptsTable = pgTable("calibrated_excerpts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  zoneId: uuid("zone_id").references(() => regulatoryCalibrationZonesTable.id, { onDelete: "cascade" }),
  overlayId: uuid("overlay_id").references(() => regulatoryOverlaysTable.id, { onDelete: "cascade" }),
  segmentId: uuid("segment_id").references(() => zoneThematicSegmentsTable.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => townHallDocumentsTable.id, { onDelete: "cascade" }).notNull(),
  articleCode: text("article_code"),
  selectionLabel: text("selection_label"),
  sourceText: text("source_text").notNull(),
  normalizedSourceText: text("normalized_source_text"),
  sourcePage: integer("source_page").notNull(),
  sourcePageEnd: integer("source_page_end"),
  selectionStartOffset: integer("selection_start_offset"),
  selectionEndOffset: integer("selection_end_offset"),
  aiSuggested: boolean("ai_suggested").notNull().default(false),
  status: text("status").notNull().default("draft"),
  reviewNote: text("review_note"),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("calibrated_excerpts_commune_idx").on(table.communeId),
  zoneIdx: index("calibrated_excerpts_zone_idx").on(table.zoneId),
  overlayIdx: index("calibrated_excerpts_overlay_idx").on(table.overlayId),
  segmentIdx: index("calibrated_excerpts_segment_idx").on(table.segmentId),
  documentIdx: index("calibrated_excerpts_document_idx").on(table.documentId),
  statusIdx: index("calibrated_excerpts_status_idx").on(table.status),
}));

export const selectCalibratedExcerptSchema = createSelectSchema(calibratedExcerptsTable);
export const insertCalibratedExcerptSchema = createInsertSchema(calibratedExcerptsTable);

export type CalibratedExcerpt = typeof calibratedExcerptsTable.$inferSelect;
export type InsertCalibratedExcerpt = typeof calibratedExcerptsTable.$inferInsert;
