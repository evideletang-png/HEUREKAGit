# HEUREKA Standardized AI Pipeline

This document describes the structured framework for document interpretation, replacing the previous free-form LLM logic with a schema-driven, auditable pipeline.

## 1. Overview
The pipeline is designed to transform raw urban planning documents (PDF/Images) into structured **Project Facts** and **Regulatory Rules** with 100% traceability.

## 2. Architecture
The logic is centralized in `@workspace/ai-core`, ensuring that both the API and potentially future client-side tools share the same schemas and prompts.

### Key Components:
- **Taxonomy**: Standardized classification of document types (CERFA, PLU, etc.).
- **Schemas**: Zod-based definitions for Extraction, Confidence, and Traceability.
- **Prompt Library**: Versioned, modular prompts for specific AI tasks.
- **Processor**: Interfaced steps for Classification -> Extraction -> Normalization.

## 3. Document Taxonomy
Every document must be classified into one of the following classes:
- `cerfa_form`: Official administrative data.
- `plu_reglement`: Legal rules and articles.
- `plu_annexe`: Technical constraints.
- `project_attachment`: Plans and drawings.
- `expert_opinion`: Manual feedback.

## 4. Traceability & Confidence
Every extracted field MUST include:
- `sources`: Reference to the document ID, page, and raw text snippet.
- `confidence`: A score (0-1) and a review status (`auto_ok`, `review_recommended`, `manual_required`).

## 5. Usage Example (Conceptual)
```typescript
import { DocumentPipeline, SYSTEM_PROMPTS } from "@workspace/ai-core";

const pipeline = new DocumentPipeline();
const classification = await pipeline.classify(rawText);

if (classification.document_class === 'plu_reglement') {
  const rules = await pipeline.extract(rawText, 'plu_reglement');
  // Process rules...
}
```

## 6. Implementation Status
- [x] Package `@workspace/ai-core` created.
- [x] Canonical schemas defined.
- [x] Prompt library migrated.
- [x] Initial service integration (`pluAnalysis.ts`).
- [ ] Full pipeline migration for all services (TODO).
