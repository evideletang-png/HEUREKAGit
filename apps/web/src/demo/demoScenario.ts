import { DEMO_DOSSIER_ID, DEMO_MAIRIE_DETAIL_ID, demoDossier, demoPluAnalysis } from "./demoSeedData";
import type { DemoScenarioVariant } from "./demoModeStore";
import type { DossierStatus } from "@/lib/urbanisme/dossier/statusWorkflow";

export type DemoRole = "citizen" | "mairie" | "metropole" | "abf" | "sdis" | "signatory";
export type DemoTimelineStatus = "done" | "current" | "upcoming";
export type DemoPieceStatus = "ok" | "missing" | "insufficient";
export type DemoPluStatus = "conforme" | "à vérifier" | "à risque" | "sans alerte" | "non conforme" | "incomplet";

export type DemoServiceOpinion = {
  service: "ABF" | "SDIS" | "Métropole";
  status: string;
  observations?: string[];
  prescriptions?: string[];
  conclusion: string;
  highlights?: string[];
};

export type DemoStep = {
  id: string;
  role: DemoRole;
  title: string;
  description: string;
  route: string;
  seedAction?: () => Promise<void>;
  highlightSelectors?: string[];
  waitMs?: number;
  dossierStatus?: DossierStatus | "signature_pending";
  variants?: DemoScenarioVariant[];
};

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "connexion-citoyen",
    role: "citizen",
    title: "Connexion citoyen",
    description: "Jean Martin entre dans le vrai portail citoyen Heureka avec une session de demonstration controlee.",
    route: "/citoyen",
    waitMs: 1200,
    dossierStatus: "draft",
  },
  {
    id: "orientation-assistant",
    role: "citizen",
    title: "Assistant d'orientation",
    description: "Le citoyen choisit d'etre guide, selectionne plusieurs travaux et obtient une recommandation de dossier.",
    route: "/citoyen/orientation",
    highlightSelectors: ["[data-demo='orientation-assistant']"],
    waitMs: 1800,
    dossierStatus: "draft",
  },
  {
    id: "identification-parcelle",
    role: "citizen",
    title: "Identification parcelle",
    description: "Le formulaire reel de nouveau depot reprend la recommandation puis renseigne l'adresse, la parcelle AB 123, la zone UB et les contraintes patrimoniales.",
    route: "/citoyen/nouveau",
    highlightSelectors: ["[data-demo='location-analysis']"],
    waitMs: 1800,
    dossierStatus: "draft",
  },
  {
    id: "depot-pcmi",
    role: "citizen",
    title: "Depot PCMI",
    description: "La checklist CERFA officielle PCMI est calculee par le moteur metier, puis les pieces PCMI1 a PCMI8 sont chargees.",
    route: "/citoyen/nouveau",
    highlightSelectors: ["[data-demo='official-pieces-checklist']", "#file-upload"],
    waitMs: 2000,
    dossierStatus: "draft",
  },
  {
    id: "soumission",
    role: "citizen",
    title: "Soumission du dossier",
    description: "Le dossier est soumis et passe dans le suivi citoyen avec accuse de depot.",
    route: `/citoyen/dossier/${DEMO_DOSSIER_ID}`,
    waitMs: 1400,
    dossierStatus: "submitted",
  },
  {
    id: "dashboard-mairie",
    role: "mairie",
    title: "Passage acces mairie",
    description: "Claire Dubois retrouve le dossier depose dans le vrai tableau de bord instructeur.",
    route: "/dashboard-mairie",
    highlightSelectors: ["table", "[data-demo='dossier-status']"],
    waitMs: 1400,
    dossierStatus: "complete",
  },
  {
    id: "ouverture-dossier-mairie",
    role: "mairie",
    title: "Ouverture dossier mairie",
    description: "Le detail dossier affiche contexte parcellaire, pieces, completude, delai, statut et historique.",
    route: `/dossier/${DEMO_MAIRIE_DETAIL_ID}`,
    waitMs: 1600,
    dossierStatus: "in_instruction",
  },
  {
    id: "analyse-plu",
    role: "mairie",
    title: "Analyse PLU",
    description: "Le bloc d'analyse reglementaire PLU verifie les articles 6, 7, 9, 10, 11 et 12 avec les donnees du dossier.",
    route: `/portail-mairie/${DEMO_DOSSIER_ID}`,
    highlightSelectors: ["[data-demo='plu-analysis']"],
    waitMs: 1800,
    dossierStatus: "in_instruction",
  },
  {
    id: "consultations",
    role: "mairie",
    title: "Consultations",
    description: "Les consultations ABF et Metropole sont suivies depuis les vrais espaces services; le SDIS reste non requis dans ce scenario.",
    route: "/portail-mairie/services-consultes",
    highlightSelectors: ["[data-demo='consultations']"],
    waitMs: 1800,
    dossierStatus: "in_consultation",
  },
  {
    id: "messagerie-transverse",
    role: "abf",
    title: "Messagerie transverse",
    description: "La mairie questionne l'ABF et la reponse est rattachee au dossier et aux pieces PCMI4, PCMI5 et PCMI6.",
    route: `/portail-abf/${DEMO_DOSSIER_ID}`,
    highlightSelectors: ["[data-demo='dossier-messages']"],
    waitMs: 1800,
    dossierStatus: "in_consultation",
  },
  {
    id: "pieces-complementaires",
    role: "citizen",
    title: "Variante pieces complementaires",
    description: "La mairie notifie une demande officielle de complement; le citoyen revient deposer la piece demandee.",
    route: `/citoyen/dossier/${DEMO_DOSSIER_ID}`,
    waitMs: 1800,
    dossierStatus: "incomplete",
    variants: ["pieces_complementaires"],
  },
  {
    id: "decision-favorable",
    role: "mairie",
    title: "Decision favorable",
    description: "Le dossier est complet, l'avis ABF est favorable avec reserve, et la decision est preparee avec prescriptions.",
    route: `/portail-mairie/${DEMO_DOSSIER_ID}`,
    waitMs: 1800,
    dossierStatus: "decision_pending",
    variants: ["decision_favorable"],
  },
  {
    id: "courrier-arrete",
    role: "mairie",
    title: "Generation courrier et arrete",
    description: "Le generateur Heureka produit un projet d'arrete motive, sans inventer de regle juridique.",
    route: `/dossier/${DEMO_MAIRIE_DETAIL_ID}`,
    waitMs: 1600,
    dossierStatus: "decision_pending",
  },
  {
    id: "parapheur",
    role: "signatory",
    title: "Parapheur eIDAS",
    description: "Le parapheur utilise le mock provider demo et affiche explicitement que la simulation n'est pas opposable juridiquement.",
    route: `/portail-mairie/${DEMO_DOSSIER_ID}`,
    highlightSelectors: ["[data-demo='signature-workflow']"],
    waitMs: 2000,
    dossierStatus: "signature_pending",
  },
  {
    id: "notification-citoyen",
    role: "citizen",
    title: "Notification citoyen",
    description: "Le citoyen retrouve la decision notifiee et peut consulter le courrier signe depuis son vrai espace de suivi.",
    route: `/citoyen/dossier/${DEMO_DOSSIER_ID}`,
    waitMs: 1800,
    dossierStatus: "notified",
  },
];

