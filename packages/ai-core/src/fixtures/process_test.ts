import { 
  CerfaExtractionSchema, 
  PluExtractionSchema, 
  RuleEvaluationSchema,
  BusinessDecisionSchema
} from "../schemas/index.js";
import * as fixtures from "./index.js";

/**
 * Validator script to ensure fixtures match their Zod schemas.
 * (This acts as a basic unit test for data structure integrity).
 */
function validateFixtures() {
  console.log("🚀 Starting AI Core Fixture Validation...");

  try {
    // 1. CERFA
    CerfaExtractionSchema.parse(fixtures.CERFA_IDEAL);
    CerfaExtractionSchema.parse(fixtures.CERFA_NOISY);
    CerfaExtractionSchema.parse(fixtures.CERFA_INCOMPLETE);
    console.log("✅ CERFA Fixtures: Valid");

    // 2. PLU
    PluExtractionSchema.parse(fixtures.PLU_IDEAL);
    PluExtractionSchema.parse(fixtures.PLU_AMBIGUOUS);
    PluExtractionSchema.parse(fixtures.PLU_EXCEPTION_HEAVY);
    console.log("✅ PLU Fixtures: Valid");

    // 3. Compliance
    RuleEvaluationSchema.parse(fixtures.EVALUATION_NON_COMPLIANT);
    RuleEvaluationSchema.parse(fixtures.EVALUATION_UNCERTAIN);
    BusinessDecisionSchema.parse(fixtures.DECISION_DEF_BLOCAGE);
    console.log("✅ Compliance Fixtures: Valid");

    console.log("\n✨ ALL FIXTURES ARE SCHEMA-COMPLIANT.");
  } catch (err) {
    console.error("❌ FIXTURE VALIDATION FAILED:", err);
    process.exit(1);
  }
}

validateFixtures();
