import { pgTable, text, timestamp, uuid, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const regulatoryCalibrationPermissionsTable = pgTable("regulatory_calibration_permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  communeId: text("commune_id").notNull(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  canEditCalibration: boolean("can_edit_calibration").notNull().default(false),
  canPublishRules: boolean("can_publish_rules").notNull().default(false),
  canManagePermissions: boolean("can_manage_permissions").notNull().default(false),
  assignedBy: text("assigned_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  communeIdx: index("reg_calibration_permissions_commune_idx").on(table.communeId),
  userIdx: index("reg_calibration_permissions_user_idx").on(table.userId),
  communeUserIdx: uniqueIndex("reg_calibration_permissions_commune_user_uidx").on(table.communeId, table.userId),
}));

export const selectRegulatoryCalibrationPermissionSchema = createSelectSchema(regulatoryCalibrationPermissionsTable);
export const insertRegulatoryCalibrationPermissionSchema = createInsertSchema(regulatoryCalibrationPermissionsTable);

export type RegulatoryCalibrationPermission = typeof regulatoryCalibrationPermissionsTable.$inferSelect;
export type InsertRegulatoryCalibrationPermission = typeof regulatoryCalibrationPermissionsTable.$inferInsert;
