import { z } from "zod";
import { AIConfidenceSchema, ReviewStatusSchema } from "./confidence.js";
import { TraceabilityReferenceSchema } from "./traceability.js";

/**
 * Standard Rule Evaluation (Audit point)
 */
export const RuleEvaluationSchema = z.object({
  rule_id: z.string(),
  status: z.enum(["compliant", "non_compliant", "uncertain", "not_applicable"]),
  impact_level: z.enum(["blocking", "major", "minor"]),
  expected_value: z.any().optional(),
  actual_value: z.any().optional(),
  justification: z.string(),
  confidence: AIConfidenceSchema,
  sources: z.array(TraceabilityReferenceSchema).default([])
});

export type RuleEvaluation = z.infer<typeof RuleEvaluationSchema>;

/**
 * Standard Field Resolution (Consolidated project fact from multiple docs)
 */
export const ResolvedFieldSchema = z.object({
  field_name: z.string(),
  value: z.any().nullable(),
  status: z.enum(["resolved", "conflict", "uncertain"]),
  confidence: AIConfidenceSchema,
  candidates: z.array(z.object({
    source_doc_id: z.string().uuid(),
    value: z.any(),
    confidence_score: z.number()
  }))
});

export type ResolvedField = z.infer<typeof ResolvedFieldSchema>;

/**
 * Final Business Decision (The "Red/Green Light" for a dossier)
 */
export const BusinessDecisionSchema = z.object({
  decision: z.enum(["favorable", "favorable_avec_reserves", "incomplet", "defavorable", "incertain"]),
  overall_score: z.number().min(0).max(1),
  blocking_points: z.array(z.string()).default([]),
  required_actions: z.array(z.string()).default([]),
  summary: z.string(),
  review_status: ReviewStatusSchema,
  confidence: AIConfidenceSchema,
  metadata: z.record(z.any()).optional()
});

export type BusinessDecision = z.infer<typeof BusinessDecisionSchema>;
