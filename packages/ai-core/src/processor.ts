import { 
  DocumentClass, 
  DocumentClassification, 
  AIConfidence 
} from "./schemas/index.js";

/**
 * Standard interface for AI document processing steps.
 * Encourages modularity and traceability.
 */
export interface AIProcessor<TInput, TOutput> {
  process(input: TInput, context?: any): Promise<TOutput>;
}

/**
 * Base implementation of the standardized pipeline steps.
 * (Scaffolded with TODOs for full GPT-4 integration).
 */
export class DocumentPipeline {
  /**
   * Step 1: Classification
   */
  async classify(text: string): Promise<DocumentClassification> {
    // TODO: Implement actual LLM call using SYSTEM_PROMPTS.CLASSIFIER
    return {
      document_class: "other",
      confidence: { score: 0, reason: "Scaffolded implementation" },
      is_ambiguous: true
    };
  }

  /**
   * Step 2: Structured Extraction
   */
  async extract<T>(text: string, documentClass: DocumentClass): Promise<T> {
    // TODO: Implement OpenAI structured output call with document-specific Zod schema
    throw new Error("NOT_IMPLEMENTED: Extraction requires specific Zod schema per document class.");
  }

  /**
   * Step 3: Confidence Scoring (Post-processing)
   */
  calculateConfidence(rawOutput: any, sourceText: string): AIConfidence {
    // TODO: Implement deterministic scoring logic (e.g. check if all mentions are in source)
    return {
      score: 0.5,
      level: "medium",
      review_status: "review_recommended",
      ambiguities: ["Pipeline scaffolded - results may be inconsistent"]
    };
  }
}
