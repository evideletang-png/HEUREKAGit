import { orchestrateDossierAnalysis } from "./orchestrator.js";
import { db, documentReviewsTable, rulesTable, municipalityLearningsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

async function verifyDecisionEngine() {
  console.log("--- STARTING DETERMINISTIC ENGINE VERIFICATION ---");

  const testCommune = "VerifCity_" + Date.now();
  const testUserId = "00000000-0000-0000-0000-000000000001";
  const testDossierId = "00000000-0000-0000-0000-888888888888";

  // 1. Seed a Formal Rule (Max Height = 10m)
  console.log(`Seeding formal rule for ${testCommune}...`);
  await db.insert(rulesTable).values({
    commune: testCommune,
    zoneCode: "UA",
    article: "Art. 10",
    category: "hauteur",
    ruleType: "numeric",
    parameters: { max: 10, unit: "m" }
  });

  // 2. Seed a Non-Compliant Document (Height = 12.5m)
  console.log("Seeding non-compliant test document...");
  const [doc] = await db.insert(documentReviewsTable).values({
    userId: testUserId,
    dossierId: testDossierId,
    title: "Projet Trop Haut",
    documentType: "permis_de_construire",
    rawText: "Construction d'un immeuble de 12.50m de haut.",
    status: "completed", // Pre-set to completed to skip OCR in this test
    extractedDataJson: JSON.stringify({ requested_height_m: 12.5 }),
    commune: testCommune,
    zoneCode: "UA"
  }).returning();

  // 3. Run Orchestrator
  console.log("\n--- RUNNING ORCHESTRATOR ---");
  const result = await orchestrateDossierAnalysis(testDossierId, testUserId, testCommune);

  // 4. Verification
  console.log("\n--- RESULTS ANALYSIS ---");
  console.log("Consolidated Data:", JSON.stringify(result.results.find(r => r.task === "formal_rules")?.consolidatedData));
  console.log("Formal Rules Found:", result.results.find(r => r.task === "formal_rules")?.rulesCount);
  console.log(`Formal Decision Status: ${result.formalDecision.status}`);
  console.log(`Global Score: ${result.globalScore}`);
  
  if (result.formalDecision.status === "unfavorable") {
    console.log("SUCCESS: Formal decision correctly identified non-compliance.");
  } else {
    throw new Error("FAILURE: Formal decision failed to catch over-height.");
  }

  if (result.simulation && result.simulation.suggestions.length > 0) {
    console.log(`Simulation Suggestion: ${result.simulation.suggestions[0].delta}`);
    console.log("SUCCESS: Simulation engine provided corrective advice.");
  } else {
    throw new Error("FAILURE: Simulation engine produced no suggestions.");
  }

  // Check Learning
  const [learning] = await db.select().from(municipalityLearningsTable).where(eq(municipalityLearningsTable.commune, testCommune));
  if (learning && learning.unfavorableCount === 1) {
    console.log(`SUCCESS: Territorial learning recorded the rejection.`);
  }

  // 5. Cleanup
  console.log("\nCleaning up...");
  await db.delete(documentReviewsTable).where(eq(documentReviewsTable.dossierId, testDossierId));
  await db.delete(rulesTable).where(eq(rulesTable.commune, testCommune));
  await db.delete(municipalityLearningsTable).where(eq(municipalityLearningsTable.commune, testCommune));
  
  console.log("--- VERIFICATION COMPLETE ---");
}

verifyDecisionEngine().catch(err => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
