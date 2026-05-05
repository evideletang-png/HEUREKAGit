import { analyzeLocationContext, type LocationConstraintContext } from "./locationContextAnalyzer";
import { normalizeDossierPieceType, type PieceStatus } from "./urbanisme/pieces/nomenclature";
import { resolveExpectedPieces, type ExpectedPiece, type InstructorAlert } from "./urbanisme/pieces/resolveExpectedPieces";

export type PieceRequirementLevel = "obligatoire" | "conditionnelle" | "recommandée" | "vigilance";

export type PieceRequirementCategory = "main" | "project" | "location" | "vigilance";

export type PieceAdditionalReason = {
  reason: string;
  source: string;
  confidence?: number;
  trigger: string;
};

export type PieceRequirement = {
  code: string;
  label: string;
  level: PieceRequirementLevel;
  status: PieceStatus;
  category?: PieceRequirementCategory;
  reason?: string;
  source?: string;
  confidence?: number;
  required?: boolean;
  official: boolean;
  blockingIfMissing?: boolean;
  trigger?: string;
  additionalReasons: PieceAdditionalReason[];
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

function levelForStatus(status: PieceStatus): PieceRequirementLevel {
  if (status === "mandatory") return "obligatoire";
  if (status === "recommended") return "recommandée";
  if (status === "instructor_alert") return "vigilance";
  return "conditionnelle";
}

function toRequirement(piece: ExpectedPiece, category: PieceRequirementCategory): PieceRequirement {
  const firstReason = piece.additionalReasons[0];
  return {
    code: piece.code,
    label: piece.label,
    level: levelForStatus(piece.status),
    status: piece.status,
    category,
    reason: firstReason?.reason || piece.description,
    source: firstReason?.source || piece.source,
    confidence: firstReason?.confidence,
    required: piece.status === "mandatory",
    official: piece.official,
    blockingIfMissing: piece.blockingIfMissing,
    trigger: firstReason?.trigger || piece.triggers[0],
    additionalReasons: piece.additionalReasons,
  };
}

export function normalizeProcedureType(value: string | null | undefined) {
  return normalizeDossierPieceType(value);
}

export function getRequiredPieces(args: {
  procedureType: string;
  parcelAnalysis?: ParcelAnalysisLike | null;
  selectedAddress?: any | null;
  addressLabel?: string | null;
  zone?: { zoneCode?: string | null; zoneType?: string | null; constraints?: unknown[] } | null;
  constraints?: unknown[];
  projectType?: string;
  projectDetails?: Record<string, unknown>;
}) {
  const procedureType = normalizeProcedureType(args.procedureType);
  const locationContext = analyzeLocationContext({
    selectedAddress: args.selectedAddress,
    addressLabel: args.addressLabel,
    parcelAnalysis: {
      ...(args.parcelAnalysis || {}),
      constraints: args.constraints || args.parcelAnalysis?.constraints,
      zoneCode: args.parcelAnalysis?.zoneCode || args.zone?.zoneCode,
    },
  });
  const resolved = resolveExpectedPieces({
    dossierType: procedureType,
    projectType: args.projectType,
    projectDetails: args.projectDetails,
    locationContext,
  });

  const requiredPieces = resolved.mainPieces.map((piece) => toRequirement(piece, "main"));
  const projectConditionalPieces = resolved.projectConditionalPieces.map((piece) => toRequirement(piece, "project"));
  const locationAdditionalPieces = resolved.locationConditionalPieces.map((piece) => toRequirement(piece, "location"));
  const recommendations = resolved.recommendations.map((piece) => toRequirement(piece, "location"));
  const warnings = resolved.instructorAlerts.map((alert) => alert.message);

  if (!locationContext.pluZone.code) {
    warnings.push("Les pièces liées à l'adresse seront recalculées automatiquement après identification du zonage, des servitudes et des périmètres réglementaires.");
  }

  return {
    requiredPieces,
    projectConditionalPieces,
    allOfficialPieces: [...requiredPieces, ...projectConditionalPieces, ...locationAdditionalPieces],
    conditionalPieces: [...projectConditionalPieces, ...locationAdditionalPieces, ...recommendations],
    locationAdditionalPieces,
    recommendations,
    instructorAlerts: resolved.instructorAlerts,
    vigilancePoints: warnings,
    locationContext,
    missingContext: resolved.debug.unresolvedChecks,
    warnings,
    debug: resolved.debug,
  };
}

export type RequiredPiecesResult = ReturnType<typeof getRequiredPieces>;
export type { LocationConstraintContext, InstructorAlert };
