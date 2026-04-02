import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { dossiersTable } from "./dossiers";

/**
 * Notifications Table
 * Tracks alerts and tasks assigned to specific users.
 */
export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  dossierId: uuid("dossier_id").references(() => dossiersTable.id, { onDelete: "set null" }),
  type: text("type").notNull(), // 'MENTION', 'MESSAGE', 'NEW_DOSSIER', 'STATUS_CHANGE'
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  priority: text("priority").notNull().default("MEDIUM"), // 'LOW', 'MEDIUM', 'HIGH'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
