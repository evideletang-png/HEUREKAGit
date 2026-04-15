import { pgTable, text, timestamp, uuid, doublePrecision, boolean, jsonb, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { townHallDocumentsTable } from "./townHallDocuments";
import { calibratedExcerptsTable } from "./calibratedExcerpts";
import { regulatoryCalibrationZonesTable } from "./regulatoryCalibrationZones";
import { regulatoryOverlaysTable } from "./regulatoryOverlays";
import { zoneThematicSegmentsTable } from "./zoneThematicSegments";

export const indexedRegulatoryRulesTable = pgTable("indexed_regulatory_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  zoneId: uuid("zone_id").references(() => regulatoryCalibrationZonesTable.id, { onDelete: "restrict" }),
  overlayId: uuid("overlay_id").references(() => regulatoryOverlaysTable.id, { onDelete: "restrict" }),
  segmentId: uuid("segment_id").references(() => zoneThematicSegmentsTable.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => townHallDocumentsTable.id, { onDelete: "cascade" }).notNull(),
  excerptId: uuid("excerpt_id").references(() => calibratedExcerptsTable.id, { onDelete: "cascade" }).notNull(),
  articleCode: text("article_code"),
  themeCode: text("theme_code").notNull(),
  ruleLabel: text("rule_label").notNull(),
  operator: text("operator"),
  valueNumeric: doublePrecision("value_numeric"),
  valueText: text("value_text"),
  unit: text("unit"),
  conditionText: text("condition_text"),
  interpretationNote: text("interpretation_note"),
  scopeType: text("scope_type").notNull().default("zone"),
  overlayType: text("overlay_type"),
  normativeEffect: text("normative_effect").notNull().default("primary"),
  proceduralEffect: text("procedural_effect").notNull().default("none"),
  applicabilityScope: text("applicability_scope").notNull().default("main_zone"),
  ruleAnchorType: text("rule_anchor_type").notNull().default("article"),
  ruleAnchorLabel: text("rule_anchor_label"),
  conflictResolutionStatus: text("conflict_resolution_status").notNull().default("none"),
  isRelationalRule: boolean("is_relational_rule").notNull().default(false),
  requiresCrossDocumentResolution: boolean("requires_cross_document_resolution").notNull().default(false),
  resolutionStatus: text("resolution_status").notNull().default("standalone"),
  linkedRuleCount: integer("linked_rule_count").notNull().default(0),
  sourceText: text("source_text").notNull(),
  sourcePage: integer("source_page").notNull(),
  sourcePageEnd: integer("source_page_end"),
  confidenceScore: doublePrecision("confidence_score").default(0),
  conflictFlag: boolean("conflict_flag").notNull().default(false),
  status: text("status").notNull().default("draft"),
  aiSuggested: boolean("ai_suggested").notNull().default(false),
  publishedAt: timestamp("published_at"),
  publishedBy: text("published_by"),
  validationNote: text("validation_note"),
  rawSuggestion: jsonb("raw_suggestion").default({}),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("indexed_regulatory_rules_commune_idx").on(table.communeId),
  zoneIdx: index("indexed_regulatory_rules_zone_idx").on(table.zoneId),
  overlayIdx: index("indexed_regulatory_rules_overlay_idx").on(table.overlayId),
  segmentIdx: index("indexed_regulatory_rules_segment_idx").on(table.segmentId),
  excerptIdx: index("indexed_regulatory_rules_excerpt_idx").on(table.excerptId),
  themeIdx: index("indexed_regulatory_rules_theme_idx").on(table.themeCode),
  statusIdx: index("indexed_regulatory_rules_status_idx").on(table.status),
}));

export const selectIndexedRegulatoryRuleSchema = createSelectSchema(indexedRegulatoryRulesTable);
export const insertIndexedRegulatoryRuleSchema = createInsertSchema(indexedRegulatoryRulesTable);

export type IndexedRegulatoryRule = typeof indexedRegulatoryRulesTable.$inferSelect;
export type InsertIndexedRegulatoryRule = typeof indexedRegulatoryRulesTable.$inferInsert;
