import type { LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";
import { ok, partial, textCorpus } from "./providerUtils";

export async function resolveInpnContext(input: ParcelContextInput): Promise<LocationProviderResult> {
  const corpus = textCorpus(input);
  const natura2000 = /natura\s*2000/.test(corpus);
  const reserveNaturelle = /réserve naturelle|reserve naturelle/.test(corpus);
  const parcNationalCore = /coeur de parc national|cœur de parc national|parc national/.test(corpus);
  const coastal = /littoral|bande des 100 mètres|bande des 100 metres/.test(corpus);
  const detected = natura2000 || reserveNaturelle || parcNationalCore || coastal;
  const data = {
    natura2000,
    reserveNaturelle,
    parcNationalCore,
    environmentalConstraints: [
      natura2000 ? "Natura 2000" : null,
      reserveNaturelle ? "Réserve naturelle" : null,
      parcNationalCore ? "Coeur de parc national" : null,
      coastal ? "Zone littorale" : null,
    ].filter(Boolean),
  };
  return detected ? ok("inpn", data, 0.68) : partial("inpn", data, ["inpn.protectedAreas"], 0.36);
}
