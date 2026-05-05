import type { PieceRequirement } from "./pieceRequirements";
import type { LocationConstraintContext } from "./locationContextAnalyzer";

export type AdditionalPiece = {
  code: string;
  label: string;
  required: boolean;
  reason: string;
  trigger: string;
  source: string;
  confidence: number;
  blockingIfMissing: boolean;
};

function addPiece(target: AdditionalPiece[], piece: AdditionalPiece) {
  if (target.some((existing) => existing.code === piece.code)) return;
  target.push(piece);
  console.debug("[additionalPiecesResolver] piece added", {
    code: piece.code,
    trigger: piece.trigger,
    source: piece.source,
    confidence: piece.confidence,
    reason: piece.reason,
  });
}

function confidence(context: LocationConstraintContext, bonus = 0) {
  return Math.min(0.95, Math.max(0.2, context.confidenceScore + bonus));
}

function normalizeProcedureType(value: string | null | undefined) {
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

export function resolveAdditionalPieces(args: {
  procedureType: string;
  locationContext: LocationConstraintContext;
  basePieces?: PieceRequirement[];
}) {
  const procedureType = normalizeProcedureType(args.procedureType);
  const context = args.locationContext;
  const pieces: AdditionalPiece[] = [];
  const vigilance: string[] = [];

  if (context.constraints.abf.isConcerned) {
    const source = context.constraints.abf.source || "GPU / servitude patrimoniale";
    addPiece(pieces, {
      code: "LOC-ABF-INSERTION",
      label: "Insertion paysagère et patrimoniale renforcée",
      required: true,
      reason: "Le terrain paraît situé dans un périmètre patrimonial nécessitant d'apprécier l'impact du projet.",
      trigger: `ABF / ${context.constraints.abf.perimeterType || "périmètre patrimonial"}`,
      source,
      confidence: confidence(context, 0.08),
      blockingIfMissing: procedureType === "PCMI" || procedureType === "PC",
    });
    addPiece(pieces, {
      code: "LOC-ABF-MATERIAUX",
      label: "Notice matériaux, teintes, menuiseries, clôtures et toiture",
      required: false,
      reason: "Une consultation patrimoniale peut nécessiter des détails architecturaux plus précis.",
      trigger: "ABF / SPR / abords",
      source,
      confidence: confidence(context),
      blockingIfMissing: false,
    });
    if (procedureType === "DP") {
      addPiece(pieces, {
        code: "LOC-ABF-FACADES",
        label: "Plans ou élévations des façades/toitures modifiées",
        required: true,
        reason: "En secteur patrimonial, les modifications extérieures doivent être lisibles.",
        trigger: "DP en contexte patrimonial",
        source,
        confidence: confidence(context),
        blockingIfMissing: true,
      });
    }
  }

  if (context.constraints.oap.isConcerned) {
    addPiece(pieces, {
      code: "LOC-OAP-COMPAT",
      label: "Justification de compatibilité avec l'OAP",
      required: false,
      reason: "La parcelle semble couverte par une orientation d'aménagement à prendre en compte.",
      trigger: context.constraints.oap.names.join(", ") || "OAP détectée",
      source: "Base documentaire PLU/PLUi ou prescription GPU",
      confidence: confidence(context),
      blockingIfMissing: false,
    });
    addPiece(pieces, {
      code: "LOC-OAP-MASSE",
      label: "Plan masse contextualisé avec accès, stationnement et espaces verts",
      required: false,
      reason: "L'insertion du projet doit être appréciée au regard des orientations d'aménagement.",
      trigger: "OAP",
      source: "Documents OAP",
      confidence: confidence(context, -0.05),
      blockingIfMissing: false,
    });
  }

  if (context.constraints.floodRisk.isConcerned) {
    addPiece(pieces, {
      code: "LOC-PPRI-NGF",
      label: "Plan altimétrique / cotes NGF et cote plancher",
      required: false,
      reason: "Le terrain paraît concerné par un risque inondation ou PPRI.",
      trigger: context.constraints.floodRisk.ppriName || "PPRI / zone inondable",
      source: "GPU / SUP PM1 / PPRI",
      confidence: confidence(context, 0.05),
      blockingIfMissing: false,
    });
    addPiece(pieces, {
      code: "LOC-PPRI-NOTICE",
      label: "Notice de prise en compte du risque inondation",
      required: false,
      reason: "Le dossier doit permettre de vérifier la compatibilité avec le règlement du PPRI.",
      trigger: "PPRI / zone inondable",
      source: "PPRI / documents risques",
      confidence: confidence(context),
      blockingIfMissing: false,
    });
  }

  if (context.constraints.naturalRisk.isConcerned || context.constraints.clayShrinkSwell.isConcerned || context.constraints.seismicRisk.isConcerned) {
    addPiece(pieces, {
      code: "LOC-RISQUE-GEOTECH",
      label: "Étude ou attestation géotechnique si applicable",
      required: false,
      reason: "Un risque naturel, argile, sismique, mouvement de terrain ou cavité est détecté ou plausible.",
      trigger: [...context.constraints.naturalRisk.types, context.constraints.clayShrinkSwell.level, context.constraints.seismicRisk.level].filter(Boolean).join(", ") || "Risque naturel",
      source: "Données risques publiques / PLU",
      confidence: confidence(context, -0.18),
      blockingIfMissing: false,
    });
    addPiece(pieces, {
      code: "LOC-RISQUE-NOTICE",
      label: "Notice de prise en compte du risque et dispositions constructives",
      required: false,
      reason: "L'instructeur peut devoir vérifier les mesures adaptées au risque local.",
      trigger: "Risque local",
      source: "Données risques publiques / PLU",
      confidence: confidence(context, -0.18),
      blockingIfMissing: false,
    });
  }

  if (context.constraints.servitudes.isConcerned) {
    addPiece(pieces, {
      code: "LOC-SUP-COMPAT",
      label: "Justification de compatibilité avec la servitude d'utilité publique",
      required: false,
      reason: "Une ou plusieurs servitudes peuvent limiter l'implantation ou les travaux.",
      trigger: context.constraints.servitudes.items.join(", "),
      source: "GPU / SUP",
      confidence: confidence(context, 0.05),
      blockingIfMissing: false,
    });
  }

  if (context.constraints.lotissement.isConcerned) {
    addPiece(pieces, {
      code: "LOC-LOT-REGLEMENT",
      label: "Règlement de lotissement, cahier des charges ou accord des colotis si nécessaire",
      required: false,
      reason: "Le terrain semble concerné par un lotissement ; certaines règles privées peuvent rester opposables.",
      trigger: "Lotissement",
      source: context.constraints.lotissement.source || "Information déclarative ou documentaire",
      confidence: confidence(context, -0.15),
      blockingIfMissing: false,
    });
  }

  if (context.constraints.protectedArea.isConcerned || context.constraints.forestFireRisk.isConcerned) {
    addPiece(pieces, {
      code: "LOC-ENV-NOTICE",
      label: "Notice environnementale et analyse d'impact paysager",
      required: false,
      reason: "Une protection environnementale ou un risque naturel peut appeler une justification complémentaire.",
      trigger: context.constraints.protectedArea.types.join(", ") || "Zone protégée environnementale",
      source: "MNHN / IGN / documents PLU",
      confidence: confidence(context, -0.05),
      blockingIfMissing: false,
    });
  }

  if (!context.pluZone.code || context.missingData.length > 0) {
    vigilance.push(`Analyse réglementaire à confirmer : ${context.missingData.join(", ") || "zonage et servitudes"}.`);
  }
  if (pieces.length === 0 && context.confidenceScore < 0.55) {
    vigilance.push("Aucune contrainte locale fiable détectée à ce stade ; ne pas conclure à l'absence de contrainte sans vérification GPU/PLU.");
  }
  if (context.pluZone.code && context.pluZone.confidence < 0.5) {
    vigilance.push("Zone PLU détectée avec une confiance faible : vérifier le plan de zonage ou les documents graphiques.");
  }

  return { pieces, vigilance };
}
