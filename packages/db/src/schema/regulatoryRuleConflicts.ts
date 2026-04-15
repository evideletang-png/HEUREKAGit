import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { indexedRegulatoryRulesTable } from "./indexedRegulatoryRules";
import { regulatoryCalibrationZonesTable } from "./regulatoryCalibrationZones";

export const regulatoryRuleConflictsTable = pgTable("regulatory_rule_conflicts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  zoneId: uuid("zone_id").references(() => regulatoryCalibrationZonesTable.id, { onDelete: "cascade" }),
  leftRuleId: uuid("left_rule_id").references(() => indexedRegulatoryRulesTable.id, { onDelete: "cascade" }).notNull(),
  rightRuleId: uuid("right_rule_id").references(() => indexedRegulatoryRulesTable.id, { onDelete: "cascade" }).notNull(),
  themeCode: text("theme_code").notNull(),
  conflictType: text("conflict_type").notNull(),
  conflictSummary: text("conflict_summary").notNull(),
  status: text("status").notNull().default("open"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("regulatory_rule_conflicts_commune_idx").on(table.communeId),
  zoneIdx: index("regulatory_rule_conflicts_zone_idx").on(table.zoneId),
  leftIdx: index("regulatory_rule_conflicts_left_idx").on(table.leftRuleId),
  rightIdx: index("regulatory_rule_conflicts_right_idx").on(table.rightRuleId),
}));

export const selectRegulatoryRuleConflictSchema = createSelectSchema(regulatoryRuleConflictsTable);
export const insertRegulatoryRuleConflictSchema = createInsertSchema(regulatoryRuleConflictsTable);

export type RegulatoryRuleConflict = typeof regulatoryRuleConflictsTable.$inferSelect;
export type InsertRegulatoryRuleConflict = typeof regulatoryRuleConflictsTable.$inferInsert;
