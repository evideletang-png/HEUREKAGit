import type { LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";
import { ok, partial, textCorpus } from "./providerUtils";

const METROPOLE_HINTS = ["tours", "métropole", "metropole", "commune démo", "commune demo"];

export async function resolveMetropolisContext(input: ParcelContextInput): Promise<LocationProviderResult> {
  const corpus = textCorpus(input);
  const commune = (input.commune || input.existingParcelAnalysis?.commune || "").toLowerCase();
  const metropolisInstruction = METROPOLE_HINTS.some((hint) => commune.includes(hint) || corpus.includes(hint));
  const roadAuthority = /voirie|domaine public|trottoir|accès|acces|surplomb/.test(corpus);
  const data = {
    epci: metropolisInstruction ? "Métropole / EPCI compétent" : null,
    metropolisInstruction,
    roadAuthority,
  };
  return metropolisInstruction || roadAuthority ? ok("metropolis", data, 0.7) : partial("metropolis", data, ["metropolis.competence"], 0.4);
}
