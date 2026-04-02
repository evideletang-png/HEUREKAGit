import { pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const municipalityLearningsTable = pgTable("municipality_learnings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  commune: text("commune").notNull().unique(),
  strictnessMap: jsonb("strictness_map"), // { height: 0.9, setbacks: 0.5 }
  commonIssues: jsonb("common_issues"), // ["Missing PCMI8", "Surface mismatch"]
  favorableCount: integer("favorable_count").default(0),
  unfavorableCount: integer("unfavorable_count").default(0),
  patterns: jsonb("patterns"), // specific trends
  overrides: jsonb("overrides").default([]), // [{ category, originalRule, humanCorrection, reason }]
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectMunicipalityLearningSchema = createSelectSchema(municipalityLearningsTable);
export const insertMunicipalityLearningSchema = createInsertSchema(municipalityLearningsTable);
