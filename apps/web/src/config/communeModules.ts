export type CommuneModuleConfig = {
  communeId: string;
  communeName: string;
  modules: {
    orientationAssistantEnabled: boolean;
    orientationAssistantMode: "recommended" | "visible_optional";
    orientationHelpText?: string;
  };
};

export const COMMUNE_MODULES: CommuneModuleConfig[] = [
  {
    communeId: "37261",
    communeName: "Tours",
    modules: {
      orientationAssistantEnabled: true,
      orientationAssistantMode: "recommended",
      orientationHelpText: "Répondez à quelques questions pour identifier le CERFA le plus probable. Vous pourrez toujours choisir un autre dossier.",
    },
  },
  {
    communeId: "demo",
    communeName: "Commune Démo",
    modules: {
      orientationAssistantEnabled: true,
      orientationAssistantMode: "recommended",
      orientationHelpText: "Mode démo : l'assistant d'orientation est activé pour montrer le parcours complet.",
    },
  },
];

export const DEFAULT_COMMUNE_MODULE_CONFIG: CommuneModuleConfig = {
  communeId: "default",
  communeName: "Commune par défaut",
  modules: {
    orientationAssistantEnabled: true,
    orientationAssistantMode: "visible_optional",
  },
};
