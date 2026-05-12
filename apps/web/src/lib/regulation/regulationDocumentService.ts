export type RegulationDocument = {
  id: string;
  title?: string | null;
  fileName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
  explanatoryNote?: string | null;
  availabilityStatus?: string;
  textQualityLabel?: string | null;
  textQualityScore?: number | null;
};

export type RegulationDocumentFilters = {
  search?: string;
  type?: string;
  commune?: string;
  zone?: string;
  opposableOnly?: boolean;
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  plu_reglement: "Règlement écrit",
  plu_annexe: "Annexe PLU/PLUi",
  zonage_map: "Plan de zonage",
  oap: "OAP",
  sup: "Servitude d'utilité publique",
  ppri: "PPRI / risques",
  patrimoine: "Patrimoine",
  reseaux: "Réseaux",
  deliberation: "Délibération",
};

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function classifyRegulationDocument(document: RegulationDocument) {
  const haystack = normalize(`${document.documentType} ${document.category} ${document.subCategory} ${document.title} ${document.fileName}`);
  if (haystack.includes("oap")) return "oap";
  if (haystack.includes("servitude") || haystack.includes("sup")) return "sup";
  if (haystack.includes("ppri") || haystack.includes("risque") || haystack.includes("inond")) return "ppri";
  if (haystack.includes("zonage") || haystack.includes("graphique")) return "zonage_map";
  if (haystack.includes("annexe")) return "plu_annexe";
  if (haystack.includes("patrimoine") || haystack.includes("abf") || haystack.includes("monument")) return "patrimoine";
  if (haystack.includes("reseau") || haystack.includes("réseau") || haystack.includes("sanitaire")) return "reseaux";
  if (haystack.includes("deliberation") || haystack.includes("délibération")) return "deliberation";
  if (haystack.includes("reglement") || haystack.includes("règlement") || haystack.includes("plu")) return "plu_reglement";
  return normalize(document.documentType) || "autre";
}

export function getRegulationDocumentTypeLabel(type: string) {
  return DOCUMENT_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

export function listRegulationDocumentTypes(documents: RegulationDocument[]) {
  const types = new Map<string, string>();
  documents.forEach((document) => {
    const type = classifyRegulationDocument(document);
    types.set(type, getRegulationDocumentTypeLabel(type));
  });
  return Array.from(types.entries()).sort((left, right) => left[1].localeCompare(right[1], "fr"));
}

export function filterRegulationDocuments(documents: RegulationDocument[], filters: RegulationDocumentFilters) {
  const search = normalize(filters.search);
  return documents.filter((document) => {
    const type = classifyRegulationDocument(document);
    if (filters.type && filters.type !== "all" && type !== filters.type) return false;
    if (filters.opposableOnly && !["plu_reglement", "plu_annexe", "zonage_map", "oap", "sup", "ppri"].includes(type)) return false;
    if (!search) return true;
    const haystack = normalize([
      document.title,
      document.fileName,
      document.category,
      document.subCategory,
      document.documentType,
      document.explanatoryNote,
    ].join(" "));
    return haystack.includes(search);
  });
}

export function buildDocumentSourceLink(document: RegulationDocument) {
  return `/api/mairie/documents/${encodeURIComponent(document.id)}/view`;
}
