import type { ProjectContext, RuleQuestion } from "./officialPieces.types";

export function isTriggerMatched(trigger: string, context: ProjectContext): boolean | "unknown" {
  const flags = context.projectFlags;
  const location = context.locationContext;
  const unresolved = location.unresolvedChecks || [];
  const locationUnknown = unresolved.length > 0;

  if (trigger === "always") return true;
  if (trigger in flags) return flags[trigger as keyof typeof flags] === true;

  const map: Record<string, boolean | "unknown"> = {
    deforestationRequired: flags.deforestationRequired === true,
    demolitionRequired: flags.demolitionRequired === true && !flags.pcIncludesDemolition,
    pcIncludesDemolition: flags.pcIncludesDemolition === true,
    createsConstruction: flags.createsConstruction === true,
    modifiesConstructionVolume: flags.modifiesConstructionVolume === true,
    modifiesTerrainProfile: flags.modifiesTerrainProfile === true,
    modifiesFacadesOrRoof: flags.modifiesFacadesOrRoof === true,
    exteriorAspectInsufficientWithPlans: flags.exteriorAspectInsufficientWithPlans === true,
    visibleFromPublicSpace: flags.visibleFromPublicSpace === true,
    lotissement: flags.lotissement === true || location.lotissement === true ? true : locationUnknown ? "unknown" : false,
    lotSubdivision: flags.lotSubdivision === true,
    zac: flags.zac === true || location.zac === true ? true : locationUnknown ? "unknown" : false,
    pup: flags.pup === true || location.pup === true ? true : locationUnknown ? "unknown" : false,
    oin: flags.oin === true || location.oin === true ? true : locationUnknown ? "unknown" : false,
    terrainDivisionBeforeCompletion: flags.terrainDivisionBeforeCompletion === true,
    spr: location.spr === true ? true : location.abf === true ? "unknown" : locationUnknown ? "unknown" : false,
    monumentHistoriqueAbords: location.monumentHistoriqueAbords === true || location.abf === true ? true : locationUnknown ? "unknown" : false,
    immeubleInscritMH: location.immeubleInscritMH === true ? true : false,
    parcNationalCore: location.parcNationalCore === true ? true : locationUnknown ? "unknown" : false,
    siteClasse: location.siteClasse === true ? true : locationUnknown ? "unknown" : false,
    siteInscrit: location.siteInscrit === true ? true : locationUnknown ? "unknown" : false,
    reserveNaturelle: location.reserveNaturelle === true ? true : locationUnknown ? "unknown" : false,
    natura2000: location.natura2000 === true || flags.requiresNatura2000Assessment === true ? true : locationUnknown ? "unknown" : false,
    requiresImpactStudy: flags.requiresImpactStudy === true,
    requiresUpdatedImpactStudy: flags.requiresUpdatedImpactStudy === true,
    riskPreventionPlanRequiresStudy: flags.riskPreventionPlanRequiresStudy === true || location.pprRequiresStudy === true ? true : locationUnknown ? "unknown" : false,
    seismicZoneRequiresAttestation: flags.requiresSeismicCompliance === true || location.seismicZoneRequiresAttestation === true ? true : locationUnknown ? "unknown" : false,
    soilInformationSector: flags.soilInformationSector === true || location.sis === true ? true : locationUnknown ? "unknown" : false,
    formerIcpeSiteDifferentUse: flags.formerIcpeSiteDifferentUse === true || location.formerIcpe === true ? true : locationUnknown ? "unknown" : false,
    hasNonCollectiveSanitation: flags.hasNonCollectiveSanitation === true,
    icpeDeclaration: flags.icpeDeclaration === true,
    icpeRegistration: flags.icpeRegistration === true,
    campingOrTourismFacility: flags.campingOrTourismFacility === true,
    permanentRemovableResidences: flags.permanentRemovableResidences === true,
    constructionOnPublicDomain: flags.constructionOnPublicDomain === true || flags.overPublicDomain === true,
    protectedSpeciesDerogation: flags.protectedSpeciesDerogation === true,
    environmentalAuthorization: flags.environmentalAuthorization === true || flags.iotaDeclaration === true,
  };

  return map[trigger] ?? "unknown";
}

