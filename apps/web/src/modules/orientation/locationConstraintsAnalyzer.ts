import type {
  OrientationAnswers,
  OrientationLocationConstraint,
  ProjectAction,
} from "./orientation.types";

function constraint(args: OrientationLocationConstraint): OrientationLocationConstraint {
  return args;
}

export function buildOrientationLocationContext(answers: OrientationAnswers) {
  return {
    commune: answers.commune || undefined,
    parcel: answers.parcel || undefined,
    pluZone: answers.pluZone || null,
    abf: answers.abf || answers.monumentHistoriqueAbords || answers.spr,
    spr: answers.spr,
    monumentHistoriqueAbords: answers.monumentHistoriqueAbords || answers.abf,
    siteClasse: answers.siteClasse,
    siteInscrit: answers.siteInscrit,
    parcNationalCore: answers.parcNationalCore,
    natura2000: answers.natura2000,
    pprRequiresStudy: answers.pprRequiresStudy || answers.floodRisk || answers.naturalRisk,
    sis: answers.soilInformationSector,
    formerIcpe: answers.formerIcpe,
    lotissement: answers.lotissement,
    zac: false,
    pup: false,
    oin: false,
    confidence: answers.commune || answers.parcel || answers.pluZone ? 0.72 : 0.45,
    unresolvedChecks: answers.address || answers.parcel || answers.pluZone ? [] : ["address", "parcel", "pluZone"],
  };
}

