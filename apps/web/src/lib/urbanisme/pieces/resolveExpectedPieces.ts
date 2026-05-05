import type { LocationConstraintContext } from "@/lib/locationContextAnalyzer";
import {
  getNomenclatureFor,
  normalizeDossierPieceType,
  type DossierPieceType,
  type OfficialPieceDefinition,
  type PieceStatus,
} from "./nomenclature";

export type PieceReason = {
  reason: string;
  source: string;
  confidence?: number;
  trigger: string;
};

export type ExpectedPiece = OfficialPieceDefinition & {
  status: PieceStatus;
  reason?: string;
  confidence?: number;
  blockingIfMissing: boolean;
  additionalReasons: PieceReason[];
};

export type InstructorAlert = {
  type: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
  source: string;
  confidence?: number;
};

export type RuleDebug = {
  rule: string;
  targetCodes: string[];
  source: string;
  confidence?: number;
  reason: string;
};

export type ExpectedPiecesLocationContext = {
  commune?: string;
  parcel?: string;
  pluZone?: string | null;
  abf?: boolean;
  spr?: boolean;
  monumentHistorique?: boolean;
  oap?: boolean;
  ppri?: boolean;
  floodRisk?: boolean;
  servitudes?: string[];
  protectedArea?: boolean;
  risks?: string[];
  confidenceScore?: number;
  missingData?: string[];
};

export type ResolveExpectedPiecesInput = {
  dossierType: DossierPieceType | string;
  projectType?: string;
  projectDetails?: Record<string, unknown>;
  locationContext?: ExpectedPiecesLocationContext | LocationConstraintContext | null;
};

function toFlatLocationContext(context?: ResolveExpectedPiecesInput["locationContext"]): ExpectedPiecesLocationContext {
  if (!context) return {};
  const rich = context as LocationConstraintContext;
  if (rich.constraints) {
    return {
      commune: rich.commune,
      parcel: rich.parcel?.fullReference,
      pluZone: rich.pluZone.code,
      abf: rich.constraints.abf.isConcerned,
      spr: rich.constraints.abf.perimeterType === "site_patrimonial_remarquable",
      monumentHistorique: rich.constraints.abf.perimeterType === "monument_historique",
      oap: rich.constraints.oap.isConcerned,
      ppri: rich.constraints.floodRisk.isConcerned,
      floodRisk: rich.constraints.floodRisk.isConcerned,
      servitudes: rich.constraints.servitudes.items,
      protectedArea: rich.constraints.protectedArea.isConcerned,
      risks: [
        ...rich.constraints.naturalRisk.types,
        rich.constraints.seismicRisk.level,
        rich.constraints.clayShrinkSwell.level,
        rich.constraints.forestFireRisk.isConcerned ? "feu de forêt" : undefined,
      ].filter(Boolean) as string[],
      confidenceScore: rich.confidenceScore,
      missingData: rich.missingData,
    };
  }
  return context as ExpectedPiecesLocationContext;
}

function makePiece(definition: OfficialPieceDefinition): ExpectedPiece {
  return {
    ...definition,
    status: definition.category,
    blockingIfMissing: definition.category === "mandatory",
    additionalReasons: [],
  };
}

function addReason(pieceMap: Map<string, ExpectedPiece>, code: string, reason: PieceReason, debug: RuleDebug[]) {
  const piece = pieceMap.get(code);
  if (!piece) return;
  if (!piece.additionalReasons.some((existing) => existing.trigger === reason.trigger && existing.reason === reason.reason)) {
    piece.additionalReasons.push(reason);
  }
  console.debug("[resolveExpectedPieces] official piece enriched", {
    code,
    trigger: reason.trigger,
    source: reason.source,
    confidence: reason.confidence,
    reason: reason.reason,
  });
  debug.push({
    rule: reason.trigger,
    targetCodes: [code],
    source: reason.source,
    confidence: reason.confidence,
    reason: reason.reason,
  });
}

function addReasons(pieceMap: Map<string, ExpectedPiece>, codes: string[], reason: PieceReason, debug: RuleDebug[]) {
  codes.forEach((code) => addReason(pieceMap, code, reason, debug));
}

function addAlert(alerts: InstructorAlert[], alert: InstructorAlert) {
  if (alerts.some((existing) => existing.type === alert.type && existing.title === alert.title)) return;
  alerts.push(alert);
}

