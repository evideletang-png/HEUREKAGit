import { pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { townHallDocumentsTable } from "./townHallDocuments";

export const townHallUploadSessionsTable = pgTable("town_hall_upload_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  commune: text("commune"),
  title: text("title"),
  originalFileName: text("original_file_name").notNull(),
  storedFileName: text("stored_file_name").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size").notNull(),
  receivedBytes: integer("received_bytes").notNull().default(0),
  category: text("category"),
  subCategory: text("sub_category"),
  documentType: text("document_type"),
  zone: text("zone"),
  tags: jsonb("tags").default([]),
  status: text("status").notNull().default("uploading"),
  errorMessage: text("error_message"),
  townHallDocumentId: uuid("town_hall_document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectTownHallUploadSessionSchema = createSelectSchema(townHallUploadSessionsTable);
export const insertTownHallUploadSessionSchema = createInsertSchema(townHallUploadSessionsTable);

export type TownHallUploadSession = typeof townHallUploadSessionsTable.$inferSelect;
export type InsertTownHallUploadSession = typeof townHallUploadSessionsTable.$inferInsert;
