import { pgTable, text, timestamp, uuid, boolean, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { regulatoryOverlaysTable } from "./regulatoryOverlays";
import { townHallDocumentsTable } from "./townHallDocuments";

export const overlayDocumentBindingsTable = pgTable("overlay_document_bindings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  overlayId: uuid("overlay_id").references(() => regulatoryOverlaysTable.id, { onDelete: "cascade" }).notNull(),
  documentId: uuid("document_id").references(() => townHallDocumentsTable.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull().default("supporting"),
  structureMode: text("structure_mode").notNull().default("mixed"),
  sourcePriority: integer("source_priority").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("overlay_document_bindings_commune_idx").on(table.communeId),
  overlayIdx: index("overlay_document_bindings_overlay_idx").on(table.overlayId),
  documentIdx: index("overlay_document_bindings_document_idx").on(table.documentId),
}));

export const selectOverlayDocumentBindingSchema = createSelectSchema(overlayDocumentBindingsTable);
export const insertOverlayDocumentBindingSchema = createInsertSchema(overlayDocumentBindingsTable);

export type OverlayDocumentBinding = typeof overlayDocumentBindingsTable.$inferSelect;
export type InsertOverlayDocumentBinding = typeof overlayDocumentBindingsTable.$inferInsert;
