import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dossiersTable } from "./dossiers";
import { usersTable } from "./users";

/**
 * Dossier Events Table
 * Tracks every state change and significant action on a dossier for the timeline.
 */
export const dossierEventsTable = pgTable("dossier_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dossierId: uuid("dossier_id").notNull().references(() => dossiersTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id), // Actor who performed the action
  type: text("type").notNull(), // STATUS_CHANGE, DOCUMENT_UPLOAD, MESSAGE, ASSIGNMENT, DECISION
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  description: text("description").notNull(),
  metadata: jsonb("metadata").default({}), 
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DossierEvent = typeof dossierEventsTable.$inferSelect;
export type InsertDossierEvent = typeof dossierEventsTable.$inferInsert;
