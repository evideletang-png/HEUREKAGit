import { REGULATORY_ARTICLE_REFERENCE, REGULATORY_THEME_SEED } from "./regulatoryCalibrationService.js";
import { resolveGraphicalDependencies } from "./graphicalRuleResolver.js";
import { resolveRiskAndOverlayEffects } from "./riskAndOverlayResolver.js";
import type {
  ClassifiedRegulatoryDocument,
  GraphicalDependency,
  IndexedRegulatorySource,
  RegulatorySuggestion,
  RegulatoryArticleSummary,
  RegulatoryConfidence,
  RegulatoryEngineOutput,
  RiskOverlayConstraint,
  RegulatoryRuleType,
  RegulatorySourceDecision,
  RegulatoryTopicAnalysis,
  ZoneAndSubsectorResolution,
  ZoneRegulatoryIndex,
} from "./regulatoryInterpretationTypes.js";
import type { StructuredUrbanRuleSource } from "./urbanRuleExtractionService.js";

type OverlayLike = {
  id: string;
  overlayCode: string;
  overlayLabel: string | null;
  overlayType: string | null;
  status: string | null;
};

const PRIORITY_TOPICS = [
  "hauteur",
  "emprise_sol",
  "recul_voie",
  "recul_limite",
  "stationnement",
  "espaces_verts",
  "interdictions",
  "conditions_particulieres",
  "risques",
] as const;

const THEME_DESCRIPTION_BY_CODE: Map<string, { label: string; description: string }> = new Map(
  REGULATORY_THEME_SEED.map(([code, label, description]) => [code, { label, description }]),
);

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function buildSourceLabel(source: IndexedRegulatorySource) {
  const parts = [
    source.document_title,
    source.article_code ? `Article ${source.article_code}` : null,
    source.page_start != null
      ? source.page_end != null && source.page_end !== source.page_start
        ? `p. ${source.page_start}-${source.page_end}`
        : `p. ${source.page_start}`
      : null,
    source.anchor_label,
  ].filter(Boolean);
  return parts.join(" · ") || source.summary.slice(0, 120) || "Source non nommée";
}

function buildSourceReference(source: IndexedRegulatorySource): RegulatorySuggestion["source_pages"][number] {
  return {
    document_id: source.document_id,
    document_title: source.document_title,
    page_start: source.page_start,
    page_end: source.page_end,
    anchor_type: source.anchor_type,
    anchor_label: source.anchor_label,
    source_type: source.source_type,
  };
}

function sourcePriorityScore(source: IndexedRegulatorySource) {
  let score = 0;
  if (source.source_type === "published_rule") score += 100;
  if (source.source_type === "segment") score += 60;
  if (source.source_type === "zone_section") score += 50;
  if (source.source_type === "graphical_doc") score += 40;
  if (source.source_type === "risk" || source.source_type === "overlay") score += 35;
  if (source.qualification === "règle opposable directe") score += 20;
  if (source.qualification === "règle opposable indirecte") score += 12;
  if (source.confidence === "high") score += 12;
  if (source.confidence === "medium") score += 6;
  if (source.page_start != null) score += 2;
  if (source.signals.some((signal) => signal.kind === "graphic_referral")) score += 3;
  if (source.signals.some((signal) => signal.kind === "risk_referral" || signal.kind === "overlay_referral")) score += 2;
  return score;
}

function truncate(text: string | null | undefined, max = 320) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function extractCandidateValue(source: IndexedRegulatorySource) {
  const haystack = `${source.summary || ""} ${source.raw_text || ""}`;
  const numericMatch = haystack.match(/(\d+(?:[.,]\d+)?)\s*(m²|m2|m|%|place|places|niveau|niveaux)?/i);
  if (!numericMatch) return { value: null as number | null, unit: "" };
  return {
    value: Number.parseFloat(String(numericMatch[1]).replace(",", ".")),
    unit: numericMatch[2] ? String(numericMatch[2]).replace("m2", "m²") : "",
  };
}

