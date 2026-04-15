import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { townHallDocumentsTable } from "./townHallDocuments";

export const townHallDocumentFilesTable = pgTable("town_hall_document_files", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => townHallDocumentsTable.id, { onDelete: "cascade" }),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  fileBase64: text("file_base64").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectTownHallDocumentFileSchema = createSelectSchema(townHallDocumentFilesTable);
export const insertTownHallDocumentFileSchema = createInsertSchema(townHallDocumentFilesTable);

export type TownHallDocumentFile = typeof townHallDocumentFilesTable.$inferSelect;
export type InsertTownHallDocumentFile = typeof townHallDocumentFilesTable.$inferInsert;