function pieceCodesByType(type: DossierPieceType, semantic: "notice" | "insertion" | "photos" | "facades" | "masse" | "coupe") {
  const map: Record<DossierPieceType, Record<typeof semantic, string[]>> = {
    PCMI: {
      notice: ["PCMI4"],
      insertion: ["PCMI6"],
      photos: ["PCMI7", "PCMI8"],
      facades: ["PCMI5"],
      masse: ["PCMI2"],
      coupe: ["PCMI3"],
    },
    PC: {
      notice: ["PC4"],
      insertion: ["PC6"],
      photos: ["PC7", "PC8"],
      facades: ["PC5"],
      masse: ["PC2"],
      coupe: ["PC3"],
    },
    DP: {
      notice: [],
      insertion: ["DP6"],
      photos: ["DP7", "DP8"],
      facades: ["DP4"],
      masse: ["DP2"],
      coupe: ["DP3"],
    },
    PA: {
      notice: ["PA2"],
      insertion: ["PA4"],
      photos: [],
      facades: [],
      masse: ["PA4"],
      coupe: [],
    },
    PD: {
      notice: [],
      insertion: [],
      photos: ["PD3"],
      facades: [],
      masse: ["PD2"],
      coupe: [],
    },
    CUA: { notice: [], insertion: [], photos: [], facades: [], masse: [], coupe: [] },
    CUB: { notice: ["CU2"], insertion: [], photos: [], facades: [], masse: ["CU3"], coupe: [] },
  };
  return map[type][semantic];
}

function hasProjectSignal(projectType?: string, projectDetails?: Record<string, unknown>) {
  return `${projectType || ""} ${JSON.stringify(projectDetails || {})}`.toLowerCase();
}

