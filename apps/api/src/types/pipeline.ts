import { z } from "zod";

/**
 * Common Schemas for the Regulatory Pipeline
 */

export const NormalizedRuleSchema = z.object({
  id: z.string(),
  zoneCode: z.string(),
  article: z.string(),
  category: z.string(),
  operator: z.enum(["<=", ">=", "=", "between", "in"]),
  value: z.any().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().optional(),
  severity: z.enum(["blocking", "major", "minor"]),
  sourceCitation: z.object({
    documentId: z.string(),
    page: z.number(),
    excerpt: z.string()
  }).optional()
});

export const RuleEvaluationSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["compliant", "non_compliant", "uncertain", "not_applicable"]),
  expected: z.any().optional(),
  actual: z.any().optional(),
  severity: z.enum(["blocking", "major", "minor"]),
  reason: z.string()
});

export const ResolvedFieldSchema = z.object({
  field: z.string(),
  value: z.any().nullable(),
  status: z.enum(["resolved", "conflict", "uncertain"]),
  confidence: z.number(),
  chosenSource: z.string().optional(),
  candidates: z.array(z.object({
    source: z.string(),
    value: z.any(),
    confidence: z.number()
  }))
});

export const BusinessDecisionSchema = z.object({
  decision: z.enum(["favorable", "favorable_avec_reserves", "incomplet", "defavorable", "incertain"]),
  score: z.number(),
  requiredActions: z.array(z.string()),
  blockingPoints: z.array(z.string()),
  unresolvedConflicts: z.array(z.string()),
  justification: z.string(),
  confidence: z.number(),
  engineVersion: z.string().default("1.0.0-stable"),
  requestId: z.string().uuid().optional(),
  timestamp: z.string().optional(),
  traceability: z.array(z.object({
    source: z.string(),
    excerpt: z.string(),
    page: z.number().optional()
  })).optional(),
  metrics: z.object({
    executionTimeMs: z.number(),
    tokenUsage: z.number(),
    estimatedCostUsd: z.number()
  }).optional()
});

export type NormalizedRule = z.infer<typeof NormalizedRuleSchema>;
export type RuleEvaluation = z.infer<typeof RuleEvaluationSchema>;
export type ResolvedField = z.infer<typeof ResolvedFieldSchema>;
export type BusinessDecision = z.infer<typeof BusinessDecisionSchema>;
