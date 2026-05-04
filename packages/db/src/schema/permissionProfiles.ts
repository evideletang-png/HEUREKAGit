import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const permissionProfilesTable = pgTable("permission_profiles", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  actorType: text("actor_type").notNull(),
  roleKey: text("role_key").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  actorRoleIdx: index("permission_profiles_actor_role_idx").on(table.actorType, table.roleKey),
}));

export type PermissionProfile = typeof permissionProfilesTable.$inferSelect;
export type InsertPermissionProfile = typeof permissionProfilesTable.$inferInsert;