function inferRuleType(args: {
  hasDirectRule: boolean;
  hasGraphicalDependency: boolean;
  hasCrossDocumentSignal: boolean;
  hasConditions: boolean;
}): RegulatoryRuleType {
  if (args.hasGraphicalDependency && args.hasDirectRule) return "mixed";
  if (args.hasGraphicalDependency) return "graphical";
  if (args.hasCrossDocumentSignal && args.hasDirectRule) return "cross_document";
  if (args.hasConditions && args.hasDirectRule) return "textual_conditional";
  if (args.hasDirectRule) return "textual";
  if (args.hasCrossDocumentSignal) return "cross_document";
  return "undetermined";
}

function inferConfidence(args: {
  primarySources: IndexedRegulatorySource[];
  hasGraphicalDependency: boolean;
  warnings: string[];
}): RegulatoryConfidence {
  const directCount = args.primarySources.filter((source) => source.source_type === "published_rule").length;
  const articleSegmentCount = args.primarySources.filter((source) => source.source_type === "segment" || source.source_type === "zone_section").length;
  if (directCount > 0 && !args.hasGraphicalDependency && args.warnings.length === 0) return "high";
  if (directCount > 0 || articleSegmentCount > 0) return args.warnings.length > 2 ? "low" : "medium";
  return "low";
}

function buildReasoningSummary(args: {
  topicLabel: string;
  sources: IndexedRegulatorySource[];
  graphicalDependencies: string[];
  risksAndServitudes: string[];
}) {
  const sourceTypes = unique(args.sources.map((source) => source.source_type));
  const parts = [
    `${args.topicLabel}: lecture reconstruite à partir de ${sourceTypes.join(", ") || "sources limitées"}.`,
  ];
  if (args.graphicalDependencies.length > 0) {
    parts.push("Une lecture graphique complémentaire a été détectée.");
  }
  if (args.risksAndServitudes.length > 0) {
    parts.push("Des risques ou servitudes superposés doivent être recoupés.");
  }
  return parts.join(" ");
}

function deriveSuggestionStatus(args: {
  ruleType: RegulatoryRuleType;
  confidence: RegulatoryConfidence;
  warnings: string[];
  graphicalDependencies: GraphicalDependency[];
}) {
  if (args.ruleType === "graphical" || (args.graphicalDependencies.length > 0 && args.ruleType !== "textual")) {
    return "graphical_review_required" as const;
  }
  if (args.confidence === "low" || args.warnings.length > 0) {
    return "needs_review" as const;
  }
  return "suggested" as const;
}

