export type SignatureLevel = "advanced" | "qualified";
export type SignatureRequestStatus = "draft" | "sent" | "signed" | "rejected" | "expired";
export type SignatureAuditEventType =
  | "created"
  | "sent"
  | "opened"
  | "authenticated"
  | "signed"
  | "rejected"
  | "expired"
  | "archived";

export interface DecisionDocumentForSignature {
  id?: string;
  filename: string;
  mimeType: "application/pdf" | string;
  url?: string;
  contentHash?: string;
  isFinalPdf?: boolean;
  generatedAt?: string;
}

export interface SignatureSignatory {
  id: string;
  fullName: string;
  role: string;
  email: string;
  authorityDelegationReference?: string;
}

export interface SignatureRequestInput {
  decisionDocument: DecisionDocumentForSignature;
  dossierId: string;
  signatory: SignatureSignatory;
  signatureLevel: SignatureLevel;
  requireTimestamp: true;
  requireEvidenceFile: true;
}

export interface SignatureAuditEvent {
  type: SignatureAuditEventType;
  at: string;
  actor?: string;
  message: string;
  providerReference?: string;
}

export interface SignatureWorkflowResult {
  signatureRequestId: string;
  status: SignatureRequestStatus;
  signedDocumentUrl?: string | null;
  evidenceFileUrl?: string | null;
  timestamp?: string | null;
  signatureLevel: SignatureLevel;
  provider: string;
  auditTrail: SignatureAuditEvent[];
  legalNotice?: string;
}

export interface SignatureProvider {
  readonly providerName: string;
  readonly eidasCompatible: boolean;
  readonly supportedSignatureLevels: readonly SignatureLevel[];
  readonly isDemoProvider?: boolean;
  createSignatureRequest(input: SignatureRequestInput): Promise<SignatureWorkflowResult>;
  getSignatureStatus(signatureRequestId: string): Promise<SignatureWorkflowResult>;
  archiveSignedDecision(result: SignatureWorkflowResult): Promise<SignatureWorkflowResult>;
}
