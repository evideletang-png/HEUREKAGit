import assert from "node:assert/strict";
import { analyzeParcelContext } from "./analyzeParcelContext";

const demo = await analyzeParcelContext({
  address: "12 rue des Tilleuls, 37000 Commune Démo",
  parcelId: "AB 123",
  commune: "Commune Démo",
  dossierType: "PCMI",
  demo: true,
});

assert.equal(demo.parcel?.fullReference, "AB 123");
assert.equal(demo.detectedConstraints.abf, true);
assert.equal(demo.detectedConstraints.monumentHistoriqueAbords, true);
assert.ok(demo.probableConsultations.some((consultation) => consultation.service === "ABF"));
assert.equal(demo.estimatedInstructionImpacts.totalDelay, 3);

const existing = await analyzeParcelContext({
  address: "4 Place Loiseau d'Entraigues 37000 Tours",
  parcelId: "CL 0954",
  commune: "Tours",
  dossierType: "DPC",
  existingParcelAnalysis: {
    parcelRef: "CL 0954",
    commune: "Tours",
    zoneCode: "UB",
    constraints: ["Natura 2000", "PPRI", "Servitude d'utilité publique"],
  },
});

assert.equal(existing.pluZone?.code, "UB");
assert.equal(existing.detectedConstraints.natura2000, true);
assert.equal(existing.detectedConstraints.ppri, true);
assert.equal(existing.detectedConstraints.sup, true);
assert.ok(existing.unresolvedChecks.length > 0, "Les sources non confirmées doivent rester visibles");

console.info("[analyzeParcelContext] analyse territoriale OK");
