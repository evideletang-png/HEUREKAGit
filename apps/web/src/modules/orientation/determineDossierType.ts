import type { ProjectContext } from "@/lib/urbanisme/cerfa/officialPieces.types";
import type { OrientationAnswers, OrientationResultPayload, ProjectAction } from "./orientation.types";
import { getProjectActionLabel } from "./projectActions";
import { analyzeLocationConstraints, buildOrientationLocationContext } from "./locationConstraintsAnalyzer";
import { estimateOrientationTimeline, resolveOrientationConsultations } from "./consultationDelayResolver";

function includes(actions: ProjectAction[], ...targets: ProjectAction[]) {
  return targets.some((target) => actions.includes(target));
}

function numeric(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function buildProjectFlags(actions: ProjectAction[], answers: OrientationAnswers): ProjectContext["projectFlags"] {
  return {
    createsConstruction: includes(actions, "new_house", "extension", "elevation", "pool", "garden_shed"),
    modifiesConstructionVolume: includes(actions, "extension", "elevation", "garage_to_habitation"),
    modifiesTerrainProfile: includes(actions, "earthworks", "pool"),
    modifiesFacadesOrRoof: includes(actions, "facade_modification", "roof_modification", "joinery_modification", "garage_to_habitation", "solar_panels") || answers.garageFacadeModified === true || answers.facadeOrStructureChanged === true,
    visibleFromPublicSpace: answers.visibleFromPublicSpace === true || includes(actions, "facade_modification", "roof_modification", "solar_panels", "fence"),
    demolitionRequired: includes(actions, "demolition") && answers.demolitionIntegrated !== true,
    pcIncludesDemolition: includes(actions, "demolition") && answers.demolitionIntegrated === true,
    deforestationRequired: includes(actions, "tree_cutting"),
    lotissement: includes(actions, "lotissement"),
    lotSubdivision: includes(actions, "land_division"),
    terrainDivisionBeforeCompletion: includes(actions, "land_division"),
    roadOrPublicSpaceModification: includes(actions, "public_space_modification") || answers.publicSpaceTouched === true,
    metropoleCompetence: includes(actions, "public_space_modification") || answers.publicSpaceTouched === true,
    erp: answers.erp === true || /erp|commerce|public|restaurant|boutique|école|ecole/i.test(answers.projectDescription || ""),
    riskPreventionPlanRequiresStudy: answers.pprRequiresStudy === true,
    requiresNatura2000Assessment: answers.natura2000 === true,
    soilInformationSector: answers.soilInformationSector === true,
    formerIcpeSiteDifferentUse: answers.formerIcpe === true,
  };
}

function completeResult(base: Omit<OrientationResultPayload, "locationConstraints" | "expectedConsultations" | "estimatedInstructionTimeline">, answers: OrientationAnswers): OrientationResultPayload {
  const locationConstraints = analyzeLocationConstraints({ answers, selectedActions: base.selectedActions });
  const locationFlags = buildOrientationLocationContext(answers);
  const expectedConsultations = resolveOrientationConsultations({
    dossierType: base.recommendedDossierType,
    projectFlags: base.projectFlags,
    locationContext: locationFlags,
    locationConstraints,
  });
  const estimatedInstructionTimeline = estimateOrientationTimeline({
    dossierType: base.recommendedDossierType,
    projectFlags: base.projectFlags,
    locationContext: locationFlags,
    expectedConsultations,
  });

  return {
    ...base,
    locationFlags,
    locationConstraints,
    expectedConsultations,
    estimatedInstructionTimeline,
  };
}

export function determineDossierType(actions: ProjectAction[], answers: OrientationAnswers = {}): OrientationResultPayload {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const alternatives = new Set<string>();
  let recommended: OrientationResultPayload["recommendedDossierType"] = "UNKNOWN";
  let confidence: OrientationResultPayload["confidence"] = "medium";

  if (actions.length === 0) {
    return completeResult({
      recommendedDossierType: "UNKNOWN",
      confidence: "low",
      selectedActions: [],
      reasons: ["Aucune nature de travaux n'a encore été sélectionnée."],
      warnings: ["Vous pouvez passer directement au dépôt si vous connaissez déjà le CERFA à remplir."],
      alternativeDossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
      projectFlags: {},
      locationFlags: {},
    }, answers);
  }

  if (actions.length > 1) {
    reasons.push(`Projet composite : ${actions.map(getProjectActionLabel).join(", ")}.`);
  }

  if (includes(actions, "new_house")) {
    recommended = "PCMI";
    confidence = "high";
    reasons.push("La construction d'une maison individuelle relève généralement d'un PCMI.");
  } else if (includes(actions, "lotissement")) {
    recommended = "PA";
    confidence = "high";
    reasons.push("La création d'un lotissement avec organisation foncière relève généralement du permis d'aménager.");
  } else if (includes(actions, "land_division") && answers.commonRoadOrEquipment === true) {
    recommended = "PA";
    confidence = "high";
    reasons.push("Une division avec voie, espace ou équipement commun oriente vers un permis d'aménager.");
  } else if (includes(actions, "demolition") && actions.length === 1) {
    recommended = "PD";
    confidence = "high";
    reasons.push("Une démolition isolée relève généralement du permis de démolir lorsque la commune ou le secteur l'exige.");
  } else if (includes(actions, "extension", "elevation", "garage_to_habitation")) {
    const createdSurface = numeric(answers.extensionSurfaceM2) || numeric(answers.garageSurfaceM2);
    if (createdSurface > 40 || includes(actions, "elevation")) {
      recommended = "PCMI";
      reasons.push("La surface ou le volume créé peut dépasser le seuil usuel de déclaration préalable.");
      alternatives.add("DPC");
    } else {
      recommended = "DPC";
      reasons.push("L'extension ou transformation semble relever d'une déclaration préalable si les seuils restent limités.");
      alternatives.add("PCMI");
    }
  } else if (includes(actions, "pool", "garden_shed", "facade_modification", "roof_modification", "joinery_modification", "fence", "solar_panels", "earthworks")) {
    const poolSurface = numeric(answers.poolSurfaceM2);
    const shedSurface = numeric(answers.shedSurfaceM2);
    if ((includes(actions, "pool") && poolSurface > 100) || (includes(actions, "garden_shed") && shedSurface > 20)) {
      recommended = "PC";
      reasons.push("La surface déclarée peut dépasser les seuils de déclaration préalable.");
      alternatives.add("DPC");
    } else {
      recommended = "DPC";
      reasons.push("Les travaux d'aspect extérieur ou annexes relèvent le plus souvent d'une déclaration préalable travaux.");
    }
  } else if (includes(actions, "destination_change")) {
    recommended = answers.facadeOrStructureChanged ? "PC" : "DPC";
    reasons.push(answers.facadeOrStructureChanged
      ? "Un changement de destination avec modification de façade ou structure peut relever d'un permis de construire."
      : "Un changement de destination sans modification lourde relève généralement d'une déclaration préalable.");
    alternatives.add("PC");
    alternatives.add("DPC");
  } else if (includes(actions, "tree_cutting")) {
    recommended = "DPC";
    confidence = "low";
    reasons.push("L'abattage d'un élément protégé peut nécessiter une déclaration préalable selon le PLU ou la protection locale.");
    warnings.push("La nécessité d'une formalité dépend fortement du zonage et des protections locales.");
  } else if (includes(actions, "other")) {
    recommended = "UNKNOWN";
    confidence = "low";
    reasons.push("Le projet doit être précisé pour recommander une démarche fiable.");
  }

  if (includes(actions, "public_space_modification")) {
    warnings.push("Une autorisation ou consultation liée au domaine public peut être nécessaire en plus du dossier d'urbanisme.");
  }
  if (includes(actions, "tree_cutting")) {
    warnings.push("Vérifier les protections paysagères, EBC, arbres remarquables ou prescriptions du PLU.");
  }
  if (answers.visibleFromPublicSpace === true) {
    warnings.push("La visibilité depuis l'espace public peut renforcer les exigences de pièces graphiques et photographiques.");
  }

  return completeResult({
    recommendedDossierType: recommended,
    confidence,
    selectedActions: actions,
    reasons: reasons.length ? reasons : ["Orientation générée à partir des réponses renseignées."],
    warnings,
    alternativeDossierTypes: Array.from(alternatives).filter((type) => type !== recommended),
    projectFlags: buildProjectFlags(actions, answers),
    locationFlags: {},
  }, answers);
}
