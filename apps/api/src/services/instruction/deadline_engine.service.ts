export type InstructionDossierLike = {
  typeProcedure?: string | null;
  type?: string | null;
  instructionStatus?: string | null;
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

function normalizeProcedureType(dossier: InstructionDossierLike) {
  const raw = (dossier.typeProcedure || dossier.type || "").toUpperCase();
  if (raw.includes("DECLARATION") || raw.includes("DP")) return "DP";
  if (raw.includes("PC") || raw.includes("PERMIS DE CONSTRUIRE")) return "PC";
  return raw || "DEFAULT";
}

export function computeDeadline(dossier: InstructionDossierLike) {
  if (!dossier.dateCompletude) return null;
  const completedAt = new Date(dossier.dateCompletude);
  if (Number.isNaN(completedAt.getTime())) return null;

  switch (normalizeProcedureType(dossier)) {
    case "DP":
      return addMonths(completedAt, 1);
    case "PC":
      return addMonths(completedAt, 2);
    default:
      return addMonths(completedAt, 2);
  }
}

export function isTacite(dossier: InstructionDossierLike, now = new Date()) {
  const rawDeadline = dossier.dateLimiteInstruction || computeDeadline(dossier);
  if (!rawDeadline) return false;
  const deadline = new Date(rawDeadline);
  if (Number.isNaN(deadline.getTime())) return false;
  return now.getTime() > deadline.getTime();
}