export function getDemoSteps(variant: DemoScenarioVariant = "decision_favorable") {
  return DEMO_STEPS.filter((step) => !step.variants || step.variants.includes(variant));
}

export function getDemoStepById(id: string, variant: DemoScenarioVariant = "decision_favorable") {
  return getDemoSteps(variant).find((step) => step.id === id) || getDemoSteps(variant)[0];
}

// Compatibility object for the previous read-only demo pages while /demo/scenario
// becomes the canonical orchestrated demo entrypoint.
export const demoScenario = {
  commune: demoDossier.commune,
  address: demoDossier.address,
  parcel: demoDossier.parcelRef,
  pluZone: `${demoDossier.zoneCode} — ${demoDossier.zoneLabel}`,
  procedure: "Permis de construire maison individuelle",
  project: demoDossier.title,
  existingSurface: 120,
  createdSurface: 28,
  totalSurface: 148,
  constraints: ["Abords monument historique", "Consultation ABF requise", "Zone UB"],
  pieces: demoDossier.documents.map((document) => ({
    code: document.code,
    label: document.title,
    status: "ok" as DemoPieceStatus,
  })),
  pluAnalysis: demoPluAnalysis.rulesChecked.map((rule) => ({
    article: rule.article,
    status: (rule.compliant ? "conforme" : "à vérifier") as DemoPluStatus,
    summary: rule.rule,
    impact: rule.explanation,
  })),
  aiConclusion: {
    scoreConformite: 92,
    status: "FAVORABLE_AVEC_PRESCRIPTIONS",
    pointsBloquants: [],
    pointsAttention: ["Prescription ABF sur teinte mate et menuiseries ton pierre"],
    recommendation: "Preparer un accord avec prescriptions et envoyer au parapheur.",
  },
  opinions: {
    abf: {
      service: "ABF",
      status: "FAVORABLE_AVEC_PRESCRIPTIONS",
      prescriptions: ["Conserver une teinte mate", "Prevoir des menuiseries ton pierre"],
      conclusion: "Avis favorable sous prescription patrimoniale",
      highlights: ["PCMI4", "PCMI5", "PCMI6"],
    },
    sdis: {
      service: "SDIS",
      status: "NON_REQUIS",
      observations: ["Pas d'ERP ni d'acces secours specifique dans le scenario demo"],
      conclusion: "Consultation SDIS non requise",
      highlights: ["Non requis"],
    },
    metropole: {
      service: "Métropole",
      status: "AVIS_RECU",
      observations: ["Aucun reseau metropolitain impacte"],
      conclusion: "Avis favorable",
      highlights: ["Voirie", "Reseaux"],
    },
  } satisfies Record<string, DemoServiceOpinion>,
  timeline: getDemoSteps().map((step, index) => ({
    day: index,
    label: step.title,
    status: index < 8 ? "done" : index === 8 ? "current" : "upcoming",
  })) satisfies Array<{ day: number; label: string; status: DemoTimelineStatus }>,
  finalDecision: {
    type: "Accord avec prescriptions",
    summary: "Decision favorable avec prescriptions ABF, puis notification citoyen.",
  },
} as const;
