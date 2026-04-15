import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { dossiersTable } from "./dossiers";
import { usersTable } from "./users";

export const appealsTable = pgTable("appeals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  linkedUrbanismCaseId: uuid("linked_urbanism_case_id").references(() => dossiersTable.id, { onDelete: "set null" }),
  appealType: text("appeal_type").notNull().default("signalement"),
  status: text("status").notNull().default("brouillon"),
  claimantRole: text("claimant_role").notNull(),
  claimantIdentity: jsonb("claimant_identity").default({}),
  beneficiaryIdentity: jsonb("beneficiary_identity").default({}),
  authorityIdentity: jsonb("authority_identity").default({}),
  projectAddress: text("project_address"),
  decisionReference: text("decision_reference"),
  permitType: text("permit_type"),
  postingStartDate: timestamp("posting_start_date"),
  postingEvidenceStatus: text("posting_evidence_status").default("a_confirmer"),
  filingDate: timestamp("filing_date"),
  notificationToAuthorityDate: timestamp("notification_to_authority_date"),
  notificationToBeneficiaryDate: timestamp("notification_to_beneficiary_date"),
  admissibilityScore: doublePrecision("admissibility_score"),
  urbanRiskScore: doublePrecision("urban_risk_score"),
  summary: text("summary"),
  commune: text("commune"),
  metadata: jsonb("metadata").default({}),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appealPartiesTable = pgTable("appeal_parties", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  appealId: uuid("appeal_id").notNull().references(() => appealsTable.id, { onDelete: "cascade" }),
  partyRole: text("party_role").notNull(),
  identity: jsonb("identity").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appealGroundsTable = pgTable("appeal_grounds", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  appealId: uuid("appeal_id").notNull().references(() => appealsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  linkedPluArticle: text("linked_plu_article"),
  linkedDocumentId: text("linked_document_id"),
  linkedExtractedMetric: text("linked_extracted_metric"),
  seriousnessScore: doublePrecision("seriousness_score"),
  responseDraft: text("response_draft"),
  status: text("status").notNull().default("a_qualifier"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appealDocumentsTable = pgTable("appeal_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  appealId: uuid("appeal_id").notNull().references(() => appealsTable.id, { onDelete: "cascade" }),
  uploadedBy: text("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  category: text("category"),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appealEventsTable = pgTable("appeal_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  appealId: uuid("appeal_id").notNull().references(() => appealsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appealNotificationsTable = pgTable("appeal_notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  appealId: uuid("appeal_id").notNull().references(() => appealsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("a_envoyer"),
  targetRole: text("target_role"),
  targetUserId: text("target_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at"),
  sentAt: timestamp("sent_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appealDeadlinesTable = pgTable("appeal_deadlines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  appealId: uuid("appeal_id").notNull().references(() => appealsTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  dueDate: timestamp("due_date").notNull(),
  status: text("status").notNull().default("a_surveiller"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appealMessagesTable = pgTable("appeal_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  appealId: uuid("appeal_id").notNull().references(() => appealsTable.id, { onDelete: "cascade" }),
  fromUserId: text("from_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  fromRole: text("from_role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const selectAppealSchema = createSelectSchema(appealsTable);
export const insertAppealSchema = createInsertSchema(appealsTable);

export type Appeal = typeof appealsTable.$inferSelect;
export type InsertAppeal = typeof appealsTable.$inferInsert;
export type AppealGround = typeof appealGroundsTable.$inferSelect;
export type AppealEvent = typeof appealEventsTable.$inferSelect;
