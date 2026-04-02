import { resolveField, CandidateValue } from "./fieldResolutionService.js";
import { evaluateFormalRules, NormalizedRule } from "./ruleEngine.js";
import { generateBusinessDecision } from "./decisionLayerService.js";
import { buildAnalysisContext } from "./contextBuilder.js";

async function runVerification() {
  console.log("=== PHASE 36 VERIFICATION START ===");

  // 1. Test Field Resolution
  const candidates: CandidateValue<number>[] = [
    { source: "cerfa", value: 100, confidence: 0.9 },
    { source: "plan_masse", value: 105, confidence: 0.95 }
  ];
  
  const resolvedHeight = resolveField("hauteur", candidates);
  console.log("Field Resolution (hauteur):", resolvedHeight.value, resolvedHeight.status); 
  // Expected: 100 (if hauteur priority is cerfa) or 105 (if plan_masse priority) 
  // In our code: hauteur prioritizes ["plan_coupe", "elevation", "cerfa"]
  
  const resolvedEmprise = resolveField("emprise", candidates);
  console.log("Field Resolution (emprise):", resolvedEmprise.value, resolvedEmprise.status);
  // Expected: 105 (plan_masse takes priority over cerfa)

  // 2. Test Formal Rule Engine
  const rules: NormalizedRule[] = [
    { id: "r1", zoneCode: "UA", article: "Art 10", category: "hauteur", operator: "<=", value: 12, severity: "blocking" },
    { id: "r2", zoneCode: "UA", article: "Art 6", category: "recul", operator: ">=", value: 4, severity: "major" }
  ];
  
  const projectData = { hauteur: 11, recul: 3 };
  const evals = evaluateFormalRules(projectData, rules);
  console.log("Rule Evaluations:", evals.map(e => `${e.ruleId}: ${e.status} (${e.reason})`));

  // 3. Test Decision Layer
  const decision = generateBusinessDecision(evals, [resolvedEmprise], { missingCritical: [] });
  console.log("Final Business Decision:", decision.decision, "Score:", decision.score);
  console.log("Blocking Points:", decision.blockingPoints);
  console.log("Required Actions:", decision.requiredActions);

  console.log("=== PHASE 36 VERIFICATION COMPLETED ===");
}

runVerification().catch(console.error);
