import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const baseIABatchesTable = pgTable("base_ia_batches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("processing"), // processing, completed, partial_failure, failed
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectBaseIABatchSchema = createSelectSchema(baseIABatchesTable);
export const insertBaseIABatchSchema = createInsertSchema(baseIABatchesTable);
