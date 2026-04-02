import { pgTable, text, timestamp, uuid, jsonb, boolean } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const dossiersTable = pgTable("dossiers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  typeProcedure: text("type_procedure").notNull(), // PC, DP, PA, PD, CUa, CUb
  status: text("status").notNull().default("BROUILLON"), 
  // BROUILLON, DEPOSE, PRE_INSTRUCTION, INCOMPLET, TRANSMIS_METROPOLE, EN_INSTRUCTION, ATTENTE_ABF, AVANT_PROJET, AVIS_ABF_RECU, DECISION_EN_COURS, ACCEPTE, REFUSE, ACCORD_PRESCRIPTION
  
  dossierNumber: text("dossier_number"),
  title: text("title").notNull(),
  address: text("address"),
  commune: text("commune"),
  metadata: jsonb("metadata").default({}),
  
  assignedMetropoleId: text("assigned_metropole_id"),
  assignedAbfId: text("assigned_abf_id"),
  isAbfConcerned: boolean("is_abf_concerned").default(false),
  
  instructionStartedAt: timestamp("instruction_started_at"),
  timeline: jsonb("timeline").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectDossierSchema = createSelectSchema(dossiersTable);
export const insertDossierSchema = createInsertSchema(dossiersTable);

export type Dossier = typeof dossiersTable.$inferSelect;
export type InsertDossier = typeof dossiersTable.$inferInsert;
