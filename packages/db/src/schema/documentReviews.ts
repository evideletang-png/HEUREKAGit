import { pgTable, text, timestamp, uuid, pgEnum, doublePrecision, boolean, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const documentTypeEnum = pgEnum("document_type", [
  "permis_de_construire",
  "declaration_prealable",
  "permis_amenager",
  "certificat_urbanisme",
  "autre",
]);

export const timelineStepEnum = pgEnum("timeline_step", [
  "depot",
  "analyse",
  "instruction",
  "pieces",
  "decision"
]);

export const documentReviewStatusEnum = pgEnum("document_review_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const pieceStatusEnum = pgEnum("piece_status", [
  "valide",
  "manquante",
  "incorrecte",
]);


export const documentReviewsTable = pgTable("document_reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  analysisId: uuid("analysis_id"),
  dossierId: uuid("dossier_id"),
  pieceCode: text("piece_code"),
  title: text("title").notNull(),
  documentType: documentTypeEnum("document_type").notNull().default("permis_de_construire"),
  fileName: text("file_name"),
  rawText: text("raw_text"),
  extractedDataJson: text("extracted_data_json"),
  comparisonResultJson: text("comparison_result_json"),
  status: documentReviewStatusEnum("status").notNull().default("pending"),
  pieceStatus: pieceStatusEnum("piece_status").default("manquante"),
  isRequested: boolean("is_requested").default(false),
  isResolved: boolean("is_resolved").default(false),
  timelineStep: timelineStepEnum("timeline_step").notNull().default("depot"),
  commune: text("commune"),
  address: text("address"),
  parcelRef: text("parcel_ref"),
  zoneCode: text("zone_code"),
  zoneLabel: text("zone_label"),
  documentNature: text("document_nature"),
  expertiseNotes: text("expertise_notes"),
  failureReason: text("failure_reason"),
  fileHash: text("file_hash"),
  confidenceScore: doublePrecision("confidence_score"),
  citationsJson: text("citations_json"),
  geometryJson: text("geometry_json"),
  
  // Nouveaux champs pour Phase 6-12
  serviceVisibility: jsonb("service_visibility").default(["citoyen", "mairie"]), // roles who can see this
  version: text("version").default("1"),
  parentId: uuid("parent_id"), // for versioning/replacements
  
  hasVisionAnalysis: boolean("has_vision_analysis").default(false),
  visionResultText: text("vision_result_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const selectDocumentReviewSchema = createSelectSchema(documentReviewsTable);
export const insertDocumentReviewSchema = createInsertSchema(documentReviewsTable);

export type DocumentReview = typeof documentReviewsTable.$inferSelect;
export type InsertDocumentReview = typeof documentReviewsTable.$inferInsert;
