/**
 * regulatory_controls — machine-evaluable checks per zone (Phase 1).
 *
 * Distinct from `zone_regulatory_rules`: a rule is a regulatory statement
 * (text + topic + source). A control is its operational form, evaluable
 * by the analysis engine (e.g. "height <= 12" or "parking_per_unit >= 1").
 *
 * Rows here are derived from rules whose value is structured (operator +
 * value). One rule can yield several controls; one control always points
 * to its source rule.
 */
import { pgTable, text, timestamp, uuid, jsonb, doublePrecision, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { regulatoryZonesTable } from "./regulatoryZones";
import { zoneRegulatoryRulesTable } from "./zoneRegulatoryRules";

export const regulatoryControlsTable = pgTable("regulatory_controls", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  zoneId: uuid("zone_id").references(() => regulatoryZonesTable.id, { onDelete: "cascade" }).notNull(),
  ruleId: uuid("rule_id").references(() => zoneRegulatoryRulesTable.id, { onDelete: "set null" }),
  controlType: text("control_type").notNull(), // 'dimensional' | 'qualitative' | 'procedural'
  rule: text("rule").notNull(),                // canonical machine-readable form, e.g. "height_m <= 12"
  ruleStructured: jsonb("rule_structured").$type<{
    operator?: string;
    valueNumeric?: number;
    valueText?: string;
    unit?: string;
    field?: string;
  }>().default({}),
  sourceArticle: text("source_article"),
  sourceDocumentId: uuid("source_document_id"),
  sourceDocumentKind: text("source_document_kind"),
  confidenceScore: doublePrecision("confidence_score").default(0),
  validationStatus: text("validation_status").notNull().default("draft"), // draft | validated | rejected
  legacySource: text("legacy_source"),         // 'indexed_regulatory_rules' | 'urban_rules' | 'manual' | ...
  legacySourceId: uuid("legacy_source_id"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  zoneIdx:       index("regulatory_controls_zone_idx").on(table.zoneId),
  ruleIdx:       index("regulatory_controls_rule_idx").on(table.ruleId),
  typeIdx:       index("regulatory_controls_type_idx").on(table.controlType),
  validationIdx: index("regulatory_controls_validation_idx").on(table.validationStatus),
  legacyIdx:     index("regulatory_controls_legacy_idx").on(table.legacySource, table.legacySourceId),
}));

export const selectRegulatoryControlSchema = createSelectSchema(regulatoryControlsTable);
export const insertRegulatoryControlSchema = createInsertSchema(regulatoryControlsTable);

export type RegulatoryControl = typeof regulatoryControlsTable.$inferSelect;
export type InsertRegulatoryControl = typeof regulatoryControlsTable.$inferInsert;
