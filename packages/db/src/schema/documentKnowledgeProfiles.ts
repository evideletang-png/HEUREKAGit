import { pgTable, text, timestamp, uuid, boolean, jsonb, doublePrecision, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { baseIADocumentsTable } from "./baseIADocuments";
import { townHallDocumentsTable } from "./townHallDocuments";

export const documentKnowledgeProfilesTable = pgTable("document_knowledge_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  baseIADocumentId: uuid("base_ia_document_id").references(() => baseIADocumentsTable.id, { onDelete: "cascade" }),
  townHallDocumentId: uuid("town_hall_document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  municipalityId: text("municipality_id").notNull(),
  documentType: text("document_type").notNull(),
  documentSubtype: text("document_subtype"),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  versionDate: text("version_date"),
  opposable: boolean("opposable").notNull().default(true),
  status: text("status").notNull().default("draft"),
  textExtractable: boolean("text_extractable").notNull().default(false),
  ocrStatus: text("ocr_status").notNull().default("pending"),
  extractionMode: text("extraction_mode").notNull().default("manual_only"),
  extractionReliability: doublePrecision("extraction_reliability").default(0),
  manualReviewRequired: boolean("manual_review_required").notNull().default(false),
  classifierConfidence: doublePrecision("classifier_confidence").default(0),
  sourceAuthority: integer("source_authority").notNull().default(0),
  rawClassification: jsonb("raw_classification").default({}),
  detectedZones: jsonb("detected_zones").default([]),
  structuredTopics: jsonb("structured_topics").default([]),
  reasoningSummary: text("reasoning_summary"),
  reasoningJson: jsonb("reasoning_json").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  municipalityIdx: index("document_knowledge_profiles_municipality_idx").on(table.municipalityId),
  baseDocIdx: index("document_knowledge_profiles_base_doc_idx").on(table.baseIADocumentId),
  townHallDocIdx: index("document_knowledge_profiles_town_hall_doc_idx").on(table.townHallDocumentId),
}));

export const selectDocumentKnowledgeProfileSchema = createSelectSchema(documentKnowledgeProfilesTable);
export const insertDocumentKnowledgeProfileSchema = createInsertSchema(documentKnowledgeProfilesTable);

export type DocumentKnowledgeProfile = typeof documentKnowledgeProfilesTable.$inferSelect;
export type InsertDocumentKnowledgeProfile = typeof documentKnowledgeProfilesTable.$inferInsert;
