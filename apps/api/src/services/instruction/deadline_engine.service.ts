export type InstructionDossierLike = {
  typeProcedure?: string | null;
  type?: string | null;
  instructionStatus?: string | null;
  dateDepot?: Date | string | null;
  dateCompletude?: Date | string | null;
  dateLimiteInstruction?: Date | string | null;
};

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  if (next.getUTCDate() < day) next.setUTCDate(0);
  return next;
}

function delayMonths(typeProcedure?: string | null) {
  const normalized = String(typeProcedure || "").toUpperCase();
  if (normalized.includes("DECLARATION") || normalized.includes("DP")) return 1;
  if (normalized.includes("PC") || normalized.includes("PERMIS DE CONSTRUIRE")) return 2;

  // MVP explicite : PA, PD et CU utilisent 2 mois par défaut jusqu'au raffinement
  // par sous-procédure et consultations.
  if (normalized.includes("PA") || normalized.includes("PD") || normalized.includes("CU")) return 2;
  return 2;
}

export function computeDeadline(dossier: InstructionDossierLike) {
  if (!dossier.dateCompletude) return null;
  const completedAt = new Date(dossier.dateCompletude);
  if (Number.isNaN(completedAt.getTime())) return null;
  return addMonths(completedAt, delayMonths(dossier.typeProcedure || dossier.type));
}

export function isTacite(dossier: InstructionDossierLike, now = new Date()) {
  const rawDeadline = dossier.dateLimiteInstruction || computeDeadline(dossier);
  if (!rawDeadline) return false;
  const deadline = new Date(rawDeadline);
  if (Number.isNaN(deadline.getTime())) return false;
  return now.getTime() > deadline.getTime();
}
