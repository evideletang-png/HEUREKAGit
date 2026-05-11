import type { LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";
import { ok, partial, textCorpus } from "./providerUtils";

export async function resolvePatrimoineContext(input: ParcelContextInput): Promise<LocationProviderResult> {
  if (input.demo) {
    return ok("patrimoine", {
      abf: true,
      monumentHistoriqueAbords: true,
      spr: false,
      siteClasse: false,
      siteInscrit: false,
    }, 0.9);
  }

  const corpus = textCorpus(input);
  const data = {
    abf: /abf|architecte des bâtiments|architecte des batiments/.test(corpus),
    monumentHistoriqueAbords: /abords|monument historique|mh\b/.test(corpus),
    spr: /spr|site patrimonial remarquable/.test(corpus),
    siteClasse: /site classé|site classe/.test(corpus),
    siteInscrit: /site inscrit/.test(corpus),
  };
  const detected = Object.values(data).some(Boolean);
  return detected ? ok("patrimoine", data, 0.7) : partial("patrimoine", data, ["patrimoine.perimeters"], 0.42);
}
