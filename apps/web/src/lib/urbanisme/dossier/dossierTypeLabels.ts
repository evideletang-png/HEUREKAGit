const LABELS: Record<string, string> = {
  PCMI: "Permis de construire maison individuelle (PCMI)",
  PC: "Permis de construire (PC)",
  DPC: "Déclaration préalable constructions et travaux (DPC)",
  DPA: "Déclaration préalable installations et aménagements (DPA)",
  PA: "Permis d'aménager (PA)",
  PD: "Permis de démolir (PD)",
  CUa: "Certificat d'urbanisme d'information (CUa)",
  CUb: "Certificat d'urbanisme opérationnel (CUb)",
};

const ALIASES: Record<string, string> = {
  DP: "DPC",
  DECLARATION_PREALABLE: "DPC",
  DECLARATION_PREALABLE_CONSTRUCTIONS_TRAVAUX: "DPC",
  DECLARATION_PREALABLE_INSTALLATIONS_AMENAGEMENTS: "DPA",
  PERMIS_DE_CONSTRUIRE: "PC",
  PERMIS_DE_CONSTRUIRE_MAISON_INDIVIDUELLE: "PCMI",
  PERMIS_D_AMENAGER: "PA",
  PERMIS_AMENAGER: "PA",
  PERMIS_DE_DEMOLIR: "PD",
  PERMIS_DEMOLIR: "PD",
  CU: "CUb",
  CERTIFICAT_URBANISME: "CUb",
  CERTIFICAT_D_URBANISME: "CUb",
  CUA: "CUa",
  CUB: "CUb",
};

function normalizeKey(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .trim()
    .replace(/[-\s]+/g, "_");
}

export function getDossierTypeLabel(raw?: string | null): string {
  if (!raw) return "Dossier d'urbanisme";
  const key = normalizeKey(raw);
  const canonical = ALIASES[key] || key;
  return LABELS[canonical] || `${raw.replace(/_/g, " ")} (${canonical})`;
}

export function getCanonicalDossierType(raw?: string | null): string {
  if (!raw) return "";
  const key = normalizeKey(raw);
  return ALIASES[key] || (LABELS[key] ? key : "");
}

export { LABELS as DOSSIER_TYPE_LABELS };
