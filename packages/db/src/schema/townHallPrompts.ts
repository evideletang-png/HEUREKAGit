import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const townHallPromptsTable = pgTable("town_hall_prompts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  commune: text("commune").notNull().unique(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectTownHallPromptSchema = createSelectSchema(townHallPromptsTable);
export const insertTownHallPromptSchema = createInsertSchema(townHallPromptsTable);

export type TownHallPrompt = typeof townHallPromptsTable.$inferSelect;
export type InsertTownHallPrompt = typeof townHallPromptsTable.$inferInsert;