export function analyzeLocationConstraints(args: {
  answers: OrientationAnswers;
  selectedActions: ProjectAction[];
}): OrientationLocationConstraint[] {
  const answers = args.answers;
  const actions = args.selectedActions;
  const projectMentionsErp = answers.erp === true || /erp|commerce|public|restaurant|boutique|école|ecole/i.test(answers.projectDescription || "");
  const touchesPublicSpace = answers.publicSpaceTouched === true || actions.includes("public_space_modification");
  const constraints: OrientationLocationConstraint[] = [];

  constraints.push(constraint({
    type: "ABF",
    label: "Abords monument historique / périmètre ABF",
    detected: answers.abf === true || answers.monumentHistoriqueAbords === true,
    confidence: answers.abf || answers.monumentHistoriqueAbords ? "high" : "low",
    source: "Contexte parcellaire / saisie orientation",
    impact: {
      additionalPieces: ["Pièces graphiques, photographies et notice à soigner dans les pièces CERFA officielles"],
      consultations: ["ABF"],
      delayImpact: "Majoration possible du délai en cas de consultation ABF.",
      decisionImpact: "Avis patrimonial à intégrer selon le périmètre et la nature des travaux.",
    },
  }));

  constraints.push(constraint({
    type: "SPR",
    label: "Site patrimonial remarquable",
    detected: answers.spr === true,
    confidence: answers.spr ? "high" : "low",
    source: "Contexte parcellaire / saisie orientation",
    impact: {
      consultations: ["ABF"],
      delayImpact: "Majoration possible du délai.",
      decisionImpact: "Insertion architecturale et matériaux à apprécier avec attention.",
    },
  }));

  constraints.push(constraint({
    type: "SITE_CLASSE",
    label: "Site classé ou inscrit / réserve naturelle",
    detected: answers.siteClasse === true || answers.siteInscrit === true,
    confidence: answers.siteClasse || answers.siteInscrit ? "medium" : "low",
    source: "Contexte environnemental",
    impact: {
      consultations: ["DDT", "Préfecture"],
      delayImpact: "Délai potentiellement modifié selon la protection exacte.",
      decisionImpact: "Décision tacite parfois exclue selon le régime applicable.",
    },
  }));

  constraints.push(constraint({
    type: "NATURA_2000",
    label: "Natura 2000",
    detected: answers.natura2000 === true,
    confidence: answers.natura2000 ? "medium" : "low",
    source: "Contexte environnemental",
    impact: {
      additionalPieces: ["Évaluation des incidences si le projet est susceptible d'affecter le site"],
      consultations: ["DDT"],
      delayImpact: "Analyse environnementale possible.",
    },
  }));

  constraints.push(constraint({
    type: "PPRI",
    label: "Plan de prévention des risques / risque identifié",
    detected: answers.pprRequiresStudy === true || answers.floodRisk === true || answers.naturalRisk === true,
    confidence: answers.pprRequiresStudy ? "high" : answers.floodRisk || answers.naturalRisk ? "medium" : "low",
    source: "Données risques / saisie orientation",
    impact: {
      additionalPieces: ["Étude ou attestation si le règlement du PPR l'impose"],
      consultations: ["DDT"],
      delayImpact: "Vérification du règlement de risque par le service instructeur.",
    },
  }));

  constraints.push(constraint({
    type: "SIS",
    label: "Secteur d'information sur les sols / ancien site ICPE",
    detected: answers.soilInformationSector === true || answers.formerIcpe === true,
    confidence: answers.soilInformationSector || answers.formerIcpe ? "medium" : "low",
    source: "Données sols / historique ICPE",
    impact: {
      additionalPieces: ["Attestation bureau d'études potentiellement requise selon le projet"],
      consultations: ["DDT"],
      decisionImpact: "Point d'attention sur la compatibilité du projet avec l'état des sols.",
    },
  }));

  constraints.push(constraint({
    type: "OAP",
    label: "Orientation d'aménagement et de programmation",
    detected: answers.oap === true,
    confidence: answers.oap ? "medium" : "low",
    source: "PLU / documents graphiques",
    impact: {
      additionalPieces: ["Justifications à intégrer dans les pièces CERFA existantes"],
      decisionImpact: "Compatibilité du projet avec les orientations à vérifier.",
    },
  }));

  constraints.push(constraint({
    type: "SUP",
    label: "Servitude d'utilité publique",
    detected: answers.servitude === true,
    confidence: answers.servitude ? "medium" : "low",
    source: "SUP / annexes PLU",
    impact: {
      consultations: ["Autre"],
      decisionImpact: "Compatibilité avec la servitude à confirmer selon sa nature.",
    },
  }));

  constraints.push(constraint({
    type: "ERP",
    label: "ERP / accessibilité / sécurité",
    detected: projectMentionsErp,
    confidence: projectMentionsErp ? "medium" : "low",
    source: "Description du projet / réponses utilisateur",
    impact: {
      consultations: ["SDIS"],
      delayImpact: "Consultation sécurité/accessibilité possible.",
      decisionImpact: "Pièces ERP spécifiques si le projet est confirmé comme ERP.",
    },
  }));

  constraints.push(constraint({
    type: "METROPOLE",
    label: "Voirie, domaine public ou compétence métropole",
    detected: touchesPublicSpace || answers.metropoleCompetence === true,
    confidence: touchesPublicSpace || answers.metropoleCompetence ? "medium" : "low",
    source: "Projet / organisation locale",
    impact: {
      consultations: ["Métropole", "Gestionnaire voirie"],
      delayImpact: "Avis voirie ou service instructeur métropolitain possible.",
    },
  }));

  constraints.push(constraint({
    type: "OTHER",
    label: "Zone agricole/naturelle, littorale, EBC ou arbres protégés",
    detected: answers.coastalArea === true || answers.agriculturalOrNaturalZone === true || answers.woodedArea === true || answers.protectedTrees === true,
    confidence: answers.coastalArea || answers.agriculturalOrNaturalZone || answers.woodedArea || answers.protectedTrees ? "medium" : "low",
    source: "PLU / protections locales",
    impact: {
      consultations: ["DDT"],
      decisionImpact: "La constructibilité ou les prescriptions paysagères peuvent être plus restrictives.",
    },
  }));

  return constraints;
}
