import { BenchmarkTestCase, EvaluationResult } from "../schemas/eval.js";
import { EvidenceChunk } from "../schemas/retrieval.js";
import { BusinessDecision } from "../schemas/compliance.js";

/**
 * CALCULATE RETRIEVAL METRICS
 * Tracks strict article hits, grounded relevance, and contamination rates.
 */
export function calculateRetrievalMetrics(
  actualChunks: EvidenceChunk[],
  expected: BenchmarkTestCase["expected_retrieval"],
  targetInsee: string
): EvaluationResult["retrieval"] {
  if (!expected) return undefined;

  const total = actualChunks.length;
  if (total === 0) {
    return {
      strict_hit_rate: 0,
      grounded_hit_rate: 0,
      leak_rate: 0,
      pool_violation_rate: 0,
      archived_leak_rate: 0
    };
  }

  // 1. Strict Article Hit Rate (Based on Metadata)
  const strictHits = actualChunks.filter(c => 
    c.metadata.article_id && expected.matching_article_ids.includes(c.metadata.article_id)
  ).length;

  // 2. Grounded Relevance Hit Rate (Based on Content Regex)
  let groundedHits = 0;
  if (expected.relevant_content_regex) {
    const rx = new RegExp(expected.relevant_content_regex, "i");
    groundedHits = actualChunks.filter(c => rx.test(c.content)).length;
  } else {
    groundedHits = strictHits; // Fallback to strict if no regex provided
  }

  // 3. Contamination Metrics
  const leaks = actualChunks.filter(c => 
    c.metadata.commune && c.metadata.commune !== targetInsee && c.metadata.commune !== "NATIONAL"
  ).length;

  const poolViolations = expected.forbidden_pool_ids.length > 0
    ? actualChunks.filter(c => expected.forbidden_pool_ids.includes(c.metadata.pool_id)).length
    : 0;

  const archivedLeaks = actualChunks.filter(c => c.metadata.status === "archived").length;

  return {
    strict_hit_rate: strictHits / total,
    grounded_hit_rate: groundedHits / total,
    leak_rate: leaks / total,
    pool_violation_rate: poolViolations / total,
    archived_leak_rate: archivedLeaks / total
  };
}

/**
 * CALCULATE EXTRACTION METRICS
 * Compares actual extracted fields with ground truth.
 */
export function calculateExtractionMetrics(
  actualFields: Record<string, any>,
  expected: BenchmarkTestCase["expected_extraction"]
): EvaluationResult["extraction"] {
  if (!expected || expected.length === 0) return undefined;

  let exactMatches = 0;
  let correctUncertainty = 0;

  expected.forEach(exp => {
    const actualRaw = actualFields[exp.field_name];
    const actual = (actualRaw && typeof actualRaw === 'object' && 'value' in actualRaw) ? actualRaw.value : actualRaw;
    
    // Exact Match Logic (Normalized)
    const normalizedActual = String(actual || "").trim().toLowerCase();
    const normalizedExpected = String(exp.expected_value || "").trim().toLowerCase();
    
    if (normalizedActual === normalizedExpected) {
      exactMatches++;
    }

    // Uncertainty / Missing Info Logic
    const isActuallyMissing = actual === null || actual === undefined || actual === "";
    if (isActuallyMissing === exp.is_uncertain) {
      correctUncertainty++;
    }
  });

  return {
    exact_match_rate: exactMatches / expected.length,
    f1_score: exactMatches / expected.length, // Simplified F1 for fixed-field extraction
    uncertainty_accuracy: correctUncertainty / expected.length
  };
}

/**
 * CALCULATE COMPLIANCE METRICS
 * Checks if the final decision and manual review status align with ground truth.
 */
export function calculateComplianceMetrics(
  actualDecision: BusinessDecision,
  expected: BenchmarkTestCase["expected_compliance"]
): EvaluationResult["compliance"] {
  if (!expected) return undefined;

  const decisionAgreement = actualDecision.decision === expected.expected_decision;
  
  // Did it correctly identify when a human needs to intervene?
  const manualReviewAlignment = (actualDecision.review_status === "manual_required") === expected.should_require_manual_review;

  return {
    decision_agreement: decisionAgreement,
    severity_alignment: decisionAgreement, // Could be more complex (e.g., major vs minor)
    manual_review_alignment: manualReviewAlignment
  };
}
