import { pgTable, text, timestamp, uuid, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const simulationsTable = pgTable("simulations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dossierId: uuid("dossier_id").notNull(),
  userId: uuid("user_id").notNull(),
  baseData: jsonb("base_data").notNull(), // ExtractedDocumentData
  modifiedData: jsonb("modified_data").notNull(), // Project delta
  scoreDelta: doublePrecision("score_delta"),
  recommendations: jsonb("recommendations"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectSimulationSchema = createSelectSchema(simulationsTable);
export const insertSimulationSchema = createInsertSchema(simulationsTable);
