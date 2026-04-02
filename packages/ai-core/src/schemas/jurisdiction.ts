import { z } from "zod";

/**
 * Unique stable identifier for a legal planning territory (Municipality or EPCI).
 */
export const JurisdictionIdSchema = z.string().describe("UUID or stable slug (e.g. EPCI-200000000)");

/**
 * PLAN SCOPE: Determines the hierarchy and authority of a document pool.
 */
export const PlanScopeSchema = z.enum(["local", "intercommunal", "national", "global"]);

/**
 * POOL IDENTIFIERS: Stable IDs for document collections.
 */
export const GLOBAL_POOL_ID = "HEUREKA-GLOBAL-NATIONAL";
export const ARCHIVED_SUFFIX = "-archived";

/**
 * JURISDICTION CONTEXT: The active legal territory for a given analysis.
 */
export const JurisdictionContextSchema = z.object({
  commune_insee: z.string().length(5).describe("INSEE code of the city (e.g. 94000)"),
  jurisdiction_id: JurisdictionIdSchema,
  name: z.string(),
  plan_scope: PlanScopeSchema,
  active_pool_ids: z.array(z.string()).describe("List of pools eligible for current retrieval"),
  owner_jurisdiction_id: JurisdictionIdSchema.optional().describe("Entity that owns/manages these pools"),
});

export type JurisdictionContext = z.infer<typeof JurisdictionContextSchema>;

/**
 * DOCUMENT POOL: A collection of related regulatory or informative documents.
 */
export const DocumentPoolSchema = z.object({
  id: z.string().describe("Unique stable ID for the pool"),
  name: z.string(),
  scope: PlanScopeSchema,
  jurisdiction_id: JurisdictionIdSchema,
  status: z.enum(["active", "archived", "draft"]),
  is_national: z.boolean().default(false),
});

export type DocumentPool = z.infer<typeof DocumentPoolSchema>;
