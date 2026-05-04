import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const userAssignmentsTable = pgTable("user_assignments", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  roleKey: text("role_key").notNull(),
  profileKey: text("profile_key"),
  scopeType: text("scope_type").notNull(),
  scopeId: text("scope_id"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("user_assignments_user_id_idx").on(table.userId),
  scopeIdx: index("user_assignments_scope_idx").on(table.scopeType, table.scopeId),
}));

export type UserAssignment = typeof userAssignmentsTable.$inferSelect;
export type InsertUserAssignment = typeof userAssignmentsTable.$inferInsert;
