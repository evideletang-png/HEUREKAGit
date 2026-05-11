import { computeInstructionTimeline } from "./computeInstructionTimeline";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const startDate = "2026-05-05T00:00:00.000Z";

const pcmi = computeInstructionTimeline({ dossierType: "PCMI", startDate });
assert(pcmi.baseDelay === 2, "PCMI doit avoir un délai de base de 2 mois");
assert(pcmi.totalDelay === 2, "PCMI simple doit rester à 2 mois");

const dp = computeInstructionTimeline({ dossierType: "DP", startDate });
assert(dp.baseDelay === 1, "DP doit avoir un délai de base de 1 mois");

const dpc = computeInstructionTimeline({ dossierType: "DPC", startDate });
assert(dpc.baseDelay === 1, "DPC doit être normalisé en DP");

const pa = computeInstructionTimeline({ dossierType: "PA", startDate });
assert(pa.baseDelay === 3, "PA doit avoir un délai de base de 3 mois");

const withAbf = computeInstructionTimeline({ dossierType: "PCMI", locationContext: { abf: true }, startDate });
assert(withAbf.totalDelay === 3, "ABF doit majorer de 1 mois");
assert(withAbf.additionalDelays.some((delay) => delay.reason.includes("ABF")), "La majoration ABF doit être expliquée");

const withSigDetectedAbf = computeInstructionTimeline({
  dossierType: "DPC",
  locationContext: { detectedConstraints: { abf: true, monumentHistoriqueAbords: true } } as any,
  startDate,
});
assert(withSigDetectedAbf.totalDelay === 2, "Les contraintes SIG ABF doivent majorer une DPC de 1 mois");

const withImpact = computeInstructionTimeline({ dossierType: "PA", projectFlags: { requiresImpactStudy: true }, startDate });
assert(withImpact.totalDelay === 5, "Étude d'impact doit majorer de 2 mois");

const withServicesAndPark = computeInstructionTimeline({
  dossierType: "PC",
  projectFlags: { consultationServices: true },
  locationContext: { parcNationalCore: true },
  startDate,
});
assert(withServicesAndPark.totalDelay === 5, "PC 3 mois + services 1 mois + parc national 1 mois");
assert(withServicesAndPark.legalDeadlineDate instanceof Date, "La date limite doit être une Date");

console.info("[computeInstructionTimeline] délais d'instruction OK");
