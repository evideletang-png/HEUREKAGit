import { checkCompleteness, type UploadedDocumentForCompleteness } from "../compliance/checkCompleteness";
import { resolveOfficialPieces } from "../cerfa/resolveOfficialPieces";
import type { ProjectContext, ResolvedPiece } from "../cerfa/officialPieces.types";

export type ConformityLevel = "conforme" | "vigilance" | "incomplet" | "non_coherent" | "impossible";
export type ConformitySeverity = "success" | "warning" | "danger" | "muted";

export type ConformityFinding = {
  id: string;
  category: "completeness" | "consistency" | "urbanism" | "regulation" | "traceability";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  source?: string;
  confidence?: number;
  pieceCode?: string;
};

export type RegulationCheck = {
  topic: "hauteur" | "stationnement" | "implantation" | "emprise" | "destination" | "aspect";
  label: string;
  status: "conforme" | "a_verifier" | "potentiellement_non_conforme" | "indetermine";
  explanation: string;
  confidence?: number;
};

export type ConformityAnalysisResult = {
  level: ConformityLevel;
  severity: ConformitySeverity;
  score: number;
  label: string;
  riskLabel: string;
  summary: string[];
  requiredPieces: ResolvedPiece[];
  completeness: ReturnType<typeof checkCompleteness>;
  cards: {
    pieces: {
      detected: number;
      missing: number;
      incoherent: number;
    };
    urbanism: {
      zone: string;
      abf: boolean | "unknown";
      ppri: boolean | "unknown";
      oap: boolean | "unknown";
    };
    vigilances: RegulationCheck[];
  };
  findings: ConformityFinding[];
  regulationChecks: RegulationCheck[];
  traceability: Array<{
    label: string;
    source: string;
    confidence?: number;
  }>;
};

export type BuildConformityAnalysisInput = {
  projectContext: ProjectContext;
  uploadedDocuments: UploadedDocumentForCompleteness[];
  parcelAnalysis?: Record<string, any> | null;
  orientationConstraints?: Array<{ type?: string; label?: string; confidence?: string; source?: string; detected?: boolean; impact?: Record<string, any> }>;
  projectFacts?: {
    surface?: number | string | null;
    height?: number | string | null;
    parking?: number | string | null;
    destination?: string | null;
  };
};

function boolFromContext(value?: boolean, unresolved?: string[], key?: string): boolean | "unknown" {
  if (value === true) return true;
  if (value === false) return false;
  if (key && unresolved?.some((item) => item.toLowerCase().includes(key))) return "unknown";
  return false;
}

function severityFor(level: ConformityLevel): ConformitySeverity {
  if (level === "conforme") return "success";
  if (level === "vigilance") return "warning";
  if (level === "incomplet" || level === "non_coherent") return "danger";
  return "muted";
}

function labelFor(level: ConformityLevel) {
  switch (level) {
    case "conforme": return "Conforme";
    case "vigilance": return "Conforme avec vigilance";
    case "incomplet": return "Incomplet";
    case "non_coherent": return "Non cohérent";
    default: return "Analyse impossible";
  }
}

function riskLabelFor(level: ConformityLevel) {
  switch (level) {
    case "conforme": return "Risque faible";
    case "vigilance": return "Risque modéré";
    case "incomplet": return "Risque élevé";
    case "non_coherent": return "Risque critique";
    default: return "Données insuffisantes";
  }
}

function confidenceFromLabel(value?: string) {
  if (value === "high") return 0.9;
  if (value === "medium") return 0.65;
  if (value === "low") return 0.4;
  return undefined;
}

function makeRegulationChecks(input: BuildConformityAnalysisInput): RegulationCheck[] {
  const facts = input.projectFacts || {};
  const context = input.projectContext;
  const constraints = input.orientationConstraints || [];
  const checks: RegulationCheck[] = [];

  if (facts.height) {
    checks.push({
      topic: "hauteur",
      label: "Hauteur",
      status: "a_verifier",
      explanation: "Hauteur déclarée à recouper avec le règlement de zone et les plans.",
      confidence: 0.62,
    });
  }
  if (facts.parking) {
    checks.push({
      topic: "stationnement",
      label: "Stationnement",
      status: "a_verifier",
      explanation: "Stationnement déclaré à comparer avec le plan de masse et les exigences locales.",
      confidence: 0.58,
    });
  }
  if (facts.destination || context.projectFlags?.erp) {
    checks.push({
      topic: "destination",
      label: "Destination",
      status: "a_verifier",
      explanation: "Destination et usage à contrôler avec les destinations autorisées en zone.",
      confidence: 0.62,
    });
  }
  if (context.locationContext.abf || context.locationContext.spr || context.locationContext.monumentHistoriqueAbords) {
    checks.push({
      topic: "aspect",
      label: "Aspect extérieur",
      status: "a_verifier",
      explanation: "Périmètre patrimonial détecté : insertion, matériaux, teintes et menuiseries à vérifier.",
      confidence: context.locationContext.confidence ?? 0.72,
    });
  }
  if (constraints.some((constraint) => /oap|implantation/i.test(`${constraint.type} ${constraint.label}`))) {
    checks.push({
      topic: "implantation",
      label: "Implantation",
      status: "a_verifier",
      explanation: "Contrainte territoriale détectée : implantation à vérifier au regard des documents graphiques.",
      confidence: 0.58,
    });
  }
  if (facts.surface) {
    checks.push({
      topic: "emprise",
      label: "Emprise / surface",
      status: "a_verifier",
      explanation: "Surface déclarée à comparer avec le plan de masse et les surfaces du CERFA.",
      confidence: 0.6,
    });
  }

  return checks;
}