export function resolveExpectedPieces(input: ResolveExpectedPiecesInput) {
  const dossierType = normalizeDossierPieceType(input.dossierType);
  const definitions = getNomenclatureFor(dossierType);
  const pieceMap = new Map(definitions.map((definition) => [definition.code, makePiece(definition)]));
  const context = toFlatLocationContext(input.locationContext);
  const confidence = context.confidenceScore ?? 0.55;
  const triggeredRules: RuleDebug[] = [];
  const instructorAlerts: InstructorAlert[] = [];
  const unresolvedChecks = [...(context.missingData || [])];
  const projectSignal = hasProjectSignal(input.projectType, input.projectDetails);

  if (/façade|facade|toiture|menuiserie|cloture|clôture|extérieur|exterieur|ravalement/.test(projectSignal)) {
    addReasons(pieceMap, pieceCodesByType(dossierType, "facades"), {
      reason: "Le projet semble modifier l'aspect extérieur ; la pièce officielle doit rendre les façades, toitures ou éléments modifiés lisibles.",
      source: "project_details",
      confidence: 0.65,
      trigger: "external_modification",
    }, triggeredRules);
    addReasons(pieceMap, pieceCodesByType(dossierType, "insertion"), {
      reason: "Le projet peut être visible depuis l'espace public ; l'insertion doit être appréciée dans la pièce officielle prévue.",
      source: "project_details",
      confidence: 0.6,
      trigger: "visible_from_public_space",
    }, triggeredRules);
  }

  if (context.abf || context.spr || context.monumentHistorique) {
    const reason = {
      reason: "Le terrain semble situé dans un périmètre patrimonial ; préciser matériaux, teintes, menuiseries, clôtures et insertion du projet dans les pièces officielles.",
      source: "location_context.abf",
      confidence: Math.max(confidence, 0.72),
      trigger: "abf_spr_monument_historique",
    };
    addReasons(pieceMap, [
      ...pieceCodesByType(dossierType, "notice"),
      ...pieceCodesByType(dossierType, "insertion"),
      ...pieceCodesByType(dossierType, "photos"),
      ...pieceCodesByType(dossierType, "facades"),
    ], reason, triggeredRules);
    addAlert(instructorAlerts, {
      type: "ABF",
      severity: "warning",
      title: "Consultation ABF probable",
      message: "Le délai d'instruction peut être majoré si le terrain est situé dans un périmètre soumis à avis de l'Architecte des Bâtiments de France.",
      source: "location_context",
      confidence: reason.confidence,
    });
  }

  if (context.oap) {
    addReasons(pieceMap, [
      ...pieceCodesByType(dossierType, "notice"),
      ...pieceCodesByType(dossierType, "masse"),
      ...pieceCodesByType(dossierType, "insertion"),
    ], {
      reason: "La parcelle semble couverte par une OAP ; expliciter la compatibilité avec les orientations d'aménagement dans les pièces officielles existantes.",
      source: "location_context.oap",
      confidence,
      trigger: "oap",
    }, triggeredRules);
    addAlert(instructorAlerts, {
      type: "OAP",
      severity: "warning",
      title: "Compatibilité OAP à vérifier",
      message: "Vérifier que la notice, le plan masse ou le plan de composition permettent d'apprécier l'accès, le stationnement, les espaces verts et l'insertion dans l'OAP.",
      source: "location_context",
      confidence,
    });
  }

  if (context.ppri || context.floodRisk) {
    addReasons(pieceMap, [
      ...pieceCodesByType(dossierType, "notice"),
      ...pieceCodesByType(dossierType, "masse"),
      ...pieceCodesByType(dossierType, "coupe"),
    ], {
      reason: "Le terrain paraît concerné par un PPRI ou un risque inondation ; les pièces officielles doivent permettre d'apprécier les cotes, la cote plancher et la prise en compte du risque.",
      source: "location_context.ppri",
      confidence,
      trigger: "ppri_flood_risk",
    }, triggeredRules);
    addAlert(instructorAlerts, {
      type: "PPRI",
      severity: "warning",
      title: "Risque inondation à vérifier",
      message: "Contrôler la compatibilité du projet avec le règlement du PPRI et les prescriptions de transparence hydraulique si elles existent.",
      source: "location_context",
      confidence,
    });
  }

  if ((context.risks || []).length > 0) {
    addReasons(pieceMap, pieceCodesByType(dossierType, "notice"), {
      reason: "Un risque naturel ou géotechnique est détecté ou plausible ; la pièce officielle doit expliquer les dispositions constructives retenues si elles sont applicables.",
      source: "location_context.risks",
      confidence: Math.max(0.3, confidence - 0.15),
      trigger: "natural_risks",
    }, triggeredRules);
    addAlert(instructorAlerts, {
      type: "RISQUE",
      severity: "warning",
      title: "Risque local à qualifier",
      message: "Ne pas exiger automatiquement une étude ; vérifier le niveau de risque et le texte applicable avant demande de pièce complémentaire.",
      source: "location_context",
      confidence: Math.max(0.3, confidence - 0.15),
    });
  }

  if ((context.servitudes || []).length > 0) {
    addReasons(pieceMap, [
      ...pieceCodesByType(dossierType, "notice"),
      ...pieceCodesByType(dossierType, "masse"),
    ], {
      reason: "Une servitude d'utilité publique semble applicable ; les pièces officielles doivent permettre de vérifier la compatibilité du projet avec cette servitude.",
      source: "location_context.servitudes",
      confidence,
      trigger: "servitudes",
    }, triggeredRules);
    addAlert(instructorAlerts, {
      type: "SUP",
      severity: "warning",
      title: "Servitude d'utilité publique détectée",
      message: "Identifier la servitude exacte avant de demander un complément spécifique.",
      source: "location_context",
      confidence,
    });
  }

  if (context.protectedArea) {
    addReasons(pieceMap, [
      ...pieceCodesByType(dossierType, "notice"),
      ...pieceCodesByType(dossierType, "insertion"),
      ...pieceCodesByType(dossierType, "photos"),
    ], {
      reason: "Le terrain semble concerné par une protection environnementale ; les pièces officielles doivent documenter l'impact paysager et environnemental lorsque c'est pertinent.",
      source: "location_context.protected_area",
      confidence,
      trigger: "protected_area",
    }, triggeredRules);
    addAlert(instructorAlerts, {
      type: "ENVIRONNEMENT",
      severity: "warning",
      title: "Protection environnementale à vérifier",
      message: "Vérifier les documents applicables avant de qualifier une pièce comme exigible.",
      source: "location_context",
      confidence,
    });
  }

  if (!context.pluZone) unresolvedChecks.push("zonage PLU/PLUi");
  if (!context.servitudes || context.servitudes.length === 0) unresolvedChecks.push("servitudes");

  const pieces = Array.from(pieceMap.values());
  const mainPieces = pieces.filter((piece) => piece.category === "mandatory");
  const projectConditionalPieces = pieces.filter((piece) => piece.category === "conditional_project");
  const locationConditionalPieces = pieces.filter((piece) => piece.additionalReasons.length > 0 && piece.category !== "mandatory" && piece.category !== "conditional_project");
  const recommendations = pieces.filter((piece) => piece.category === "recommended");

  return {
    mainPieces,
    projectConditionalPieces,
    locationConditionalPieces,
    recommendations,
    instructorAlerts,
    debug: {
      dossierType,
      triggeredRules,
      unresolvedChecks: Array.from(new Set(unresolvedChecks.filter(Boolean))),
    },
  };
}
