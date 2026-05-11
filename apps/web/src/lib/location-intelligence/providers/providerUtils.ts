import type { LocationProviderName, LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";

export function textCorpus(input: ParcelContextInput) {
  return [
    input.address,
    input.parcelId,
    input.commune,
    input.existingParcelAnalysis?.zoneCode,
    input.existingParcelAnalysis?.zoningLabel,
    input.existingParcelAnalysis?.zoneLabel,
    ...(Array.isArray(input.existingParcelAnalysis?.constraints) ? input.existingParcelAnalysis.constraints : []),
    ...(Array.isArray(input.existingParcelAnalysis?.geoConstraints) ? input.existingParcelAnalysis.geoConstraints : []),
    ...(Array.isArray(input.existingParcelAnalysis?.overlays) ? input.existingParcelAnalysis.overlays : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function ok(provider: LocationProviderName, data: Record<string, any>, confidence = 0.7): LocationProviderResult {
  return { provider, status: "ok", confidence, data };
}

export function partial(provider: LocationProviderName, data: Record<string, any>, unresolvedChecks: string[], confidence = 0.45): LocationProviderResult {
  return { provider, status: "partial", confidence, data, unresolvedChecks };
}

export function failed(provider: LocationProviderName, error: unknown, unresolvedChecks: string[]): LocationProviderResult {
  return {
    provider,
    status: "error",
    confidence: 0.2,
    unresolvedChecks,
    error: error instanceof Error ? error.message : "Source indisponible",
  };
}

export function numberFrom(...values: unknown[]) {
  return values.map(Number).find((value) => Number.isFinite(value) && value > 0) || null;
}

export function firstDefined<T>(...values: Array<T | null | undefined | "">): T | null {
  const value = values.find((item) => item !== undefined && item !== null && item !== "");
  return (value as T | undefined) ?? null;
}
