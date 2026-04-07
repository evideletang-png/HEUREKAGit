import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { indexedRegulatoryRulesTable } from "./indexedRegulatoryRules";
import { townHallDocumentsTable } from "./townHallDocuments";

export const ruleRelationsTable = pgTable("rule_relations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceRuleId: uuid("source_rule_id").references(() => indexedRegulatoryRulesTable.id, { onDelete: "cascade" }).notNull(),
  targetRuleId: uuid("target_rule_id").references(() => indexedRegulatoryRulesTable.id, { onDelete: "cascade" }),
  sourceDocumentId: uuid("source_document_id").references(() => townHallDocumentsTable.id, { onDelete: "cascade" }).notNull(),
  targetDocumentId: uuid("target_document_id").references(() => townHallDocumentsTable.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull(),
  relationScope: text("relation_scope").notNull().default("rule"),
  conditionText: text("condition_text"),
  priorityNote: text("priority_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  sourceRuleIdx: index("rule_relations_source_rule_idx").on(table.sourceRuleId),
  targetRuleIdx: index("rule_relations_target_rule_idx").on(table.targetRuleId),
  sourceDocumentIdx: index("rule_relations_source_document_idx").on(table.sourceDocumentId),
  targetDocumentIdx: index("rule_relations_target_document_idx").on(table.targetDocumentId),
  relationTypeIdx: index("rule_relations_relation_type_idx").on(table.relationType),
}));

export const selectRuleRelationSchema = createSelectSchema(ruleRelationsTable);
export const insertRuleRelationSchema = createInsertSchema(ruleRelationsTable);

export type RuleRelation = typeof ruleRelationsTable.$inferSelect;
export type InsertRuleRelation = typeof ruleRelationsTable.$inferInsert;
