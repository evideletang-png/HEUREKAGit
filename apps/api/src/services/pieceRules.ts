/**
 * Rules engine for mandated pieces in urban planning dossiers.
 * Maps dossier types and project characteristics to required document codes.
 */

export interface PieceEvaluationResult {
  dossier_type: string;
  pieces_obligatoires: string[];
  pieces_conditionnelles: string[];
  justification_reglementaire: string[];
}

export const PIECE_LABELS: Record<string, string> = {
  PD1: "Plan de situation du terrain",
  PD2: "Plan de masse des constructions à édifier ou modifier",
  PD3: "Plan en coupe du terrain et de la construction",
  PD4: "Notice descriptive (Monument Historique)",
  PD5: "Documents photographiques (Monument Historique)",
  PD8: "Plan de masse (Démolition partielle)",
  PD9: "ABF - Justification",
  PD11: "Natura 2000 - Evaluation simplifiée",
  PD13: "Etude d'impact",
  PCMI1: "Plan de situation du terrain",
  PCMI2: "Plan de masse des constructions",
  PCMI3: "Plan en coupe du terrain et de la construction",
  PCMI4: "Notice décrivant le terrain et le projet",
  PCMI5: "Plan des façades et des toitures",
  PCMI6: "Document graphique (insertion)",
  PCMI7: "Photographie (environnement proche)",
  PCMI8: "Photographie (environnement lointain)",
  PCMI9: "Certificat de l'aménageur (Lotissement)",
  PCMI10: "Attestation de surface (Lotissement)",
  PCMI11: "Attestation de l'aménageur (ZAC)",
  PCMI12: "Plan de situation (ZAC)",
  "PCMI12-1": "Natura 2000 / Evaluation",
  "PCMI12-1-1": "Etude d'impact / Actualisation",
  "PCMI12-2": "Attestation assainissement non collectif",
  PCMI14: "Attestation de prise en compte du risque (PPR)",
  "PCMI14-1": "Formulaire RE2020 (Attestation au dépôt)",
  PCMI18: "Justificatifs démolition",
  PCMI21: "Accord de l'ABF / Avis de l'architecte"
};

const PIECE_RULES: Record<string, { mandatory: string[], conditional: Record<string, { code: string, label: string }> }> = {
  PD: {
    mandatory: ["PD1", "PD2", "PD3"],
    conditional: {
      monument_historique: { code: "PD4,PD5", label: "Périmètre Monument Historique" },
      demolition_partielle: { code: "PD8", label: "Démolition partielle" },
      zone_ABF: { code: "PD9", label: "Zone ABF" },
      Natura2000: { code: "PD11", label: "Zone Natura 2000" },
      etude_impact: { code: "PD13", label: "Projet soumis à étude d'impact" }
    }
  },
  PCMI: {
    mandatory: ["PCMI1", "PCMI2", "PCMI3", "PCMI4", "PCMI5", "PCMI6", "PCMI7", "PCMI8"],
    conditional: {
      lotissement: { code: "PCMI9,PCMI10", label: "Projet en lotissement" },
      ZAC: { code: "PCMI11,PCMI12", label: "Projet en ZAC" },
      assainissement_non_collectif: { code: "PCMI12-2", label: "Assainissement non collectif" },
      Natura2000: { code: "PCMI12-1", label: "Zone Natura 2000" },
      etude_impact: { code: "PCMI12-1-1", label: "Projet soumis à étude d'impact" },
      RE2020: { code: "PCMI14-1", label: "Réglementation Environnementale 2020" },
      PPR: { code: "PCMI14", label: "Plan de Prévention des Risques" },
      projet_inclut_demolition: { code: "PCMI18", label: "Projet incluant une démolition" },
      zone_ABF: { code: "PCMI21", label: "Zone ABF (Architectes des Bâtiments de France)" }
    }
  }
};

/**
 * Evaluates the required pieces for a dossier.
 */
export function evaluateRequiredPieces(dossierType: string, characteristics: Record<string, any>): PieceEvaluationResult {
  const rules = PIECE_RULES[dossierType] || { mandatory: [], conditional: {} };
  
  const result: PieceEvaluationResult = {
    dossier_type: dossierType,
    pieces_obligatoires: [...rules.mandatory],
    pieces_conditionnelles: [],
    justification_reglementaire: []
  };

  Object.entries(rules.conditional).forEach(([key, piece]) => {
    if (characteristics[key] === true || characteristics[key] === "true" || characteristics[key] === "TRUE") {
      const codes = piece.code.split(",");
      result.pieces_conditionnelles.push(...codes);
      result.justification_reglementaire.push(`${piece.label} (Pièce(s) ${piece.code})`);
    }
  });

  return result;
}
