import { RuleEvaluation } from "@workspace/ai-core";
import { ResolvedField } from "./fieldResolutionService.js";

export type FinalDecisionStatus = "favorable" | "favorable_avec_reserves" | "incomplet" | "defavorable" | "incertain";

export interface BusinessDecision {
  decision: FinalDecisionStatus;
  overall_score: number;
  required_actions: string[];
  blocking_points: string[];
  unresolved_conflicts: string[];
  summary: string;
  review_status: "auto_ok" | "review_recommended" | "manual_required";
  confidence: {
    score: number;
    level: "high" | "medium" | "low";
    review_status: "auto_ok" | "review_recommended" | "manual_required";
    reason?: string;
  };
}

/**
 * Decision Layer Service.
 * Converts technical evaluations into a final regulatory business decision.
 */
export function generateBusinessDecision(
  evaluations: RuleEvaluation[],
  resolvedFields: ResolvedField<any>[],
  completeness: { missingCritical: string[] }
): BusinessDecision {
  console.log(`[DecisionLayer] Generating final decision...`);

  const blockingIssues = evaluations.filter(e => e.status === "non_compliant" && e.impact_level === "blocking");
  const majorIssues = evaluations.filter(e => e.status === "non_compliant" && e.impact_level === "major");
  const conflicts = resolvedFields.filter(f => f.status === "conflict");
  
  let decision: FinalDecisionStatus = "favorable";
  const required_actions: string[] = [];
  const blocking_points: string[] = [];
  const unresolved_conflicts: string[] = conflicts.map(c => `Conflit sur ${c.field} entre ${(c as any).candidates.map((cand: any) => cand.source).join(" et ")}`);

  // 1. Completeness check
  if (completeness.missingCritical.length > 0) {
    decision = "incomplet";
    required_actions.push(...completeness.missingCritical.map(m => `Ajouter le document: ${m}`));
  }

  // 2. Compliance check
  if (blockingIssues.length > 0) {
    decision = "defavorable";
    blocking_points.push(...blockingIssues.map(i => `${i.justification}`));
  } else if (majorIssues.length > 0) {
    if (decision !== "incomplet") decision = "favorable_avec_reserves";
    required_actions.push(...majorIssues.map(i => `Ajustement requis: ${i.justification}`));
  }

  // 3. Uncertainty check
  if (evaluations.filter(e => e.status === "uncertain").length > 3 || conflicts.length > 2) {
    if (decision === "favorable") decision = "incertain";
  }

  // 4. Calculate final confidence
  const techConfidence = evaluations.length > 0 
    ? evaluations.reduce((acc, e) => acc + (e.status === "uncertain" ? 0.5 : 1.0), 0) / evaluations.length
    : 1.0;
  
  const conflictPenalty = conflicts.length * 0.1;
  const finalConfidenceScore = Math.max(0, techConfidence - conflictPenalty);

  const confidenceLevel = finalConfidenceScore > 0.8 ? "high" : finalConfidenceScore > 0.5 ? "medium" : "low";
  
  // Review Status logic
  const review_status = (conflicts.length > 0 || finalConfidenceScore < 0.6 || decision === "defavorable") 
    ? "manual_required" 
    : (finalConfidenceScore < 0.9 || decision !== "favorable") 
      ? "review_recommended" 
      : "auto_ok";

  // 5. Score (Normalized 0-1)
  const score = Math.max(0, 100 - (blockingIssues.length * 50) - (majorIssues.length * 15)) / 100;

  const summary = decision === "favorable"
    ? "Le projet respecte l'ensemble des dispositions impératives du règlement."
    : decision === "defavorable"
    ? "Le projet présente des non-conformités majeures bloquant la délivrance du permis."
    : decision === "incomplet"
    ? "Des pièces obligatoires manquent au dossier pour permettre une instruction complète."
    : "Le projet nécessite des modifications mineures ou présente des incertitudes techniques.";

  return {
    decision,
    overall_score: score,
    required_actions,
    blocking_points,
    unresolved_conflicts,
    summary,
    review_status,
    confidence: {
      score: finalConfidenceScore,
      level: confidenceLevel,
      review_status,
      reason: `Confidence based on ${evaluations.length} evaluations and ${conflicts.length} conflicts.`
    }
  };
}
