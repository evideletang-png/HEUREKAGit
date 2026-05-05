import { checkCompleteness } from "./checkCompleteness";
import { resolveOfficialPieces } from "../cerfa/resolveOfficialPieces";
import type { ProjectContext } from "../cerfa/officialPieces.types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const pcmiContext: ProjectContext = { dossierType: "PCMI", projectFlags: {}, locationContext: {} };
const pcmiPieces = resolveOfficialPieces(pcmiContext);

const complete = checkCompleteness({
  requiredPieces: pcmiPieces,
  uploadedDocuments: ["PCMI1", "PCMI2", "PCMI3", "PCMI4", "PCMI5", "PCMI6", "PCMI7", "PCMI8"].map((code) => ({ filename: `${code}_piece.pdf` })),
});
assert(complete.status === "complete", "PCMI avec toutes les pièces doit être complet");
assert(complete.missingPieces.length === 0, "Aucune pièce manquante attendue");

const incomplete = checkCompleteness({
  requiredPieces: pcmiPieces,
  uploadedDocuments: [{ filename: "PCMI1.pdf" }],
});
assert(incomplete.status === "incomplete", "PCMI incomplet doit être incomplete");
assert(incomplete.missingPieces.some((piece) => piece.code === "PCMI2"), "PCMI2 doit être manquante");
assert(incomplete.message.includes("Votre dossier est incomplet"), "Message automatique incomplet attendu");
assert(incomplete.officialLetterPayload.missingPieceCodes.includes("PCMI2"), "Payload courrier doit contenir les codes manquants");

const uncertain = checkCompleteness({
  requiredPieces: pcmiPieces.slice(0, 1),
  uploadedDocuments: [{ filename: "plan.pdf", detectedCode: "PCMI1", confidence: 0.42 }],
});
assert(uncertain.status === "uncertain", "Détection faible doit rendre le dossier incertain");

const byClassification = checkCompleteness({
  requiredPieces: pcmiPieces.slice(0, 1),
  uploadedDocuments: [{ filename: "plan.pdf", detectedCode: "PCMI1", confidence: 0.91 }],
});
assert(byClassification.status === "complete", "Classification IA forte doit matcher la pièce");

console.info("[checkCompleteness] contrôle de complétude CERFA OK");