export function buildConformityAnalysis(input: BuildConformityAnalysisInput): ConformityAnalysisResult {
  const requiredPieces = resolveOfficialPieces(input.projectContext);
  const completeness = checkCompleteness({
    requiredPieces,
    uploadedDocuments: input.uploadedDocuments,
  });
  const regulationChecks = makeRegulationChecks(input);
  const criticalFindings: ConformityFinding[] = completeness.missingPieces.map((piece) => ({
    id: `missing-${piece.code}`,
    category: "completeness",
    severity: "critical",
    title: `${piece.code} manquante`,
    message: piece.conditionLabel ? `${piece.label}. Condition : ${piece.conditionLabel}` : piece.label,
    source: piece.legalReference || "Bordereau CERFA",
    confidence: piece.confidence,
    pieceCode: piece.code,
  }));
  const ambiguousFindings: ConformityFinding[] = completeness.ambiguousMatches.map((match) => ({
    id: `ambiguous-${match.piece.code}`,
    category: "completeness",
    severity: "warning",
    title: `${match.piece.code} à vérifier`,
    message: match.reason,
    source: "Classification documentaire",
    confidence: 0.62,
    pieceCode: match.piece.code,
  }));
  const urbanismFindings: ConformityFinding[] = (input.orientationConstraints || [])
    .filter((constraint) => constraint.detected !== false)
    .map((constraint, index) => ({
      id: `constraint-${index}`,
      category: "urbanism",
      severity: /abf|ppri|ppr|spr|site/i.test(`${constraint.type} ${constraint.label}`) ? "warning" : "info",
      title: constraint.label || constraint.type || "Contrainte détectée",
      message: constraint.impact?.decisionImpact || constraint.impact?.delayImpact || "Contrainte à prendre en compte dans l'instruction.",
      source: constraint.source || "Analyse parcellaire",
      confidence: confidenceFromLabel(constraint.confidence),
    }));
  const findings = [...criticalFindings, ...ambiguousFindings, ...urbanismFindings];
  const inconsistentCount = ambiguousFindings.length + regulationChecks.filter((check) => check.status === "potentiellement_non_conforme").length;
  const level: ConformityLevel = input.uploadedDocuments.length === 0
    ? "impossible"
    : completeness.status === "incomplete"
      ? "incomplet"
      : inconsistentCount > 0
        ? "non_coherent"
        : regulationChecks.length > 0 || urbanismFindings.length > 0 || completeness.status === "uncertain"
          ? "vigilance"
          : "conforme";
  const scorePenalty = completeness.missingPieces.length * 18 + ambiguousFindings.length * 8 + regulationChecks.length * 4;
  const score = Math.max(0, Math.min(100, Math.round((completeness.confidenceScore || 0) * 100 - scorePenalty)));
  const zone = input.projectContext.locationContext.pluZone || input.parcelAnalysis?.zoneCode || input.parcelAnalysis?.zone || "Non déterminée";
  const summary = [
    completeness.status === "complete"
      ? "Les pièces obligatoires identifiées semblent présentes."
      : `${completeness.missingPieces.length} pièce(s) requise(s) semblent manquante(s).`,
    regulationChecks.length > 0
      ? `${regulationChecks.length} vigilance(s) réglementaire(s) à contrôler avant décision.`
      : "Aucune vigilance réglementaire majeure n'est remontée à ce stade.",
    urbanismFindings.length > 0
      ? `${urbanismFindings.length} contrainte(s) territoriale(s) impactante(s) détectée(s).`
      : "Les contraintes territoriales connues ne signalent pas d'impact majeur.",
  ];

  return {
    level,
    severity: severityFor(level),
    score,
    label: labelFor(level),
    riskLabel: riskLabelFor(level),
    summary,
    requiredPieces,
    completeness,
    cards: {
      pieces: {
        detected: completeness.matchedPieces.length,
        missing: completeness.missingPieces.length,
        incoherent: inconsistentCount,
      },
      urbanism: {
        zone,
        abf: boolFromContext(input.projectContext.locationContext.abf || input.projectContext.locationContext.monumentHistoriqueAbords || input.projectContext.locationContext.spr, input.projectContext.locationContext.unresolvedChecks, "abf"),
        ppri: boolFromContext(input.projectContext.locationContext.pprRequiresStudy, input.projectContext.locationContext.unresolvedChecks, "ppr"),
        oap: (input.orientationConstraints || []).some((constraint) => /oap/i.test(`${constraint.type} ${constraint.label}`)),
      },
      vigilances: regulationChecks,
    },
    findings,
    regulationChecks,
    traceability: [
      ...completeness.matchedPieces.map((match) => ({
        label: `${match.piece.code} détectée`,
        source: match.document.filename,
        confidence: match.confidence,
      })),
      ...urbanismFindings.map((finding) => ({
        label: finding.title,
        source: finding.source || "Analyse parcellaire",
        confidence: finding.confidence,
      })),
    ],
  };
}
