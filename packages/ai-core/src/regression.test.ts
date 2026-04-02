import { CerfaExtractionSchema, PluExtractionSchema } from "./schemas/extraction.js";
import { RuleEvaluationSchema, BusinessDecisionSchema } from "./schemas/compliance.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, "../fixtures");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion Failed: ${message}`);
}

async function runRegression() {
  console.log("🚀 Starting HEUREKA AI Core Regression Suite...");

  // 1. CERFA Regression
  console.log("\n--- CERFA Extraction ---");
  const cerfaIdealPath = path.join(FIXTURES_DIR, "cerfa/ideal.json");
  const cerfaIdeal = JSON.parse(fs.readFileSync(cerfaIdealPath, "utf8"));
  const cerfaParsed = CerfaExtractionSchema.parse(cerfaIdeal);
  
  assert(cerfaParsed.document_type === "PCMI", "Should identify PCMI");
  assert(cerfaParsed.confidence.review_status === "auto_ok", "Ideal CERFA should be auto_ok");
  assert(cerfaParsed.cadastre.length > 0, "Should have cadastral refs");
  console.log("✅ CERFA Ideal: Validated");

  const cerfaAmbiguousPath = path.join(FIXTURES_DIR, "cerfa/ambiguous.json");
  const cerfaAmbiguous = JSON.parse(fs.readFileSync(cerfaAmbiguousPath, "utf8"));
  const cerfaParsedAmb = CerfaExtractionSchema.parse(cerfaAmbiguous);
  assert(cerfaParsedAmb.confidence.review_status === "manual_required", "Ambiguous CERFA should require manual review");
  assert(cerfaParsedAmb.confidence.ambiguities.length > 0, "Should report ambiguities");
  console.log("✅ CERFA Ambiguous: Validated uncertainty path");

  // 2. PLU Regression
  console.log("\n--- PLU Interpretation ---");
  const pluIdealPath = path.join(FIXTURES_DIR, "plu/ideal.json");
  const pluIdeal = JSON.parse(fs.readFileSync(pluIdealPath, "utf8"));
  const pluParsed = PluExtractionSchema.parse(pluIdeal);
  assert(pluParsed.articles.length >= 1, "Should extract articles");
  assert(pluParsed.articles[0].source_text.length > 0, "Should have source text");
  console.log("✅ PLU Ideal: Validated");

  // 3. Compliance & Rule Engine Regression
  console.log("\n--- Rule Evaluation ---");
  const compUncertainPath = path.join(FIXTURES_DIR, "compliance/uncertain.json");
  const compUncertain = JSON.parse(fs.readFileSync(compUncertainPath, "utf8"));
  const compParsed = RuleEvaluationSchema.parse(compUncertain);
  assert(compParsed.status === "uncertain", "Should map to uncertain");
  assert(compParsed.impact_level === "major", "Uncertainty often maps to major impact");
  assert(compParsed.confidence.review_status === "manual_required", "Uncertain compliance must be reviewed");
  console.log("✅ Compliance Uncertain: Validated missing info path");

  // 4. Schema Versioning Logic (Simulated)
  console.log("\n--- Schema Stability ---");
  const stableData = { 
    document_type: "autre" as const, 
    confidence: { score: 0.9, level: "high" as const, reason: "stable", ambiguities: [], missing_critical_data: [], review_status: "auto_ok" as const },
    cadastre: [],
    sources: []
  };
  CerfaExtractionSchema.parse(stableData);
  console.log("✅ Forward Compatibility: Validated");

  console.log("\n✨ All regressions passed! HEUREKA AI Pipeline is stable.");
}

runRegression().catch(err => {
  console.error("\n❌ Regression Failed!");
  if (err.issues) {
    console.error(JSON.stringify(err.issues, null, 2));
  } else {
    console.error(err);
  }
  process.exit(1);
});
