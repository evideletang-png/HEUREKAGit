import { z } from "zod";
import { EvidenceChunkSchema } from "./retrieval.js";
import { RuleEvaluationSchema, BusinessDecisionSchema } from "./compliance.js";

/**
 * GROUND TRUTH: Expected Retrieval Result
 */
export const ExpectedRetrievalSchema = z.object({
  query: z.string(),
  matching_article_ids: z.array(z.string()).describe("Articles that MUST be found (e.g. '10', '13')"),
  relevant_content_regex: z.string().optional().describe("Regex to verify 'grounded relevance' even if article ID differs"),
  forbidden_pool_ids: z.array(z.string()).optional().default([]).describe("Pools that MUST NOT be accessed (contamination check)")
});

/**
 * GROUND TRUTH: Expected Extraction Result
 */
export const ExpectedExtractionSchema = z.object({
  field_name: z.string(),
  expected_value: z.any().nullable(),
  is_uncertain: z.boolean().default(false).describe("True if the 'correct' behavior is to be uncertain/missing")
});

/**
 * GROUND TRUTH: Expected Compliance Decision
 */
export const ExpectedComplianceSchema = z.object({
  expected_decision: z.enum(["favorable", "favorable_avec_reserves", "incomplet", "defavorable", "incertain"]),
  expected_blocking_points: z.array(z.string()).optional(),
  should_require_manual_review: z.boolean().default(false)
});

/**
 * BENCHMARK TEST CASE: Canonical Input/Output for Evaluation
 */
export const BenchmarkTestCaseSchema = z.object({
  id: z.string(),
  insee: z.string(),
  dossier_type: z.string().default("PCMI"),
  input_text: z.string().describe("Dossier raw text or specific query for retrieval"),
  
  // Specific Expected Outcomes
  expected_retrieval: ExpectedRetrievalSchema.optional(),
  expected_extraction: z.array(ExpectedExtractionSchema).optional(),
  expected_compliance: ExpectedComplianceSchema.optional(),
  
  metadata: z.record(z.any()).optional()
});

export type BenchmarkTestCase = z.infer<typeof BenchmarkTestCaseSchema>;

/**
 * ACCURACY REPORT: Results for a single test run
 */
export const EvaluationResultSchema = z.object({
  case_id: z.string(),
  timestamp: z.string(),
  
  retrieval: z.object({
    strict_hit_rate: z.number(),      // Found specific article ID
    grounded_hit_rate: z.number(),    // Found relevant content via regex
    leak_rate: z.number(),             // From other cities
    pool_violation_rate: z.number(),   // From wrong pools
    archived_leak_rate: z.number()     // From archived doc pools
  }).optional(),

  extraction: z.object({
    exact_match_rate: z.number(),
    f1_score: z.number(),
    uncertainty_accuracy: z.number().describe("Did it correctly identify 'missing info'?")
  }).optional(),

  compliance: z.object({
    decision_agreement: z.boolean(),
    severity_alignment: z.boolean(),
    manual_review_alignment: z.boolean()
  }).optional()
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

/**
 * AGGREGATE SUMMARY: The final "Quality Dashboard" state
 */
export const AggregateAccuracyReportSchema = z.object({
  total_cases: z.number(),
  
  global_metrics: z.object({
    retrieval_strict_precision: z.number(),
    retrieval_grounded_precision: z.number(),
    retrieval_leak_rate: z.number(),
    
    extraction_accuracy: z.number(),
    uncertainty_handling_precision: z.number(),
    
    compliance_agreement: z.number()
  }),
  
  weak_spots: z.array(z.string()),
  contamination_risks: z.array(z.string()),
  recommendations: z.array(z.string())
});

export type AggregateAccuracyReport = z.infer<typeof AggregateAccuracyReportSchema>;
