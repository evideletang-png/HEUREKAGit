export type DossierType = "PCMI" | "PC" | "DPC" | "DPA" | "PA" | "PD";

export type PieceStatus = "mandatory" | "conditional";

export type PieceRequirementState = "required" | "potentially_required" | "not_applicable";

export type TriggerSource =
  | "always"
  | "project"
  | "location"
  | "risk"
  | "environment"
  | "heritage"
  | "servitude"
  | "user_answer";

export interface OfficialPiece {
  code: string;
  label: string;
  legalReference?: string;
  dossierTypes: DossierType[];
  status: PieceStatus;
  conditionLabel?: string;
  triggers: string[];
  source: TriggerSource[];
  paperCopies?: string;
  notes?: string;
}

export interface ProjectContext {
  dossierType: DossierType;
  projectFlags: {
    createsConstruction?: boolean;
    modifiesConstructionVolume?: boolean;
    modifiesTerrainProfile?: boolean;
    modifiesFacadesOrRoof?: boolean;
    exteriorAspectInsufficientWithPlans?: boolean;
    visibleFromPublicSpace?: boolean;
    demolitionRequired?: boolean;
    pcIncludesDemolition?: boolean;
    deforestationRequired?: boolean;
    requiresImpactStudy?: boolean;
    requiresUpdatedImpactStudy?: boolean;
    requiresNatura2000Assessment?: boolean;
    hasNonCollectiveSanitation?: boolean;
    requiresSeismicCompliance?: boolean;
    riskPreventionPlanRequiresStudy?: boolean;
    requiresThermalOrEnvironmentalRegulation?: boolean;
    lotissement?: boolean;
    lotSubdivision?: boolean;
    zac?: boolean;
    pup?: boolean;
    oin?: boolean;
    terrainDivisionBeforeCompletion?: boolean;
    constructionOnPublicDomain?: boolean;
    overPublicDomain?: boolean;
    icpeDeclaration?: boolean;
    icpeRegistration?: boolean;
    iotaDeclaration?: boolean;
    environmentalAuthorization?: boolean;
    protectedSpeciesDerogation?: boolean;
    erp?: boolean;
    accessibilityDerogation?: boolean;
    energyExemplarityDerogation?: boolean;
    gabaritDerogation?: boolean;
    publicSafetyStudyRequired?: boolean;
    transportFundsSecureArea?: boolean;
    concertationRequired?: boolean;
    formerIcpeSiteDifferentUse?: boolean;
    soilInformationSector?: boolean;
    agrivoltaicOrGroundSolar?: boolean;
    coastalSetbackConsignation?: boolean;
    socialHousingReservedSector?: boolean;
    officeFeeConcerned?: boolean;
    campingOrTourismFacility?: boolean;
    permanentRemovableResidences?: boolean;
    roadOrPublicSpaceModification?: boolean;
    metropoleCompetence?: boolean;
    treeCuttingOrProtectedElement?: boolean;
  };
  locationContext: {
    commune?: string;
    parcel?: string;
    pluZone?: string | null;
    abf?: boolean;
    spr?: boolean;
    monumentHistoriqueAbords?: boolean;
    immeubleInscritMH?: boolean;
    siteClasse?: boolean;
    siteInscrit?: boolean;
    reserveNaturelle?: boolean;
    parcNationalCore?: boolean;
    natura2000?: boolean;
    pprRequiresStudy?: boolean;
    seismicZoneRequiresAttestation?: boolean;
    sis?: boolean;
    formerIcpe?: boolean;
    lotissement?: boolean;
    zac?: boolean;
    pup?: boolean;
    oin?: boolean;
    confidence?: number;
    unresolvedChecks?: string[];
  };
}

export interface ResolvedPiece extends OfficialPiece {
  requirementState: PieceRequirementState;
  matchedTriggers: string[];
  explanation: string;
  confidence?: number;
}

export type RuleQuestion = {
  trigger: keyof ProjectContext["projectFlags"];
  label: string;
  dossierTypes: DossierType[];
};
