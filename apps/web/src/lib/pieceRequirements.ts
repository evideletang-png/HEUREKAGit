export type PieceRequirementLevel = "obligatoire" | "recommandée" | "à vérifier" | "déclenchée par contexte local";

export type PieceRequirement = {
  code: string;
  label: string;
  level: PieceRequirementLevel;
  reason?: string;
};

export type ParcelAnalysisLike = {
  zoneCode?: string | null;
  zoneLabel?: string | null;
  zoningLabel?: string | null;
  constraints?: unknown[];
  overlays?: unknown[];
};

const BASE_PIECES: Record<string, PieceRequirement[]> = {
  PCMI: [
    ["PCMI1", "Plan de situation"],
    ["PCMI2", "Plan de masse"],
    ["PCMI3", "Plan en coupe"],
    ["PCMI4", "Notice descriptive"],
    ["PCMI5", "Plans des façades et toitures"],
    ["PCMI6", "Document graphique d'insertion"],
    ["PCMI7", "Photographie environnement proche"],
    ["PCMI8", "Photographie environnement lointain"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire" })),
  PC: [
    ["PC1", "Plan de situation"],
    ["PC2", "Plan de masse"],
    ["PC3", "Plan en coupe"],
    ["PC4", "Notice descriptive"],
    ["PC5", "Plans des façades et toitures"],
    ["PC6", "Document graphique d'insertion"],
    ["PC7", "Photographie environnement proche"],
    ["PC8", "Photographie environnement lointain"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire" })),
  DP: [
    ["DP1", "Plan de situation"],
    ["DP2", "Plan de masse si création ou modification"],
    ["DP3", "Plan en coupe si modification du profil"],
    ["DP4", "Façades/toitures si modification extérieure"],
    ["DP6", "Insertion graphique si visible depuis l'espace public"],
    ["DP7", "Photographie environnement proche"],
    ["DP8", "Photographie environnement lointain"],
  ].map(([code, label]) => ({ code, label, level: code === "DP1" ? "obligatoire" : "à vérifier" })),
  PA: [
    ["PA1", "Plan de situation"],
    ["PA2", "Notice descriptive du terrain et du projet"],
    ["PA3", "Plan de l'état actuel du terrain"],
    ["PA4", "Plan de composition d'ensemble"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire" })),
  PD: [
    ["PD1", "Plan de situation"],
    ["PD2", "Plan de masse des constructions à démolir"],
    ["PD3", "Photographies du bâtiment"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire" })),
  CUA: [
    ["CU1", "Plan de situation"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire" })),
  CUB: [
    ["CU1", "Plan de situation"],
    ["CU2", "Description de l'opération"],
    ["CU3", "Plan du terrain"],
  ].map(([code, label]) => ({ code, label, level: "obligatoire" })),
};

function textFromContext(parcelAnalysis?: ParcelAnalysisLike | null, constraints?: unknown[]) {
  return JSON.stringify({
    constraints: constraints || parcelAnalysis?.constraints || [],
    overlays: parcelAnalysis?.overlays || [],
    zoneCode: parcelAnalysis?.zoneCode,
    zoneLabel: parcelAnalysis?.zoneLabel || parcelAnalysis?.zoningLabel,
  }).toLowerCase();
}

export function normalizeProcedureType(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "permis_de_construire") return "PC";
  if (normalized === "declaration_prealable") return "DP";
  if (normalized === "permis_amenager") return "PA";
  if (normalized === "certificat_urbanisme") return "CUA";
  if (raw === "CUa") return "CUA";
  if (raw === "CUb") return "CUB";
  return raw.toUpperCase();
}

export function getRequiredPieces(args: {
  procedureType: string;
  parcelAnalysis?: ParcelAnalysisLike | null;
  zone?: { zoneCode?: string | null; zoneType?: string | null; constraints?: unknown[] } | null;
  constraints?: unknown[];
}) {
  const procedureType = normalizeProcedureType(args.procedureType);
  const requiredPieces = BASE_PIECES[procedureType] || [];
  const context = textFromContext(args.parcelAnalysis, args.constraints);
  const conditionalPieces: PieceRequirement[] = [];
  const warnings: string[] = [];

  if (/(abf|spr|patrimonial|monument|historique)/i.test(context)) {
    conditionalPieces.push(
      { code: "PATRIMOINE-1", label: "Notice matériaux détaillée", level: "déclenchée par contexte local", reason: "ABF / SPR / patrimoine détecté" },
      { code: "PATRIMOINE-2", label: "Photographies complémentaires et insertion renforcée", level: "recommandée", reason: "Contexte patrimonial" },
    );
  }
  if (/(ppri|inond|risque)/i.test(context)) {
    conditionalPieces.push({ code: "RISQUE-1", label: "Notice de prise en compte du risque", level: "à vérifier", reason: "PPRI ou risque détecté" });
  }
  if (/(cavit|géotech|geotech|mouvement)/i.test(context)) {
    conditionalPieces.push({ code: "CAVITES-1", label: "Étude ou justificatif géotechnique", level: "à vérifier", reason: "Cavités ou mouvement de terrain potentiels" });
  }
  if (/(spr|abf|patrimoine)/i.test(JSON.stringify(args.zone || {}).toLowerCase())) {
    conditionalPieces.push({ code: "ZONE-PATRIMOINE", label: "Justification d'insertion patrimoniale", level: "déclenchée par contexte local", reason: "Contrainte de zone ou document lié" });
  }
  if (!args.parcelAnalysis?.zoneCode && !args.zone?.zoneCode) warnings.push("Zone PLU non déterminée : certaines pièces locales restent à vérifier.");

  return {
    requiredPieces,
    conditionalPieces,
    missingContext: args.parcelAnalysis ? [] : ["Analyse parcelle non disponible"],
    warnings,
  };
}
