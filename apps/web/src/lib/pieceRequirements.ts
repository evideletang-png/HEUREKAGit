import { analyzeLocationContext, type LocationConstraintContext } from "./locationContextAnalyzer";
import { normalizeOfficialDossierType, resolveOfficialPieces } from "./urbanisme/cerfa/resolveOfficialPieces";
import type { PieceStatus, ProjectContext, ResolvedPiece } from "./urbanisme/cerfa/officialPieces.types";

export type InstructorAlert = {
  type: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
  source: string;
  confidence?: number;
};

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

function toProjectContext(args: {
  procedureType: string;
  locationContext: LocationConstraintContext;
  projectDetails?: Record<string, unknown>;
}): ProjectContext {
  const flags = (args.projectDetails || {}) as ProjectContext["projectFlags"];
  const context = args.locationContext;
  return {
    dossierType: normalizeOfficialDossierType(args.procedureType),
    projectFlags: flags,
    locationContext: {
      commune: context.commune,
      parcel: context.parcel?.fullReference,
      pluZone: context.pluZone.code,
      abf: context.constraints.abf.isConcerned,
      spr: context.constraints.abf.perimeterType === "site_patrimonial_remarquable",
      monumentHistoriqueAbords: context.constraints.abf.perimeterType === "abords" || context.constraints.abf.isConcerned,
      immeubleInscritMH: context.constraints.abf.perimeterType === "monument_historique",
      natura2000: context.constraints.protectedArea.types.some((type) => /natura/i.test(type)),
      parcNationalCore: context.constraints.protectedArea.types.some((type) => /parc national|coeur|cœur/i.test(type)),
      pprRequiresStudy: context.constraints.floodRisk.isConcerned,
      seismicZoneRequiresAttestation: context.constraints.seismicRisk.isConcerned,
      sis: context.constraints.servitudes.items.some((item) => /sis|secteur d'information/i.test(item)),
      formerIcpe: context.constraints.servitudes.items.some((item) => /icpe/i.test(item)),
      lotissement: context.constraints.lotissement.isConcerned,
      confidence: context.confidenceScore,
      unresolvedChecks: context.missingData,
    },
  };
}

function toRequirement(piece: ResolvedPiece, category: PieceRequirementCategory): PieceRequirement {
  return {
    code: piece.code,
    label: piece.label,
    level: piece.status === "mandatory" ? "obligatoire" : "conditionnelle",
    status: piece.status,
    category,
    reason: piece.explanation,
    source: piece.source.join(", "),
    confidence: piece.confidence,
    required: piece.requirementState === "required",
    official: true,
    blockingIfMissing: piece.requirementState === "required",
    trigger: piece.matchedTriggers[0],
    additionalReasons: piece.matchedTriggers.map((trigger) => ({
      reason: piece.explanation,
      source: piece.source.join(", "),
      confidence: piece.confidence,
      trigger,
    })),
  };
}

export function normalizeProcedureType(value: string | null | undefined) {
  return normalizeOfficialDossierType(value);
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
  const locationContext = analyzeLocationContext({
    selectedAddress: args.selectedAddress,
    addressLabel: args.addressLabel,
    parcelAnalysis: {
      ...(args.parcelAnalysis || {}),
      constraints: args.constraints || args.parcelAnalysis?.constraints,
      zoneCode: args.parcelAnalysis?.zoneCode || args.zone?.zoneCode,
    },
  });
  const projectContext = toProjectContext({ procedureType: args.procedureType, locationContext, projectDetails: args.projectDetails });
  const pieces = resolveOfficialPieces(projectContext);
  const requiredPieces = pieces.filter((piece) => piece.status === "mandatory").map((piece) => toRequirement(piece, "main"));
  const projectConditionalPieces = pieces
    .filter((piece) => piece.status === "conditional" && piece.requirementState === "required")
    .map((piece) => toRequirement(piece, "project"));
  const locationAdditionalPieces = pieces
    .filter((piece) => piece.status === "conditional" && piece.requirementState === "potentially_required")
    .map((piece) => toRequirement(piece, "location"));

  const warnings = locationContext.pluZone.code
    ? []
    : ["Les pièces liées à l'adresse seront recalculées automatiquement après identification du zonage, des servitudes et des périmètres réglementaires."];

  return {
    requiredPieces,
    projectConditionalPieces,
    allOfficialPieces: [...requiredPieces, ...projectConditionalPieces, ...locationAdditionalPieces],
    conditionalPieces: [...projectConditionalPieces, ...locationAdditionalPieces],
    locationAdditionalPieces,
    recommendations: [],
    instructorAlerts: [] as InstructorAlert[],
    vigilancePoints: warnings,
    locationContext,
    missingContext: projectContext.locationContext.unresolvedChecks || [],
    warnings,
    debug: {
      dossierType: projectContext.dossierType,
      triggeredRules: pieces.flatMap((piece) => piece.matchedTriggers.map((trigger) => ({ rule: trigger, targetCodes: [piece.code], source: piece.source.join(", "), confidence: piece.confidence, reason: piece.explanation }))),
      unresolvedChecks: projectContext.locationContext.unresolvedChecks || [],
    },
  };
}

export type RequiredPiecesResult = ReturnType<typeof getRequiredPieces>;
export type { LocationConstraintContext };
