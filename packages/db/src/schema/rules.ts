import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const rulesTable = pgTable("rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  commune: text("commune").notNull(),
  zoneCode: text("zone_code").notNull(),
  article: text("article").notNull(), // Art. 1-16
  category: text("category").notNull(), // e.g., "hauteur", "emprise", "recul"
  operator: text("operator").notNull().default("<="), // <=, >=, =, between, in
  ruleType: text("rule_type").notNull().default("numeric"), // numeric, boolean, set
  expression: text("expression"), // formal logic or DSL
  parameters: jsonb("parameters"), // { min: 4, max: 12, unit: "m" }
  sourceCitations: jsonb("source_citations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectRuleSchema = createSelectSchema(rulesTable);
export const insertRuleSchema = createInsertSchema(rulesTable);