export function triggerSourceLabel(trigger: string) {
  const labels: Record<string, string> = {
    always: "CERFA",
    deforestationRequired: "Projet > Défrichement",
    demolitionRequired: "Projet > Démolition séparée",
    pcIncludesDemolition: "Projet > PC valant démolition",
    createsConstruction: "Projet > Construction créée",
    modifiesConstructionVolume: "Projet > Volume modifié",
    modifiesTerrainProfile: "Projet > Profil du terrain",
    modifiesFacadesOrRoof: "Projet > Façades ou toiture",
    exteriorAspectInsufficientWithPlans: "Projet > Aspect extérieur",
    visibleFromPublicSpace: "Projet > Visibilité espace public",
    lotissement: "Localisation > Lotissement",
    lotSubdivision: "Projet > Subdivision de lot",
    zac: "Localisation > ZAC",
    pup: "Localisation > PUP",
    oin: "Localisation > OIN",
    spr: "Patrimoine > SPR",
    monumentHistoriqueAbords: "Patrimoine > Abords MH",
    immeubleInscritMH: "Patrimoine > Immeuble inscrit",
    parcNationalCore: "Environnement > Coeur de parc national",
    natura2000: "Environnement > Natura 2000",
    requiresImpactStudy: "Environnement > Étude d'impact",
    requiresUpdatedImpactStudy: "Environnement > Étude d'impact actualisée",
    riskPreventionPlanRequiresStudy: "Risque > PPR",
    seismicZoneRequiresAttestation: "Risque > Sismique",
    soilInformationSector: "Risque > SIS",
    formerIcpeSiteDifferentUse: "Risque > Ancien site ICPE",
    hasNonCollectiveSanitation: "Projet > Assainissement non collectif",
    icpeDeclaration: "Projet > ICPE déclaration",
    icpeRegistration: "Projet > ICPE enregistrement",
    campingOrTourismFacility: "Projet > Camping / tourisme",
    permanentRemovableResidences: "Projet > Résidences démontables",
    constructionOnPublicDomain: "Projet > Domaine public",
  };
  return labels[trigger] || trigger;
}

export const CERFA_DYNAMIC_QUESTIONS: RuleQuestion[] = [
  { trigger: "deforestationRequired", label: "Votre projet nécessite-t-il un défrichement ?", dossierTypes: ["PCMI", "PC", "PA"] },
  { trigger: "demolitionRequired", label: "Votre projet comprend-il une démolition avec permis de démolir séparé ?", dossierTypes: ["PCMI", "PC", "PA"] },
  { trigger: "pcIncludesDemolition", label: "Souhaitez-vous que la demande vaille également demande de permis de démolir ?", dossierTypes: ["PCMI", "PC"] },
  { trigger: "modifiesFacadesOrRoof", label: "Le projet modifie-t-il les façades ou les toitures ?", dossierTypes: ["DPC"] },
  { trigger: "modifiesTerrainProfile", label: "Le projet modifie-t-il le profil du terrain ?", dossierTypes: ["DPC"] },
  { trigger: "createsConstruction", label: "Le projet crée-t-il une construction ou une emprise au sol ?", dossierTypes: ["DPC"] },
  { trigger: "visibleFromPublicSpace", label: "Le projet est-il visible depuis l'espace public ?", dossierTypes: ["DPC"] },
  { trigger: "icpeDeclaration", label: "Votre projet porte-t-il sur une installation classée ICPE soumise à déclaration ?", dossierTypes: ["PC"] },
  { trigger: "icpeRegistration", label: "Votre projet porte-t-il sur une installation classée ICPE soumise à enregistrement ?", dossierTypes: ["PC"] },
  { trigger: "requiresImpactStudy", label: "Votre projet nécessite-t-il une étude d'impact ?", dossierTypes: ["DPC", "DPA", "PA", "PD"] },
  { trigger: "requiresUpdatedImpactStudy", label: "Votre projet nécessite-t-il une étude d'impact actualisée ?", dossierTypes: ["DPC", "DPA", "PA", "PD"] },
  { trigger: "requiresNatura2000Assessment", label: "Votre projet nécessite-t-il une évaluation Natura 2000 ?", dossierTypes: ["DPC", "DPA", "PA", "PD"] },
  { trigger: "hasNonCollectiveSanitation", label: "Le projet prévoit-il un assainissement non collectif ?", dossierTypes: ["PA"] },
  { trigger: "lotissement", label: "Le terrain est-il situé dans un lotissement ou le projet crée-t-il un lotissement ?", dossierTypes: ["PC", "DPA", "PA"] },
  { trigger: "lotSubdivision", label: "Le projet subdivise-t-il un lot provenant d'un lotissement soumis à permis d'aménager ?", dossierTypes: ["DPA", "PA"] },
  { trigger: "zac", label: "Le terrain est-il situé dans une ZAC ?", dossierTypes: ["PC"] },
  { trigger: "pup", label: "Le terrain est-il concerné par un PUP ?", dossierTypes: ["PC", "PA"] },
  { trigger: "oin", label: "Le terrain est-il situé dans une opération d'intérêt national ?", dossierTypes: ["PC"] },
  { trigger: "terrainDivisionBeforeCompletion", label: "Le terrain fait-il l'objet d'une division avant achèvement ?", dossierTypes: ["PC"] },
  { trigger: "campingOrTourismFacility", label: "Le projet concerne-t-il un camping ou un terrain aménagé pour hébergement touristique ?", dossierTypes: ["PA"] },
  { trigger: "permanentRemovableResidences", label: "Le projet prévoit-il des résidences démontables constituant l'habitat permanent ?", dossierTypes: ["PA"] },
];
