import type { LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";
import { ok, partial, textCorpus } from "./providerUtils";

export async function resolveSupContext(input: ParcelContextInput): Promise<LocationProviderResult> {
  const corpus = textCorpus(input);
  const sup = /sup|servitude|utilité publique|utilite publique|alignement|canalisation|réseau|reseau/.test(corpus);
  const data = {
    sup,
    regulations: sup ? [{ label: "Servitude d'utilité publique à vérifier", source: "SUP / annexes PLU", confidence: 0.58 }] : [],
  };
  return sup ? ok("sup", data, 0.58) : partial("sup", data, ["sup"], 0.38);
}
