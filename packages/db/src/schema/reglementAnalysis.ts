import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { townHallDocumentsTable } from "./townHallDocuments";

export const reglementAnalysisTable = pgTable("reglement_analysis", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  documentId: uuid("document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  source: text("source").notNull().default("manual"),
  rawContent: text("raw_content").notNull(),
  structuredContent: jsonb("structured_content").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("reglement_analysis_commune_idx").on(table.communeId),
  documentIdx: index("reglement_analysis_document_idx").on(table.documentId),
  statusIdx: index("reglement_analysis_status_idx").on(table.status),
}));

export const selectReglementAnalysisSchema = createSelectSchema(reglementAnalysisTable);
export const insertReglementAnalysisSchema = createInsertSchema(reglementAnalysisTable);

export type ReglementAnalysis = typeof reglementAnalysisTable.$inferSelect;
export type InsertReglementAnalysis = typeof reglementAnalysisTable.$inferInsert;
