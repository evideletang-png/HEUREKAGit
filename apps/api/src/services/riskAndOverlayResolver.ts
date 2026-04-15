import type { ClassifiedRegulatoryDocument, IndexedTopicBundle, RiskOverlayOutput } from "./regulatoryInterpretationTypes.js";
import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";

type OverlayLike = {
  id: string;
  overlayCode: string;
  overlayLabel: string | null;
  overlayType: string | null;
  status: string | null;
};

function strongestEffectFromRules(rules: StructuredUrbanRuleSource[]) {
  const effectPriority = new Map<string, number>([
    ["substitutive", 5],
    ["restrictive", 4],
    ["additive", 3],
    ["procedural", 2],
    ["primary", 1],
    ["informative", 0],
  ]);

  return rules.reduce<RiskOverlayOutput["strongest_effect"]>((best, rule) => {
    const rawEffect = "normativeEffect" in rule
      ? String(rule.normativeEffect || "primary")
      : "primary";
    const effect = rawEffect === "substitutes"
      ? "substitutive"
      : rawEffect === "restricts"
        ? "restrictive"
        : rawEffect === "complements"
          ? "additive"
          : rawEffect === "procedural_dependency"
            ? "procedural"
            : rawEffect;
    return (effectPriority.get(effect) || 0) > (effectPriority.get(best) || 0)
      ? effect as RiskOverlayOutput["strongest_effect"]
      : best;
  }, "informative");
}

export function resolveRiskAndOverlayEffects(args: {
  topicCode: string;
  bundle: IndexedTopicBundle;
  overlays: OverlayLike[];
  documents: ClassifiedRegulatoryDocument[];
  rules: StructuredUrbanRuleSource[];
}): RiskOverlayOutput {
  const risks_and_servitudes = new Set<string>();
  const warnings: string[] = [];

  for (const overlay of args.overlays) {
    const label = `${overlay.overlayCode}${overlay.overlayType ? ` (${overlay.overlayType})` : ""}${overlay.overlayLabel ? ` — ${overlay.overlayLabel}` : ""}`;
    if (["PPRI", "PPRT", "servitude", "SPR", "PSMV", "PVAP", "ABF"].includes(String(overlay.overlayType || ""))) {
      risks_and_servitudes.add(label);
    }
  }

  for (const doc of args.documents) {
    if (["ppri", "pprt", "risk_plan", "sup_servitude", "spr_heritage"].includes(doc.canonical_type)) {
      risks_and_servitudes.add(`${doc.source_name} · ${doc.canonical_type.replace(/_/g, " ")}`);
    }
  }

  for (const source of args.bundle.risk_sources) {
    const label = [source.document_title, source.anchor_label, source.summary]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 220);
    if (label) risks_and_servitudes.add(label);
  }

  if (args.topicCode === "hauteur" && Array.from(risks_and_servitudes).some((item) => /ppri|inond/i.test(item))) {
    warnings.push("Un document de risques ou de crue peut modifier les hauteurs, les surélévations ou les cotes de référence applicables.");
  }
  if (args.topicCode !== "risques" && risks_and_servitudes.size > 0) {
    warnings.push("Des servitudes ou risques superposés existent : les dispositions les plus contraignantes doivent être recoupées avant conclusion.");
  }

  return {
    topic: args.topicCode,
    risks_and_servitudes: Array.from(risks_and_servitudes),
    warnings,
    strongest_effect: strongestEffectFromRules(args.rules),
  };
}
