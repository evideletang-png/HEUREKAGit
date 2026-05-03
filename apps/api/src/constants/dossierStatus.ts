export const DOSSIER_STATUS = {
  BROUILLON: "BROUILLON",
  DEPOSE: "DEPOSE",
  PRE_INSTRUCTION: "PRE_INSTRUCTION",
  INCOMPLET: "INCOMPLET",
  TRANSMIS_METROPOLE: "TRANSMIS_METROPOLE",
  EN_INSTRUCTION: "EN_INSTRUCTION",
  ATTENTE_ABF: "ATTENTE_ABF",
  AVIS_ABF_RECU: "AVIS_ABF_RECU",
  DECISION_EN_COURS: "DECISION_EN_COURS",
  ACCEPTE: "ACCEPTE",
  REFUSE: "REFUSE",
  ACCORD_PRESCRIPTION: "ACCORD_PRESCRIPTION",
} as const;

export type DossierStatus = typeof DOSSIER_STATUS[keyof typeof DOSSIER_STATUS];

export const DOSSIER_STATUSES = Object.values(DOSSIER_STATUS);

export function isDossierStatus(value: unknown): value is DossierStatus {
  return typeof value === "string" && DOSSIER_STATUSES.includes(value as DossierStatus);
}
