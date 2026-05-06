import type {
  SignatureProvider,
  SignatureRequestInput,
  SignatureWorkflowResult,
} from "./signatureProvider.interface";
import { MockSignatureProvider } from "./providers/mockSignatureProvider";

export type SignaturePreflightStatus = "ready" | "blocked";

export interface SignaturePreflightResult {
  status: SignaturePreflightStatus;
  blockers: string[];
  warnings: string[];
}

export interface StartSignatureWorkflowInput extends SignatureRequestInput {
  dossierReadyForSignature?: boolean;
}

function isMayorRole(role: string) {
  return /maire|mayor/i.test(role);
}

export function validateSignaturePreflight(input: StartSignatureWorkflowInput): SignaturePreflightResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.decisionDocument) blockers.push("Décision générée obligatoire avant envoi au parapheur.");
  if (!input.decisionDocument?.filename) blockers.push("Nom du document de décision manquant.");
  if (input.decisionDocument?.mimeType !== "application/pdf") blockers.push("Le document à signer doit être un PDF.");
  if (!input.decisionDocument?.isFinalPdf) blockers.push("Le document PDF doit être figé avant signature.");
  if (!input.decisionDocument?.contentHash) blockers.push("Empreinte/hash du PDF requis pour contrôler l'intégrité.");
  if (!input.signatory?.id || !input.signatory?.fullName || !input.signatory?.email || !input.signatory?.role) {
    blockers.push("Signataire désigné incomplet.");
  }
  if (input.signatory?.role && !isMayorRole(input.signatory.role) && !input.signatory.authorityDelegationReference) {
    blockers.push("Référence de délégation de signature obligatoire si le signataire n'est pas le maire.");
  }
  if (input.requireTimestamp !== true) blockers.push("Horodatage qualifié ou conforme requis.");
  if (input.requireEvidenceFile !== true) blockers.push("Dossier de preuve requis.");
  if (!input.dossierReadyForSignature) blockers.push("Dossier non marqué prêt pour signature.");

  if (input.signatureLevel === "advanced") {
    warnings.push("Signature avancée sélectionnée : vérifier que le niveau répond bien au risque juridique de l'acte.");
  }

  return { status: blockers.length > 0 ? "blocked" : "ready", blockers, warnings };
}

function ensureProviderSupportsRequest(provider: SignatureProvider, input: SignatureRequestInput) {
  if (!provider.supportedSignatureLevels.includes(input.signatureLevel)) {
    throw new Error(`SIGNATURE_LEVEL_NOT_SUPPORTED_BY_${provider.providerName}`);
  }
  if (!provider.eidasCompatible && !provider.isDemoProvider) {
    throw new Error("SIGNATURE_PROVIDER_NOT_EIDAS_COMPATIBLE");
  }
}

export async function startSignatureWorkflow(
  input: StartSignatureWorkflowInput,
  provider: SignatureProvider = new MockSignatureProvider(),
): Promise<{ preflight: SignaturePreflightResult; result?: SignatureWorkflowResult }> {
  const preflight = validateSignaturePreflight(input);
  if (preflight.status === "blocked") return { preflight };

  ensureProviderSupportsRequest(provider, input);
  const result = await provider.createSignatureRequest(input);
  return { preflight, result };
}

export async function refreshSignatureWorkflow(
  signatureRequestId: string,
  provider: SignatureProvider,
): Promise<SignatureWorkflowResult> {
  const result = await provider.getSignatureStatus(signatureRequestId);
  if (result.status !== "signed") return result;

  if (!result.signedDocumentUrl || !result.evidenceFileUrl || !result.timestamp) {
    throw new Error("PROVIDER_RETURNED_INCOMPLETE_SIGNED_DECISION");
  }

  return provider.archiveSignedDecision(result);
}

export function isLegallySigned(result?: SignatureWorkflowResult | null) {
  return !!result
    && result.status === "signed"
    && !!result.signedDocumentUrl
    && !!result.evidenceFileUrl
    && !!result.timestamp
    && !/mock|simulation/i.test(result.provider);
}
