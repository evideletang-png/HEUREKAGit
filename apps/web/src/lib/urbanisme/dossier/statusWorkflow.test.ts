import { getDossierStatusMeta, normalizeDossierStatus, updateDossierStatus } from "./statusWorkflow";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(normalizeDossierStatus("BROUILLON") === "draft", "BROUILLON doit être normalisé en draft");
assert(normalizeDossierStatus("DEPOSE") === "submitted", "DEPOSE doit être normalisé en submitted");
assert(normalizeDossierStatus("ATTENTE_ABF") === "in_consultation", "ATTENTE_ABF doit être normalisé en in_consultation");

assert(
  updateDossierStatus({ currentStatus: "submitted", completenessStatus: "incomplete" }) === "incomplete",
  "submitted doit pouvoir devenir incomplete",
);
assert(
  updateDossierStatus({ currentStatus: "submitted", completenessStatus: "complete" }) === "complete",
  "submitted doit pouvoir devenir complete",
);
assert(
  updateDossierStatus({ currentStatus: "complete" }) === "in_instruction",
  "complete doit passer en instruction",
);
assert(
  updateDossierStatus({ currentStatus: "in_instruction", hasPendingConsultations: true }) === "in_consultation",
  "in_instruction doit passer en consultation si une consultation est requise",
);
assert(
  updateDossierStatus({ currentStatus: "in_consultation", consultationsCompleted: true }) === "decision_pending",
  "in_consultation doit passer en decision_pending après retours",
);
assert(
  updateDossierStatus({ currentStatus: "decision_pending", decisionSigned: true }) === "signed",
  "decision_pending doit passer en signed",
);
assert(
  updateDossierStatus({ currentStatus: "signed", notified: true }) === "notified",
  "signed doit passer en notified",
);
assert(getDossierStatusMeta("REFUSE").label === "Signé", "Une décision legacy refusée doit être affichée comme signée");

console.info("[statusWorkflow] workflow état dossier OK");
