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

export type OrientationResultPayload = {
  recommendedDossierType: OrientationDossierType;
  confidence: OrientationConfidence;
  selectedActions: ProjectAction[];
  reasons: string[];
  warnings: string[];
  alternativeDossierTypes: string[];
  projectFlags: ProjectContext["projectFlags"];
  locationFlags: ProjectContext["locationContext"];
};

export const ORIENTATION_STORAGE_KEY = "heureka.orientation.result";
