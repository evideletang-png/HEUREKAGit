import { MockSignatureProvider } from "./providers/mockSignatureProvider";
import { isLegallySigned, refreshSignatureWorkflow, startSignatureWorkflow, validateSignaturePreflight } from "./signatureWorkflow";
import type { StartSignatureWorkflowInput } from "./signatureWorkflow";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const readyInput: StartSignatureWorkflowInput = {
  dossierId: "dossier-1",
  decisionDocument: {
    id: "decision-1",
    filename: "decision.pdf",
    mimeType: "application/pdf",
    isFinalPdf: true,
    contentHash: "sha256-demo",
  },
  signatory: {
    id: "signatory-1",
    fullName: "Marie Durand",
    role: "Maire",
    email: "maire@example.test",
  },
  signatureLevel: "advanced",
  requireTimestamp: true,
  requireEvidenceFile: true,
  dossierReadyForSignature: true,
};

const ready = validateSignaturePreflight(readyInput);
assert(ready.status === "ready", "Un dossier complet doit être prêt pour le parapheur");

const blocked = validateSignaturePreflight({
  ...readyInput,
  decisionDocument: { ...readyInput.decisionDocument, isFinalPdf: false, contentHash: "" },
  signatory: { ...readyInput.signatory, role: "Adjoint", authorityDelegationReference: undefined },
});
assert(blocked.status === "blocked", "Un PDF non figé et une délégation manquante doivent bloquer");
assert(blocked.blockers.some((item) => item.includes("délégation")), "La délégation doit être contrôlée si le signataire n'est pas le maire");
assert(blocked.blockers.some((item) => item.includes("figé")), "Le PDF figé doit être contrôlé");

const provider = new MockSignatureProvider();
const started = await startSignatureWorkflow(readyInput, provider);
assert(started.result?.status === "sent", "Le mock doit envoyer la demande");
assert(started.result?.legalNotice?.includes("non opposable"), "Le mock doit afficher sa limite juridique");

const refreshed = await refreshSignatureWorkflow(started.result.signatureRequestId, provider);
assert(refreshed.status === "signed", "Le mock peut simuler un retour signé");
assert(!!refreshed.signedDocumentUrl, "Le document signé simulé doit être exposé");
assert(!!refreshed.evidenceFileUrl, "Le dossier de preuve simulé doit être exposé");
assert(isLegallySigned(refreshed) === false, "Une simulation mock ne doit jamais être considérée comme juridiquement signée");

console.info("[signatureWorkflow] orchestration eIDAS OK");
