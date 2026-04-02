import { 
  BenchmarkTestCase, 
  EvaluationResult, 
  AggregateAccuracyReport 
} from "../schemas/eval.js";
import { 
  calculateRetrievalMetrics, 
  calculateExtractionMetrics, 
  calculateComplianceMetrics 
} from "../eval/metrics.js";
import { EvidenceChunk } from "../schemas/retrieval.js";
import { BusinessDecision } from "../schemas/compliance.js";

export type RetrievalQueryFn = (query: string, insee: string, articleId?: string) => Promise<EvidenceChunk[]>;
export type FullProcessFn = (testCase: BenchmarkTestCase) => Promise<{
  retrievedChunks: EvidenceChunk[];
  extractedFields: Record<string, any>;
  decision: BusinessDecision;
}>;

export class AccuracyEvaluator {
  private results: EvaluationResult[] = [];

  constructor(private dataset: BenchmarkTestCase[]) {}

  /**
   * Run only the retrieval part of the benchmark.
   */
  async runRetrievalBenchmark(queryFn: RetrievalQueryFn): Promise<EvaluationResult[]> {
    this.results = [];
    
    for (const testCase of this.dataset) {
      if (!testCase.expected_retrieval) continue;

      const actualChunks = await queryFn(
        testCase.expected_retrieval.query, 
        testCase.insee, 
        testCase.expected_retrieval.matching_article_ids[0] // Target the primary article
      );

      const res: EvaluationResult = {
        case_id: testCase.id,
        timestamp: new Date().toISOString(),
        retrieval: calculateRetrievalMetrics(actualChunks, testCase.expected_retrieval, testCase.insee)
      };

      this.results.push(res);
    }
    
    return this.results;
  }

  /**
   * Run the full end-to-end extraction and compliance benchmark.
   */
  async runFullBenchmark(processFn: FullProcessFn): Promise<EvaluationResult[]> {
    this.results = [];

    for (const testCase of this.dataset) {
      const { retrievedChunks, extractedFields, decision } = await processFn(testCase);

      const res: EvaluationResult = {
        case_id: testCase.id,
        timestamp: new Date().toISOString(),
        retrieval: testCase.expected_retrieval 
          ? calculateRetrievalMetrics(retrievedChunks, testCase.expected_retrieval, testCase.insee) 
          : undefined,
        extraction: testCase.expected_extraction 
          ? calculateExtractionMetrics(extractedFields, testCase.expected_extraction) 
          : undefined,
        compliance: testCase.expected_compliance 
          ? calculateComplianceMetrics(decision, testCase.expected_compliance) 
          : undefined
      };

      this.results.push(res);
    }

    return this.results;
  }

  /**
   * Aggregate results into a high-level Accuracy Dashboard.
   */
  generateAggregateReport(): AggregateAccuracyReport {
    const total = this.results.length;
    if (total === 0) throw new Error("No evaluation results available.");

    const sums = {
       retrieval_strict: 0,
       retrieval_grounded: 0,
       retrieval_leak: 0,
       extraction_em: 0,
       uncertainty_acc: 0,
       compliance_agreement: 0
    };

    let counts = { retrieval: 0, extraction: 0, compliance: 0 };

    this.results.forEach(r => {
      if (r.retrieval) {
        sums.retrieval_strict += r.retrieval.strict_hit_rate;
        sums.retrieval_grounded += r.retrieval.grounded_hit_rate;
        sums.retrieval_leak += r.retrieval.leak_rate;
        counts.retrieval++;
      }
      if (r.extraction) {
        sums.extraction_em += r.extraction.exact_match_rate;
        sums.uncertainty_acc += r.extraction.uncertainty_accuracy;
        counts.extraction++;
      }
      if (r.compliance) {
        sums.compliance_agreement += r.compliance.decision_agreement ? 1 : 0;
        counts.compliance++;
      }
    });

    return {
      total_cases: total,
      global_metrics: {
        retrieval_strict_precision: counts.retrieval > 0 ? sums.retrieval_strict / counts.retrieval : 0,
        retrieval_grounded_precision: counts.retrieval > 0 ? sums.retrieval_grounded / counts.retrieval : 0,
        retrieval_leak_rate: counts.retrieval > 0 ? sums.retrieval_leak / counts.retrieval : 0,
        extraction_accuracy: counts.extraction > 0 ? sums.extraction_em / counts.extraction : 0,
        uncertainty_handling_precision: counts.extraction > 0 ? sums.uncertainty_acc / counts.extraction : 0,
        compliance_agreement: counts.compliance > 0 ? sums.compliance_agreement / counts.compliance : 0
      },
      weak_spots: this.identifyWeakSpots(sums, counts),
      contamination_risks: sums.retrieval_leak > 0 ? ["Cross-city data contamination detected in retrieval phase."] : [],
      recommendations: [
        "Increase grounding weight (lexical_boost) to improve strict article hit rate.",
        "Refine field extraction prompts to better handle uncertainty/missing information."
      ]
    };
  }

  private identifyWeakSpots(sums: any, counts: any): string[] {
    const spots: string[] = [];
    if (counts.retrieval > 0 && (sums.retrieval_strict / counts.retrieval) < 0.8) {
      spots.push("Retrieval precision (strict article matching) is below threshold.");
    }
    if (counts.extraction > 0 && (sums.extraction_em / counts.extraction) < 0.7) {
      spots.push("Field extraction accuracy (Exact Match) needs improvement.");
    }
    return spots;
  }
}
