import { RuleEvaluation, RuleEvaluationSchema, AIConfidence } from "@workspace/ai-core";

export interface NormalizedRule {
  id: string;
  zoneCode: string;
  article: string;
  category: string;
  operator: "<=" | ">=" | "=" | "between" | "in";
  value?: number;
  min?: number;
  max?: number;
  unit?: string;
  conditions?: Record<string, any>;
  severity: "blocking" | "major" | "minor";
  sourceCitation?: {
    documentId: string;
    page: number;
    excerpt: string;
  };
}

/**
 * Deterministic Formal Rule Engine.
 */
export function evaluateFormalRules(
  projectData: any,
  rules: NormalizedRule[]
): RuleEvaluation[] {
  console.log(`[RuleEngine] Evaluating ${rules.length} formal rules...`);

  return rules.map(rule => {
    const actualValue = projectData[rule.category] ?? projectData[`requested_${rule.category}_m2`] ?? projectData[`requested_${rule.category}_m`];
    
    const missingDataConfidence: AIConfidence = {
      score: 0.5,
      level: "medium",
      review_status: "manual_required",
      reason: `Donnée '${rule.category}' manquante`,
      ambiguities: [],
      missing_critical_data: [rule.category]
    };

    if (actualValue === undefined || actualValue === null) {
      return {
        rule_id: rule.id,
        status: "uncertain",
        impact_level: rule.severity,
        justification: `Donnée '${rule.category}' manquante dans le dossier.`,
        confidence: missingDataConfidence,
        sources: []
      };
    }

    let isCompliant = false;
    let reason = "";

    switch (rule.operator) {
      case "<=":
        isCompliant = actualValue <= (rule.value ?? rule.max ?? Infinity);
        reason = isCompliant ? "Valeur conforme." : `Dépassement du maximum de ${rule.value || rule.max}${rule.unit || ""}.`;
        break;
      case ">=":
        isCompliant = actualValue >= (rule.value ?? rule.min ?? 0);
        reason = isCompliant ? "Valeur conforme." : `Inférieur au minimum de ${rule.value || rule.min}${rule.unit || ""}.`;
        break;
      case "=":
        isCompliant = actualValue === rule.value;
        reason = isCompliant ? "Valeur conforme." : `Valeur attendue: ${rule.value}${rule.unit || ""}.`;
        break;
      case "between":
        isCompliant = actualValue >= (rule.min ?? 0) && actualValue <= (rule.max ?? Infinity);
        reason = isCompliant ? "Valeur dans la plage." : `Hors plage [${rule.min}, ${rule.max}]${rule.unit || ""}.`;
        break;
      case "in":
        const set = Array.isArray(rule.value) ? rule.value : [rule.value];
        isCompliant = set.includes(actualValue);
        break;
    }

    const defaultConfidence: AIConfidence = {
      score: 1.0,
      level: "high",
      review_status: isCompliant ? "auto_ok" : "review_recommended",
      reason: "Deterministic rule engine evaluation",
      ambiguities: [],
      missing_critical_data: []
    };

    return {
      rule_id: rule.id,
      status: isCompliant ? "compliant" : "non_compliant",
      impact_level: rule.severity,
      expected_value: rule.operator === "between" ? [rule.min, rule.max] : rule.value,
      actual_value: actualValue,
      justification: reason,
      confidence: defaultConfidence,
      sources: rule.sourceCitation ? [{
        document_id: rule.sourceCitation.documentId,
        page_number: rule.sourceCitation.page,
        raw_snippet: rule.sourceCitation.excerpt,
        relevance_score: 1.0
      }] : []
    };
  });
}

// Keep backward compatibility for now if needed by other services
export { evaluateFormalRules as evaluateRules };
export type { RuleEvaluation };
