import type { DossierType } from "./officialPieces.types";
import type { CerfaFormValues } from "./cerfaFieldMapping";
import { PDFDocument } from "pdf-lib";

export type GenerateCerfaPdfInput = {
  dossierType: DossierType;
  values: CerfaFormValues;
  title?: string;
  generatedAt?: Date;
};

export type CerfaFormDescriptor = {
  dossierType: DossierType;
  formFamily: string;
  officialName: string;
  servicePublicCode?: string;
  templatePath: string;
  templateStatus: "app_export" | "official_template_bound";
};

export const CERFA_FORM_DESCRIPTORS: Record<DossierType, CerfaFormDescriptor> = {
  PCMI: {
    dossierType: "PCMI",
    formFamily: "Permis de construire maison individuelle",
    officialName: "Demande de permis de construire pour une maison individuelle et/ou ses annexes",
    servicePublicCode: "13406*16",
    templatePath: "/cerfa/pcmi.pdf",
    templateStatus: "official_template_bound",
  },
  PC: {
    dossierType: "PC",
    formFamily: "Permis de construire",
    officialName: "Demande de permis de construire comprenant ou non des démolitions",
    servicePublicCode: "13409*16",
    templatePath: "/cerfa/pc.pdf",
    templateStatus: "official_template_bound",
  },
  DPC: {
    dossierType: "DPC",
    formFamily: "Déclaration préalable - constructions et travaux",
    officialName: "Déclaration préalable pour une maison individuelle et/ou ses annexes ou pour des constructions et travaux non soumis à permis",
    servicePublicCode: "16702*02",
    templatePath: "/cerfa/dpc.pdf",
    templateStatus: "official_template_bound",
  },
  DPA: {
    dossierType: "DPA",
    formFamily: "Déclaration préalable - installations et aménagements",
    officialName: "Déclaration préalable pour constructions, travaux, installations et aménagements non soumis à permis",
    servicePublicCode: "16703*02",
    templatePath: "/cerfa/dpa.pdf",
    templateStatus: "official_template_bound",
  },
  PA: {
    dossierType: "PA",
    formFamily: "Permis d'aménager",
    officialName: "Demande de permis d'aménager comprenant ou non des constructions et/ou des démolitions",
    servicePublicCode: "16297*04",
    templatePath: "/cerfa/pa.pdf",
    templateStatus: "official_template_bound",
  },
  PD: {
    dossierType: "PD",
    formFamily: "Permis de démolir",
    officialName: "Demande de permis de démolir",
    servicePublicCode: "13405*14",
    templatePath: "/cerfa/pd.pdf",
    templateStatus: "official_template_bound",
  },
};

export function getCerfaFormDescriptor(dossierType: DossierType) {
  const descriptor = CERFA_FORM_DESCRIPTORS[dossierType];
  if (!descriptor) throw new Error(`Aucun formulaire CERFA configuré pour le type ${dossierType}`);
  return descriptor;
}

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

function splitName(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return { lastName: "", firstName: "" };
  const parts = text.split(/\s+/);
  if (parts.length === 1) return { lastName: text, firstName: "" };
  return { lastName: parts.slice(0, -1).join(" "), firstName: parts.at(-1) || "" };
}

function splitStreet(value: unknown) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+\s*(?:bis|ter|quater)?)(?:\s+)(.+)$/i);
  return {
    number: match?.[1] || "",
    street: match?.[2] || text,
  };
}

function setText(form: ReturnType<PDFDocument["getForm"]>, names: string[], value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return;
  for (const name of names) {
    try {
      form.getTextField(name).setText(text);
    } catch {
      // Field names differ slightly between CERFA families; ignore missing fields.
    }
  }
}

function setCheck(form: ReturnType<PDFDocument["getForm"]>, names: string[], checked: boolean | undefined) {
  if (checked !== true) return;
  for (const name of names) {
    try {
      form.getCheckBox(name).check();
    } catch {
      // Field names differ slightly between CERFA families; ignore missing fields.
    }
  }
}

