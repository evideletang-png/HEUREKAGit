import {
  Blocks,
  ClipboardCheck,
  FileArchive,
  FileCheck2,
  FolderOpen,
  Landmark,
  Map,
  MessagesSquare,
  PenTool,
  ScanSearch,
} from "lucide-react";

export type ProjectModuleId =
  | "parcel_analysis"
  | "project_qualification"
  | "assisted_site_plan"
  | "section_plan"
  | "landscape_insertion"
  | "project_ged"
  | "dossier_assembly"
  | "administrative_deposit"
  | "instruction_tracking"
  | "appeals_and_modifications";

export type ProjectModuleDefinition = {
  id: ProjectModuleId;
  title: string;
  description: string;
  status: "available" | "planned" | "connected";
  icon: typeof ScanSearch;
};

export const PROJECT_MODULES: ProjectModuleDefinition[] = [
  {
    id: "parcel_analysis",
    title: "Analyse parcellaire",
    description: "Zonage PLU, servitudes, risques, patrimoine, synthèse IA et export.",
    status: "connected",
    icon: ScanSearch,
  },
  {
    id: "project_qualification",
    title: "Qualification du projet",
    description: "Description libre, recommandation de démarche, pièces, délais et services consultés.",
    status: "connected",
    icon: ClipboardCheck,
  },
  {
    id: "assisted_site_plan",
    title: "Plan de masse assisté",
    description: "Éditeur cartographique avec cadastre, orthophoto, retraits, emprise et contrôles temps réel.",
    status: "planned",
    icon: Map,
  },
  {
    id: "section_plan",
    title: "Plan de coupe",
    description: "Préparation progressive d'une coupe simplifiée liée au terrain et au projet.",
    status: "planned",
    icon: PenTool,
  },
  {
    id: "landscape_insertion",
    title: "Insertion paysagère",
    description: "Préfiguration visuelle évolutive compatible IGN, LiDAR HD, Three.js, CesiumJS ou Mapbox.",
    status: "planned",
    icon: Landmark,
  },
  {
    id: "project_ged",
    title: "GED projet",
    description: "Arborescence automatique, upload, versioning, tags, classification IA et historique.",
    status: "available",
    icon: FolderOpen,
  },
  {
    id: "dossier_assembly",
    title: "Constitution dossier",
    description: "Association GED ↔ pièces CERFA, détection des pièces, cohérence et manquants.",
    status: "connected",
    icon: FileArchive,
  },
  {
    id: "administrative_deposit",
    title: "Dépôt administratif",
    description: "Dépôt officiel à partir des données projet, analyses, GED et pièces générées.",
    status: "connected",
    icon: FileCheck2,
  },
  {
    id: "instruction_tracking",
    title: "Instruction",
    description: "Timeline, échanges contextualisés, versioning, consultations et décision.",
    status: "connected",
    icon: MessagesSquare,
  },
  {
    id: "appeals_and_modifications",
    title: "Modificatifs / recours",
    description: "Cycle de vie du projet après décision, demandes modificatives et contentieux.",
    status: "available",
    icon: Blocks,
  },
];

export function getProjectModule(id: string) {
  return PROJECT_MODULES.find((module) => module.id === id);
}
