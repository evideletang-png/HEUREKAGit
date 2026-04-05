import { orchestrateDossierAnalysis } from "./orchestrator.js";
import { BusinessDecision } from "../types/pipeline.js";
import crypto from "node:crypto";
// @ts-nocheck

const ENGINE_VERSION = "1.0.0-stable";

export interface EngineRunOptions {
  dossierId: string;
  userId: string;
  commune: string;
  forceReanalysis?: boolean;
}

/**
 * HEUREKA Internal SDK.
 * The single way to run the regulatory decision engine.
 */
export async function runDecisionEngine(
  options: EngineRunOptions
): Promise<any> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  console.log(`[EngineSDK] Starting run ${requestId} for dossier ${options.dossierId}`);

  // TODO: Implement idempotency check here if needed (e.g., check for existing runs with same hash)

  const result = await orchestrateDossierAnalysis(
    options.dossierId,
    [],
    { userId: options.userId }
  );

  // Inject metadata into the business decision
  if (result.businessDecision) {
    result.businessDecision = {
      ...result.businessDecision,
      engineVersion: ENGINE_VERSION,
      requestId,
      timestamp,
      traceability: result.businessDecision.traceability || []
    };
  }

  return {
    ...result,
    engineVersion: ENGINE_VERSION,
    requestId,
    timestamp
  };
}
