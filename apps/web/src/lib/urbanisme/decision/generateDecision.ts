import type { ProjectContext } from "../cerfa/officialPieces.types";
import type { CompletenessResult } from "../compliance/checkCompleteness";
import type { Consultation } from "../consultations/resolveConsultations";
import type { ProjectPluRuleCheck } from "../plu/analyzeProject";

export type UrbanismDecision = "approved" | "refused" | "conditional";
export type MotivationResult = "compliant" | "non-compliant";

export interface DecisionMotivation {
  rule: string;
  result: MotivationResult;
  justification: string;
}

export interface PluRuleAnalysis {
  rule?: string;
  article?: string;
  articleNumber?: string;
  articleTitle?: string;
  sourceArticle?: string;
  source?: string;
  result?: string;
  status?: string;
  compliant?: boolean;
  isCompliant?: boolean;
  justification?: string;
  reason?: string;
  comment?: string;
  details?: string;
}

export interface PluAnalysisInput {
  conclusion?: string;
  status?: string;
  result?: string;
  summary?: string;
  zoneCode?: string | null;
  zone?: string | null;
  articles?: PluRuleAnalysis[];
  rules?: PluRuleAnalysis[];
  controles?: PluRuleAnalysis[];
  controls?: PluRuleAnalysis[];
  motivations?: PluRuleAnalysis[];
  rulesChecked?: ProjectPluRuleCheck[];
}

export interface GenerateDecisionInput {
  projectContext: ProjectContext;
  pluAnalysis?: PluAnalysisInput | null;
  consultations?: Consultation[] | { consultations?: Consultation[] } | null;
  complianceStatus?: CompletenessResult | { status?: string; missingPieces?: unknown[]; message?: string } | null;
}

export interface GeneratedDecision {
  decision: UrbanismDecision;
  motivations: DecisionMotivation[];
  legalText: string;
}

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function ruleLabel(item: PluRuleAnalysis) {
  if (item.article && item.rule) return `${item.article} - ${item.rule}`;
  if (item.sourceArticle && item.rule) return `${item.sourceArticle} - ${item.rule}`;
  return item.rule || item.article || item.sourceArticle || item.source || [
    item.articleNumber ? `Article ${item.articleNumber}` : null,
    item.articleTitle,
  ].filter(Boolean).join(" - ");
}

function justification(item: PluRuleAnalysis) {
  return item.justification || item.reason || item.comment || item.details || "Résultat issu de l'analyse réglementaire fournie.";
}

function resultFromRule(item: PluRuleAnalysis): MotivationResult | null {
  if (item.compliant === true || item.isCompliant === true) return "compliant";
  if (item.compliant === false || item.isCompliant === false) return "non-compliant";

  const value = normalize(item.result || item.status);
  if (!value) return null;
  if (value.includes("non conforme") || value.includes("non-compliant") || value.includes("refus") || value.includes("fail")) {
    return "non-compliant";
  }
  if (value.includes("conforme") || value.includes("compliant") || value.includes("ok") || value.includes("valid")) {
    return "compliant";
  }
  return null;
}

function collectPluRules(pluAnalysis?: PluAnalysisInput | null) {
  if (!pluAnalysis) return [];
  return [
    ...(pluAnalysis.rulesChecked || []).map((item) => ({
      article: item.article,
      rule: item.rule,
      compliant: item.compliant,
      justification: item.explanation,
    })),
    ...(pluAnalysis.motivations || []),
    ...(pluAnalysis.controles || []),
    ...(pluAnalysis.controls || []),
    ...(pluAnalysis.rules || []),
    ...(pluAnalysis.articles || []),
  ];
}

function extractMotivations(pluAnalysis?: PluAnalysisInput | null): DecisionMotivation[] {
  return collectPluRules(pluAnalysis)
    .map((item) => {
      const rule = ruleLabel(item);
      const result = resultFromRule(item);
      if (!rule || !result) return null;
      return {
        rule,
        result,
        justification: justification(item),
      };
    })
    .filter((item): item is DecisionMotivation => item !== null);
}

function hasGlobalNonCompliance(pluAnalysis?: PluAnalysisInput | null) {
  const conclusion = normalize(pluAnalysis?.conclusion || pluAnalysis?.status || pluAnalysis?.result);
  return conclusion.includes("non conforme") || conclusion.includes("non-compliant") || conclusion.includes("refus");
}

function consultationList(input: GenerateDecisionInput["consultations"]) {
  if (!input) return [];
  return Array.isArray(input) ? input : input.consultations || [];
}

function legalReferences(motivations: DecisionMotivation[]) {
  return unique(motivations.map((motivation) => motivation.rule).filter(Boolean));
}

