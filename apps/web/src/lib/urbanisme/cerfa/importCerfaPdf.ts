import { normalizeOfficialDossierType } from "./resolveOfficialPieces";
import type { DossierType } from "./officialPieces.types";
import type { CerfaFormValues } from "./cerfaFieldMapping";

export type ImportedCerfaPdf = {
  dossierType: DossierType;
  values: CerfaFormValues;
  confidence: number;
  warnings: string[];
};

function detectDossierTypeFromName(name: string): DossierType {
  const upper = name.toUpperCase();
  if (upper.includes("PCMI")) return "PCMI";
  if (upper.includes("DPA")) return "DPA";
  if (upper.includes("DPC") || upper.includes("DP")) return "DPC";
  if (upper.includes("PA")) return "PA";
  if (upper.includes("PD")) return "PD";
  if (upper.includes("PC")) return "PC";
  return normalizeOfficialDossierType(undefined);
}

export async function importCerfaPdf(file: File): Promise<ImportedCerfaPdf> {
  return {
    dossierType: detectDossierTypeFromName(file.name),
    values: {
      "project.title": file.name.replace(/\.pdf$/i, ""),
    },
    confidence: 0.35,
    warnings: [
      "Lecture partielle du nom de fichier uniquement. TODO_OFFICIAL_PDF_FIELD_EXTRACTION: brancher les gabarits CERFA remplissables pour extraire les champs.",
    ],
  };
}
