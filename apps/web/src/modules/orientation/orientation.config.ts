import type { ProjectAction } from "./orientation.types";

export const ORIENTATION_HELP_TEXT =
  "Cet assistant vous aide à identifier la démarche la plus adaptée. Vous pouvez aussi accéder directement au dépôt si vous connaissez déjà le type de dossier à remplir.";

export const ACTION_QUESTIONS: Partial<Record<ProjectAction, string[]>> = {
  extension: ["extensionSurfaceM2", "extensionFootprintM2", "extensionHeightM", "visibleFromPublicSpace"],
  elevation: ["extensionSurfaceM2", "extensionHeightM", "visibleFromPublicSpace"],
  facade_modification: ["visibleFromPublicSpace"],
  roof_modification: ["visibleFromPublicSpace"],
  joinery_modification: ["joineryChangesAspect", "visibleFromPublicSpace"],
  garage_to_habitation: ["garageSurfaceM2", "garageFacadeModified", "garageParkingRemoved"],
  destination_change: ["destinationCurrent", "destinationFuture", "facadeOrStructureChanged"],
  pool: ["poolSurfaceM2"],
  garden_shed: ["shedSurfaceM2"],
  demolition: ["demolitionIntegrated", "demolitionTotal"],
  land_division: ["createsLots", "commonRoadOrEquipment"],
  lotissement: ["createsLots", "commonRoadOrEquipment"],
  earthworks: ["extensionFootprintM2"],
  public_space_modification: ["publicSpaceTouched"],
};

export const QUESTION_LABELS: Record<string, { label: string; type: "number" | "boolean" | "text"; help?: string }> = {
  extensionSurfaceM2: { label: "Surface de plancher créée estimée (m2)", type: "number" },
  extensionFootprintM2: { label: "Emprise au sol créée estimée (m2)", type: "number" },
  extensionHeightM: { label: "Hauteur maximale du projet (m)", type: "number" },
  poolSurfaceM2: { label: "Surface du bassin (m2)", type: "number" },
  shedSurfaceM2: { label: "Surface de l'abri (m2)", type: "number" },
  facadeOrStructureChanged: { label: "Les façades ou structures porteuses sont-elles modifiées ?", type: "boolean" },
  visibleFromPublicSpace: { label: "Le projet est-il visible depuis l'espace public ?", type: "boolean" },
  joineryChangesAspect: { label: "Les menuiseries changent-elles d'aspect, dimensions, matériau ou couleur ?", type: "boolean" },
  garageSurfaceM2: { label: "Surface du garage transformée (m2)", type: "number" },
  garageFacadeModified: { label: "La transformation modifie-t-elle la façade ?", type: "boolean" },
  garageParkingRemoved: { label: "Une place de stationnement est-elle supprimée ?", type: "boolean" },
  demolitionIntegrated: { label: "La démolition est-elle intégrée au projet principal ?", type: "boolean" },
  demolitionTotal: { label: "La démolition est-elle totale ?", type: "boolean" },
  createsLots: { label: "Le projet crée-t-il des lots ?", type: "boolean" },
  commonRoadOrEquipment: { label: "Y a-t-il une voie, un espace ou équipement commun ?", type: "boolean" },
  destinationCurrent: { label: "Destination actuelle", type: "text" },
  destinationFuture: { label: "Destination future", type: "text" },
  publicSpaceTouched: { label: "Le projet modifie-t-il un accès, trottoir, voirie ou domaine public ?", type: "boolean" },
};
