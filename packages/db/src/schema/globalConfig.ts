import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const globalConfigsTable = pgTable("global_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "finance_formulas"
  value: jsonb("value").notNull(), // The dynamic formulas JSON
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectGlobalConfigSchema = createSelectSchema(globalConfigsTable);
export const insertGlobalConfigSchema = createInsertSchema(globalConfigsTable);
