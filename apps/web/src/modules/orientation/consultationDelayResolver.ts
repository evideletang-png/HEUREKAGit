import { computeInstructionTimeline } from "@/lib/urbanisme/timeline/computeInstructionTimeline";
import { resolveConsultations } from "@/lib/urbanisme/consultations/resolveConsultations";
import type { DossierType, ProjectContext } from "@/lib/urbanisme/cerfa/officialPieces.types";
import type {
  OrientationDossierType,
  OrientationEstimatedTimeline,
  OrientationExpectedConsultation,
  OrientationLocationConstraint,
} from "./orientation.types";

function isDossierType(type: OrientationDossierType): type is DossierType {
  return type === "PCMI" || type === "PC" || type === "DPC" || type === "DPA" || type === "PA" || type === "PD";
}

function expectedDelayFor(service: string, required: boolean): OrientationExpectedConsultation["expectedDelayImpact"] {
  if (service === "ABF") {
    return {
      type: required ? "mandatory_majoration" : "possible_majoration",
      durationMonths: 1,
      explanation: "Majoration indicative possible en cas de consultation patrimoniale.",
    };
  }
  if (service === "SDIS" || service === "DDT" || service === "Métropole") {
    return {
      type: "possible_majoration",
      durationMonths: 1,
      explanation: "Délai susceptible d'être ajusté selon les consultations réellement lancées.",
    };
  }
  return { type: "none", explanation: "Pas de majoration identifiée à ce stade." };
}

export function resolveOrientationConsultations(args: {
  dossierType: OrientationDossierType;
  projectFlags: ProjectContext["projectFlags"];
  locationContext: ProjectContext["locationContext"];
  locationConstraints: OrientationLocationConstraint[];
}): OrientationExpectedConsultation[] {
  if (!isDossierType(args.dossierType)) return [];
  const context: ProjectContext = {
    dossierType: args.dossierType,
    projectFlags: args.projectFlags,
    locationContext: args.locationContext,
  };
  const resolved = resolveConsultations(context).consultations;
  const technical = args.locationConstraints.filter((constraint) => constraint.detected && constraint.impact.consultations?.length);

  const byService = new Map<string, OrientationExpectedConsultation>();
  for (const consultation of resolved) {
    byService.set(consultation.service, {
      service: consultation.service,
      required: consultation.required,
      probable: true,
      reason: consultation.reason,
      legalOrOperationalBasis: "Déduit du contexte projet/localisation Heureka.",
      expectedDelayImpact: expectedDelayFor(consultation.service, consultation.required),
    });
  }

  for (const constraint of technical) {
    for (const service of constraint.impact.consultations || []) {
      const normalized = service === "Gestionnaire voirie" ? "Gestionnaire voirie" : service;
      if (byService.has(normalized)) continue;
      byService.set(normalized, {
        service: normalized as OrientationExpectedConsultation["service"],
        required: false,
        probable: true,
        reason: constraint.label,
        legalOrOperationalBasis: constraint.source,
        expectedDelayImpact: expectedDelayFor(normalized, false),
      });
    }
  }

  return Array.from(byService.values());
}

export function estimateOrientationTimeline(args: {
  dossierType: OrientationDossierType;
  projectFlags: ProjectContext["projectFlags"];
  locationContext: ProjectContext["locationContext"];
  expectedConsultations: OrientationExpectedConsultation[];
}): OrientationEstimatedTimeline {
  if (!isDossierType(args.dossierType)) {
    return {
      baseDelay: { durationMonths: 0, reason: "Type de dossier à confirmer." },
      possibleMajorations: [],
      estimatedTotalDelayMonths: null,
      warning: "Les délais ne peuvent pas être estimés tant que la démarche n'est pas confirmée.",
    };
  }

  const timeline = computeInstructionTimeline({
    dossierType: args.dossierType,
    projectFlags: args.projectFlags,
    locationContext: args.locationContext,
  });

  return {
    baseDelay: {
      durationMonths: timeline.baseDelay,
      reason: `Délai de base indicatif pour ${args.dossierType}.`,
    },
    possibleMajorations: timeline.additionalDelays.map((delay) => ({
      service: delay.reason.includes("ABF") || delay.reason.includes("patrimoniale") ? "ABF" : "Service consulté",
      durationMonths: delay.duration,
      reason: delay.reason,
      confidence: delay.reason.includes("ABF") ? "medium" : "low",
    })),
    estimatedTotalDelayMonths: timeline.totalDelay,
    warning: "Les délais sont indicatifs et peuvent être confirmés ou modifiés par le service instructeur dans le premier mois suivant le dépôt.",
  };
}
