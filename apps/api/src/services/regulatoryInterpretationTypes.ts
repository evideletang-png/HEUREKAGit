export type RegulatoryRuleType =
  | "textual"
  | "textual_conditional"
  | "graphical"
  | "mixed"
  | "cross_document"
  | "undetermined";

export type RegulatoryConfidence = "high" | "medium" | "low";

export type RegulatorySourceDecision = {
  source_label: string;
  source_type:
    | "published_rule"
    | "segment"
    | "zone_section"
    | "document"
    | "overlay"
    | "risk"
    | "graphical_doc";
  decision:
    | "retained_primary"
    | "retained_secondary"
    | "retained_graphical"
    | "retained_risk"
    | "discarded_context"
    | "discarded_low_confidence";
  reason: string;
  confidence: RegulatoryConfidence;
};

export type AdjudicationSourceDecision = RegulatorySourceDecision;

export type RegulatoryDocumentCanonicalType =
  | "written_regulation"
  | "graphic_regulation"
  | "zoning_map"
  | "height_map"
  | "special_provisions_map"
  | "heritage_map"
  | "oap"
  | "annex_regulatory"
  | "annex_calculation"
  | "definitions_calculation"
  | "sup_servitude"
  | "ppri"
  | "pprt"
  | "risk_plan"
  | "spr_heritage"
  | "padd"
  | "report"
  | "informative"
  | "unknown";

export type RegulatoryDocumentContentMode = "text" | "graphical" | "mixed";

export type RegulatoryNormativeWeight =
  | "opposable_direct"
  | "opposable_indirect"
  | "orientation"
  | "justification"
  | "context";

export type RegulatorySetRole =
  | "primary"
  | "secondary"
  | "graphical_dependency"
  | "risk_overlay"
  | "context";

export type CrossDocumentSignal = {
  kind:
    | "graphic_referral"
    | "annex_referral"
    | "risk_referral"
    | "overlay_referral"
    | "document_referral"
    | "subsector_referral";
  label: string;
  excerpt: string | null;
  confidence: RegulatoryConfidence;
};

export type CrossDocumentDependency = {
  topic_code: string | null;
  source_document_id: string | null;
  source_document_name: string;
  target_document_id: string | null;
  target_document_name: string;
  dependency_type:
    | "graphic_referral"
    | "annex_referral"
    | "risk_referral"
    | "overlay_referral"
    | "document_referral"
    | "subsector_referral"
    | "topic_support";
  normative_effect:
    | "primary"
    | "additive"
    | "restrictive"
    | "substitutive"
    | "procedural"
    | "informative";
  reason: string;
  confidence: RegulatoryConfidence;
};

export type NormativeEffectDescriptor = {
  topic_code: string | null;
  source_label: string;
  effect:
    | "primary"
    | "additive"
    | "restrictive"
    | "substitutive"
    | "procedural"
    | "informative";
  reason: string;
  confidence: RegulatoryConfidence;
};

export type ClassifiedRegulatoryDocument = {
  document_id: string;
  profile_id: string | null;
  source_name: string;
  canonical_type: RegulatoryDocumentCanonicalType;
  legacy_canonical_type: string;
  category: string | null;
  sub_category: string | null;
  document_type: string | null;
  content_mode: RegulatoryDocumentContentMode;
  normative_weight: RegulatoryNormativeWeight;
  set_role: RegulatorySetRole;
  is_opposable: boolean;
  classifier_confidence: number;
  source_authority: number;
  extraction_mode: string | null;
  extraction_reliability: number | null;
  manual_review_required: boolean;
  zone_hints: string[];
  structured_topics: string[];
  detected_signals: CrossDocumentSignal[];
  cross_document_dependencies: CrossDocumentDependency[];
  graphical_dependencies: GraphicalDependency[];
  risk_constraints: RiskOverlayConstraint[];
  normative_effects: NormativeEffectDescriptor[];
  relevance_score: number;
  reasoning_note: string;
};

