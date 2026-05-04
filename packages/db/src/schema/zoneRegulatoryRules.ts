import { pgTable, text, timestamp, uuid, doublePrecision, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { regulatoryCalibrationZonesTable } from "./regulatoryCalibrationZones";
import { townHallDocumentsTable } from "./townHallDocuments";

export const zoneRegulatoryRulesTable = pgTable("zone_regulatory_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: uuid("zone_id").references(() => regulatoryCalibrationZonesTable.id, { onDelete: "cascade" }).notNull(),
  articleNumber: integer("article_number"),
  articleTitle: text("article_title"),
  topic: text("topic").notNull().default("general"),
  ruleText: text("rule_text").notNull(),
  conditions: text("conditions"),
  exceptions: text("exceptions"),
  sourceDocumentId: uuid("source_document_id").references(() => townHallDocumentsTable.id, { onDelete: "set null" }),
  sourceExcerpt: text("source_excerpt"),
  confidenceScore: doublePrecision("confidence_score").default(0.5),
  validationStatus: text("validation_status").notNull().default("draft"),
  analysisId: uuid("analysis_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  zoneIdx: index("zone_regulatory_rules_zone_idx").on(table.zoneId),
  articleIdx: index("zone_regulatory_rules_article_idx").on(table.articleNumber),
  statusIdx: index("zone_regulatory_rules_status_idx").on(table.validationStatus),
}));

export const selectZoneRegulatoryRuleSchema = createSelectSchema(zoneRegulatoryRulesTable);
export const insertZoneRegulatoryRuleSchema = createInsertSchema(zoneRegulatoryRulesTable);

export type ZoneRegulatoryRule = typeof zoneRegulatoryRulesTable.$inferSelect;
export type InsertZoneRegulatoryRule = typeof zoneRegulatoryRulesTable.$inferInsert;
