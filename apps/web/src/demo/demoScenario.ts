export type DemoPieceStatus = "ok" | "missing" | "insufficient";
export type DemoPluStatus = "conforme" | "à vérifier" | "à risque" | "sans alerte" | "non conforme" | "incomplet";
export type DemoTimelineStatus = "done" | "current" | "upcoming";

export type DemoServiceOpinion = {
  service: "ABF" | "SDIS" | "Métropole";
  status: string;
  observations?: string[];
  prescriptions?: string[];
  conclusion: string;
  highlights?: string[];
};

export const demoScenario = {
  commune: "Rochecorbon",
  address: "14 rue des Caves",
  parcel: "AB 145",
  pluZone: "UA — centre ancien",
  procedure: "Permis de construire",
  project: "Transformation d'une grange existante en habitation avec extension contemporaine de 32 m²",
  existingSurface: 85,
  createdSurface: 32,
  totalSurface: 117,
  constraints: [
    "Site Patrimonial Remarquable",
    "Consultation ABF requise",
    "Risque de cavités souterraines",
    "Accès étroit nécessitant analyse SDIS",
    "Stationnement à justifier",
  ],
  pieces: [
    { code: "PCMI1", label: "Plan de situation", status: "ok" },
    { code: "PCMI5", label: "Plans des façades", status: "ok" },
    { code: "PCMI7", label: "Photographie environnement proche", status: "ok" },
    { code: "PCMI8", label: "Photographie environnement lointain", status: "ok" },
    { code: "PCMI3", label: "Plan en coupe", status: "missing" },
    { code: "PCMI6", label: "Document graphique d'insertion", status: "missing" },
    { code: "PCMI2", label: "Plan de masse incomplet", status: "insufficient" },
    { code: "PCMI4", label: "Notice descriptive insuffisante", status: "insufficient" },
  ] satisfies Array<{ code: string; label: string; status: DemoPieceStatus }>,
  pluAnalysis: [
    { article: "Article 1", status: "conforme", summary: "Destination habitation autorisée", impact: "Aucun blocage identifié." },
    { article: "Article 2", status: "à vérifier", summary: "Projet autorisé sous réserve du respect du SPR et de l'avis ABF", impact: "Coordination patrimoniale nécessaire." },
    { article: "Article 3", status: "à risque", summary: "Accès existant étroit, analyse secours recommandée", impact: "Avis SDIS à sécuriser avant décision." },
    { article: "Article 4", status: "conforme", summary: "Raccordement aux réseaux possible", impact: "Raccordements usuels à confirmer." },
    { article: "Article 6", status: "conforme", summary: "Implantation sur rue existante conservée", impact: "Pas d'alerte d'implantation principale." },
    { article: "Article 7", status: "à vérifier", summary: "Extension proche limite séparative, hauteur à justifier", impact: "Pièce graphique complémentaire attendue." },
    { article: "Article 8", status: "sans alerte", summary: "Pas de difficulté identifiée", impact: "Sans impact notable." },
    { article: "Article 9", status: "conforme", summary: "Emprise créée limitée", impact: "Extension compatible avec l'emprise admise." },
    { article: "Article 10", status: "conforme", summary: "Hauteur existante conservée et extension basse", impact: "Hauteur cohérente sous réserve des plans." },
    { article: "Article 11", status: "non conforme", summary: "Menuiseries aluminium anthracite et bac acier visibles incompatibles avec le secteur ancien", impact: "Alerte majeure sur l'aspect extérieur." },
    { article: "Article 12", status: "à vérifier", summary: "Deux places annoncées mais implantation insuffisamment démontrée", impact: "Stationnement à documenter." },
    { article: "Article 13", status: "incomplet", summary: "Traitement paysager et espaces libres à préciser", impact: "Insertion paysagère insuffisante." },
  ] satisfies Array<{ article: string; status: DemoPluStatus; summary: string; impact: string }>,
  aiConclusion: {
    scoreConformite: 72,
    status: "FAVORABLE_SOUS_RESERVES",
    pointsBloquants: ["Aspect extérieur non conforme", "Insertion paysagère insuffisante"],
    pointsAttention: ["Accès secours", "Stationnement", "Cavités souterraines", "Consultation ABF obligatoire"],
    recommendation: "Demander les pièces complémentaires, consulter ABF et SDIS, puis préparer un accord avec prescriptions si les réserves sont levées.",
  },
  opinions: {
    abf: {
      service: "ABF",
      status: "FAVORABLE_AVEC_PRESCRIPTIONS",
      prescriptions: [
        "Remplacer les menuiseries aluminium anthracite par une teinte plus adaptée ou du bois peint",
        "Supprimer ou masquer le bac acier visible depuis l'espace public",
        "Conserver les encadrements en pierre",
        "Fournir une insertion graphique plus précise",
      ],
      conclusion: "Avis favorable sous prescriptions architecturales",
      highlights: ["Façade", "Insertion", "Matériaux", "Menuiseries", "Toiture"],
    },
    sdis: {
      service: "SDIS",
      status: "RESERVE",
      observations: [
        "Largeur utile de l'accès à préciser",
        "Distance entre voie engin et construction à vérifier",
        "Point d'eau incendie non identifié",
      ],
      conclusion: "Avis réservé dans l'attente de précisions",
      highlights: ["Accès", "Défense incendie", "Voie engin", "Point d'eau incendie"],
    },
    metropole: {
      service: "Métropole",
      status: "ANALYSE_EXPERTE",
      observations: [
        "Analyse multi-documents activée",
        "Conflit potentiel entre règlement écrit et prescriptions patrimoniales",
        "Vérifier document graphique des hauteurs et servitudes",
      ],
      conclusion: "Donner priorité aux prescriptions du SPR/ABF sur l'aspect extérieur et coordonner la décision avec la mairie.",
      highlights: ["Règlement écrit", "SPR", "Hauteurs", "Servitudes"],
    },
  } satisfies Record<string, DemoServiceOpinion>,
  timeline: [
    { day: 0, label: "Dépôt du dossier", status: "done" },
    { day: 5, label: "Pré-contrôle automatique", status: "done" },
    { day: 8, label: "Analyse PLU consolidée", status: "done" },
    { day: 10, label: "Demande de pièces complémentaires recommandée", status: "done" },
    { day: 15, label: "Consultation ABF lancée", status: "done" },
    { day: 17, label: "Consultation SDIS lancée", status: "done" },
    { day: 20, label: "Retour ABF", status: "done" },
    { day: 25, label: "Retour SDIS", status: "current" },
    { day: 30, label: "Projet de décision favorable avec prescriptions", status: "upcoming" },
  ] satisfies Array<{ day: number; label: string; status: DemoTimelineStatus }>,
  finalDecision: {
    type: "Accord avec prescriptions",
    summary: "Le projet peut être autorisé sous réserve de compléments documentaires, prescriptions ABF et validation des accès secours.",
  },
} as const;
