import { resolveAdditionalPieces, type AdditionalPiece } from "./additionalPiecesResolver";
import { analyzeLocationContext, type LocationConstraintContext } from "./locationContextAnalyzer";

export type PieceRequirementLevel = "obligatoire" | "recommandée" | "à vérifier" | "déclenchée par contexte local";

export type PieceRequirementCategory = "main" | "project" | "location" | "vigilance";

export type PieceRequirement = {
  code: string;
  label: string;
  level: PieceRequirementLevel;
  category?: PieceRequirementCategory;
  reason?: string;
  source?: string;
  confidence?: number;
  required?: boolean;
  blockingIfMissing?: boolean;
  trigger?: string;
};

export type ParcelAnalysisLike = {
  zoneCode?: string | null;
  zoneLabel?: string | null;
  zoningLabel?: string | null;
  constraints?: unknown[];
  overlays?: unknown[];
  geoConstraints?: unknown[];
  [key: string]: unknown;
};

const BASE_PIECES: Record<string, PieceRequirement[]> = {
  PCMI: [
    ["PCMI1", "Plan de situation"],
    ["PCMI2", "Plan de masse"],
    ["PCMI3", "Plan en coupe"],
    ["PCMI4", "Notice descriptive"],
    ["PCMI5", "Plans des façades et toitures"],
    ["PCMI6", "Document graphique d'insertion"],
    ["PCMI7", "Photographie environnement proche"],
    ["PCMI8", "Photographie environnement lointain"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire", category: "main", source: "CERFA PCMI" })),
  PC: [
    ["PC1", "Plan de situation"],
    ["PC2", "Plan de masse"],
    ["PC3", "Plan en coupe"],
    ["PC4", "Notice descriptive"],
    ["PC5", "Plans des façades et toitures"],
    ["PC6", "Document graphique d'insertion"],
    ["PC7", "Photographie environnement proche"],
    ["PC8", "Photographie environnement lointain"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire", category: "main", source: "CERFA PC" })),
  DP: [
    ["DP1", "Plan de situation", "obligatoire"],
    ["DP2", "Plan de masse si création ou modification", "à vérifier"],
    ["DP3", "Plan en coupe si modification du profil", "à vérifier"],
    ["DP4", "Façades/toitures si modification extérieure", "à vérifier"],
    ["DP6", "Insertion graphique si visible depuis l'espace public", "à vérifier"],
    ["DP7", "Photographie environnement proche", "à vérifier"],
    ["DP8", "Photographie environnement lointain", "à vérifier"],
  ].map(([code, label, level]) => ({ code, label, level: level as PieceRequirementLevel, category: "main", source: "CERFA DP" })),
  PA: [
    ["PA1", "Plan de situation"],
    ["PA2", "Notice descriptive du terrain et du projet"],
    ["PA3", "Plan de l'état actuel du terrain"],
    ["PA4", "Plan de composition d'ensemble"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire", category: "main", source: "CERFA PA" })),
  PD: [
    ["PD1", "Plan de situation"],
    ["PD2", "Plan de masse des constructions à démolir"],
    ["PD3", "Photographies du bâtiment"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire", category: "main", source: "CERFA PD" })),
  CUA: [
    ["CU1", "Plan de situation"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire", category: "main", source: "CERFA CUa" })),
  CUB: [
    ["CU1", "Plan de situation"],
    ["CU2", "Description de l'opération"],
    ["CU3", "Plan du terrain"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire", category: "main", source: "CERFA CUb" })),
};

const PROJECT_CONDITIONAL_PIECES: Record<string, PieceRequirement[]> = {
  PCMI: [
    {
      code: "PROJET-EXT",
      label: "Plans avant/après et cohérence des surfaces créées",
      level: "à vérifier",
      category: "project",
      reason: "À fournir si le projet modifie l'existant ou crée de la surface.",
      source: "Analyse du projet déclaré",
      confidence: 0.55,
    },
  ],
  PC: [
    {
      code: "PROJET-ACCESS",
      label: "Justification des accès, stationnements et espaces extérieurs",
      level: "à vérifier",
      category: "project",
      reason: "Pièce utile selon destination, ampleur du projet et règlement local.",
      source: "Analyse du projet déclaré",
      confidence: 0.55,
    },
  ],
  DP: [
    {
      code: "PROJET-VISIBLE",
      label: "Photographies et insertion si le projet est visible depuis l'espace public",
      level: "à vérifier",
      category: "project",
      reason: "Les pièces DP varient selon la nature exacte des travaux.",
      source: "CERFA DP / conditions projet",
      confidence: 0.6,
    },
  ],
  PA: [],
  PD: [],
  CUA: [],
  CUB: [
    {
      code: "PROJET-CUB-OPERATION",
      label: "Description précise de l'opération envisagée",
      level: "obligatoire",
      category: "project",
      reason: "Nécessaire pour un certificat d'urbanisme opérationnel.",
      source: "CERFA CUb",
      confidence: 0.9,
      blockingIfMissing: true,
    },
  ],
};

export function normalizeProcedureType(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "permis_de_construire") return "PC";
  if (normalized === "declaration_prealable") return "DP";
  if (normalized === "permis_amenager") return "PA";
  if (normalized === "certificat_urbanisme") return "CUA";
  if (raw === "CUa") return "CUA";
  if (raw === "CUb") return "CUB";
  return raw.toUpperCase();
}

function toPieceRequirement(piece: AdditionalPiece): PieceRequirement {
  return {
    code: piece.code,
    label: piece.label,
    level: piece.required ? "déclenchée par contexte local" : "recommandée",
    category: "location",
    reason: piece.reason,
    source: piece.source,
    confidence: piece.confidence,
    required: piece.required,
    blockingIfMissing: piece.blockingIfMissing,
    trigger: piece.trigger,
  };
}

export function getRequiredPieces(args: {
  procedureType: string;
  parcelAnalysis?: ParcelAnalysisLike | null;
  selectedAddress?: any | null;
  addressLabel?: string | null;
  zone?: { zoneCode?: string | null; zoneType?: string | null; constraints?: unknown[] } | null;
  constraints?: unknown[];
}) {
  const procedureType = normalizeProcedureType(args.procedureType);
  const requiredPieces = BASE_PIECES[procedureType] || [];
  const projectConditionalPieces = PROJECT_CONDITIONAL_PIECES[procedureType] || [];
  const locationContext = analyzeLocationContext({
    selectedAddress: args.selectedAddress,
    addressLabel: args.addressLabel,
    parcelAnalysis: {
      ...(args.parcelAnalysis || {}),
      constraints: args.constraints || args.parcelAnalysis?.constraints,
      zoneCode: args.parcelAnalysis?.zoneCode || args.zone?.zoneCode,
    },
  });
  const resolved = resolveAdditionalPieces({ procedureType, locationContext, basePieces: requiredPieces });
  const locationAdditionalPieces = resolved.pieces.map(toPieceRequirement);
  const warnings = [...resolved.vigilance];

  if (!locationContext.pluZone.code) warnings.push("Checklist provisoire : à confirmer après identification du zonage et des servitudes.");

  return {
    requiredPieces,
    projectConditionalPieces,
    conditionalPieces: [...projectConditionalPieces, ...locationAdditionalPieces],
    locationAdditionalPieces,
    vigilancePoints: warnings,
    locationContext,
    missingContext: locationContext.missingData,
    warnings,
  };
}

export type RequiredPiecesResult = ReturnType<typeof getRequiredPieces>;
export type { LocationConstraintContext };
