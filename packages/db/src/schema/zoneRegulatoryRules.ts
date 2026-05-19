/**
 * zone_regulatory_rules — unified rule table (Phase 1 of zone-centric refactor)
 *
 * Replaces the role of three legacy tables:
 *   - regulatory_units      (the oldest, theme-centric)
 *   - urban_rules           (intermediate, value-centric)
 *   - indexed_regulatory_rules (the most recent, calibration-centric)
 *
 * During Phase 1, data is fused into this table with deduplication on
 * (zoneId, articleNumber, topic). Legacy tables remain intact.
 *
 * `legacySource` + `legacySourceId` allow tracing each row back to its origin.
 */
import { pgTable, text, timestamp, uuid, jsonb, integer, doublePrecision, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { regulatoryZonesTable } from "./regulatoryZones";

export const zoneRegulatoryRulesTable = pgTable("zone_regulatory_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: uuid("zone_id").references(() => regulatoryZonesTable.id, { onDelete: "cascade" }).notNull(),
  articleNumber: text("article_number"),     // text to allow "UA-7" or "13.2"
  articleTitle: text("article_title"),
  topic: text("topic").notNull(),            // theme code: hauteur, emprise, recul, etc.
  ruleText: text("rule_text").notNull(),
  conditions: jsonb("conditions").$type<Record<string, unknown>>().default({}),
  exceptions: jsonb("exceptions").$type<Record<string, unknown>>().default({}),
  sourceDocumentId: uuid("source_document_id"), // can target town_hall_documents OR base_ia_documents
  sourceDocumentKind: text("source_document_kind"), // 'town_hall' | 'base_ia' | 'notebook' | null
  sourceExcerpt: text("source_excerpt"),
  sourcePage: integer("source_page"),
  confidenceScore: doublePrecision("confidence_score").default(0),
  validationStatus: text("validation_status").notNull().default("draft"), // draft | validated | rejected
  legacySource: text("legacy_source"),       // 'regulatory_units' | 'urban_rules' | 'indexed_regulatory_rules' | 'notebook' | 'manual'
  legacySourceId: uuid("legacy_source_id"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  zoneIdx:           index("zone_regulatory_rules_zone_idx").on(table.zoneId),
  topicIdx:          index("zone_regulatory_rules_topic_idx").on(table.topic),
  articleIdx:        index("zone_regulatory_rules_article_idx").on(table.articleNumber),
  validationIdx:     index("zone_regulatory_rules_validation_idx").on(table.validationStatus),
  legacyIdx:         index("zone_regulatory_rules_legacy_idx").on(table.legacySource, table.legacySourceId),
  // Soft-dedup index: speeds up the upsert path (zone + article + topic).
  zoneArticleTopicIdx: index("zone_regulatory_rules_zone_article_topic_idx").on(table.zoneId, table.articleNumber, table.topic),
}));

export const selectZoneRegulatoryRuleSchema = createSelectSchema(zoneRegulatoryRulesTable);
export const insertZoneRegulatoryRuleSchema = createInsertSchema(zoneRegulatoryRulesTable);

export type ZoneRegulatoryRule = typeof zoneRegulatoryRulesTable.$inferSelect;
export type InsertZoneRegulatoryRule = typeof zoneRegulatoryRulesTable.$inferInsert;
