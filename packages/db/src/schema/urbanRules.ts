import { pgTable, text, timestamp, uuid, boolean, jsonb, doublePrecision, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { baseIADocumentsTable } from "./baseIADocuments";
import { townHallDocumentsTable } from "./townHallDocuments";

export const urbanRulesTable = pgTable("urban_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  baseIADocumentId: uuid("base_ia_document_id").references(() => baseIADocumentsTable.id, { onDelete: "cascade" }),
  townHallDocumentId: uuid("town_hall_document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  sourceDocumentId: text("source_document_id"),
  sourceDocumentKind: text("source_document_kind"),
  municipalityId: text("municipality_id").notNull(),
  zoneCode: text("zone_code"),
  subzoneCode: text("subzone_code"),
  sectorCode: text("sector_code"),
  ruleFamily: text("rule_family").notNull(),
  ruleTopic: text("rule_topic").notNull(),
  ruleLabel: text("rule_label").notNull(),
  ruleTextRaw: text("rule_text_raw").notNull(),
  ruleSummary: text("rule_summary"),
  ruleValueType: text("rule_value_type"),
  ruleValueMin: doublePrecision("rule_value_min"),
  ruleValueMax: doublePrecision("rule_value_max"),
  ruleValueExact: doublePrecision("rule_value_exact"),
  ruleUnit: text("rule_unit"),
  ruleCondition: text("rule_condition"),
  ruleException: text("rule_exception"),
  rulePriority: integer("rule_priority").notNull().default(0),
  sourcePage: integer("source_page"),
  sourceArticle: text("source_article"),
  sourceExcerpt: text("source_excerpt"),
  sourceAuthority: integer("source_authority").notNull().default(0),
  isOpposable: boolean("is_opposable").notNull().default(true),
  confidenceScore: doublePrecision("confidence_score").default(0),
  extractionMode: text("extraction_mode"),
  requiresManualValidation: boolean("requires_manual_validation").notNull().default(false),
  reviewStatus: text("review_status").notNull().default("auto"),
  validatedByUser: text("validated_by_user"),
  validationNote: text("validation_note"),
  ruleConflictFlag: boolean("rule_conflict_flag").notNull().default(false),
  rawMetadata: jsonb("raw_metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  municipalityIdx: index("urban_rules_municipality_idx").on(table.municipalityId),
  zoneIdx: index("urban_rules_zone_idx").on(table.zoneCode),
  familyIdx: index("urban_rules_family_idx").on(table.ruleFamily),
  documentIdx: index("urban_rules_document_idx").on(table.sourceDocumentId),
}));

export const selectUrbanRuleSchema = createSelectSchema(urbanRulesTable);
export const insertUrbanRuleSchema = createInsertSchema(urbanRulesTable);

export type UrbanRule = typeof urbanRulesTable.$inferSelect;
export type InsertUrbanRule = typeof urbanRulesTable.$inferInsert;
