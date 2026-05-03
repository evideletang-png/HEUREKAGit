import { isTacite, type InstructionDossierLike } from "./deadline_engine.service.js";

export type InstructionAlert = {
  type: string;
  message: string;
  severity?: "info" | "warning" | "critical";
  source?: "system" | "ai";
};

export function generateAlerts(dossier: InstructionDossierLike): { alerts: InstructionAlert[] } {
  const alerts: InstructionAlert[] = [];

  if (!dossier.dateCompletude) {
    alerts.push({
      type: "missing_completude",
      message: "Aucune date de complétude n'est renseignée, le délai d'instruction ne peut pas être calculé.",
      severity: "info",
      source: "system",
    });
  }

  if (isTacite(dossier)) {
    alerts.push({
      type: "tacite_risk",
      message: "Le délai d'instruction est dépassé, il existe un risque de décision tacite.",
      severity: "critical",
      source: "system",
    });
  }

  return { alerts };
}
