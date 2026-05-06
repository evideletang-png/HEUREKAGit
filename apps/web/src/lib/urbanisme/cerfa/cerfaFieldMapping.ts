import type { DossierType, ProjectContext } from "./officialPieces.types";

export type CerfaFieldValue = string | number | boolean | null | undefined;

export type CerfaFormValues = Record<string, CerfaFieldValue>;

export type CerfaFieldMapping = {
  fieldId: string;
  cerfaReference: string;
  label: string;
  dossierTypes: DossierType[];
  projectFlag?: keyof ProjectContext["projectFlags"];
  metadataKey?: string;
};

export const CERFA_FIELD_MAPPINGS: CerfaFieldMapping[] = [
  {
    fieldId: "project.title",
    cerfaReference: "CERFA - Description synthétique du projet",
    label: "Titre du projet",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
    metadataKey: "title",
  },
  {
    fieldId: "applicant.fullName",
    cerfaReference: "CERFA - Identité du demandeur",
    label: "Nom et prénom ou raison sociale",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
  },
  {
    fieldId: "applicant.email",
    cerfaReference: "CERFA - Coordonnées électroniques",
    label: "Adresse électronique",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
  },
  {
    fieldId: "terrain.address",
    cerfaReference: "CERFA - Adresse du terrain",
    label: "Adresse du terrain",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
    metadataKey: "address",
  },
  {
    fieldId: "terrain.commune",
    cerfaReference: "CERFA - Commune du terrain",
    label: "Commune",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
    metadataKey: "commune",
  },
  {
    fieldId: "terrain.parcel",
    cerfaReference: "CERFA - Références cadastrales",
    label: "Référence cadastrale",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
    metadataKey: "parcel",
  },
  {
    fieldId: "works.description",
    cerfaReference: "CERFA - Nature des travaux",
    label: "Description des travaux",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
  },
  {
    fieldId: "works.createsConstruction",
    cerfaReference: "CERFA - Construction nouvelle / emprise",
    label: "Création d'une construction",
    dossierTypes: ["DPC", "PC", "PCMI", "PA"],
    projectFlag: "createsConstruction",
  },
  {
    fieldId: "works.modifiesFacadesOrRoof",
    cerfaReference: "CERFA - Modification façade ou toiture",
    label: "Modification de façade ou toiture",
    dossierTypes: ["DPC", "PCMI", "PC"],
    projectFlag: "modifiesFacadesOrRoof",
  },
  {
    fieldId: "works.modifiesTerrainProfile",
    cerfaReference: "CERFA - Modification du profil du terrain",
    label: "Modification du profil du terrain",
    dossierTypes: ["DPC", "DPA", "PA"],
    projectFlag: "modifiesTerrainProfile",
  },
  {
    fieldId: "works.visibleFromPublicSpace",
    cerfaReference: "CERFA - Visibilité depuis l'espace public",
    label: "Projet visible depuis l'espace public",
    dossierTypes: ["DPC", "PCMI", "PC"],
    projectFlag: "visibleFromPublicSpace",
  },
  {
    fieldId: "surfaces.existing",
    cerfaReference: "CERFA - Surface de plancher existante",
    label: "Surface existante",
    dossierTypes: ["PCMI", "PC", "DPC"],
  },
  {
    fieldId: "surfaces.created",
    cerfaReference: "CERFA - Surface de plancher créée",
    label: "Surface créée",
    dossierTypes: ["PCMI", "PC", "DPC"],
  },
  {
    fieldId: "demolition.demolitionRequired",
    cerfaReference: "CERFA - Démolitions",
    label: "Démolition avec permis séparé",
    dossierTypes: ["PCMI", "PC", "PA", "PD"],
    projectFlag: "demolitionRequired",
  },
  {
    fieldId: "demolition.pcIncludesDemolition",
    cerfaReference: "CERFA - Permis valant démolition",
    label: "La demande vaut permis de démolir",
    dossierTypes: ["PCMI", "PC"],
    projectFlag: "pcIncludesDemolition",
  },
  {
    fieldId: "related.deforestationRequired",
    cerfaReference: "CERFA - Défrichement",
    label: "Défrichement nécessaire",
    dossierTypes: ["PCMI", "PC", "PA"],
    projectFlag: "deforestationRequired",
  },
  {
    fieldId: "related.requiresImpactStudy",
    cerfaReference: "CERFA - Étude d'impact",
    label: "Étude d'impact requise",
    dossierTypes: ["PC", "DPC", "DPA", "PA", "PD"],
    projectFlag: "requiresImpactStudy",
  },
  {
    fieldId: "related.requiresNatura2000Assessment",
    cerfaReference: "CERFA - Évaluation Natura 2000",
    label: "Évaluation Natura 2000 requise",
    dossierTypes: ["DPC", "DPA", "PA", "PD"],
    projectFlag: "requiresNatura2000Assessment",
  },
  {
    fieldId: "related.hasNonCollectiveSanitation",
    cerfaReference: "CERFA - Assainissement non collectif",
    label: "Assainissement non collectif",
    dossierTypes: ["PA"],
    projectFlag: "hasNonCollectiveSanitation",
  },
  {
    fieldId: "related.lotissement",
    cerfaReference: "CERFA - Lotissement",
    label: "Terrain situé dans un lotissement",
    dossierTypes: ["PC", "DPA", "PA"],
    projectFlag: "lotissement",
  },
  {
    fieldId: "related.zac",
    cerfaReference: "CERFA - ZAC",
    label: "Terrain situé dans une ZAC",
    dossierTypes: ["PC"],
    projectFlag: "zac",
  },
  {
    fieldId: "related.pup",
    cerfaReference: "CERFA - Projet urbain partenarial",
    label: "Projet concerné par un PUP",
    dossierTypes: ["PC", "PA"],
    projectFlag: "pup",
  },
  {
    fieldId: "engagement.accepted",
    cerfaReference: "CERFA - Engagement du demandeur",
    label: "Engagement",
    dossierTypes: ["PCMI", "PC", "DPC", "DPA", "PA", "PD"],
  },
];

export function getCerfaFieldMapping(fieldId: string) {
  return CERFA_FIELD_MAPPINGS.find((mapping) => mapping.fieldId === fieldId);
}

export function getProjectFlagsFromCerfaValues(values: CerfaFormValues): ProjectContext["projectFlags"] {
  return CERFA_FIELD_MAPPINGS.reduce<ProjectContext["projectFlags"]>((flags, mapping) => {
    if (!mapping.projectFlag) return flags;
    const value = values[mapping.fieldId];
    if (typeof value === "boolean") flags[mapping.projectFlag] = value;
    return flags;
  }, {});
}

export function mergeCerfaValuesWithPrefill(values: CerfaFormValues, prefill: CerfaFormValues): CerfaFormValues {
  return Object.entries(prefill).reduce<CerfaFormValues>((next, [key, value]) => {
    if (next[key] === undefined || next[key] === null || next[key] === "") next[key] = value;
    return next;
  }, { ...values });
}
