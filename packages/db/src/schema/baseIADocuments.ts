import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const baseIADocumentsTable = pgTable("base_ia_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: uuid("batch_id").notNull(),
  municipalityId: text("municipality_id"), // Commune name or ID
  zoneCode: text("zone_code"),
  category: text("category"),
  subCategory: text("sub_category"),
  tags: jsonb("tags").default([]),
  type: text("type").notNull().default("plu"), // plu, oap, servitude, directive, other
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  status: text("status").notNull().default("uploaded"), // uploaded, parsing, indexed, failed
  errorMessage: text("error_message"),
  rawText: text("raw_text"), // Full extracted text for re-indexing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectBaseIADocumentSchema = createSelectSchema(baseIADocumentsTable);
export const insertBaseIADocumentSchema = createInsertSchema(baseIADocumentsTable);
