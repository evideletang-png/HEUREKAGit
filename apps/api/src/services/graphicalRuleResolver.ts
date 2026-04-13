import type { GraphicalDependencyOutput, IndexedTopicBundle, RegulatoryRuleType } from "./regulatoryInterpretationTypes.js";

const TOPIC_GRAPHICAL_PRIORITIES: Record<string, string[]> = {
  hauteur: ["height_map", "graphic_regulation", "zoning_map", "special_provisions_map"],
  recul_voie: ["special_provisions_map", "graphic_regulation", "zoning_map"],
  recul_limite: ["special_provisions_map", "graphic_regulation", "zoning_map"],
  emprise_sol: ["special_provisions_map", "graphic_regulation", "zoning_map"],
  stationnement: ["graphic_regulation", "zoning_map"],
  espaces_verts: ["special_provisions_map", "heritage_map", "graphic_regulation"],
  risques: ["risk_plan", "special_provisions_map", "zoning_map"],
};

function inferReason(topicCode: string, canonicalType: string) {
  if (topicCode === "hauteur" && canonicalType === "height_map") return "La hauteur semble reportée sur un plan de hauteurs ou un document graphique spécialisé.";
  if (["recul_voie", "recul_limite", "emprise_sol"].includes(topicCode) && canonicalType === "special_provisions_map") {
    return "Le thème paraît dépendre de prescriptions graphiques localisées ou de marges de recul reportées au plan.";
  }
  if (canonicalType === "zoning_map") return "Le plan de zonage est nécessaire pour vérifier si la règle s’applique uniformément ou via un sous-secteur.";
  if (canonicalType === "graphic_regulation") return "Le règlement renvoie à une prescription graphique opposable.";
  if (canonicalType === "heritage_map") return "La lecture du thème dépend d’un plan patrimonial ou d’une protection localisée.";
  return "Une pièce graphique complémentaire doit être recoupée avant de conclure définitivement.";
}

export function resolveGraphicalDependencies(args: {
  topicCode: string;
  bundle: IndexedTopicBundle;
}): GraphicalDependencyOutput {
  const priorities = TOPIC_GRAPHICAL_PRIORITIES[args.topicCode] || ["graphic_regulation", "zoning_map", "special_provisions_map"];
  const dependencies = args.bundle.sources
    .filter((source) =>
      source.source_type === "graphical_doc"
      || source.signals.some((signal) => signal.kind === "graphic_referral"),
    )
    .map((source) => ({
      document_id: source.document_id || source.source_id,
      document_name: source.document_title || source.anchor_label || "Document graphique",
      canonical_type: (source.anchor_type || "graphic_regulation") as any,
      reason: inferReason(args.topicCode, String(source.anchor_type || "")),
      confidence: source.signals.some((signal) => signal.kind === "graphic_referral") ? "high" : source.confidence,
    }))
    .sort((left, right) => {
      const leftPriority = priorities.indexOf(left.canonical_type);
      const rightPriority = priorities.indexOf(right.canonical_type);
      return (leftPriority === -1 ? 999 : leftPriority) - (rightPriority === -1 ? 999 : rightPriority);
    });

  const warnings: string[] = [];
  if (dependencies.length > 1) {
    warnings.push("Plusieurs pièces graphiques paraissent nécessaires : la règle ne doit pas être uniformisée sans lecture croisée.");
  }
  if (args.bundle.cross_document_signals.some((signal) => signal.kind === "graphic_referral") && dependencies.length === 0) {
    warnings.push("Le texte renvoie à un document graphique, mais aucune pièce graphique suffisamment fiable n’a été retrouvée dans le jeu documentaire.");
  }

  let ruleTypeOverride: RegulatoryRuleType | null = null;
  if (dependencies.length > 0 && args.bundle.direct_rules.length > 0) {
    ruleTypeOverride = "mixed";
  } else if (dependencies.length > 0) {
    ruleTypeOverride = "graphical";
  } else if (args.bundle.cross_document_signals.some((signal) => signal.kind === "graphic_referral")) {
    ruleTypeOverride = "cross_document";
  }

  return {
    topic: args.topicCode,
    dependencies,
    warnings,
    rule_type_override: ruleTypeOverride,
  };
}
