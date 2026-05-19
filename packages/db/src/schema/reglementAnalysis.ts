/**
 * reglement_analysis — externally-imported PLU analyses (NotebookLM, manual, AI).
 *
 * Stores both the raw pasted/uploaded content and the structured parse result.
 * The `zoneExtractionService` consumes rows here to upsert
 * `regulatory_zones` + `zone_regulatory_rules` + `regulatory_controls`.
 *
 * `status` follows the standard draft → validated lifecycle.
 */
import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const reglementAnalysisTable = pgTable("reglement_analysis", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  documentId: uuid("document_id"),                // optional → town_hall_documents.id
  source: text("source").notNull(),               // 'notebook' | 'manual' | 'ia'
  title: text("title"),
  rawContent: text("raw_content").notNull(),
  structuredContent: jsonb("structured_content").$type<{
    zones?: Array<Record<string, unknown>>;
    transversalRules?: Array<Record<string, unknown>>;
    documentRelations?: Array<Record<string, unknown>>;
    parserVersion?: string;
    warnings?: string[];
  }>().default({}),
  status: text("status").notNull().default("draft"), // draft | validated
  importedBy: text("imported_by"),
  validatedBy: text("validated_by"),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("reglement_analysis_commune_idx").on(table.communeId),
  sourceIdx:  index("reglement_analysis_source_idx").on(table.source),
  statusIdx:  index("reglement_analysis_status_idx").on(table.status),
  documentIdx: index("reglement_analysis_document_idx").on(table.documentId),
}));

export const selectReglementAnalysisSchema = createSelectSchema(reglementAnalysisTable);
export const insertReglementAnalysisSchema = createInsertSchema(reglementAnalysisTable);

export type ReglementAnalysis = typeof reglementAnalysisTable.$inferSelect;
export type InsertReglementAnalysis = typeof reglementAnalysisTable.$inferInsert;
