import type { ParcelContextAnalysis } from "@/lib/location-intelligence/analyzeParcelContext";
import type { RegulationDocument } from "./regulationDocumentService";
import { classifyRegulationDocument, getRegulationDocumentTypeLabel } from "./regulationDocumentService";
import { buildOperationalConstraints, getVigilanceLevel } from "./parcelConstraintService";
import { buildOperationalRuleSummaries } from "./regulationSummaryService";
import type { RegulationRule } from "./zoningService";

export function buildRegulatoryOperationalSheet(args: {
  address?: string;
  parcel?: string;
  analysis: ParcelContextAnalysis | null | undefined;
  rules: RegulationRule[];
  documents: RegulationDocument[];
}) {
  const constraints = buildOperationalConstraints(args.analysis);
  const zoneCode = args.analysis?.pluZone?.code || null;
  const sourceTypes = new Set(args.documents.map((document) => classifyRegulationDocument(document)));
  const relatedSources = Array.from(sourceTypes).map((type) => getRegulationDocumentTypeLabel(type));
  const consultations = args.analysis?.probableConsultations || [];
  const timeline = args.analysis?.estimatedInstructionImpacts;
  const detected = constraints.filter((constraint) => constraint.detected);

  return {
    identification: {
      commune: args.analysis?.commune || "Commune à confirmer",
      address: args.address || "Adresse à confirmer",
      parcel: args.analysis?.parcel?.fullReference || args.parcel || "Parcelle à confirmer",
      surfaceM2: args.analysis?.parcel?.surfaceM2 || null,
      pluZone: zoneCode || "Zone à confirmer",
      sector: args.analysis?.pluZone?.label || null,
    },
    constraints,
    rules: buildOperationalRuleSummaries(zoneCode, args.rules),
    instruction: {
      consultations,
      delayMonths: timeline?.totalDelay || null,
      delayReasons: timeline?.additionalDelays || [],
      potentialPieces: detected.flatMap((constraint) => {
        if (constraint.key === "abf" || constraint.key === "spr") return ["Pièces graphiques d'insertion et notice matériaux à relire dans les pièces CERFA applicables"];
        if (constraint.key === "ppri") return ["Notice de prise en compte du risque et cotes altimétriques si le règlement PPRI les exige"];
        if (constraint.key === "sup") return ["Justification de compatibilité avec la servitude détectée"];
        if (constraint.key === "oap") return ["Justification de compatibilité avec l'OAP dans les pièces officielles du dossier"];
        return [];
      }),
      taxes: ["Taxe d'aménagement : vérifier selon surface créée et exonérations locales", "Participations éventuelles : PUP/ZAC/voirie si détecté"],
      vigilanceLevel: getVigilanceLevel(constraints),
    },
    sources: relatedSources,
    confidence: args.analysis?.confidence || 0,
    unresolvedChecks: args.analysis?.unresolvedChecks || [],
  };
}
