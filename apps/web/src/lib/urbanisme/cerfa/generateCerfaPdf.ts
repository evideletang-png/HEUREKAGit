import type { DossierType } from "./officialPieces.types";
import type { CerfaFormValues } from "./cerfaFieldMapping";

export type GenerateCerfaPdfInput = {
  dossierType: DossierType;
  values: CerfaFormValues;
  title?: string;
  generatedAt?: Date;
};

function escapePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .slice(0, 240);
}

function buildMinimalPdf(lines: string[]) {
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "" : "0 -18 Td",
      `(${escapePdfText(line)}) Tj`,
    ]).filter(Boolean),
    "ET",
  ].join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = objects.map((object) => {
    const current = offset;
    offset += object.length + 1;
    return current;
  });
  const body = objects.join("\n");
  const xrefStart = "%PDF-1.4\n".length + body.length + 1;
  const xrefTable = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...xref.map((entry) => `${String(entry).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
  ].join("\n");
  return `%PDF-1.4\n${body}\n${xrefTable}`;
}

export async function generateCerfaPdf(input: GenerateCerfaPdfInput): Promise<Blob> {
  const generatedAt = input.generatedAt || new Date();
  const lines = [
    `Heureka - Export CERFA ${input.dossierType}`,
    input.title || String(input.values["project.title"] || "Dossier sans titre"),
    `Generation: ${generatedAt.toLocaleString("fr-FR")}`,
    "Export applicatif structure selon le CERFA. TODO_OFFICIAL_TEMPLATE_BINDING: connecter les PDF officiels remplissables.",
    `Terrain: ${input.values["terrain.address"] || ""}`,
    `Commune: ${input.values["terrain.commune"] || ""}`,
    `Parcelle: ${input.values["terrain.parcel"] || ""}`,
    `Travaux: ${input.values["works.description"] || ""}`,
  ];
  return new Blob([buildMinimalPdf(lines)], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
