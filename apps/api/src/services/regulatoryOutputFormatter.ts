import type { RegulatoryEngineOutput } from "./regulatoryInterpretationTypes.js";

export function formatMultiDocumentOtherPieces(engine: RegulatoryEngineOutput): Array<{
  title: string;
  role: string;
  qualification:
    | "règle opposable directe"
    | "règle opposable indirecte"
    | "orientation de projet"
    | "justification / doctrine locale"
    | "information de contexte"
    | "point à confirmer";
  note: string;
}> {
  return engine.document_set
    .filter((doc) => doc.set_role !== "primary")
    .slice(0, 12)
    .map((doc) => ({
      title: doc.source_name,
      role: doc.canonical_type.replace(/_/g, " "),
      qualification:
        doc.normative_weight === "opposable_direct"
          ? "règle opposable directe"
          : doc.normative_weight === "opposable_indirect"
            ? "règle opposable indirecte"
            : doc.normative_weight === "orientation"
              ? "orientation de projet"
              : doc.normative_weight === "justification"
                ? "justification / doctrine locale"
                : "information de contexte" as const,
      note: doc.reasoning_note,
    }));
}

export function formatMultiDocumentProfessionalInterpretation(engine: RegulatoryEngineOutput) {
  const highConfidenceTopics = engine.topic_analyses.filter((topic) => topic.confidence === "high");
  const cautionTopics = engine.topic_analyses.filter((topic) => topic.confidence !== "high");
  const firstWarnings = engine.warnings.slice(0, 3);

  return [
    `Le moteur multi-documents a identifié la zone ${engine.identified_zone}${engine.identified_subzone ? ` avec un sous-secteur probable ${engine.identified_subzone}` : ""} à partir d’un jeu documentaire hiérarchisé.`,
    highConfidenceTopics.length > 0
      ? `Les thèmes les plus stabilisés sont ${highConfidenceTopics.slice(0, 4).map((topic) => topic.topic.toLowerCase()).join(", ")}.`
      : "Aucun thème n’atteint encore un niveau de confiance élevé, la lecture doit rester prudente.",
    cautionTopics.length > 0
      ? `Les points les plus sensibles restent ${cautionTopics.slice(0, 4).map((topic) => topic.topic.toLowerCase()).join(", ")}.`
      : "",
    firstWarnings.length > 0
      ? `Alertes principales : ${firstWarnings.join(" ")}`
      : "",
  ].filter(Boolean).join(" ");
}

export function formatMultiDocumentOperationalConclusion(engine: RegulatoryEngineOutput): {
  zonePlutot: "très restrictive" | "restrictive" | "intermédiaire" | "souple" | "très souple";
  logiqueDominante: string;
  facteursLimitantsPrincipaux: string[];
  opportunitesPossibles: string[];
  pointsBloquantsPotentiels: string[];
  pointsAConfirmerSurPlanOuAnnexe: string[];
} {
  const restrictiveCount = engine.topic_analyses.filter((topic) =>
    topic.topic.toLowerCase().includes("hauteur")
    || topic.topic.toLowerCase().includes("implantation")
    || topic.topic.toLowerCase().includes("stationnement")
    || topic.topic.toLowerCase().includes("risque")
    || topic.risks_and_servitudes.length > 0,
  ).length;

  const zonePlutot: "très restrictive" | "restrictive" | "intermédiaire" | "souple" | "très souple" =
    restrictiveCount >= 5 ? "très restrictive"
      : restrictiveCount >= 4 ? "restrictive"
        : restrictiveCount >= 2 ? "intermédiaire"
          : restrictiveCount >= 1 ? "souple"
            : "très souple";

  const logiqueDominante = engine.document_set.some((doc) => doc.canonical_type === "spr_heritage")
    ? "patrimoniale"
    : engine.topic_analyses.some((topic) => topic.graphical_dependencies.length > 0)
      ? "secteur à projet"
      : engine.topic_analyses.some((topic) => topic.topic.toLowerCase().includes("stationnement") || topic.topic.toLowerCase().includes("accès"))
        ? "maîtrise par accès et stationnement"
        : "autre";

  return {
    zonePlutot,
    logiqueDominante,
    facteursLimitantsPrincipaux: engine.topic_analyses
      .filter((topic) => topic.confidence !== "low" || topic.warnings.length > 0)
      .slice(0, 5)
      .map((topic) => topic.topic),
    opportunitesPossibles: engine.topic_analyses
      .filter((topic) => topic.confidence === "high" && topic.value != null)
      .slice(0, 4)
      .map((topic) => `${topic.topic} : ${topic.rule_summary}`),
    pointsBloquantsPotentiels: engine.topic_analyses
      .filter((topic) => topic.warnings.length > 0 || topic.graphical_dependencies.length > 0)
      .slice(0, 5)
      .map((topic) => `${topic.topic} — ${topic.warnings[0] || topic.reasoning_summary}`),
    pointsAConfirmerSurPlanOuAnnexe: engine.topic_analyses
      .filter((topic) => topic.graphical_dependencies.length > 0 || topic.rule_type === "cross_document")
      .slice(0, 5)
      .map((topic) => `${topic.topic} — ${topic.graphical_dependencies[0] || "recroiser avec les pièces complémentaires"}`),
  };
}
