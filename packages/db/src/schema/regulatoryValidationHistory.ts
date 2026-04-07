import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const regulatoryValidationHistoryTable = pgTable("regulatory_validation_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  action: text("action").notNull(),
  note: text("note"),
  userId: text("user_id"),
  snapshot: jsonb("snapshot").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("regulatory_validation_history_commune_idx").on(table.communeId),
  entityIdx: index("regulatory_validation_history_entity_idx").on(table.entityType, table.entityId),
}));

export const selectRegulatoryValidationHistorySchema = createSelectSchema(regulatoryValidationHistoryTable);
export const insertRegulatoryValidationHistorySchema = createInsertSchema(regulatoryValidationHistoryTable);

export type RegulatoryValidationHistory = typeof regulatoryValidationHistoryTable.$inferSelect;
export type InsertRegulatoryValidationHistory = typeof regulatoryValidationHistoryTable.$inferInsert;
