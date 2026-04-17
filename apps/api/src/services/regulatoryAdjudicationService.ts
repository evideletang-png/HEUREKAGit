import { openai } from "@workspace/integrations-openai-ai-server";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import type {
  RegulatoryAiAdjudication,
  RegulatoryArticleSummary,
  RegulatoryConfidence,
  RegulatoryEngineOutput,
  RegulatoryTopicAnalysis,
} from "./regulatoryInterpretationTypes.js";
import { buildRegulatorySinglePipeContext, loadRegulatorySinglePipePrompt } from "./regulatorySinglePipe.js";

const ConfidenceEnum = z.enum(["high", "medium", "low"]);
const RuleTypeEnum = z.enum(["textual", "textual_conditional", "graphical", "mixed", "cross_document", "undetermined"]);
const ArticleStatusEnum = z.enum([
  "applicable",
  "sans_objet",
  "non_reglemente",
  "renvoi_document_graphique",
  "renvoi_annexe",
  "cross_document_required",
]);
const ZonePlutotEnum = z.enum(["très restrictive", "restrictive", "intermédiaire", "souple", "très souple"]);
const SourceDecisionSchema = z.object({
  source_label: z.string(),
  source_type: z.enum(["published_rule", "segment", "zone_section", "document", "overlay", "risk", "graphical_doc"]),
  decision: z.enum([
    "retained_primary",
    "retained_secondary",
    "retained_graphical",
    "retained_risk",
    "discarded_context",
    "discarded_low_confidence",
  ]),
  reason: z.string(),
  confidence: ConfidenceEnum,
});

const CrossDocumentDependencySchema = z.object({
  topic_code: z.string().nullable(),
  source_document_id: z.string().nullable(),
  source_document_name: z.string(),
  target_document_id: z.string().nullable(),
  target_document_name: z.string(),
  dependency_type: z.enum([
    "graphic_referral",
    "annex_referral",
    "risk_referral",
    "overlay_referral",
    "document_referral",
    "subsector_referral",
    "topic_support",
  ]),
  normative_effect: z.enum(["primary", "additive", "restrictive", "substitutive", "procedural", "informative"]),
  reason: z.string(),
  confidence: ConfidenceEnum,
});

const NormativeEffectSchema = z.object({
  topic_code: z.string().nullable(),
  source_label: z.string(),
  effect: z.enum(["primary", "additive", "restrictive", "substitutive", "procedural", "informative"]),
  reason: z.string(),
  confidence: ConfidenceEnum,
});

const ArbitrationCandidateSchema = z.object({
  topic_code: z.string(),
  source_label: z.string(),
  source_type: z.enum(["published_rule", "segment", "zone_section", "document", "overlay", "risk", "graphical_doc"]),
  normative_effect: z.enum(["primary", "additive", "restrictive", "substitutive", "procedural", "informative"]),
  role: z.enum(["primary", "secondary", "graphical", "risk", "context"]),
  confidence: ConfidenceEnum,
  note: z.string(),
});

const ArbitrationDecisionSchema = z.object({
  topic_code: z.string(),
  summary: z.string(),
  primary_source: z.string().nullable(),
  retained_sources: z.array(z.string()),
  discarded_sources: z.array(z.string()),
  confidence: ConfidenceEnum,
});

const TopicAnalysisSchema = z.object({
  commune: z.string(),
  document_set: z.array(z.object({
    document_id: z.string(),
    source_name: z.string(),
    canonical_type: z.string(),
    normative_weight: z.string(),
    set_role: z.string(),
    confidence: ConfidenceEnum,
  })),
  analysis_scope: z.string(),
  identified_zone: z.string(),
  identified_subzone: z.string().nullable(),
  topic: z.string(),
  relevant_articles: z.array(z.string()),
  rule_type: RuleTypeEnum,
  primary_source: z.string(),
  secondary_sources: z.array(z.string()),
  rule_summary: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  conditions: z.array(z.string()),
  exceptions: z.array(z.string()),
  graphical_dependencies: z.array(z.string()),
  risks_and_servitudes: z.array(z.string()),
  cross_document_dependencies: z.array(CrossDocumentDependencySchema).optional(),
  normative_effects: z.array(NormativeEffectSchema).optional(),
  warnings: z.array(z.string()),
  confidence: ConfidenceEnum,
  reasoning_summary: z.string(),
  source_decisions: z.array(SourceDecisionSchema).optional(),
  arbitration_candidates: z.array(ArbitrationCandidateSchema).optional(),
  arbitration_decision: ArbitrationDecisionSchema.nullable().optional(),
});

