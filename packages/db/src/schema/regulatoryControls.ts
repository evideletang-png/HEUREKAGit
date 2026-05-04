import { pgTable, text, timestamp, uuid, doublePrecision, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { regulatoryCalibrationZonesTable } from "./regulatoryCalibrationZones";
import { townHallDocumentsTable } from "./townHallDocuments";

export const regulatoryControlsTable = pgTable("regulatory_controls", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: uuid("zone_id").references(() => regulatoryCalibrationZonesTable.id, { onDelete: "cascade" }).notNull(),
  controlType: text("control_type").notNull(),
  rule: text("rule").notNull(),
  sourceArticle: text("source_article"),
  sourceDocumentId: uuid("source_document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  confidenceScore: doublePrecision("confidence_score").default(0.5),
  validationStatus: text("validation_status").notNull().default("draft"),
  linkedOverlay: text("linked_overlay"),
  sourceExcerpt: text("source_excerpt"),
  analysisId: uuid("analysis_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  zoneIdx: index("regulatory_controls_zone_idx").on(table.zoneId),
  typeIdx: index("regulatory_controls_type_idx").on(table.controlType),
  statusIdx: index("regulatory_controls_status_idx").on(table.validationStatus),
}));

export const selectRegulatoryControlSchema = createSelectSchema(regulatoryControlsTable);
export const insertRegulatoryControlSchema = createInsertSchema(regulatoryControlsTable);

export type RegulatoryControl = typeof regulatoryControlsTable.$inferSelect;
export type InsertRegulatoryControl = typeof regulatoryControlsTable.$inferInsert;
