import { integer, jsonb, pgTable, text, timestamp, uuid, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const projectsTable = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address"),
  parcelReferences: jsonb("parcel_references").default([]),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  commune: text("commune"),
  status: text("status").notNull().default("draft"),
  projectType: text("project_type").default("urbanisme"),
  progress: integer("progress").notNull().default(0),
  detectedConstraints: jsonb("detected_constraints").default([]),
  mainPluZone: text("main_plu_zone"),
  usedModules: jsonb("used_modules").default([]),
  alerts: jsonb("alerts").default([]),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projectTimelineEventsTable = pgTable("project_timeline_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  actorId: text("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  payload: jsonb("payload").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const selectProjectSchema = createSelectSchema(projectsTable);
export const insertProjectSchema = createInsertSchema(projectsTable);

export type Project = typeof projectsTable.$inferSelect;
export type InsertProject = typeof projectsTable.$inferInsert;
export type ProjectTimelineEvent = typeof projectTimelineEventsTable.$inferSelect;
