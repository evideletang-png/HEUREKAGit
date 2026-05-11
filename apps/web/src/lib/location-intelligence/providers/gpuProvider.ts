import type { LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";
import { firstDefined, ok, partial, textCorpus } from "./providerUtils";

export async function resolveGpuContext(input: ParcelContextInput): Promise<LocationProviderResult> {
  const existing = input.existingParcelAnalysis || {};
  const corpus = textCorpus(input);
  const zoneCode = firstDefined(existing.zoneCode, existing.zone_code, existing.zoningPreview?.zoneCode);
  const zoneLabel = firstDefined(existing.zoneLabel, existing.zoningLabel, existing.zoningPreview?.zoningLabel);
  const oap = /oap|orientation d.?aménagement|orientation d.?amenagement/.test(corpus);
  const sup = /sup|servitude|utilité publique|utilite publique/.test(corpus);
  const wooded = /espace boisé|espace boise|ebc|arbre protégé|arbre protege/.test(corpus);
  const agriculturalOrNatural = /^a|^n/.test(String(zoneCode || "").toLowerCase()) || /zone agricole|zone naturelle/.test(corpus);

  if (input.demo) {
    return ok("gpu", {
      pluZone: { code: "UB", label: "Zone urbaine mixte", confidence: 0.92, source: "demoGpuProvider" },
      regulations: [{ label: "Règlement de zone UB", source: "GPU démo", confidence: 0.92 }],
      oap: false,
      sup: false,
      environmentalConstraints: [],
    }, 0.92);
  }

  const data = {
    pluZone: { code: zoneCode || null, label: zoneLabel || null, confidence: zoneCode ? 0.78 : 0.35, source: existing.source || "GPU / données parcelle" },
    regulations: zoneCode ? [{ label: `Règlement de zone ${zoneCode}`, source: "GPU / PLU", confidence: 0.72 }] : [],
    oap,
    sup,
    environmentalConstraints: [
      wooded ? "Espace boisé classé ou arbre protégé possible" : null,
      agriculturalOrNatural ? "Zone agricole ou naturelle" : null,
    ].filter(Boolean),
  };

  return zoneCode || oap || sup
    ? ok("gpu", data, zoneCode ? 0.72 : 0.55)
    : partial("gpu", data, ["gpu.zone", "gpu.oap", "gpu.sup"], 0.35);
}
