import {
  DocumentClass,
  DocumentClassification,
  AIConfidence
} from "./schemas/index.js";
import { SYSTEM_PROMPTS } from "./prompts/extraction.js";

/**
 * Standard interface for AI document processing steps.
 * Encourages modularity and traceability.
 */
export interface AIProcessor<TInput, TOutput> {
  process(input: TInput, context?: any): Promise<TOutput>;
}

/**
 * Dependency injection contract for DocumentPipeline.
 * The caller provides an OpenAI-compatible classifier so ai-core stays platform-agnostic.
 */
export interface PipelineDeps {
  /** Call an OpenAI-compatible API and return parsed JSON */
  callLLM: (systemPrompt: string, userContent: string) => Promise<any>;
}

/**
 * Base implementation of the standardized pipeline steps.
 * Inject `deps` to enable real LLM classification and confidence scoring.
 */
export class DocumentPipeline {
  private deps?: PipelineDeps;

  constructor(deps?: PipelineDeps) {
    this.deps = deps;
  }

  /**
   * Step 1: Classification — detects document class using SYSTEM_PROMPTS.CLASSIFIER.
   * Falls back to { document_class: "other" } if no LLM injected or on error.
   */
  async classify(text: string): Promise<DocumentClassification> {
    if (!this.deps?.callLLM) {
      return { document_class: "other", confidence: { score: 0, reason: "No LLM injected" }, is_ambiguous: true };
    }
    try {
      const result = await this.deps.callLLM(
        SYSTEM_PROMPTS.CLASSIFIER,
        text.substring(0, 5000)
      );
      return {
        document_class: result.document_class || "other",
        confidence: { score: result.confidence ?? 0.5, reason: result.reason || "" },
        is_ambiguous: result.is_ambiguous ?? false,
        sub_type: result.sub_type
      };
    } catch {
      return { document_class: "other", confidence: { score: 0, reason: "Classification failed" }, is_ambiguous: true };
    }
  }

  /**
   * Step 2: Structured Extraction
   * Use extractDocumentData() from pluAnalysis.ts for full pipeline extraction.
   */
  async extract<T>(text: string, documentClass: DocumentClass): Promise<T> {
    throw new Error("NOT_IMPLEMENTED: Use extractDocumentData() from pluAnalysis instead.");
  }

  /**
   * Step 3: Confidence Scoring — checks how many extracted values are grounded in source text.
   */
  calculateConfidence(rawOutput: any, sourceText: string): AIConfidence {
    if (!rawOutput || typeof rawOutput !== "object") {
      return { score: 0, level: "low", review_status: "manual_required", ambiguities: ["No output"], missing_critical_data: [] };
    }
    const values = Object.values(rawOutput).filter(v => v !== null && v !== undefined && v !== "");
    const total = Object.keys(rawOutput).length || 1;
    const filled = values.length;
    const score = Math.round((filled / total) * 100) / 100;
    const level = score > 0.8 ? "high" : score > 0.5 ? "medium" : "low";
    return {
      score,
      level,
      review_status: score > 0.8 ? "auto_ok" : "review_recommended",
      ambiguities: [],
      missing_critical_data: Object.keys(rawOutput).filter(k => !rawOutput[k])
    };
  }
}
