import type { DossierType, ProjectContext } from "@/lib/urbanisme/cerfa/officialPieces.types";

export type ProjectAction =
  | "new_house"
  | "extension"
  | "elevation"
  | "facade_modification"
  | "roof_modification"
  | "joinery_modification"
  | "garage_to_habitation"
  | "destination_change"
  | "pool"
  | "garden_shed"
  | "fence"
  | "demolition"
  | "land_division"
  | "lotissement"
  | "tree_cutting"
  | "solar_panels"
  | "earthworks"
  | "public_space_modification"
  | "other";

export type OrientationDossierType = DossierType | "NO_FORMALITY" | "UNKNOWN";

export type OrientationConfidence = "low" | "medium" | "high";

export type OrientationAnswers = {
  projectDescription?: string;
  address?: string;
  commune?: string;
  parcel?: string;
  pluZone?: string;
  abf?: boolean;
  spr?: boolean;
  monumentHistoriqueAbords?: boolean;
  siteClasse?: boolean;
  siteInscrit?: boolean;
  parcNationalCore?: boolean;
  natura2000?: boolean;
  pprRequiresStudy?: boolean;
  floodRisk?: boolean;
  naturalRisk?: boolean;
  soilInformationSector?: boolean;
  formerIcpe?: boolean;
  servitude?: boolean;
  oap?: boolean;
  lotissement?: boolean;
  coastalArea?: boolean;
  agriculturalOrNaturalZone?: boolean;
  woodedArea?: boolean;
  protectedTrees?: boolean;
  metropoleCompetence?: boolean;
  erp?: boolean;
  extensionSurfaceM2?: number;
  extensionFootprintM2?: number;
  extensionHeightM?: number;
  poolSurfaceM2?: number;
  shedSurfaceM2?: number;
  facadeOrStructureChanged?: boolean;
  visibleFromPublicSpace?: boolean;
  joineryChangesAspect?: boolean;
  garageSurfaceM2?: number;
  garageFacadeModified?: boolean;
  garageParkingRemoved?: boolean;
  demolitionIntegrated?: boolean;
  demolitionTotal?: boolean;
  createsLots?: boolean;
  commonRoadOrEquipment?: boolean;
  destinationCurrent?: string;
  destinationFuture?: string;
  publicSpaceTouched?: boolean;
};

export type LocationConstraintType =
  | "ABF"
  | "SPR"
  | "SITE_CLASSE"
  | "NATURA_2000"
  | "PPRI"
  | "SIS"
  | "OAP"
  | "SUP"
  | "ERP"
  | "METROPOLE"
  | "SDIS"
  | "DDT"
  | "OTHER";

export type OrientationExpectedConsultation = {
  service: "ABF" | "SDIS" | "DDT" | "Métropole" | "ARS" | "Préfecture" | "Gestionnaire voirie" | "Parc national" | "Autre";
  required: boolean;
  probable: boolean;
  reason: string;
  legalOrOperationalBasis?: string;
  expectedDelayImpact?: {
    type: "none" | "possible_majoration" | "mandatory_majoration";
    durationDays?: number;
    durationMonths?: number;
    explanation: string;
  };
};

export type OrientationLocationConstraint = {
  type: LocationConstraintType;
  label: string;
  detected: boolean;
  confidence: OrientationConfidence;
  source: string;
  impact: {
    additionalPieces?: string[];
    consultations?: string[];
    delayImpact?: string;
    decisionImpact?: string;
  };
};

export type OrientationEstimatedTimeline = {
  baseDelay: {
    durationMonths: number;
    reason: string;
  };
  possibleMajorations: {
    service: string;
    durationMonths?: number;
    reason: string;
    confidence: OrientationConfidence;
  }[];
  estimatedTotalDelayMonths: number | null;
  warning: string;
};

export type OrientationResultPayload = {
  recommendedDossierType: OrientationDossierType;
  confidence: OrientationConfidence;
  selectedActions: ProjectAction[];
  reasons: string[];
  warnings: string[];
  alternativeDossierTypes: string[];
  projectFlags: ProjectContext["projectFlags"];
  locationFlags: ProjectContext["locationContext"];
  locationConstraints: OrientationLocationConstraint[];
  expectedConsultations: OrientationExpectedConsultation[];
  estimatedInstructionTimeline: OrientationEstimatedTimeline;
};

export const ORIENTATION_STORAGE_KEY = "heureka.orientation.result";