export type IndexedRegulatorySource = {
  source_type:
    | "published_rule"
    | "segment"
    | "zone_section"
    | "document"
    | "overlay"
    | "risk"
    | "graphical_doc";
  source_id: string;
  document_id: string | null;
  document_title: string | null;
  page_start: number | null;
  page_end: number | null;
  article_code: string | null;
  anchor_type: string | null;
  anchor_label: string | null;
  theme_code: string | null;
  summary: string;
  raw_text: string | null;
  qualification:
    | "règle opposable directe"
    | "règle opposable indirecte"
    | "orientation de projet"
    | "justification / doctrine locale"
    | "information de contexte"
    | "point à confirmer";
  confidence: RegulatoryConfidence;
  signals: CrossDocumentSignal[];
};

export type IndexedTopicBundle = {
  topic_code: string;
  topic_label: string;
  relevant_articles: string[];
  sources: IndexedRegulatorySource[];
  direct_rules: IndexedRegulatorySource[];
  indirect_sources: IndexedRegulatorySource[];
  graphical_sources: IndexedRegulatorySource[];
  risk_sources: IndexedRegulatorySource[];
  cross_document_signals: CrossDocumentSignal[];
  cross_document_dependencies: CrossDocumentDependency[];
  normative_effects: NormativeEffectDescriptor[];
  arbitration_candidates: ArbitrationCandidate[];
};

export type ZoneRegulatoryIndex = {
  commune: string;
  identified_zone: string;
  identified_subzone: string | null;
  document_set: ClassifiedRegulatoryDocument[];
  topic_index: IndexedTopicBundle[];
  article_index: Array<{
    article: string;
    title: string;
    topic_codes: string[];
    sources: IndexedRegulatorySource[];
  }>;
  warnings: string[];
};

export type GraphicalDependencyOutput = {
  topic: string;
  dependencies: Array<{
    document_id: string;
    document_name: string;
    canonical_type: RegulatoryDocumentCanonicalType;
    reason: string;
    confidence: RegulatoryConfidence;
  }>;
  warnings: string[];
  rule_type_override: RegulatoryRuleType | null;
};

export type RiskOverlayOutput = {
  topic: string;
  risks_and_servitudes: string[];
  warnings: string[];
  strongest_effect:
    | "primary"
    | "additive"
    | "restrictive"
    | "substitutive"
    | "procedural"
    | "informative";
};

export type GraphicalDependency = {
  document_id: string | null;
  document_name: string;
  canonical_type: RegulatoryDocumentCanonicalType | null;
  reason: string;
  confidence: RegulatoryConfidence;
};

export type RiskOverlayConstraint = {
  label: string;
  effect:
    | "primary"
    | "additive"
    | "restrictive"
    | "substitutive"
    | "procedural"
    | "informative";
  confidence: RegulatoryConfidence;
  note: string;
};

export type ArbitrationCandidate = {
  topic_code: string;
  source_label: string;
  source_type:
    | "published_rule"
    | "segment"
    | "zone_section"
    | "document"
    | "overlay"
    | "risk"
    | "graphical_doc";
  normative_effect:
    | "primary"
    | "additive"
    | "restrictive"
    | "substitutive"
    | "procedural"
    | "informative";
  role: "primary" | "secondary" | "graphical" | "risk" | "context";
  confidence: RegulatoryConfidence;
  note: string;
};

export type ArbitrationDecision = {
  topic_code: string;
  summary: string;
  primary_source: string | null;
  retained_sources: string[];
  discarded_sources: string[];
  confidence: RegulatoryConfidence;
};

export type ZoneAndSubsectorResolution = {
  requested_zone: string;
  identified_zone: string;
  identified_subzone: string | null;
  confidence: RegulatoryConfidence;
  warnings: string[];
  supporting_sources: Array<{
    label: string;
    reason: string;
    confidence: RegulatoryConfidence;
  }>;
};

