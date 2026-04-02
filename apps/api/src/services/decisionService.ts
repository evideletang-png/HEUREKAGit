import { RuleEvaluation } from "./ruleEngine.js";
// @ts-nocheck

export type DecisionStatus = "favorable" | "unfavorable" | "favorable_avec_prescriptions" | "sursis_a_statuer";

export interface DecisionOutcome {
  status: DecisionStatus;
  summary: string;
  prescriptions: string[];
  blockingIssues: string[];
  confidence: number;
}

/**
 * Decision Layer.
 * Converts rule evaluations into a formal regulatory decision.
 */
export function generateFormalDecision(results: RuleEvaluation[]): DecisionOutcome {
  console.log(`[DecisionService] Generating formal decision...`);

  const blockingRecs = results.filter(r => r.status === "non_compliant" && r.severity === "blocking");
  const majorRecs = results.filter(r => r.status === "non_compliant" && r.severity === "major");
  const minorRecs = results.filter(r => r.status === "non_compliant" && r.severity === "minor");

  let status: DecisionStatus = "favorable";
  const prescriptions: string[] = [];
  const blockingIssues: string[] = [];

  if (blockingRecs.length > 0) {
    status = "unfavorable";
    blockingIssues.push(...blockingRecs.map(r => `Erreur: ${r.reason}`));
  } else if (majorRecs.length > 0) {
    status = "favorable_avec_prescriptions";
    prescriptions.push(...majorRecs.map(r => `Ajustement requis pour l'article ${r.article} (${r.category}).`));
  } else if (minorRecs.length > 0) {
    status = "favorable";
    prescriptions.push(...minorRecs.map(r => `Note: ${r.reason}`));
  }

  const summary = status === "favorable" 
    ? "Le projet respecte l'ensemble des dispositions impératives du règlement d'urbanisme."
    : status === "unfavorable"
    ? `Le projet présente ${blockingIssues.length} point(s) de non-conformité bloquant(s).`
    : "Le projet est globalement conforme mais nécessite des ajustements mineurs ou des prescriptions spécifiques.";

  return {
    status,
    summary,
    prescriptions,
    blockingIssues,
    confidence: 1.0 // Deterministic decision always has 100% confidence in its own logic
  };
}
