import type { ResolvedPiece, DossierType } from "./officialPieces.types";
import type { CerfaFormValues } from "./cerfaFieldMapping";

export type CerfaSectionStatus = "not_started" | "in_progress" | "complete" | "error" | "not_applicable";

export type CerfaFieldType = "text" | "textarea" | "address" | "yes_no" | "select" | "number" | "date";

export type CerfaFieldDefinition = {
  id: string;
  label: string;
  type: CerfaFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
  dossierTypes?: DossierType[];
  visibleWhen?: { fieldId: string; equals: CerfaFormValues[string] };
};

export type CerfaSectionKind = "form" | "pieces" | "verification" | "transmission";

export type CerfaSectionDefinition = {
  id: string;
  title: string;
  description: string;
  kind: CerfaSectionKind;
  fields: CerfaFieldDefinition[];
  optional?: boolean;
};

const COMMON_SECTIONS: CerfaSectionDefinition[] = [
  {
    id: "receipt",
    title: "Récépissé",
    description: "Synthèse de la demande et identification du formulaire.",
    kind: "form",
    fields: [
      { id: "project.title", label: "Titre du projet", type: "text", required: true, placeholder: "Extension, rénovation, division..." },
      {
        id: "project.dossierType",
        label: "Type de dossier",
        type: "select",
        required: true,
        options: [
          { value: "PCMI", label: "PCMI - Maison individuelle" },
          { value: "PC", label: "PC - Permis de construire" },
          { value: "DPC", label: "DPC - Déclaration préalable travaux" },
          { value: "DPA", label: "DPA - Déclaration préalable aménagement" },
          { value: "PA", label: "PA - Permis d'aménager" },
          { value: "PD", label: "PD - Permis de démolir" },
        ],
      },
    ],
  },
  {
    id: "identity",
    title: "Identité du demandeur",
    description: "Informations nécessaires à l'identification du pétitionnaire.",
    kind: "form",
    fields: [
      { id: "applicant.fullName", label: "Nom et prénom ou raison sociale", type: "text", required: true },
      {
        id: "applicant.quality",
        label: "Qualité du demandeur",
        type: "select",
        required: true,
        options: [
          { value: "owner", label: "Propriétaire" },
          { value: "co_owner", label: "Indivisaire / copropriétaire" },
          { value: "mandatary", label: "Mandataire" },
          { value: "company_representative", label: "Représentant d'une personne morale" },
          { value: "usufructuary", label: "Usufruitier" },
          { value: "future_owner", label: "Acquéreur ou futur propriétaire" },
          { value: "tenant_authorized", label: "Locataire autorisé par le propriétaire" },
          { value: "public_authority", label: "Collectivité / personne publique" },
          { value: "other", label: "Autre" },
        ],
      },
      {
        id: "applicant.qualityOther",
        label: "Précisez la qualité du demandeur",
        type: "text",
        required: true,
        visibleWhen: { fieldId: "applicant.quality", equals: "other" },
        placeholder: "Ex. bénéficiaire d'une promesse de vente...",
      },
      { id: "coApplicant.enabled", label: "Ajouter un co-demandeur", type: "yes_no" },
      {
        id: "coApplicant.fullName",
        label: "Nom et prénom ou raison sociale du co-demandeur",
        type: "text",
        required: true,
        visibleWhen: { fieldId: "coApplicant.enabled", equals: true },
      },
      {
        id: "coApplicant.quality",
        label: "Qualité du co-demandeur",
        type: "select",
        required: true,
        visibleWhen: { fieldId: "coApplicant.enabled", equals: true },
        options: [
          { value: "owner", label: "Propriétaire" },
          { value: "co_owner", label: "Indivisaire / copropriétaire" },
          { value: "mandatary", label: "Mandataire" },
          { value: "company_representative", label: "Représentant d'une personne morale" },
          { value: "usufructuary", label: "Usufruitier" },
          { value: "future_owner", label: "Acquéreur ou futur propriétaire" },
          { value: "tenant_authorized", label: "Locataire autorisé par le propriétaire" },
          { value: "public_authority", label: "Collectivité / personne publique" },
          { value: "other", label: "Autre" },
        ],
      },
      {
        id: "coApplicant.qualityOther",
        label: "Précisez la qualité du co-demandeur",
        type: "text",
        required: true,
        visibleWhen: { fieldId: "coApplicant.quality", equals: "other" },
      },
      {
        id: "coApplicant.email",
        label: "Adresse électronique du co-demandeur",
        type: "text",
        visibleWhen: { fieldId: "coApplicant.enabled", equals: true },
      },
      {
        id: "coApplicant.phone",
        label: "Téléphone du co-demandeur",
        type: "text",
        visibleWhen: { fieldId: "coApplicant.enabled", equals: true },
      },
      {
        id: "coApplicant.address",
        label: "Adresse postale du co-demandeur",
        type: "address",
        placeholder: "Rechercher l'adresse du co-demandeur...",
        helpText: "Sélectionnez une adresse proposée pour fiabiliser les coordonnées du co-demandeur.",
        visibleWhen: { fieldId: "coApplicant.enabled", equals: true },
      },
    ],
  },
  {
    id: "contact",
    title: "Coordonnées",
    description: "Coordonnées utilisées pour les échanges d'instruction.",
    kind: "form",
    fields: [
      { id: "applicant.email", label: "Adresse électronique", type: "text", required: true },
      { id: "applicant.phone", label: "Téléphone", type: "text" },
      {
        id: "applicant.address",
        label: "Adresse postale",
        type: "address",
        placeholder: "Rechercher l'adresse du demandeur...",
        helpText: "Sélectionnez une adresse proposée pour fiabiliser les coordonnées du demandeur.",
      },
    ],
  },
  {
    id: "terrain",
    title: "Terrain",
    description: "Adresse, commune, parcelle et données de localisation.",
    kind: "form",
    fields: [
      { id: "terrain.address", label: "Adresse du terrain", type: "text", required: true },
      { id: "terrain.commune", label: "Commune", type: "text", required: true },
      { id: "terrain.parcel", label: "Références cadastrales", type: "text" },
      { id: "terrain.area", label: "Superficie du terrain (m2)", type: "number" },
      { id: "terrain.pluZone", label: "Zone PLU", type: "text" },
    ],
  },
  {
    id: "legal_situation",
    title: "Situation juridique du terrain",
    description: "Informations utiles sur les droits, servitudes et opérations d'aménagement.",
    kind: "form",
    fields: [
      { id: "legal.ownerAuthorization", label: "Vous disposez de l'autorisation du propriétaire", type: "yes_no", required: true },
      { id: "related.lotissement", label: "Le terrain est situé dans un lotissement", type: "yes_no" },
      { id: "related.zac", label: "Le terrain est situé dans une ZAC", type: "yes_no", dossierTypes: ["PC"] },
      { id: "related.pup", label: "Le terrain est concerné par un PUP", type: "yes_no", dossierTypes: ["PC", "PA"] },
    ],
  },
  {
    id: "works",
    title: "Nature des travaux",
    description: "Description du projet et questions déclenchant les pièces conditionnelles.",
    kind: "form",
    fields: [
      { id: "works.description", label: "Description courte des travaux", type: "textarea", required: true },
      { id: "works.createsConstruction", label: "Le projet crée une construction ou une emprise", type: "yes_no", dossierTypes: ["PCMI", "PC", "DPC", "PA"] },
      { id: "works.modifiesFacadesOrRoof", label: "Le projet modifie les façades ou les toitures", type: "yes_no", dossierTypes: ["PCMI", "PC", "DPC"] },
      { id: "works.modifiesTerrainProfile", label: "Le projet modifie le profil du terrain", type: "yes_no", dossierTypes: ["DPC", "DPA", "PA"] },
      { id: "works.visibleFromPublicSpace", label: "Le projet est visible depuis l'espace public", type: "yes_no", dossierTypes: ["PCMI", "PC", "DPC"] },
    ],
  },
  {
    id: "architect",
    title: "Architecte",
    description: "Données relatives au recours à un architecte.",
    kind: "form",
    optional: true,
    fields: [
      { id: "architect.required", label: "Recours à un architecte", type: "yes_no" },
      { id: "architect.name", label: "Nom de l'architecte", type: "text" },
      { id: "architect.orderNumber", label: "Numéro d'inscription à l'ordre", type: "text" },
    ],
  },
  {
    id: "surfaces",
    title: "Surfaces",
    description: "Surfaces de plancher et emprises déclarées.",
    kind: "form",
    fields: [
      { id: "surfaces.existing", label: "Surface existante (m2)", type: "number", dossierTypes: ["PCMI", "PC", "DPC"] },
      { id: "surfaces.created", label: "Surface créée (m2)", type: "number", dossierTypes: ["PCMI", "PC", "DPC"] },
      { id: "surfaces.demolished", label: "Surface démolie (m2)", type: "number", dossierTypes: ["PCMI", "PC", "PD"] },
    ],
  },
  {
    id: "demolition",
    title: "Démolitions",
    description: "Permis de démolir séparé ou intégré à la demande.",
    kind: "form",
    fields: [
      { id: "demolition.demolitionRequired", label: "Un permis de démolir séparé est nécessaire", type: "yes_no", dossierTypes: ["PCMI", "PC", "PA", "PD"] },
      { id: "demolition.pcIncludesDemolition", label: "La présente demande vaut permis de démolir", type: "yes_no", dossierTypes: ["PCMI", "PC"] },
      { id: "demolition.description", label: "Description des démolitions", type: "textarea" },
    ],
  },
  {
    id: "related_legislation",
    title: "Législations connexes",
    description: "Défrichement, environnement, Natura 2000, risques et consultations.",
    kind: "form",
    fields: [
      { id: "related.deforestationRequired", label: "Le projet nécessite un défrichement", type: "yes_no", dossierTypes: ["PCMI", "PC", "PA"] },
      { id: "related.requiresImpactStudy", label: "Le projet nécessite une étude d'impact", type: "yes_no", dossierTypes: ["PC", "DPC", "DPA", "PA", "PD"] },
      { id: "related.requiresNatura2000Assessment", label: "Le projet nécessite une évaluation Natura 2000", type: "yes_no", dossierTypes: ["DPC", "DPA", "PA", "PD"] },
      { id: "related.hasNonCollectiveSanitation", label: "Le projet prévoit un assainissement non collectif", type: "yes_no", dossierTypes: ["PA"] },
    ],
  },
  {
    id: "engagement",
    title: "Engagement",
    description: "Déclaration et engagement du demandeur avant transmission.",
    kind: "form",
    fields: [
      { id: "engagement.accepted", label: "Je certifie l'exactitude des informations déclarées", type: "yes_no", required: true },
    ],
  },
  {
    id: "pieces",
    title: "Pièces à joindre",
    description: "Bordereau officiel des pièces CERFA recalculé automatiquement.",
    kind: "pieces",
    fields: [],
  },
  {
    id: "verification",
    title: "Vérification",
    description: "Contrôle des champs, pièces et incohérences avant transmission.",
    kind: "verification",
    fields: [],
  },
  {
    id: "transmission",
    title: "Transmission",
    description: "Dernière étape avant envoi à la mairie.",
    kind: "transmission",
    fields: [],
  },
];

