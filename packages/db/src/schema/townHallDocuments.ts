import { pgTable, text, timestamp, uuid, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const townHallDocumentsTable = pgTable("town_hall_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  commune: text("commune"),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  hasStoredBlob: boolean("has_stored_blob").notNull().default(false),
  rawText: text("raw_text").notNull(),
  category: text("category"), // REGULATORY, ANNEXES, INFRASTRUCTURE
  subCategory: text("sub_category"), // PLU, RISKS, HERITAGE, NETWORKS, etc.
  documentType: text("document_type"), // Written regulation, Zoning map, etc.
  explanatoryNote: text("explanatory_note"), // AI generated summary
  tags: jsonb("tags").default([]),
  zone: text("zone"),
  isRegulatory: boolean("is_regulatory").default(true),
  isOpposable: boolean("is_opposable").default(true),
  structuredContent: jsonb("structured_content").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectTownHallDocumentSchema = createSelectSchema(townHallDocumentsTable);
export const insertTownHallDocumentSchema = createInsertSchema(townHallDocumentsTable);

export type TownHallDocument = typeof townHallDocumentsTable.$inferSelect;
export type InsertTownHallDocument = typeof townHallDocumentsTable.$inferInsert;
