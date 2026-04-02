import { NormalizedRule, evaluateRules } from "./ruleEngine.js";

export interface Suggestion {
  issueId: string;
  category: string;
  currentValue: any;
  suggestedValue: any;
  delta: string;
  scoreImpact: number;
  message: string;
}

export interface SimulationResult {
  originalScore: number;
  simulatedScore: number;
  suggestions: Suggestion[];
}

/**
 * Simulation Engine.
 * Suggests modifications to reach compliance.
 */
export function simulateProjectModifications(
  project: any,
  rules: NormalizedRule[]
): SimulationResult {
  console.log(`[SimulationService] Simulating project modifications...`);

  // 1. Initial Evaluation
  const initialResults = evaluateRules(project, rules);
  const nonCompliant = initialResults.filter(r => r.status === "non_compliant");

  const suggestions: Suggestion[] = [];
  let scoreImpactTotal = 0;

  // 2. Generate Suggestions for each non-compliance
  nonCompliant.forEach(nc => {
    let suggestedValue: any = null;
    let scoreImpact = 0;
    let delta = "";

    const rule = rules.find(r => r.id === nc.ruleId);
    if (!rule) return;

    const category = rule.category;

    switch (category) {
      case "hauteur":
        if (rule.max !== undefined) {
          suggestedValue = rule.max;
          delta = `Reduire de ${(nc.actual - suggestedValue).toFixed(2)}m`;
          scoreImpact = 30; // Weight for height
        }
        break;

      case "recul":
        if (rule.min !== undefined) {
          suggestedValue = rule.min;
          delta = `Augmenter de ${(suggestedValue - (nc.actual || 0)).toFixed(2)}m`;
          scoreImpact = 20; // Weight for setback
        }
        break;

      case "emprise":
        if (rule.max !== undefined) {
          suggestedValue = rule.max;
          delta = `Reduire de ${(nc.actual - suggestedValue).toFixed(2)}m²`;
          scoreImpact = 15;
        }
        break;
    }

    if (suggestedValue !== null) {
      suggestions.push({
        issueId: nc.ruleId,
        category: category,
        currentValue: nc.actual,
        suggestedValue,
        delta,
        scoreImpact,
        message: `Suggestion: ${delta} pour la règle ${rule.article}.`
      });
      scoreImpactTotal += scoreImpact;
    }
  });

  // Calculate scores (normalized to 100)
  const originalScore = Math.max(0, 100 - scoreImpactTotal);
  const simulatedScore = 100; // If all suggestions are applied

  return {
    originalScore,
    simulatedScore,
    suggestions
  };
}
