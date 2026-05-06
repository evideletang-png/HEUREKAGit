export type DossierStatus =
  | "draft"
  | "submitted"
  | "incomplete"
  | "complete"
  | "in_instruction"
  | "in_consultation"
  | "decision_pending"
  | "signature_pending"
  | "signed"
  | "notified";

export interface DossierStatusContext {
  currentStatus?: string | null;
  completenessStatus?: "complete" | "incomplete" | "uncertain" | string | null;
  instructionStarted?: boolean;
  hasPendingConsultations?: boolean;
  consultationsCompleted?: boolean;
  decisionReady?: boolean;
  decisionSigned?: boolean;
  notified?: boolean;
}

export const DOSSIER_STATUS_ORDER: DossierStatus[] = [
  "draft",
  "submitted",
  "incomplete",
  "complete",
  "in_instruction",
  "in_consultation",
  "decision_pending",
  "signature_pending",
  "signed",
  "notified",
];

const LEGACY_STATUS_MAP: Record<string, DossierStatus> = {
  BROUILLON: "draft",
  DRAFT: "draft",
  DEPOSE: "submitted",
  DÉPOSÉ: "submitted",
  DEPOSED: "submitted",
  SUBMITTED: "submitted",
  INCOMPLET: "incomplete",
  INCOMPLETE: "incomplete",
  COMPLET: "complete",
  COMPLETE: "complete",
  PRE_INSTRUCTION: "in_instruction",
  UNDER_REVIEW: "in_instruction",
  EN_INSTRUCTION: "in_instruction",
  "EN INSTRUCTION": "in_instruction",
  TRANSMIS_METROPOLE: "in_instruction",
  ATTENTE_ABF: "in_consultation",
  AVIS_ABF_RECU: "in_instruction",
  IN_CONSULTATION: "in_consultation",
  DECISION_EN_COURS: "decision_pending",
  DECISION_PENDING: "decision_pending",
  SIGNATURE_PENDING: "signature_pending",
  EN_SIGNATURE: "signature_pending",
  ACCEPTE: "signed",
  APPROVED: "signed",
  REFUSE: "signed",
  REFUSED: "signed",
  ACCORD_PRESCRIPTION: "signed",
  SIGNED: "signed",
  NOTIFIED: "notified",
  NOTIFIE: "notified",
  NOTIFIÉ: "notified",
};

export const DOSSIER_STATUS_META: Record<DossierStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-slate-100 text-slate-700 border-slate-200" },
  submitted: { label: "Déposé", className: "bg-blue-50 text-blue-700 border-blue-200" },
  incomplete: { label: "Incomplet", className: "bg-red-50 text-red-700 border-red-200" },
  complete: { label: "Complet", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  in_instruction: { label: "En instruction", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  in_consultation: { label: "En consultation", className: "bg-amber-50 text-amber-700 border-amber-200" },
  decision_pending: { label: "Décision à préparer", className: "bg-purple-50 text-purple-700 border-purple-200" },
  signature_pending: { label: "En signature", className: "bg-violet-50 text-violet-700 border-violet-200" },
  signed: { label: "Signé", className: "bg-slate-900 text-white border-slate-900" },
  notified: { label: "Notifié", className: "bg-emerald-600 text-white border-emerald-600" },
};

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function normalizeDossierStatus(status?: string | null): DossierStatus {
  const direct = status as DossierStatus;
  if (DOSSIER_STATUS_ORDER.includes(direct)) return direct;
  return LEGACY_STATUS_MAP[normalize(status)] || "draft";
}

export function updateDossierStatus(context: DossierStatusContext): DossierStatus {
  const current = normalizeDossierStatus(context.currentStatus);

  if (context.notified) return "notified";
  if (context.decisionSigned) return current === "notified" ? "notified" : "signed";

  if (current === "signature_pending" || current === "signed" || current === "notified") return current;

  if (context.decisionReady || current === "decision_pending") {
    return "decision_pending";
  }

  if (current === "in_consultation") {
    return context.consultationsCompleted ? "decision_pending" : "in_consultation";
  }

  if (context.hasPendingConsultations) return "in_consultation";

  if (current === "in_instruction") return "in_instruction";

  if (context.instructionStarted || current === "complete") return "in_instruction";

  if (current === "submitted") {
    if (context.completenessStatus === "incomplete" || context.completenessStatus === "uncertain") return "incomplete";
    if (context.completenessStatus === "complete") return "complete";
  }

  if (current === "incomplete" && context.completenessStatus === "complete") return "complete";

  return current;
}

export function getDossierStatusMeta(status?: string | null) {
  const normalized = normalizeDossierStatus(status);
  return { status: normalized, ...DOSSIER_STATUS_META[normalized] };
}
