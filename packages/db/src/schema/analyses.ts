import { pgTable, text, timestamp, pgEnum, doublePrecision, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const analysisStatusEnum = pgEnum("analysis_status", [
  "draft",
  "collecting_data",
  "parsing_documents",
  "extracting_rules",
  "calculating",
  "completed",
  "failed",
]);

export const analysesTable = pgTable("analyses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title"),
  address: text("address").notNull(),
  city: text("city"),
  postalCode: text("postal_code"),
  parcelRef: text("parcel_ref"),
  zoneCode: text("zone_code"),
  zoningLabel: text("zoning_label"),
  status: analysisStatusEnum("status").notNull().default("draft"),
  summary: text("summary"),
  confidenceScore: doublePrecision("confidence_score"),
  geoContextJson: text("geo_context_json"),
  globalScore: integer("global_score").default(100),
  severityWeightsJson: text("severity_weights_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const parcelsTable = pgTable("parcels", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  cadastralSection: text("cadastral_section"),
  parcelNumber: text("parcel_number"),
  parcelSurfaceM2: doublePrecision("parcel_surface_m2"),
  geometryJson: text("geometry_json"),
  centroidLat: doublePrecision("centroid_lat"),
  centroidLng: doublePrecision("centroid_lng"),
  roadFrontageLengthM: doublePrecision("road_frontage_length_m"),
  sideBoundaryLengthM: doublePrecision("side_boundary_length_m"),
  metadataJson: text("metadata_json"),
});

export const buildingsTable = pgTable("buildings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  footprintM2: doublePrecision("footprint_m2"),
  estimatedFloorAreaM2: doublePrecision("estimated_floor_area_m2"),
  avgHeightM: doublePrecision("avg_height_m"),
  avgFloors: doublePrecision("avg_floors"),
  geometryJson: text("geometry_json"),
  metadataJson: text("metadata_json"),
});

export const planningDocumentsTable = pgTable("planning_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  documentType: text("document_type"),
  title: text("title"),
  sourceUrl: text("source_url"),
  filePath: text("file_path"),
  rawText: text("raw_text"),
  parsedJson: text("parsed_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const zoneAnalysesTable = pgTable("zone_analyses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  zoneCode: text("zone_code"),
  zoneLabel: text("zone_label"),
  sourceExcerpt: text("source_excerpt"),
  structuredJson: text("structured_json"),
  issuesJson: text("issues_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ruleArticlesTable = pgTable("rule_articles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  zoneAnalysisId: text("zone_analysis_id").notNull().references(() => zoneAnalysesTable.id, { onDelete: "cascade" }),
  articleNumber: integer("article_number").notNull(),
  title: text("title").notNull(),
  sourceText: text("source_text"),
  summary: text("summary"),
  structuredJson: text("structured_json"),
  impactText: text("impact_text"),
  vigilanceText: text("vigilance_text"),
  confidence: text("confidence").default("unknown"),
});

export const constraintsTable = pgTable("constraints", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull().default("info"),
  source: text("source"),
});

export const buildabilityResultsTable = pgTable("buildability_results", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  maxFootprintM2: doublePrecision("max_footprint_m2"),
  remainingFootprintM2: doublePrecision("remaining_footprint_m2"),
  maxHeightM: doublePrecision("max_height_m"),
  setbackRoadM: doublePrecision("setback_road_m"),
  setbackBoundaryM: doublePrecision("setback_boundary_m"),
  parkingRequirement: text("parking_requirement"),
  greenSpaceRequirement: text("green_space_requirement"),
  assumptionsJson: text("assumptions_json"),
  sourceDetailsJson: text("source_details_json"),
  confidenceScore: doublePrecision("confidence_score").notNull().default(0),
  resultSummary: text("result_summary"),
});

export const generatedReportsTable = pgTable("generated_reports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  htmlContent: text("html_content"),
  pdfPath: text("pdf_path"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const eventLogsTable = pgTable("event_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  analysisId: text("analysis_id").notNull().references(() => analysesTable.id, { onDelete: "cascade" }),
  step: text("step").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  payloadJson: text("payload_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAnalysisSchema = createInsertSchema(analysesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analysesTable.$inferSelect;
export type Parcel = typeof parcelsTable.$inferSelect;
export type Building = typeof buildingsTable.$inferSelect;
export type ZoneAnalysis = typeof zoneAnalysesTable.$inferSelect;
export type RuleArticle = typeof ruleArticlesTable.$inferSelect;
export type Constraint = typeof constraintsTable.$inferSelect;
export type BuildabilityResult = typeof buildabilityResultsTable.$inferSelect;
export type GeneratedReport = typeof generatedReportsTable.$inferSelect;
export type EventLog = typeof eventLogsTable.$inferSelect;
