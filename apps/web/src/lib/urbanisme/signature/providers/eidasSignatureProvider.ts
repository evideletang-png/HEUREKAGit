import type {
  SignatureProvider,
  SignatureRequestInput,
  SignatureWorkflowResult,
} from "../signatureProvider.interface";

export interface EidasSignatureProviderConfig {
  providerName: string;
  apiBaseUrl: string;
  apiKey?: string;
}

export class EidasSignatureProvider implements SignatureProvider {
  readonly eidasCompatible = true;
  readonly supportedSignatureLevels = ["advanced", "qualified"] as const;
  readonly isDemoProvider = false;
  readonly providerName: string;

  constructor(private readonly config: EidasSignatureProviderConfig) {
    this.providerName = config.providerName;
  }

  async createSignatureRequest(input: SignatureRequestInput): Promise<SignatureWorkflowResult> {
    if (!this.config.apiKey) {
      throw new Error("EIDAS_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch(`${this.config.apiBaseUrl.replace(/\/$/, "")}/signature-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        dossierId: input.dossierId,
        document: input.decisionDocument,
        signatory: input.signatory,
        signatureLevel: input.signatureLevel,
        requireTimestamp: input.requireTimestamp,
        requireEvidenceFile: input.requireEvidenceFile,
      }),
    });

    if (!response.ok) throw new Error(`EIDAS_PROVIDER_ERROR_${response.status}`);
    return this.normalizeProviderResult(await response.json(), input.signatureLevel);
  }

  async getSignatureStatus(signatureRequestId: string): Promise<SignatureWorkflowResult> {
    if (!this.config.apiKey) {
      throw new Error("EIDAS_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch(`${this.config.apiBaseUrl.replace(/\/$/, "")}/signature-requests/${encodeURIComponent(signatureRequestId)}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });

    if (!response.ok) throw new Error(`EIDAS_PROVIDER_ERROR_${response.status}`);
    return this.normalizeProviderResult(await response.json(), "advanced");
  }

  async archiveSignedDecision(result: SignatureWorkflowResult): Promise<SignatureWorkflowResult> {
    if (result.status !== "signed" || !result.signedDocumentUrl || !result.evidenceFileUrl) {
      throw new Error("CANNOT_ARCHIVE_UNSIGNED_DECISION");
    }
    return {
      ...result,
      auditTrail: [
        ...result.auditTrail,
        {
          type: "archived",
          at: new Date().toISOString(),
          actor: "Heureka",
          message: "Document signé et dossier de preuve remis à la conservation archivable Heureka.",
        },
      ],
    };
  }

  private normalizeProviderResult(payload: any, fallbackLevel: SignatureWorkflowResult["signatureLevel"]): SignatureWorkflowResult {
    return {
      signatureRequestId: String(payload.signatureRequestId || payload.id),
      status: payload.status,
      signedDocumentUrl: payload.signedDocumentUrl || payload.signed_document_url || null,
      evidenceFileUrl: payload.evidenceFileUrl || payload.evidence_file_url || null,
      timestamp: payload.timestamp || payload.signedAt || payload.signed_at || null,
      signatureLevel: payload.signatureLevel || payload.signature_level || fallbackLevel,
      provider: this.providerName,
      auditTrail: Array.isArray(payload.auditTrail || payload.audit_trail) ? (payload.auditTrail || payload.audit_trail) : [],
    };
  }
}