const ArticleSummarySchema = z.object({
  article: z.string(),
  title: z.string(),
  status: ArticleStatusEnum,
  rule_type: RuleTypeEnum,
  summary: z.string(),
  key_values: z.array(z.string()),
  conditions: z.array(z.string()),
  exceptions: z.array(z.string()),
  secondary_sources: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: ConfidenceEnum,
});

const RegulatoryAiAdjudicationSchema = z.object({
  adjudication_version: z.literal("regulatory_ai_adjudication_v1"),
  orchestration_mode: z.literal("llm_adjudicated"),
  adjudication_confidence: ConfidenceEnum,
  topic_analyses: z.array(TopicAnalysisSchema),
  article_summaries: z.array(ArticleSummarySchema),
  warnings: z.array(z.string()),
  reasoning_summary: z.string(),
  professional_interpretation: z.string(),
  operational_conclusion: z.object({
    zonePlutot: ZonePlutotEnum,
    logiqueDominante: z.string(),
    facteursLimitantsPrincipaux: z.array(z.string()),
    opportunitesPossibles: z.array(z.string()),
    pointsBloquantsPotentiels: z.array(z.string()),
    pointsAConfirmerSurPlanOuAnnexe: z.array(z.string()),
  }),
});

function mergeWarnings(base: string[], adjudicated: string[]) {
  return Array.from(new Set([...base, ...adjudicated]));
}

function normalizeConfidence(value: RegulatoryConfidence | undefined, warnings: string[]) {
  if (value) return value;
  return warnings.length > 2 ? "low" : warnings.length > 0 ? "medium" : "high";
}

export async function adjudicateRegulatoryEngineOutput(args: {
  commune: string;
  zoneCode: string;
  zoneLabel?: string | null;
  referenceDocumentTitle?: string | null;
  engineOutput: RegulatoryEngineOutput;
  articleOrThemeBlocks: Array<{
    articleCode: string | null;
    themeCode: string;
    themeLabel: string;
    anchorType: string;
    anchorLabel: string | null;
    documentTitle: string | null;
    ruleResumee: string;
    detailUtile: string;
    exceptionsConditions: string | null;
    effetConcretConstructibilite: string;
    niveauVigilance: "faible" | "moyen" | "fort";
    qualification: string;
    sources: Array<{
      documentTitle: string | null;
      pageStart: number | null;
      pageEnd: number | null;
      anchorType: string | null;
      anchorLabel: string | null;
      sourceType: "published_rule" | "segment";
    }>;
  }>;
  crossEffects: string[];
  otherDocuments: Array<{
    title: string;
    role: string;
    qualification: string;
    note: string;
  }>;
}): Promise<RegulatoryAiAdjudication | null> {
  try {
    const systemPrompt = await loadRegulatorySinglePipePrompt();
    const payload = buildRegulatorySinglePipeContext("regulatory_adjudication", {
      commune: args.commune,
      zone: {
        code: args.zoneCode,
        label: args.zoneLabel || null,
        reference_document: args.referenceDocumentTitle || null,
      },
      deterministic_engine: args.engineOutput,
      thematic_blocks: args.articleOrThemeBlocks,
      cross_effects: args.crossEffects,
      other_documents: args.otherDocuments,
      expected_output: {
        format: "zod_response_format",
        primary_contract: "RegulatoryAiAdjudicationSchema",
        required_behavior: [
          "do_not_invent_articles",
          "do_not_promote_thematic_blocks_to_canonical_articles",
          "do_not_discard_cross_document_referrals",
        ],
      },
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: payload.length > 45000 ? `${payload.slice(0, 45000)}...` : payload },
      ],
      response_format: zodResponseFormat(RegulatoryAiAdjudicationSchema, "regulatory_ai_adjudication"),
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = RegulatoryAiAdjudicationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      logger.warn("[regulatoryAdjudicationService] Invalid adjudication payload", parsed.error.flatten());
      return null;
    }

    const value = parsed.data;
    return {
      ...value,
      warnings: mergeWarnings(args.engineOutput.warnings, value.warnings),
      adjudication_confidence: normalizeConfidence(value.adjudication_confidence, value.warnings),
      topic_analyses: value.topic_analyses as RegulatoryTopicAnalysis[],
      article_summaries: value.article_summaries as RegulatoryArticleSummary[],
    };
  } catch (error) {
    logger.error("[regulatoryAdjudicationService] adjudication failed", error);
    return null;
  }
}