function fieldAppliesTo(field: CerfaFieldDefinition, dossierType: DossierType) {
  return !field.dossierTypes || field.dossierTypes.includes(dossierType);
}

export function fieldIsVisible(field: CerfaFieldDefinition, values: CerfaFormValues) {
  if (!field.visibleWhen) return true;
  return values[field.visibleWhen.fieldId] === field.visibleWhen.equals;
}

export function getCerfaSections(dossierType: DossierType): CerfaSectionDefinition[] {
  return COMMON_SECTIONS.map((section) => ({
    ...section,
    fields: section.fields.filter((field) => fieldAppliesTo(field, dossierType)),
  })).filter((section) => section.kind !== "form" || section.fields.length > 0);
}

export function getMissingRequiredFields(sections: CerfaSectionDefinition[], values: CerfaFormValues) {
  return sections.flatMap((section) =>
    section.fields
      .filter((field) => fieldIsVisible(field, values))
      .filter((field) => field.required)
      .filter((field) => values[field.id] === undefined || values[field.id] === null || values[field.id] === "")
      .map((field) => ({ sectionId: section.id, sectionTitle: section.title, field })),
  );
}

export function getCerfaSectionStatus(args: {
  section: CerfaSectionDefinition;
  values: CerfaFormValues;
  missingPieceCodes?: string[];
  resolvedPieces?: ResolvedPiece[];
  hasBlockingErrors?: boolean;
}): CerfaSectionStatus {
  const { section, values } = args;
  if (section.kind === "pieces") {
    if ((args.missingPieceCodes || []).length > 0) return "error";
    return (args.resolvedPieces || []).length > 0 ? "complete" : "not_started";
  }
  if (section.kind === "verification") return args.hasBlockingErrors ? "error" : "complete";
  if (section.kind === "transmission") return args.hasBlockingErrors ? "in_progress" : "complete";
  if (section.optional && section.fields.every((field) => values[field.id] === undefined || values[field.id] === "")) {
    return "not_applicable";
  }
  const visibleFields = section.fields.filter((field) => fieldIsVisible(field, values));
  const requiredFields = visibleFields.filter((field) => field.required);
  const answeredFields = visibleFields.filter((field) => values[field.id] !== undefined && values[field.id] !== null && values[field.id] !== "");
  if (requiredFields.some((field) => values[field.id] === undefined || values[field.id] === null || values[field.id] === "")) {
    return answeredFields.length > 0 ? "in_progress" : "not_started";
  }
  return answeredFields.length > 0 || requiredFields.length === 0 ? "complete" : "not_started";
}
