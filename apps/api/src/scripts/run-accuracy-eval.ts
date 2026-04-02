import { 
  AccuracyEvaluator, 
  PLU_BENCHMARK_V1, 
} from "@workspace/ai-core";
import { queryRelevantChunks } from "../services/embeddingService.js";
import { resolveJurisdictionContext } from "../services/orchestrator.js";
import { logger } from "../utils/logger.js";

/**
 * HEUREKA ACCURACY EVALUATOR CLI
 * 
 * Runs the benchmark suite against the live system and prints a quality report.
 */
async function runAccuracyEval() {
  console.log("\n🚀 HEUREKA Accuracy Evaluation Framework");
  console.log("Running PLU_BENCHMARK_V1 dataset...\n");

  const evaluator = new AccuracyEvaluator(PLU_BENCHMARK_V1);

  // 1. Define the Retrieval Runner
  const retrievalRunner = async (query: string, insee: string, articleId?: string) => {
    try {
      const jurisdictionContext = await resolveJurisdictionContext(insee);
      return await queryRelevantChunks(query, {
        municipalityId: insee,
        articleId,
        jurisdictionContext,
        limit: 5 // Top-5 evaluation
      });
    } catch (err) {
      logger.error(`[Eval] Failed to resolve retrieval for ${insee}`, err);
      return [];
    }
  };

  // 2. Execute Benchmark
  await evaluator.runRetrievalBenchmark(retrievalRunner);
  const report = evaluator.generateAggregateReport();

  // 3. Print Results
  console.log("========================================");
  console.log("           PERFORMANCE REPORT           ");
  console.log("========================================");
  console.log(`Total Test Cases: ${report.total_cases}`);
  console.log(`----------------------------------------`);
  
  const gm = report.global_metrics;
  console.log(`Strict Article Accuracy:  ${(gm.retrieval_strict_precision * 100).toFixed(1)}%`);
  console.log(`Grounded Relevance:       ${(gm.retrieval_grounded_precision * 100).toFixed(1)}%`);
  console.log(`Contamination (Leak Rate): ${(gm.retrieval_leak_rate * 100).toFixed(2)}%`);
  console.log(`Uncertainty Handling PS:   ${(gm.uncertainty_handling_precision * 100).toFixed(1)}%`);
  console.log(`Compliance Agreement:      ${(gm.compliance_agreement * 100).toFixed(1)}%`);
  
  console.log("\n⚠️  WEAK SPOTS");
  if (report.weak_spots.length > 0) {
    report.weak_spots.forEach((s: string) => console.log(`  • ${s}`));
  } else {
    console.log("  • None detected. (Above threshold)");
  }

  console.log("\n🚨 CONTAMINATION RISKS");
  if (report.contamination_risks.length > 0) {
    report.contamination_risks.forEach((r: string) => console.log(`  • ${r}`));
  } else {
    console.log("  • Zero cross-jurisdiction leaks detected.");
  }

  console.log("\n💡 RECOMMENDATIONS");
  report.recommendations.forEach((r: string) => console.log(`  • ${r}`));

  console.log(`\nReport generated at: ${new Date().toLocaleString()}\n`);
}

// EXECUTION
runAccuracyEval().catch(err => {
  console.error("FATAL: Accuracy evaluation failed.", err);
  process.exit(1);
});