function projectLine(context: ProjectContext) {
  const commune = context.locationContext.commune || "commune non renseignée";
  const parcel = context.locationContext.parcel || "parcelle non renseignée";
  const zone = context.locationContext.pluZone || "zone PLU non renseignée";
  return `Projet situé à ${commune}, parcelle ${parcel}, zone ${zone}.`;
}

function decisionTitle(decision: UrbanismDecision) {
  if (decision === "refused") return "ARRÊTÉ PORTANT REFUS D'AUTORISATION D'URBANISME";
  if (decision === "conditional") return "ARRÊTÉ PORTANT ACCORD SOUS RÉSERVES D'AUTORISATION D'URBANISME";
  return "ARRÊTÉ PORTANT ACCORD D'AUTORISATION D'URBANISME";
}

function decisionArticle(decision: UrbanismDecision) {
  if (decision === "refused") return "Article 1 - La demande d'autorisation d'urbanisme est refusée.";
  if (decision === "conditional") return "Article 1 - La demande d'autorisation d'urbanisme est accordée sous réserve de la levée des points indiqués ci-dessous.";
  return "Article 1 - La demande d'autorisation d'urbanisme est accordée.";
}

function buildLegalText(args: {
  decision: UrbanismDecision;
  context: ProjectContext;
  motivations: DecisionMotivation[];
  consultations: Consultation[];
  complianceStatus: GenerateDecisionInput["complianceStatus"];
}) {
  const references = legalReferences(args.motivations);
  const nonCompliant = args.motivations.filter((motivation) => motivation.result === "non-compliant");
  const compliant = args.motivations.filter((motivation) => motivation.result === "compliant");
  const pendingConsultations = args.consultations.filter((consultation) => consultation.required && consultation.status !== "received");
  const compliance = args.complianceStatus?.status;

  const lines = [
    decisionTitle(args.decision),
    "",
    "Vu le code de l'urbanisme ;",
    references.length > 0 ? `Vu les règles et articles PLU explicitement analysés : ${references.join("; ")} ;` : "Vu l'analyse réglementaire fournie, sans article PLU exploitable explicitement référencé ;",
    args.consultations.length > 0 ? `Vu les consultations identifiées : ${args.consultations.map((consultation) => consultation.service).join(", ")} ;` : "Vu l'absence de consultation obligatoire identifiée dans les données fournies ;",
    compliance ? `Vu l'état de complétude CERFA : ${compliance} ;` : "Vu l'absence d'état de complétude CERFA exploitable ;",
    "",
    `Considérant que ${projectLine(args.context)}`,
  ];

  for (const motivation of args.motivations) {
    lines.push(`Considérant ${motivation.rule} : ${motivation.justification}`);
  }

  if (pendingConsultations.length > 0) {
    lines.push(`Considérant que les consultations suivantes restent à suivre : ${pendingConsultations.map((consultation) => consultation.service).join(", ")}.`);
  }

  if (compliance === "incomplete") {
    const message = "message" in (args.complianceStatus || {}) ? args.complianceStatus?.message : undefined;
    lines.push(`Considérant que le dossier est incomplet au regard des pièces attendues${message ? ` : ${message}` : "."}`);
  }

  lines.push("");
  lines.push("ARRÊTE");
  lines.push("");
  lines.push(decisionArticle(args.decision));

  if (nonCompliant.length > 0) {
    lines.push(`Article 2 - Le refus est motivé par les non-conformités suivantes : ${nonCompliant.map((motivation) => motivation.rule).join("; ")}.`);
  } else if (args.decision === "conditional") {
    lines.push("Article 2 - Les réserves portent sur les consultations ou la complétude du dossier restant à vérifier.");
  } else if (compliant.length > 0) {
    lines.push(`Article 2 - Les règles analysées ne révèlent pas de non-conformité : ${compliant.map((motivation) => motivation.rule).join("; ")}.`);
  }

  lines.push("Article 3 - La présente décision est établie exclusivement à partir des règles, analyses et consultations fournies à Heureka.");

  return lines.join("\n");
}

export function generateDecision(input: GenerateDecisionInput): GeneratedDecision {
  const motivations = extractMotivations(input.pluAnalysis);
  const nonCompliant = motivations.some((motivation) => motivation.result === "non-compliant") || hasGlobalNonCompliance(input.pluAnalysis);
  const compliance = input.complianceStatus?.status;
  const consultations = consultationList(input.consultations);
  const pendingConsultations = consultations.some((consultation) => consultation.required && consultation.status !== "received");
  const decision: UrbanismDecision = nonCompliant
    ? "refused"
    : compliance === "incomplete" || compliance === "uncertain" || pendingConsultations
      ? "conditional"
      : "approved";

  return {
    decision,
    motivations,
    legalText: buildLegalText({
      decision,
      context: input.projectContext,
      motivations,
      consultations,
      complianceStatus: input.complianceStatus,
    }),
  };
}
