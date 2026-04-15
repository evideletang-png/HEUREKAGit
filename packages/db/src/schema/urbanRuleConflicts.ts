import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { urbanRulesTable } from "./urbanRules";

export const urbanRuleConflictsTable = pgTable("urban_rule_conflicts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  municipalityId: text("municipality_id").notNull(),
  zoneCode: text("zone_code"),
  ruleFamily: text("rule_family").notNull(),
  ruleTopic: text("rule_topic").notNull(),
  leftRuleId: uuid("left_rule_id").notNull().references(() => urbanRulesTable.id, { onDelete: "cascade" }),
  rightRuleId: uuid("right_rule_id").notNull().references(() => urbanRulesTable.id, { onDelete: "cascade" }),
  conflictType: text("conflict_type").notNull(),
  conflictSummary: text("conflict_summary").notNull(),
  requiresManualValidation: boolean("requires_manual_validation").notNull().default(true),
  status: text("status").notNull().default("open"),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  municipalityIdx: index("urban_rule_conflicts_municipality_idx").on(table.municipalityId),
  zoneIdx: index("urban_rule_conflicts_zone_idx").on(table.zoneCode),
  leftRuleIdx: index("urban_rule_conflicts_left_rule_idx").on(table.leftRuleId),
  rightRuleIdx: index("urban_rule_conflicts_right_rule_idx").on(table.rightRuleId),
}));

export const selectUrbanRuleConflictSchema = createSelectSchema(urbanRuleConflictsTable);
export const insertUrbanRuleConflictSchema = createInsertSchema(urbanRuleConflictsTable);

export type UrbanRuleConflict = typeof urbanRuleConflictsTable.$inferSelect;
export type InsertUrbanRuleConflict = typeof urbanRuleConflictsTable.$inferInsert;
