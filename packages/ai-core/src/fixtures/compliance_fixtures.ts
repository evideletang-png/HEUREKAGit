import { RuleEvaluation, BusinessDecision } from "../schemas/compliance.js";

/**
 * Audit Point: Non-compliant (Height exceeds limit)
 */
export const EVALUATION_NON_COMPLIANT: RuleEvaluation = {
  rule_id: "RULE_H_UA_10",
  status: "non_compliant",
  impact_level: "blocking",
  expected_value: 9.0,
  actual_value: 11.2,
  justification: "Le projet déclare une hauteur à l'acrotère de 11.20m, dépassant le maximum de 9.00m autorisé par l'Article 10.",
  confidence: {
    score: 1.0,
    level: "high",
    review_status: "auto_ok",
    reason: "Direct comparison of unambiguous numerical values.",
    ambiguities: [],
    missing_critical_data: []
  },
  sources: [
    {
      document_id: "550e8400-e29b-41d4-a716-446655440003",
      file_name: "pcmi3_coupe.pdf",
      raw_snippet: "H=11.20m",
      relevance_score: 1.0
    }
  ]
};

/**
 * Audit Point: Uncertain (Missing data)
 */
export const EVALUATION_UNCERTAIN: RuleEvaluation = {
  rule_id: "RULE_CES_UA_9",
  status: "uncertain",
  impact_level: "major",
  expected_value: 0.4,
  actual_value: null,
  justification: "L'emprise au sol n'est pas précisée dans la notice et le plan de masse ne comporte pas de cotes parcellaires complètes.",
  confidence: {
    score: 0.5,
    level: "medium",
    review_status: "manual_required",
    reason: "Technical assessment of geometry is impossible without scale or labels.",
    ambiguities: ["Absence de cotes parcellaires"],
    missing_critical_data: ["emprise_au_sol"]
  },
  sources: []
};

/**
 * Final Business Decision: Unfavorable
 */
export const DECISION_DEF_BLOCAGE: BusinessDecision = {
  decision: "defavorable",
  overall_score: 0.2,
  blocking_points: ["Dépassement de la hauteur autorisée (+2.20m)"],
  required_actions: ["Réduire la hauteur du bâtiment pour se conformer à l'Article 10."],
  summary: "Le projet présente une non-conformité bloquante majeure sur la hauteur des constructions. Une révision architecturale est indispensable.",
  review_status: "manual_required",
  confidence: {
    score: 0.95,
    level: "high",
    review_status: "auto_ok",
    reason: "Failure is confirmed by three separate document sources (PCMI2, PCMI3, PCMI5).",
    ambiguities: [],
    missing_critical_data: []
  }
};
