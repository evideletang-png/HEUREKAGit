import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const aiPromptsTable = pgTable("ai_prompts", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AiPrompt = typeof aiPromptsTable.$inferSelect;
