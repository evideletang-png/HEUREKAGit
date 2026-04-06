import { pgTable, text, timestamp, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { baseIADocumentsTable } from "./baseIADocuments";
import { townHallDocumentsTable } from "./townHallDocuments";

export const regulatoryZoneSectionsTable = pgTable("regulatory_zone_sections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  baseIADocumentId: uuid("base_ia_document_id").references(() => baseIADocumentsTable.id, { onDelete: "cascade" }),
  townHallDocumentId: uuid("town_hall_document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  municipalityId: text("municipality_id").notNull(),
  zoneCode: text("zone_code").notNull(),
  parentZoneCode: text("parent_zone_code"),
  heading: text("heading").notNull(),
  sourceText: text("source_text").notNull(),
  startOffset: integer("start_offset"),
  endOffset: integer("end_offset"),
  startPage: integer("start_page"),
  endPage: integer("end_page"),
  isSubZone: boolean("is_sub_zone").notNull().default(false),
  reviewStatus: text("review_status").notNull().default("auto"),
  reviewedStartPage: integer("reviewed_start_page"),
  reviewedEndPage: integer("reviewed_end_page"),
  reviewedParentZoneCode: text("reviewed_parent_zone_code"),
  reviewedIsSubZone: boolean("reviewed_is_sub_zone"),
  reviewNotes: text("review_notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  documentType: text("document_type"),
  sourceAuthority: integer("source_authority").notNull().default(0),
  isOpposable: boolean("is_opposable").notNull().default(true),
  parserVersion: text("parser_version").notNull().default("v1"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  municipalityIdx: index("regulatory_zone_sections_municipality_idx").on(table.municipalityId),
  zoneIdx: index("regulatory_zone_sections_zone_idx").on(table.zoneCode),
  documentIdx: index("regulatory_zone_sections_document_idx").on(table.baseIADocumentId),
}));

export const selectRegulatoryZoneSectionSchema = createSelectSchema(regulatoryZoneSectionsTable);
export const insertRegulatoryZoneSectionSchema = createInsertSchema(regulatoryZoneSectionsTable);

export type RegulatoryZoneSection = typeof regulatoryZoneSectionsTable.$inferSelect;
export type InsertRegulatoryZoneSection = typeof regulatoryZoneSectionsTable.$inferInsert;
