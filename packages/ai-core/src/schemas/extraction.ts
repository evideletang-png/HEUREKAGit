import { z } from "zod";
import { AIConfidenceSchema } from "./confidence.js";
import { TraceabilityReferenceSchema } from "./traceability.js";

/**
 * Standard CERFA Extraction Model (Standardized Project Facts)
 */
export const CerfaExtractionSchema = z.object({
  document_type: z.enum(["PCMI", "PC", "DP", "CUa", "CUb", "autre"]),
  reference_form: z.string().optional(),
  applicant: z.object({
    name: z.string().optional(),
    is_company: z.boolean().default(false)
  }).optional(),
  project_address: z.string().optional(),
  cadastre: z.array(z.object({
    section: z.string(),
    parcel_number: z.string()
  })).default([]),
  surfaces: z.object({
    existing_m2: z.number().nullable().default(null),
    created_m2: z.number().nullable().default(null),
    taxable_m2: z.number().nullable().default(null)
  }).optional(),
  requested_height_m: z.number().nullable().default(null),
  requested_footprint_m2: z.number().nullable().default(null),
  parking_spaces: z.number().int().optional(),
  confidence: AIConfidenceSchema,
  sources: z.array(TraceabilityReferenceSchema).default([])
});

export type CerfaExtraction = z.infer<typeof CerfaExtractionSchema>;

/**
 * Standard PLU Rule Model
 */
export const PluRuleSchema = z.object({
  article: z.string().describe("Article number/identifier"),
  title: z.string().optional(),
  source_text: z.string().describe("Original legislation snippet"),
  operational_rule: z.string().describe("Human/Machine-readable interpretation"),
  constraints: z.array(z.object({
    category: z.string(), // e.g. "Height", "Footprint", "Setback"
    operator: z.enum(["<=", ">=", "=", "between"]),
    value: z.any()
  })).default([]),
  exceptions: z.array(z.string()).default([])
});

export type PluRule = z.infer<typeof PluRuleSchema>;

/**
 * Standard PLU Document Extraction result
 */
export const PluExtractionSchema = z.object({
  zone_code: z.string(),
  zone_label: z.string().optional(),
  articles: z.array(PluRuleSchema),
  confidence: AIConfidenceSchema,
  sources: z.array(TraceabilityReferenceSchema).default([])
});

export type PluExtraction = z.infer<typeof PluExtractionSchema>;
