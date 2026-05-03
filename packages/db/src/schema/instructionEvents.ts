import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dossiersTable } from "./dossiers";

export const instructionEventsTable = pgTable("instruction_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dossierId: uuid("dossier_id").notNull().references(() => dossiersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InstructionEvent = typeof instructionEventsTable.$inferSelect;
export type InsertInstructionEvent = typeof instructionEventsTable.$inferInsert;
