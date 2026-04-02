import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "system"]);

export const analysisChatMessagesTable = pgTable("analysis_chat_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  analysisId: uuid("analysis_id").notNull(),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const selectAnalysisChatMessageSchema = createSelectSchema(analysisChatMessagesTable);
export const insertAnalysisChatMessageSchema = createInsertSchema(analysisChatMessagesTable);

export type AnalysisChatMessage = typeof analysisChatMessagesTable.$inferSelect;
export type InsertAnalysisChatMessage = typeof analysisChatMessagesTable.$inferInsert;
