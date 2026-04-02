export interface DossierPiece {
  code: string;
  name: string;
  description: string;
  isMandatory: boolean;
  condition?: string;
  promptKey?: string;
}

export interface ProcedureType {
  code: string;
  label: string;
  description: string;
  pieces: DossierPiece[];
}

export const PROCEDURES: Record<string, ProcedureType> = {
  PC: {
    code: "PC",
    label: "Permis de Construire (Maison Individuelle)",
    description: "Pour toute construction de maison individuelle ou ses annexes.",
    pieces: [
      { code: "CERFA", name: "Formulaire CERFA", description: "Le formulaire officiel complété et signé.", isMandatory: true },
      { code: "PCMI1", name: "Plan de situation du terrain", description: "Permet de situer le terrain sur la commune.", isMandatory: true, promptKey: "expert_pcmi1_system" },
      { code: "PCMI2", name: "Plan de masse", description: "Vue aérienne du projet et des limites.", isMandatory: true, promptKey: "expert_pcmi2_system" },
      { code: "PCMI3", name: "Plan en coupe", description: "Profil du terrain et de la construction.", isMandatory: true, promptKey: "expert_pcmi3_system" },
      { code: "PCMI4", name: "Notice descriptive", description: "Présentation détaillée du projet.", isMandatory: true, promptKey: "expert_pcmi4_system" },
      { code: "PCMI5", name: "Plan des façades et toitures", description: "Aspect extérieur du projet.", isMandatory: true, promptKey: "expert_pcmi5_system" },
      { code: "PCMI6", name: "Document graphique d’insertion", description: "Insertion 3D ou montage photo.", isMandatory: true },
      { code: "PCMI7", name: "Photographie (proche)", description: "Environnement immédiat.", isMandatory: true },
      { code: "PCMI8", name: "Photographie (lointaine)", description: "Paysage lointain.", isMandatory: true },
      // Conditionnables
      { code: "PCMI12", name: "Attestation Assainissement", description: "Pour les zones sans tout-à-l'égout.", isMandatory: false, condition: "ANC" },
      { code: "PCMI14-2", name: "Attestation RE2020", description: "Respect de la réglementation environnementale.", isMandatory: false, condition: "RE2020" },
      { code: "ARCHI", name: "Attestation Architecte", description: "Si surface > 150m².", isMandatory: false, condition: "SURFACE_GT_150" },
    ]
  },
  DP: {
    code: "DP",
    label: "Déclaration Préalable",
    description: "Pour les travaux de faible importance (clôtures, abris, ravalement).",
    pieces: [
      { code: "CERFA", name: "Formulaire CERFA", description: "Le formulaire officiel complété et signé.", isMandatory: true },
      { code: "DP1", name: "Plan de situation du terrain", description: "Situation sur la commune.", isMandatory: true },
      { code: "DP2", name: "Plan de masse", description: "Dimensions et emplacements.", isMandatory: true },
      { code: "DP3", name: "Plan en coupe", description: "Si modification du terrain.", isMandatory: false },
      { code: "DP4", name: "Notice descriptive", description: "Description des travaux.", isMandatory: true },
      { code: "DP5", name: "Plans des façades et toitures", description: "Si modification de l'aspect.", isMandatory: false },
    ]
  },
  CUa: {
    code: "CUa",
    label: "Certificat d'Urbanisme d'Information",
    description: "Pour connaître les règles d'urbanisme applicables.",
    pieces: [
      { code: "CERFA", name: "Formulaire CERFA", description: "Le formulaire officiel complété et signé.", isMandatory: true },
      { code: "CU1", name: "Plan de situation", description: "Localisation précise.", isMandatory: true },
      { code: "CU2", name: "Notice descriptive", description: "Description succincte.", isMandatory: true },
    ]
  },
  CUb: {
    code: "CUb",
    label: "Certificat d'Urbanisme Opérationnel",
    description: "Pour savoir si un projet spécifique est réalisable.",
    pieces: [
      { code: "CERFA", name: "Formulaire CERFA", description: "Le formulaire officiel complété et signé.", isMandatory: true },
      { code: "CU1", name: "Plan de situation", description: "Localisation précise.", isMandatory: true },
      { code: "CU2", name: "Notice descriptive", description: "Description du projet.", isMandatory: true },
      { code: "CU3", name: "Plan de masse", description: "Esquisse du projet.", isMandatory: true },
    ]
  },
  PA: {
    code: "PA",
    label: "Permis d'Aménager",
    description: "Pour les lotissements, campings, ou affouillements et exhaussements du sol.",
    pieces: [
      { code: "CERFA", name: "Formulaire CERFA", description: "Le formulaire officiel complété et signé.", isMandatory: true },
      { code: "PA1", name: "Plan de situation du terrain", description: "Situation sur la commune.", isMandatory: true },
      { code: "PA2", name: "Plan de masse des constructions", description: "Dimensions et emplacements.", isMandatory: true },
      { code: "PA3", name: "Plan en coupe du terrain", description: "Profil avant/après travaux.", isMandatory: true },
      { code: "PA4", name: "Notice descriptive", description: "Description de l'aménagement.", isMandatory: true },
    ]
  },
  PD: {
    code: "PD",
    label: "Permis de Démolir",
    description: "Pour la démolition totale ou partielle d'un bâtiment protégé ou en zone protégée.",
    pieces: [
      { code: "CERFA", name: "Formulaire CERFA", description: "Le formulaire officiel complété et signé.", isMandatory: true },
      { code: "PD1", name: "Plan de situation du terrain", description: "Situation sur la commune.", isMandatory: true },
      { code: "PD2", name: "Plan de masse", description: "Indiquant les bâtiments à démolir.", isMandatory: true },
      { code: "PD3", name: "Photographies", description: "Vues des bâtiments à démolir.", isMandatory: true },
    ]
  }
};
