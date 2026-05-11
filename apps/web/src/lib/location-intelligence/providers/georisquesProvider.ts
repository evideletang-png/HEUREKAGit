import type { LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";
import { ok, partial, textCorpus } from "./providerUtils";

export async function resolveGeorisquesContext(input: ParcelContextInput): Promise<LocationProviderResult> {
  const corpus = textCorpus(input);
  const data = {
    ppri: /ppri|inondation|zone inondable/.test(corpus),
    pprn: /pprn|mouvement de terrain|cavité|cavite|argile|retrait.?gonflement|radon/.test(corpus),
    pprt: /pprt|technologique/.test(corpus),
    sis: /sis|secteur d.?information sur les sols|sols pollu/.test(corpus),
    formerIcpe: /ancienne icpe|icpe|installation classée|installation classee/.test(corpus),
    clayShrinkSwell: /argile|retrait.?gonflement/.test(corpus),
    cavities: /cavité|cavite/.test(corpus),
    radon: /radon/.test(corpus),
  };
  const detected = Object.values(data).some(Boolean);
  return detected ? ok("georisques", data, 0.68) : partial("georisques", data, ["georisques.ppr", "georisques.sis", "georisques.icpe"], 0.38);
}
