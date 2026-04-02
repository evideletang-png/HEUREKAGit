import { z } from "zod";

/**
 * Standard confidence model for all HEUREKA AI outputs.
 */
export const ConfidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * Standard review status for prioritizing human intervention.
 */
export const ReviewStatusSchema = z.enum([
  "auto_ok",            // Confidence high, no conflicts
  "review_recommended", // Minor uncertainties or warnings
  "manual_required"     // Conflict detected or low confidence
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/**
 * Common confidence object to be embedded in all AI responses.
 */
export const AIConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  level: ConfidenceLevelSchema,
  review_status: ReviewStatusSchema,
  reason: z.string().optional(), // Why this confidence level was chosen
  ambiguities: z.array(z.string()).default([]), // Explicitly list what was unclear
  missing_critical_data: z.array(z.string()).default([]) // Fields that could not be found
});

export type AIConfidence = z.infer<typeof AIConfidenceSchema>;
