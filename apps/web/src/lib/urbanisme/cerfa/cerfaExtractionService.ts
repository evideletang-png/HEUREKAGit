import { importCerfaPdf } from "./importCerfaPdf";
import { normalizeOfficialDossierType } from "./resolveOfficialPieces";
import type { DossierType } from "./officialPieces.types";
import type { CerfaFormValues } from "./cerfaFieldMapping";

export type ExtractedCerfaField<T = string | number | boolean> = {
  value: T;
  confidence: number;
  sourcePage?: number;
  needsReview: boolean;
};

export type CerfaExtractionResult = {
  dossierType: ExtractedCerfaField<DossierType>;
  cerfaReference?: ExtractedCerfaField<string>;
  values: Record<string, ExtractedCerfaField>;
  rawValues: CerfaFormValues;
  warnings: string[];
};

function field<T extends string | number | boolean>(value: T, confidence: number, sourcePage = 1): ExtractedCerfaField<T> {
  return {
    value,
    confidence,
    sourcePage,
    needsReview: confidence < 0.75,
  };
}

function detectReference(name: string) {
  const match = name.match(/\b(?:cerfa[_ -]?)?(\d{5}(?:[-_]\d{2})?)\b/i);
  return match?.[1]?.replace("_", "-") || null;
}

function detectTypeFromName(name: string): DossierType {
  const upper = name.toUpperCase();
  if (upper.includes("PCMI")) return "PCMI";
  if (upper.includes("DPA")) return "DPA";
  if (upper.includes("DPC") || upper.includes(" DP") || upper.startsWith("DP")) return "DPC";
  if (upper.includes("PA")) return "PA";
  if (upper.includes("PD")) return "PD";
  if (upper.includes("PC")) return "PC";
  return normalizeOfficialDossierType(undefined);
}

export async function extractCerfaScan(file: File): Promise<CerfaExtractionResult> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const imported = isPdf
    ? await importCerfaPdf(file)
    : {
        dossierType: detectTypeFromName(file.name),
        values: {} as CerfaFormValues,
        confidence: 0.25,
        warnings: ["Image importée : OCR détaillé à brancher côté serveur. Les champs proposés sont à vérifier."],
      };

  const title = String(imported.values["project.title"] || file.name.replace(/\.[^.]+$/i, ""));
  const cerfaReference = detectReference(file.name);
  const values: Record<string, ExtractedCerfaField> = {
    "project.title": field(title, imported.confidence || 0.35),
    "project.dossierType": field(imported.dossierType, imported.confidence || 0.35),
  };

  Object.entries(imported.values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    values[key] = field(value as any, imported.confidence || 0.35);
  });

  return {
    dossierType: field(imported.dossierType, imported.confidence || 0.35),
    cerfaReference: cerfaReference ? field(cerfaReference, 0.72) : undefined,
    values,
    rawValues: {
      ...imported.values,
      "project.title": title,
      "project.dossierType": imported.dossierType,
    },
    warnings: [
      ...imported.warnings,
      "Extraction de Cerfa scanné en mode revue instructeur : les champs incertains doivent être validés avant création.",
    ],
  };
}
