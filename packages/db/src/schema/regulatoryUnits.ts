import { pgTable, text, timestamp, uuid, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { baseIADocumentsTable } from "./baseIADocuments";
import { townHallDocumentsTable } from "./townHallDocuments";

export const regulatoryUnitsTable = pgTable("regulatory_units", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  baseIADocumentId: uuid("base_ia_document_id").references(() => baseIADocumentsTable.id, { onDelete: "cascade" }),
  townHallDocumentId: uuid("town_hall_document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  municipalityId: text("municipality_id").notNull(),
  zoneCode: text("zone_code"),
  documentType: text("document_type"),
  theme: text("theme").notNull(),
  articleNumber: integer("article_number"),
  title: text("title").notNull(),
  sourceText: text("source_text").notNull(),
  parsedValues: jsonb("parsed_values").default({}),
  confidence: text("confidence").notNull().default("low"),
  sourceAuthority: integer("source_authority").notNull().default(0),
  isOpposable: boolean("is_opposable").notNull().default(true),
  parserVersion: text("parser_version").notNull().default("v2"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectRegulatoryUnitSchema = createSelectSchema(regulatoryUnitsTable);
export const insertRegulatoryUnitSchema = createInsertSchema(regulatoryUnitsTable);

export type RegulatoryUnit = typeof regulatoryUnitsTable.$inferSelect;
export type InsertRegulatoryUnit = typeof regulatoryUnitsTable.$inferInsert;
