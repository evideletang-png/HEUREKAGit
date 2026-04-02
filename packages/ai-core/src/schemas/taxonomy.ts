import { z } from "zod";

/**
 * Canonical taxonomy for HEUREKA urban planning documents.
 * Standardizes how the AI classifies incoming files.
 */
export const DocumentClassSchema = z.enum([
  "cerfa_form",               // Official French administrative forms (PC/DP/CU)
  "plu_reglement",            // Narrative text of the Plan Local d'Urbanisme
  "plu_annexe",               // Technical annexes (Environmental, Heritage, etc.)
  "zonage_map",               // Visual zoning documents
  "servitude_document",       // Legal servitudes (Public utility constraints)
  "mairie_instruction_note",  // Internal notes or previous instruction feedback
  "project_attachment",       // Project plans (PCMI2, PCMI3, etc.)
  "citizen_description",      // Narrative project description from the user
  "expert_opinion",           // Feedback from architect or expert service
  "other"                     // Fallback for unrecognized documents
]);

export type DocumentClass = z.infer<typeof DocumentClassSchema>;

/**
 * Metadata for a classified document.
 */
export const DocumentClassificationSchema = z.object({
  document_class: DocumentClassSchema,
  sub_type: z.string().optional(), // e.g. "PCMI1", "Art_11"
  confidence: z.object({
    score: z.number().min(0).max(1),
    reason: z.string()
  }),
  is_ambiguous: z.boolean().default(false),
  suggested_action: z.string().optional()
});

export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;