function buildSourceDecisions(args: {
  directRules: IndexedRegulatorySource[];
  graphicalSources: IndexedRegulatorySource[];
  indirectSources: IndexedRegulatorySource[];
  riskSources: IndexedRegulatorySource[];
  hasGraphicReferral: boolean;
}): RegulatorySourceDecision[] {
  const decisions: RegulatorySourceDecision[] = [];
  const seen = new Set<string>();

  const pushDecision = (
    source: IndexedRegulatorySource,
    decision: RegulatorySourceDecision["decision"],
    reason: string,
  ) => {
    const key = `${decision}:${source.source_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    decisions.push({
      source_label: buildSourceLabel(source),
      source_type: source.source_type,
      decision,
      reason,
      confidence: source.confidence,
    });
  };

  const rankedDirect = [...args.directRules].sort((left, right) => sourcePriorityScore(right) - sourcePriorityScore(left));
  const rankedIndirect = [...args.indirectSources].sort((left, right) => sourcePriorityScore(right) - sourcePriorityScore(left));
  const rankedGraphical = [...args.graphicalSources].sort((left, right) => sourcePriorityScore(right) - sourcePriorityScore(left));
  const rankedRisk = [...args.riskSources].sort((left, right) => sourcePriorityScore(right) - sourcePriorityScore(left));

  const primary = rankedDirect[0] || rankedIndirect[0] || rankedGraphical[0] || rankedRisk[0] || null;
  if (primary) {
    pushDecision(primary, "retained_primary", primary.source_type === "published_rule"
      ? "Règle publiée calibrée retenue comme source principale pour ce thème."
      : "Source textuelle la plus robuste retenue comme base de lecture pour ce thème.");
  }

  for (const source of rankedDirect.slice(primary?.source_id === rankedDirect[0]?.source_id ? 1 : 0, 3)) {
    pushDecision(source, "retained_secondary", "Source textuelle conservée pour confirmer, nuancer ou compléter la source principale.");
  }

  for (const source of rankedIndirect.slice(0, 2)) {
    pushDecision(source, "retained_secondary", "Source complémentaire conservée pour documenter les conditions, renvois ou précisions de lecture.");
  }

  if (args.hasGraphicReferral || rankedGraphical.length > 0) {
    for (const source of rankedGraphical.slice(0, 2)) {
      pushDecision(source, "retained_graphical", "Pièce graphique retenue car le thème dépend d’un renvoi au plan, à une légende ou à une prescription graphique.");
    }
  }

  for (const source of rankedRisk.slice(0, 2)) {
    pushDecision(source, "retained_risk", "Source de risque ou de servitude conservée comme contrainte superposée potentiellement plus contraignante.");
  }

  const rankedDiscarded = [...rankedIndirect.slice(2), ...rankedGraphical.slice(2), ...rankedRisk.slice(2)]
    .sort((left, right) => sourcePriorityScore(right) - sourcePriorityScore(left))
    .slice(0, 3);

  for (const source of rankedDiscarded) {
    pushDecision(
      source,
      source.confidence === "low" ? "discarded_low_confidence" : "discarded_context",
      source.confidence === "low"
        ? "Source repérée mais écartée du cœur du raisonnement car trop faible ou trop ambiguë à ce stade."
        : "Source conservée en contexte mais non retenue comme pièce structurante pour la règle principale.",
    );
  }

  return decisions;
}

function articleStatusFromTopicAnalysis(analysis: RegulatoryTopicAnalysis): RegulatoryArticleSummary["status"] {
  if (analysis.rule_type === "graphical") return "renvoi_document_graphique";
  if (analysis.rule_type === "cross_document") return "cross_document_required";
  if (analysis.secondary_sources.some((source) => /annexe/i.test(source))) return "renvoi_annexe";
  if (!analysis.rule_summary || analysis.confidence === "low") return "non_reglemente";
  return "applicable";
}

function createArticleSummary(args: {
  articleCode: string;
  title: string;
  topicAnalyses: RegulatoryTopicAnalysis[];
}): RegulatoryArticleSummary {
  if (args.articleCode === "5" || args.articleCode === "14") {
    return {
      article: args.articleCode,
      title: args.title,
      status: "sans_objet",
      rule_type: "undetermined",
      summary: "Article réputé sans objet ou non mobilisé dans la structure réglementaire standard.",
      key_values: [],
      conditions: [],
      exceptions: [],
      secondary_sources: [],
      warnings: [],
      confidence: "medium",
    };
  }

  if (args.topicAnalyses.length === 0) {
    return {
      article: args.articleCode,
      title: args.title,
      status: "non_reglemente",
      rule_type: "undetermined",
      summary: "Aucune matière réglementaire suffisamment robuste n’a été reliée à cet article ou thème canonique.",
      key_values: [],
      conditions: [],
      exceptions: [],
      secondary_sources: [],
      warnings: ["Article à confirmer par lecture directe du règlement ou des documents complémentaires."],
      confidence: "low",
    };
  }

  const status = articleStatusFromTopicAnalysis(args.topicAnalyses[0]);
  return {
    article: args.articleCode,
    title: args.title,
    status,
    rule_type: args.topicAnalyses[0].rule_type,
    summary: args.topicAnalyses.map((analysis) => `${analysis.topic}: ${analysis.rule_summary}`).join(" "),
    key_values: unique(
      args.topicAnalyses
        .map((analysis) => analysis.value != null ? `${analysis.value}${analysis.unit ? ` ${analysis.unit}` : ""}` : "")
        .filter(Boolean),
    ),
    conditions: unique(args.topicAnalyses.flatMap((analysis) => analysis.conditions)),
    exceptions: unique(args.topicAnalyses.flatMap((analysis) => analysis.exceptions)),
    secondary_sources: unique(args.topicAnalyses.flatMap((analysis) => analysis.secondary_sources)),
    warnings: unique(args.topicAnalyses.flatMap((analysis) => analysis.warnings)),
    confidence: args.topicAnalyses.some((analysis) => analysis.confidence === "high")
      ? "high"
      : args.topicAnalyses.some((analysis) => analysis.confidence === "medium")
        ? "medium"
        : "low",
  };
}

function summarizeDocuments(documentSet: ClassifiedRegulatoryDocument[]) {
  return documentSet.map((doc) => ({
    document_id: doc.document_id,
    source_name: doc.source_name,
    canonical_type: doc.canonical_type,
    normative_weight: doc.normative_weight,
    set_role: doc.set_role,
    confidence: doc.classifier_confidence >= 0.8 ? "high" : doc.classifier_confidence >= 0.45 ? "medium" : "low" as RegulatoryConfidence,
  }));
}

export function buildCrossDocumentReasoning(args: {
  index: ZoneRegulatoryIndex;
  overlays: OverlayLike[];
  rules: StructuredUrbanRuleSource[];
  documents: ClassifiedRegulatoryDocument[];
  zoneResolution?: ZoneAndSubsectorResolution;
}): RegulatoryEngineOutput {
  const zoneResolution = args.zoneResolution || {
    requested_zone: args.index.identified_zone,
    identified_zone: args.index.identified_zone,
    identified_subzone: args.index.identified_subzone,
    confidence: "medium" as const,
    warnings: [],
    supporting_sources: [],
  };
  const topicBundles = args.index.topic_index.filter((bundle) =>
    PRIORITY_TOPICS.includes(bundle.topic_code as any)
    || bundle.direct_rules.length > 0
    || bundle.cross_document_signals.length > 0
    || bundle.graphical_sources.length > 0
    || bundle.risk_sources.length > 0,
  );

  const topic_analyses: RegulatoryTopicAnalysis[] = topicBundles.map((bundle) => {
    const topicMeta = THEME_DESCRIPTION_BY_CODE.get(bundle.topic_code) || { label: bundle.topic_label, description: bundle.topic_label };
    const graphical = resolveGraphicalDependencies({
      topicCode: bundle.topic_code,
      bundle,
    });
    const topicRules = args.rules.filter((rule) => {
      const themeCode = "themeCode" in rule ? String(rule.themeCode || "") : "";
      const ruleTopic = "ruleTopic" in rule ? String(rule.ruleTopic || "") : "";
      return themeCode === bundle.topic_code || ruleTopic === bundle.topic_code;
    });
    const risks = resolveRiskAndOverlayEffects({
      topicCode: bundle.topic_code,
      bundle,
      overlays: args.overlays,
      documents: args.documents,
      rules: topicRules,
    });

    const orderedSources = [
      ...bundle.direct_rules,
      ...bundle.graphical_sources,
      ...bundle.indirect_sources,
      ...bundle.risk_sources,
    ].sort((left, right) => sourcePriorityScore(right) - sourcePriorityScore(left));
    const primarySource = orderedSources[0] || null;
    const conditions = unique(
      topicRules
        .map((rule) => ("ruleCondition" in rule ? String(rule.ruleCondition || "") : ("conditionText" in rule ? String((rule as any).conditionText || "") : "")))
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const exceptions = unique(
      topicRules
        .map((rule) => ("ruleException" in rule ? String(rule.ruleException || "") : ""))
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const hasDirectRule = bundle.direct_rules.length > 0;
    const hasCrossDocumentSignal = bundle.cross_document_signals.length > 0 || graphical.dependencies.length > 0 || risks.risks_and_servitudes.length > 0;
    const rule_type = graphical.rule_type_override
      || inferRuleType({
        hasDirectRule,
        hasGraphicalDependency: graphical.dependencies.length > 0,
        hasCrossDocumentSignal,
        hasConditions: conditions.length > 0,
      });
    const warnings = unique([
      ...bundle.cross_document_signals
        .filter((signal) => signal.kind !== "graphic_referral")
        .map((signal) => `${signal.label}${signal.excerpt ? ` : ${truncate(signal.excerpt, 140)}` : ""}`),
      ...graphical.warnings,
      ...risks.warnings,
    ]);

    const values = bundle.direct_rules.map((source) => extractCandidateValue(source)).filter((candidate) => candidate.value != null);
    const uniqueValues = unique(values.map((candidate) => `${candidate.value}|${candidate.unit}`));
    if (uniqueValues.length > 1) {
      warnings.push("Plusieurs valeurs apparaissent pour ce thème : la zone peut être hétérogène ou dépendre d’un sous-secteur / document complémentaire.");
    }
    const selectedValue = uniqueValues.length === 1 ? values[0] : { value: null, unit: "" };
    if (graphical.dependencies.length > 0 && !hasDirectRule) {
      warnings.push("La règle paraît principalement graphique : une lecture du plan est requise avant conclusion ferme.");
    }

    const confidence = inferConfidence({
      primarySources: orderedSources,
      hasGraphicalDependency: graphical.dependencies.length > 0 && !hasDirectRule,
      warnings,
    });
    const secondarySources = orderedSources.slice(1, 6).map(buildSourceLabel);
    const sourceDecisions = buildSourceDecisions({
      directRules: bundle.direct_rules,
      graphicalSources: bundle.graphical_sources,
      indirectSources: bundle.indirect_sources,
      riskSources: bundle.risk_sources,
      hasGraphicReferral: bundle.cross_document_signals.some((signal) => signal.kind === "graphic_referral"),
    });
    const ruleSummary = primarySource
      ? truncate(primarySource.summary, 420)
      : `Aucune règle ferme n’a été stabilisée pour ${topicMeta.description.toLowerCase()}.`;

    return {
      commune: args.index.commune,
      document_set: summarizeDocuments(args.index.document_set),
      analysis_scope: `zone:${zoneResolution.identified_zone}`,
      identified_zone: zoneResolution.identified_zone,
      identified_subzone: zoneResolution.identified_subzone,
      topic: topicMeta.description,
      relevant_articles: bundle.relevant_articles,
      rule_type,
      primary_source: primarySource ? buildSourceLabel(primarySource) : "Aucune source primaire consolidée",
      secondary_sources: secondarySources,
      rule_summary: ruleSummary,
      value: selectedValue.value,
      unit: selectedValue.unit,
      conditions,
      exceptions,
      graphical_dependencies: graphical.dependencies.map((dependency) => `${dependency.document_name} — ${dependency.reason}`),
      risks_and_servitudes: risks.risks_and_servitudes,
      warnings: unique(warnings),
      confidence,
      reasoning_summary: buildReasoningSummary({
        topicLabel: bundle.topic_label,
        sources: orderedSources,
        graphicalDependencies: graphical.dependencies.map((dependency) => dependency.document_name),
        risksAndServitudes: risks.risks_and_servitudes,
      }),
      source_decisions: sourceDecisions,
    };
  });

  const topicAnalysesByArticle = new Map<string, RegulatoryTopicAnalysis[]>();
  for (const analysis of topic_analyses) {
    const targetArticles = analysis.relevant_articles.length > 0 ? analysis.relevant_articles : ["0"];
    for (const article of targetArticles) {
      topicAnalysesByArticle.set(article, [...(topicAnalysesByArticle.get(article) || []), analysis]);
    }
  }

  const article_summaries: RegulatoryArticleSummary[] = REGULATORY_ARTICLE_REFERENCE.map((article) =>
    createArticleSummary({
      articleCode: article.code,
      title: article.label,
      topicAnalyses: topicAnalysesByArticle.get(article.code) || [],
    }),
  );

  const warnings = unique([
    ...zoneResolution.warnings,
    ...args.index.warnings,
    ...topic_analyses.flatMap((analysis) => analysis.warnings),
  ]);

  const suggestions: RegulatorySuggestion[] = topicBundles.map((bundle, index) => {
    const analysis = topic_analyses[index];
    const graphical = resolveGraphicalDependencies({
      topicCode: bundle.topic_code,
      bundle,
    });
    const risks = resolveRiskAndOverlayEffects({
      topicCode: bundle.topic_code,
      bundle,
      overlays: args.overlays,
      documents: args.documents,
      rules: args.rules.filter((rule) => {
        const themeCode = "themeCode" in rule ? String(rule.themeCode || "") : "";
        const ruleTopic = "ruleTopic" in rule ? String(rule.ruleTopic || "") : "";
        return themeCode === bundle.topic_code || ruleTopic === bundle.topic_code;
      }),
    });
    const orderedSources = [
      ...bundle.direct_rules,
      ...bundle.graphical_sources,
      ...bundle.indirect_sources,
      ...bundle.risk_sources,
    ].sort((left, right) => sourcePriorityScore(right) - sourcePriorityScore(left));
    const sourcePages = unique(
      orderedSources
        .slice(0, 5)
        .map((source) => JSON.stringify(buildSourceReference(source))),
    ).map((entry) => JSON.parse(entry));
    const graphicalDependencies: GraphicalDependency[] = graphical.dependencies.map((dependency) => ({
      document_id: dependency.document_id,
      document_name: dependency.document_name,
      canonical_type: dependency.canonical_type,
      reason: dependency.reason,
      confidence: dependency.confidence,
    }));
    const risksAndServitudes: RiskOverlayConstraint[] = risks.risks_and_servitudes.map((label) => ({
      label,
      effect: risks.strongest_effect,
      confidence: analysis.confidence === "high" ? "medium" : analysis.confidence,
      note: "Contrainte superposee a recouper avec la regle principale avant conclusion ferme.",
    }));

    return {
      suggestion_id: `${zoneResolution.identified_zone}:${bundle.topic_code}:${bundle.relevant_articles[0] || "na"}:${index}`,
      commune: args.index.commune,
      identified_zone: zoneResolution.identified_zone,
      identified_subzone: zoneResolution.identified_subzone,
      topic_code: bundle.topic_code,
      topic_label: bundle.topic_label,
      relevant_articles: analysis.relevant_articles,
      rule_type: analysis.rule_type,
      status: deriveSuggestionStatus({
        ruleType: analysis.rule_type,
        confidence: analysis.confidence,
        warnings: analysis.warnings,
        graphicalDependencies,
      }),
      primary_source: analysis.primary_source,
      secondary_sources: analysis.secondary_sources,
      source_pages: sourcePages,
      suggestion_summary: analysis.rule_summary,
      value: analysis.value,
      unit: analysis.unit,
      conditions: analysis.conditions,
      exceptions: analysis.exceptions,
      graphical_dependencies: graphicalDependencies,
      risks_and_servitudes: risksAndServitudes,
      warnings: analysis.warnings,
      confidence: analysis.confidence,
      reasoning_summary: analysis.reasoning_summary,
      source_decisions: analysis.source_decisions || [],
    };
  });

  return {
    engine_version: "regulatory_multi_document_engine_v2",
    document_set: args.index.document_set,
    analysis_scope: `zone:${zoneResolution.identified_zone}`,
    identified_zone: zoneResolution.identified_zone,
    identified_subzone: zoneResolution.identified_subzone,
    zone_resolution: zoneResolution,
    topic_analyses,
    article_summaries,
    suggestions,
    warnings,
    reasoning_summary: topic_analyses.length > 0
      ? `Lecture multi-documents construite à partir de ${args.index.document_set.length} document(s), ${topic_analyses.length} theme(s) et ${article_summaries.filter((article) => article.status === "applicable").length} article(s) canoniques exploitables.`
      : "Aucune lecture multi-documents suffisamment robuste n’a pu être stabilisée à ce stade.",
  };
}
