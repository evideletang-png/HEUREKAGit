export type DossierPieceType = "PCMI" | "PC" | "DP" | "PA" | "PD" | "CUA" | "CUB";

export type PieceStatus =
  | "mandatory"
  | "conditional_project"
  | "conditional_location"
  | "recommended"
  | "instructor_alert";

export type OfficialPieceDefinition = {
  code: string;
  label: string;
  category: PieceStatus;
  official: true;
  appliesTo: DossierPieceType[];
  description?: string;
  triggers: string[];
  source: string;
};

export const OFFICIAL_PIECE_NOMENCLATURE: Record<DossierPieceType, OfficialPieceDefinition[]> = {
  PCMI: [
    {
      code: "PCMI1",
      label: "Plan de situation du terrain",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      description: "Permet de localiser le terrain dans la commune.",
      triggers: ["always"],
      source: "CERFA PCMI",
    },
    {
      code: "PCMI2",
      label: "Plan de masse des constructions à édifier ou à modifier",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      description: "Présente le projet dans l'unité foncière.",
      triggers: ["always"],
      source: "CERFA PCMI",
    },
    {
      code: "PCMI3",
      label: "Plan en coupe du terrain et de la construction",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      triggers: ["always"],
      source: "CERFA PCMI",
    },
    {
      code: "PCMI4",
      label: "Notice décrivant le terrain et présentant le projet",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      triggers: ["always", "abf", "spr", "oap", "ppri", "risk", "servitude", "protected_area"],
      source: "CERFA PCMI",
    },
    {
      code: "PCMI5",
      label: "Plan des façades et des toitures",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      triggers: ["always", "abf", "spr"],
      source: "CERFA PCMI",
    },
    {
      code: "PCMI6",
      label: "Document graphique permettant d'apprécier l'insertion du projet",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      triggers: ["always", "abf", "spr", "oap", "protected_area"],
      source: "CERFA PCMI",
    },
    {
      code: "PCMI7",
      label: "Photographie permettant de situer le terrain dans l'environnement proche",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      triggers: ["always", "abf", "spr", "protected_area"],
      source: "CERFA PCMI",
    },
    {
      code: "PCMI8",
      label: "Photographie permettant de situer le terrain dans le paysage lointain",
      category: "mandatory",
      official: true,
      appliesTo: ["PCMI"],
      triggers: ["always", "abf", "spr", "protected_area"],
      source: "CERFA PCMI",
    },
  ],
  PC: [
    { code: "PC1", label: "Plan de situation du terrain", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always"], source: "CERFA PC" },
    { code: "PC2", label: "Plan de masse des constructions à édifier ou à modifier", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always"], source: "CERFA PC" },
    { code: "PC3", label: "Plan en coupe du terrain et de la construction", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always"], source: "CERFA PC" },
    { code: "PC4", label: "Notice décrivant le terrain et présentant le projet", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always", "abf", "spr", "oap", "ppri", "risk", "servitude"], source: "CERFA PC" },
    { code: "PC5", label: "Plan des façades et des toitures", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always", "abf", "spr"], source: "CERFA PC" },
    { code: "PC6", label: "Document graphique permettant d'apprécier l'insertion du projet", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always", "abf", "spr", "oap"], source: "CERFA PC" },
    { code: "PC7", label: "Photographie permettant de situer le terrain dans l'environnement proche", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always", "abf", "spr"], source: "CERFA PC" },
    { code: "PC8", label: "Photographie permettant de situer le terrain dans le paysage lointain", category: "mandatory", official: true, appliesTo: ["PC"], triggers: ["always", "abf", "spr"], source: "CERFA PC" },
  ],
  DP: [
    { code: "DP1", label: "Plan de situation du terrain", category: "mandatory", official: true, appliesTo: ["DP"], triggers: ["always"], source: "CERFA DP" },
    { code: "DP2", label: "Plan de masse des constructions à édifier ou à modifier", category: "conditional_project", official: true, appliesTo: ["DP"], triggers: ["project_creates_footprint", "oap", "ppri", "servitude"], source: "CERFA DP" },
    { code: "DP3", label: "Plan en coupe du terrain et de la construction", category: "conditional_project", official: true, appliesTo: ["DP"], triggers: ["project_changes_ground_profile", "ppri"], source: "CERFA DP" },
    { code: "DP4", label: "Plan des façades et des toitures", category: "conditional_project", official: true, appliesTo: ["DP"], triggers: ["external_modification", "abf", "spr"], source: "CERFA DP" },
    { code: "DP6", label: "Document graphique permettant d'apprécier l'insertion du projet", category: "conditional_project", official: true, appliesTo: ["DP"], triggers: ["visible_from_public_space", "abf", "spr", "oap", "protected_area"], source: "CERFA DP" },
    { code: "DP7", label: "Photographie permettant de situer le terrain dans l'environnement proche", category: "conditional_project", official: true, appliesTo: ["DP"], triggers: ["visible_from_public_space", "abf", "spr", "protected_area"], source: "CERFA DP" },
    { code: "DP8", label: "Photographie permettant de situer le terrain dans le paysage lointain", category: "conditional_project", official: true, appliesTo: ["DP"], triggers: ["visible_from_public_space", "abf", "spr", "protected_area"], source: "CERFA DP" },
  ],
  PA: [
    { code: "PA1", label: "Plan de situation du terrain", category: "mandatory", official: true, appliesTo: ["PA"], triggers: ["always"], source: "CERFA PA" },
    { code: "PA2", label: "Notice décrivant le terrain et le projet d'aménagement", category: "mandatory", official: true, appliesTo: ["PA"], triggers: ["always", "oap", "ppri", "risk", "servitude"], source: "CERFA PA" },
    { code: "PA3", label: "Plan de l'état actuel du terrain à aménager et de ses abords", category: "mandatory", official: true, appliesTo: ["PA"], triggers: ["always"], source: "CERFA PA" },
    { code: "PA4", label: "Plan de composition d'ensemble du projet", category: "mandatory", official: true, appliesTo: ["PA"], triggers: ["always", "oap"], source: "CERFA PA" },
  ],
  PD: [
    { code: "PD1", label: "Plan de situation du terrain", category: "mandatory", official: true, appliesTo: ["PD"], triggers: ["always"], source: "CERFA PD" },
    { code: "PD2", label: "Plan de masse des constructions à démolir ou à conserver", category: "mandatory", official: true, appliesTo: ["PD"], triggers: ["always"], source: "CERFA PD" },
    { code: "PD3", label: "Photographie du ou des bâtiments à démolir", category: "mandatory", official: true, appliesTo: ["PD"], triggers: ["always", "abf", "spr"], source: "CERFA PD" },
  ],
  CUA: [
    { code: "CU1", label: "Plan de situation du terrain", category: "mandatory", official: true, appliesTo: ["CUA"], triggers: ["always"], source: "CERFA CU" },
  ],
  CUB: [
    { code: "CU1", label: "Plan de situation du terrain", category: "mandatory", official: true, appliesTo: ["CUB"], triggers: ["always"], source: "CERFA CU" },
    { code: "CU2", label: "Note descriptive succincte de l'opération", category: "mandatory", official: true, appliesTo: ["CUB"], triggers: ["always"], source: "CERFA CUb" },
    { code: "CU3", label: "Plan du terrain", category: "mandatory", official: true, appliesTo: ["CUB"], triggers: ["always"], source: "CERFA CUb" },
  ],
};

export function normalizeDossierPieceType(value: string | null | undefined): DossierPieceType {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "permis_de_construire") return "PC";
  if (normalized === "declaration_prealable") return "DP";
  if (normalized === "permis_amenager") return "PA";
  if (normalized === "certificat_urbanisme") return "CUA";
  if (raw === "CUa") return "CUA";
  if (raw === "CUb") return "CUB";
  const upper = raw.toUpperCase();
  if (upper === "PCMI" || upper === "PC" || upper === "DP" || upper === "PA" || upper === "PD" || upper === "CUA" || upper === "CUB") {
    return upper;
  }
  return "DP";
}

export function getNomenclatureFor(type: string | null | undefined) {
  return OFFICIAL_PIECE_NOMENCLATURE[normalizeDossierPieceType(type)];
}
