import { evaluateFormalRules, NormalizedRule } from "../services/ruleEngine.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function testRuleEngine() {
  console.log("Running RuleEngine Unit Tests...");

  // Test 1: Simple numeric <=
  const rules1: NormalizedRule[] = [
    { id: "r1", zoneCode: "UA", article: "1", category: "hauteur", operator: "<=", value: 12, severity: "blocking" }
  ];
  const res1 = evaluateFormalRules({ hauteur: 10 }, rules1);
  assert(res1[0].status === "compliant", "10 should be compliant with <= 12");
  
  const res1b = evaluateFormalRules({ hauteur: 15 }, rules1);
  assert(res1b[0].status === "non_compliant", "15 should be non_compliant with <= 12");

  // Test 2: Between operator
  const rules2: NormalizedRule[] = [
    { id: "r2", zoneCode: "UA", article: "2", category: "recul", operator: "between", min: 3, max: 8, severity: "major" }
  ];
  const res2 = evaluateFormalRules({ recul: 5 }, rules2);
  assert(res2[0].status === "compliant", "5 should be in [3, 8]");
  
  const res2b = evaluateFormalRules({ recul: 2 }, rules2);
  assert(res2b[0].status === "non_compliant", "2 should be out of [3, 8]");

  // Test 3: Missing data
  const res3 = evaluateFormalRules({}, rules1);
  assert(res3[0].status === "uncertain", "Empty data should result in uncertain status");

  // Test 4: Unit handling
  const res4 = evaluateFormalRules({ hauteur: 13 }, rules1);
  assert(res4[0].reason.includes("maximum de 12"), "Reason should mention the threshold");

  console.log("✅ RuleEngine Unit Tests Passed!");
}

testRuleEngine().catch(err => {
  console.error("❌ Tests Failed:", err.message);
  process.exit(1);
});
