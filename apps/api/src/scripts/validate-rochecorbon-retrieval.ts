import { queryRelevantChunks } from "../services/embeddingService.js";
import { resolveJurisdictionContext } from "../services/orchestrator.js";
import { logger } from "../utils/logger.js";

async function validateRochecorbon() {
  const insee = "37203";
  const address = "9 Chemin de Bois Soleil, 37210 Rochecorbon";
  
  console.log(`\n🔍 Validating Retrieval for: ${address}`);
  
  const ctx = await resolveJurisdictionContext(insee);
  console.log(`📍 Resolved Jurisdiction: ${ctx.name} (ID: ${ctx.jurisdiction_id})`);
  console.log(`📍 Active Pools: ${ctx.active_pool_ids.join(", ")}`);

  const tests = [
    { topic: "hauteur", expectedArticle: "10" },
    { topic: "stationnement", expectedArticle: "12" },
    { topic: "emprise au sol", expectedArticle: "9" }
  ];

  for (const test of tests) {
    console.log(`\n--- Testing Topic: ${test.topic} ---`);
    const results = await queryRelevantChunks(test.topic, {
      municipalityId: insee,
      jurisdictionContext: ctx,
      limit: 3,
      includeTrace: true
    });

    console.log(`Found ${results.length} results.`);
    results.forEach((r, i) => {
      const isHit = r.metadata.article_id === test.expectedArticle;
      console.log(`[${i+1}] Article: ${r.metadata.article_id} | ${isHit ? "✅ HIT" : "❌ MISS"}`);
      console.log(`    Content: ${r.content.substring(0, 100)}...`);
      console.log(`    Pool: ${r.metadata.pool_id}`);
      if (r.trace) {
        console.log(`    Trace: Semantic=${r.trace.semantic_score?.toFixed(2)}, Authority=${r.trace.authority_score}`);
      }
    });

    // Contamination check
    const contamination = results.filter(r => r.metadata.commune && r.metadata.commune !== insee && r.metadata.commune !== "NATIONAL");
    if (contamination.length > 0) {
      console.error(`🚨 CONTAMINATION DETECTED: ${contamination.length} chunks from other cities!`);
    } else {
      console.log(`🛡️  Zero contamination detected for ${test.topic}.`);
    }
  }
}

validateRochecorbon().catch(console.error);
