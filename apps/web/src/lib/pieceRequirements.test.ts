import { getRequiredPieces } from "./pieceRequirements";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function codes(result: ReturnType<typeof getRequiredPieces>) {
  return result.allOfficialPieces.map((piece) => piece.code);
}

function piece(result: ReturnType<typeof getRequiredPieces>, code: string) {
  return result.allOfficialPieces.find((item) => item.code === code);
}

function hasReason(result: ReturnType<typeof getRequiredPieces>, code: string, trigger: string) {
  return piece(result, code)?.additionalReasons.some((reason) => reason.trigger === trigger);
}

const selectedAddress = { label: "4 Place Loiseau d'Entraigues 37000 Tours", city: "Tours", citycode: "37261" };

const pcmi = getRequiredPieces({ procedureType: "PCMI", selectedAddress });
assert(codes(pcmi).includes("PCMI1"), "PCMI simple doit contenir PCMI1");
assert(codes(pcmi).includes("PCMI8"), "PCMI simple doit contenir PCMI8");
assert(!codes(pcmi).some((code) => code.startsWith("LOC-")), "Aucun code LOC inventé ne doit exister");

const pcmiAbf = getRequiredPieces({
  procedureType: "PCMI",
  selectedAddress,
  parcelAnalysis: {
    zoneCode: "UA",
    parcelRef: "CL 0954",
    constraints: [{ label: "Abords monument historique AC1" }],
  },
});
assert(hasReason(pcmiAbf, "PCMI4", "abf_spr_monument_historique"), "ABF doit enrichir PCMI4");
assert(hasReason(pcmiAbf, "PCMI6", "abf_spr_monument_historique"), "ABF doit enrichir PCMI6");
assert(codes(pcmiAbf).filter((code) => code === "PCMI4").length === 1, "PCMI4 ne doit pas être dupliqué");
assert(pcmiAbf.instructorAlerts.some((alert) => alert.type === "ABF"), "ABF doit créer une vigilance instructeur");

const dp = getRequiredPieces({ procedureType: "DP", selectedAddress });
assert(codes(dp).includes("DP1"), "DP simple doit contenir DP1");
assert(!codes(dp).some((code) => code.startsWith("PCMI")), "DP simple ne doit pas contenir de PCMI");

const pcmiToDpBefore = getRequiredPieces({ procedureType: "PCMI", selectedAddress });
const pcmiToDpAfter = getRequiredPieces({ procedureType: "DP", selectedAddress });
assert(codes(pcmiToDpBefore).some((code) => code.startsWith("PCMI")), "Le cas dynamique PCMI doit contenir des PCMI");
assert(!codes(pcmiToDpAfter).some((code) => code.startsWith("PCMI")), "Après passage PCMI → DP, les PCMI disparaissent");
assert(codes(pcmiToDpAfter).some((code) => code.startsWith("DP")), "Après passage PCMI → DP, les DP apparaissent");

const dpToPcmiAfter = getRequiredPieces({ procedureType: "PCMI", selectedAddress });
assert(!codes(dpToPcmiAfter).some((code) => code.startsWith("DP")), "Après passage DP → PCMI, les DP disparaissent");

const oap = getRequiredPieces({
  procedureType: "PA",
  selectedAddress,
  parcelAnalysis: { zoneCode: "1AU", parcelRef: "AB 12", constraints: [{ label: "OAP Centre-bourg" }] },
});
assert(hasReason(oap, "PA2", "oap"), "OAP doit enrichir PA2");
assert(hasReason(oap, "PA4", "oap"), "OAP doit enrichir PA4");

const ppri = getRequiredPieces({
  procedureType: "DP",
  selectedAddress,
  parcelAnalysis: { zoneCode: "UB", parcelRef: "AB 12", constraints: [{ label: "PPRI zone inondable PM1" }] },
});
assert(hasReason(ppri, "DP2", "ppri_flood_risk"), "PPRI doit enrichir DP2");
assert(hasReason(ppri, "DP3", "ppri_flood_risk"), "PPRI doit enrichir DP3");

const unknownZone = getRequiredPieces({
  procedureType: "PCMI",
  selectedAddress,
  parcelAnalysis: { parcelRef: "CL 0954", constraints: [] },
});
assert(unknownZone.debug.unresolvedChecks.includes("zonage PLU/PLUi"), "Zone inconnue doit rester en unresolvedChecks");

const weakRisk = getRequiredPieces({
  procedureType: "PCMI",
  selectedAddress,
  parcelAnalysis: { zoneCode: "UC", parcelRef: "AB 12", constraints: [{ label: "Retrait-gonflement argiles aléa faible" }] },
});
assert(hasReason(weakRisk, "PCMI4", "natural_risks"), "Risque faible doit enrichir une pièce officielle");
assert(!codes(weakRisk).includes("LOC-RISQUE-GEOTECH"), "Risque faible ne doit pas créer de fausse pièce");
assert(weakRisk.instructorAlerts.some((alert) => alert.type === "RISQUE"), "Risque faible doit devenir une vigilance instructeur");

console.info("[pieceRequirements] 10 cas de nomenclature officielle OK");