function fillOfficialTemplate(pdfDoc: PDFDocument, input: GenerateCerfaPdfInput, descriptor: CerfaFormDescriptor) {
  const form = pdfDoc.getForm();
  const values = input.values;
  const applicant = splitName(values["applicant.fullName"]);
  const coApplicant = splitName(values["coApplicant.fullName"]);
  const applicantAddress = splitStreet(values["applicant.address"]);
  const terrainAddress = splitStreet(values["terrain.address"]);

  setText(form, ["N1FCA_formulaire"], descriptor.dossierType);
  setText(form, ["N1NCA_numero"], descriptor.servicePublicCode);
  setText(form, ["D1N_nom", "V1N_nom"], applicant.lastName);
  setText(form, ["D1P_prenom", "V1P_prenom"], applicant.firstName);
  setText(form, ["D2D_denomination", "V1MD1_denomination"], values["applicant.fullName"]);
  setText(form, ["D3N_numero"], applicantAddress.number);
  setText(form, ["D3V_voie"], applicantAddress.street);
  setText(form, ["D3L_localite"], values["applicant.address"]);
  setText(form, ["D3T_telephone"], values["applicant.phone"]);
  setText(form, ["D5GE1_email", "D5GE2_email"], values["applicant.email"]);
  setCheck(form, ["D5A_acceptation"], values["engagement.accepted"] === true);

  setText(form, ["D6N_nom"], coApplicant.lastName);
  setText(form, ["D6P_prenom"], coApplicant.firstName);
  setText(form, ["D6GE1_email", "D6GE2_email"], values["coApplicant.email"]);
  setText(form, ["D6T_telephone"], values["coApplicant.phone"]);

  setText(form, ["T2Q_numero"], terrainAddress.number);
  setText(form, ["T2V_voie"], terrainAddress.street);
  setText(form, ["T2L_localite"], values["terrain.commune"]);
  setText(form, ["T2C_code"], values["terrain.postcode"]);
  setText(form, ["T2S_section"], values["terrain.parcel"]);
  setText(form, ["T2T_superficie"], values["terrain.area"]);

  setCheck(form, ["T3B_CUnc", "T3S_lotnc", "T3T_ZACnc"], true);
  setCheck(form, ["P3GA1", "P4EC1", "G1A_agrandissementoui"], values["works.createsConstruction"] === true);
  setCheck(form, ["P4HC1"], values["works.modifiesFacadesOrRoof"] === true);
  setCheck(form, ["X1A_ABF"], values["works.visibleFromPublicSpace"] === true);
  setText(form, ["A4D_description"], values["works.description"]);
}

async function generateFromOfficialTemplate(input: GenerateCerfaPdfInput, descriptor: CerfaFormDescriptor) {
  const response = await fetch(descriptor.templatePath);
  if (!response.ok) throw new Error(`Gabarit CERFA indisponible: ${descriptor.templatePath}`);
  const bytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  fillOfficialTemplate(pdfDoc, input, descriptor);
  const saved = await pdfDoc.save({ updateFieldAppearances: true });
  return new Blob([new Uint8Array(saved)], { type: "application/pdf" });
}

export async function generateCerfaPdf(input: GenerateCerfaPdfInput): Promise<Blob> {
  const generatedAt = input.generatedAt || new Date();
  const descriptor = getCerfaFormDescriptor(input.dossierType);
  if (descriptor.templateStatus === "official_template_bound") {
    try {
      return await generateFromOfficialTemplate(input, descriptor);
    } catch (error) {
      console.warn("[generateCerfaPdf] Official CERFA template fallback", error);
    }
  }
  const lines = [
    `Heureka - Export CERFA ${input.dossierType}`,
    `Formulaire cible: ${descriptor.formFamily}`,
    `Intitule officiel: ${descriptor.officialName}`,
    descriptor.servicePublicCode ? `Reference CERFA: ${descriptor.servicePublicCode}` : "",
    input.title || String(input.values["project.title"] || "Dossier sans titre"),
    `Generation: ${generatedAt.toLocaleString("fr-FR")}`,
    descriptor.templateStatus === "official_template_bound"
      ? "PDF officiel rempli depuis le gabarit CERFA configure."
      : "Export applicatif structure selon le CERFA. TODO_OFFICIAL_TEMPLATE_BINDING: connecter les PDF officiels remplissables.",
    `Terrain: ${input.values["terrain.address"] || ""}`,
    `Commune: ${input.values["terrain.commune"] || ""}`,
    `Parcelle: ${input.values["terrain.parcel"] || ""}`,
    `Travaux: ${input.values["works.description"] || ""}`,
  ].filter(Boolean);
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
