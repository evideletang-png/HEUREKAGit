import type {
  SignatureAuditEvent,
  SignatureProvider,
  SignatureRequestInput,
  SignatureWorkflowResult,
} from "../signatureProvider.interface";

const LEGAL_NOTICE = "Simulation de signature — non opposable juridiquement.";

function now() {
  return new Date().toISOString();
}

function audit(type: SignatureAuditEvent["type"], message: string, actor?: string): SignatureAuditEvent {
  return { type, at: now(), actor, message };
}

export class MockSignatureProvider implements SignatureProvider {
  readonly providerName = "Heureka Mock Parapheur";
  readonly eidasCompatible = false;
  readonly supportedSignatureLevels = ["advanced", "qualified"] as const;
  readonly isDemoProvider = true;

  private requests = new Map<string, SignatureWorkflowResult>();

  async createSignatureRequest(input: SignatureRequestInput): Promise<SignatureWorkflowResult> {
    const signatureRequestId = `mock-signature-${input.dossierId}-${Date.now()}`;
    const result: SignatureWorkflowResult = {
      signatureRequestId,
      status: "sent",
      signedDocumentUrl: null,
      evidenceFileUrl: null,
      timestamp: null,
      signatureLevel: input.signatureLevel,
      provider: this.providerName,
      legalNotice: LEGAL_NOTICE,
      auditTrail: [
        audit("created", `${LEGAL_NOTICE} Demande préparée pour ${input.decisionDocument.filename}.`, "Heureka"),
        audit("sent", `Simulation envoyée au signataire ${input.signatory.fullName}.`, "Heureka"),
      ],
    };

    this.requests.set(signatureRequestId, result);
    return result;
  }

  async getSignatureStatus(signatureRequestId: string): Promise<SignatureWorkflowResult> {
    const result = this.requests.get(signatureRequestId);
    if (!result) {
      return {
        signatureRequestId,
        status: "expired",
        signedDocumentUrl: null,
        evidenceFileUrl: null,
        timestamp: null,
        signatureLevel: "advanced",
        provider: this.providerName,
        legalNotice: LEGAL_NOTICE,
        auditTrail: [audit("expired", "Demande mock introuvable ou expirée.", "Heureka")],
      };
    }

    if (result.status === "sent") {
      const signed: SignatureWorkflowResult = {
        ...result,
        status: "signed",
        signedDocumentUrl: `/mock-signatures/${signatureRequestId}/decision-signee.pdf`,
        evidenceFileUrl: `/mock-signatures/${signatureRequestId}/dossier-preuve.pdf`,
        timestamp: now(),
        auditTrail: [
          ...result.auditTrail,
          audit("opened", `${LEGAL_NOTICE} Le signataire a ouvert la simulation.`, "Mock"),
          audit("authenticated", `${LEGAL_NOTICE} Authentification simulée.`, "Mock"),
          audit("signed", `${LEGAL_NOTICE} Signature simulée générée.`, "Mock"),
        ],
      };
      this.requests.set(signatureRequestId, signed);
      return signed;
    }

    return result;
  }

  async archiveSignedDecision(result: SignatureWorkflowResult): Promise<SignatureWorkflowResult> {
    const archived = {
      ...result,
      auditTrail: [
        ...result.auditTrail,
        audit("archived", `${LEGAL_NOTICE} Archive de démonstration enregistrée.`, "Heureka"),
      ],
    };
    this.requests.set(result.signatureRequestId, archived);
    return archived;
  }
}