export type RegulatorySuggestion = {
  suggestion_id: string;
  commune: string;
  identified_zone: string;
  identified_subzone: string | null;
  topic_code: string;
  topic_label: string;
  relevant_articles: string[];
  rule_type: RegulatoryRuleType;
  status: "suggested" | "needs_review" | "graphical_review_required";
  primary_source: string;
  secondary_sources: string[];
  source_pages: Array<{
    document_id: string | null;
    document_title: string | null;
    page_start: number | null;
    page_end: number | null;
    anchor_type: string | null;
    anchor_label: string | null;
    source_type:
      | "published_rule"
      | "segment"
      | "zone_section"
      | "document"
      | "overlay"
      | "risk"
      | "graphical_doc";
  }>;
  suggestion_summary: string;
  value: number | null;
  unit: string;
  conditions: string[];
  exceptions: string[];
  graphical_dependencies: GraphicalDependency[];
  risks_and_servitudes: RiskOverlayConstraint[];
  cross_document_dependencies: CrossDocumentDependency[];
  normative_effects: NormativeEffectDescriptor[];
  warnings: string[];
  confidence: RegulatoryConfidence;
  reasoning_summary: string;
  source_decisions: RegulatorySourceDecision[];
};

export type RegulatoryTopicAnalysis = {
  commune: string;
  document_set: Array<{
    document_id: string;
    source_name: string;
    canonical_type: RegulatoryDocumentCanonicalType;
    normative_weight: RegulatoryNormativeWeight;
    set_role: RegulatorySetRole;
    confidence: RegulatoryConfidence;
  }>;
  analysis_scope: string;
  identified_zone: string;
  identified_subzone: string | null;
  topic: string;
  relevant_articles: string[];
  rule_type: RegulatoryRuleType;
  primary_source: string;
  secondary_sources: string[];
  rule_summary: string;
  value: number | null;
  unit: string;
  conditions: string[];
  exceptions: string[];
  graphical_dependencies: string[];
  risks_and_servitudes: string[];
  cross_document_dependencies: CrossDocumentDependency[];
  normative_effects: NormativeEffectDescriptor[];
  warnings: string[];
  confidence: RegulatoryConfidence;
  reasoning_summary: string;
  source_decisions?: RegulatorySourceDecision[];
  arbitration_candidates?: ArbitrationCandidate[];
  arbitration_decision?: ArbitrationDecision | null;
};

export type RegulatoryArticleSummary = {
  article: string;
  title: string;
  status:
    | "applicable"
    | "sans_objet"
    | "non_reglemente"
    | "renvoi_document_graphique"
    | "renvoi_annexe"
    | "cross_document_required";
  rule_type: RegulatoryRuleType;
  summary: string;
  key_values: string[];
  conditions: string[];
  exceptions: string[];
  secondary_sources: string[];
  warnings: string[];
  confidence: RegulatoryConfidence;
};

export type RegulatoryEngineOutput = {
  engine_version: "regulatory_multi_document_engine_v1" | "regulatory_multi_document_engine_v2";
  document_set: ClassifiedRegulatoryDocument[];
  analysis_scope: string;
  identified_zone: string;
  identified_subzone: string | null;
  zone_resolution: ZoneAndSubsectorResolution;
  topic_analyses: RegulatoryTopicAnalysis[];
  article_summaries: RegulatoryArticleSummary[];
  suggestions: RegulatorySuggestion[];
  warnings: string[];
  reasoning_summary: string;
};

export type RegulatoryAiAdjudication = {
  adjudication_version: "regulatory_ai_adjudication_v1";
  orchestration_mode: "llm_adjudicated";
  adjudication_confidence: RegulatoryConfidence;
  topic_analyses: RegulatoryTopicAnalysis[];
  article_summaries: RegulatoryArticleSummary[];
  warnings: string[];
  reasoning_summary: string;
  professional_interpretation: string;
  operational_conclusion: {
    zonePlutot: "très restrictive" | "restrictive" | "intermédiaire" | "souple" | "très souple";
    logiqueDominante: string;
    facteursLimitantsPrincipaux: string[];
    opportunitesPossibles: string[];
    pointsBloquantsPotentiels: string[];
    pointsAConfirmerSurPlanOuAnnexe: string[];
  };
};
