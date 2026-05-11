import type { ProjectAction } from "./orientation.types";

export type ProjectActionDefinition = {
  id: ProjectAction;
  label: string;
  description: string;
  group: "construction" | "aspect" | "land" | "environment" | "other";
};

export const PROJECT_ACTIONS: ProjectActionDefinition[] = [
  { id: "new_house", label: "Maison neuve", description: "Construction d'une maison individuelle.", group: "construction" },
  { id: "extension", label: "Extension", description: "Agrandissement d'une construction existante.", group: "construction" },
  { id: "elevation", label: "Surélévation", description: "Création d'un niveau ou rehaussement.", group: "construction" },
  { id: "garage_to_habitation", label: "Garage en habitation", description: "Transformation d'un garage en pièce habitable.", group: "construction" },
  { id: "pool", label: "Piscine", description: "Création ou modification d'une piscine.", group: "construction" },
  { id: "garden_shed", label: "Abri de jardin", description: "Construction légère annexe.", group: "construction" },
  { id: "facade_modification", label: "Façade", description: "Ravalement, percement, aspect extérieur.", group: "aspect" },
  { id: "roof_modification", label: "Toiture", description: "Modification de toiture ou couverture.", group: "aspect" },
  { id: "joinery_modification", label: "Menuiseries", description: "Fenêtres, portes, volets, matériaux ou couleurs.", group: "aspect" },
  { id: "solar_panels", label: "Panneaux solaires", description: "Installation visible sur toiture ou terrain.", group: "aspect" },
  { id: "fence", label: "Clôture", description: "Création ou modification d'une clôture.", group: "aspect" },
  { id: "destination_change", label: "Changement de destination", description: "Transformation d'usage du bâtiment.", group: "construction" },
  { id: "demolition", label: "Démolition", description: "Démolition totale ou partielle.", group: "land" },
  { id: "land_division", label: "Division foncière", description: "Division d'un terrain ou création de lots.", group: "land" },
  { id: "lotissement", label: "Lotissement", description: "Aménagement avec lots, voies ou équipements communs.", group: "land" },
  { id: "earthworks", label: "Affouillement / exhaussement", description: "Terrassements ou modification du terrain.", group: "land" },
  { id: "tree_cutting", label: "Abattage d'arbres", description: "Coupe d'arbres ou élément protégé.", group: "environment" },
  { id: "public_space_modification", label: "Espace public", description: "Accès, voirie, trottoir, domaine public.", group: "land" },
  { id: "other", label: "Autre projet", description: "Projet à préciser avec le service instructeur.", group: "other" },
];

export function getProjectActionLabel(action: ProjectAction) {
  return PROJECT_ACTIONS.find((item) => item.id === action)?.label || action;
}
