import { z } from "zod";

/**
 * Standard traceability reference for every important AI output.
 * Connects interpretation back to the original document.
 */
export const TraceabilityReferenceSchema = z.object({
  document_id: z.string().uuid(),
  file_name: z.string().optional(),
  page_number: z.number().int().positive().optional(),
  raw_snippet: z.string().describe("Original text from source"),
  relevance_score: z.number().min(0).max(1).default(1),
  location: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional()
  }).optional().describe("Bounding box coords for visual verification")
});

export type TraceabilityReference = z.infer<typeof TraceabilityReferenceSchema>;

/**
 * Common field wrapper that includes traceability and confidence.
 */
export const TraceableFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) => z.object({
  value: valueSchema.nullable(),
  status: z.enum(["extracted", "inferred", "not_found", "conflict"]),
  confidence_score: z.number().min(0).max(1),
  sources: z.array(TraceabilityReferenceSchema).default([])
});

export type TraceableField<T> = {
  value: T | null;
  status: "extracted" | "inferred" | "not_found" | "conflict";
  confidence_score: number;
  sources: TraceabilityReference[];
};
