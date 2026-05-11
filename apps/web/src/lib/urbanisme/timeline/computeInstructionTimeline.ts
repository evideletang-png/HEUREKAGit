import type { ProjectContext } from "../cerfa/officialPieces.types";

export type TimelineDossierType = "PCMI" | "PC" | "DP" | "DPC" | "DPA" | "PA" | "PD";

export type InstructionTimelineInput = {
  dossierType: TimelineDossierType;
  locationContext?: ProjectContext["locationContext"] | null;
  projectFlags?: ProjectContext["projectFlags"] & {
    consultationServices?: boolean;
    consultServices?: boolean;
  };
  startDate?: Date | string | null;
};

export type InstructionTimelineResult = {
  baseDelay: number;
  additionalDelays: {
    reason: string;
    duration: number;
    source: string;
  }[];
  totalDelay: number;
  legalDeadlineDate: Date;
};

function normalizeDossierType(value: TimelineDossierType) {
  if (value === "DPC" || value === "DPA") return "DP";
  return value;
}

function baseDelayFor(type: TimelineDossierType) {
  const normalized = normalizeDossierType(type);
  if (normalized === "PCMI") return 2;
  if (normalized === "DP") return 1;
  if (normalized === "PA") return 3;
  if (normalized === "PC") return 3;
  if (normalized === "PD") return 2;
  return 1;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < originalDay) next.setDate(0);
  return next;
}

function startDateOf(value?: Date | string | null) {
  if (!value) return new Date();
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function pushDelay(
  target: InstructionTimelineResult["additionalDelays"],
  reason: string,
  duration: number,
  source: string,
) {
  if (target.some((delay) => delay.reason === reason && delay.source === source)) return;
  target.push({ reason, duration, source });
}

export function computeInstructionTimeline(input: InstructionTimelineInput): InstructionTimelineResult {
  const location = input.locationContext || {};
  const flags = input.projectFlags || {};
  const baseDelay = baseDelayFor(input.dossierType);
  const additionalDelays: InstructionTimelineResult["additionalDelays"] = [];

  if (location.abf || location.spr || location.monumentHistoriqueAbords) {
    pushDelay(additionalDelays, "Consultation patrimoniale / ABF", 1, "Code de l'urbanisme - périmètre patrimonial");
  }

  if (flags.requiresImpactStudy || flags.requiresUpdatedImpactStudy) {
    pushDelay(additionalDelays, "Projet soumis à étude d'impact", 2, "Code de l'environnement / instruction urbanisme");
  }

  if (flags.consultationServices || flags.consultServices || flags.environmentalAuthorization || flags.iotaDeclaration || flags.icpeDeclaration || flags.icpeRegistration) {
    pushDelay(additionalDelays, "Consultation de services extérieurs", 1, "Consultations administratives requises");
  }

  if (location.parcNationalCore) {
    pushDelay(additionalDelays, "Projet situé en coeur de parc national", 1, "Code de l'urbanisme - parc national");
  }

  if (location.siteClasse || location.siteInscrit || location.reserveNaturelle || location.natura2000) {
    pushDelay(additionalDelays, "Protection environnementale ou paysagère à consulter", 1, "Code de l'environnement / protections locales");
  }

  if (location.pprRequiresStudy || flags.riskPreventionPlanRequiresStudy) {
    pushDelay(additionalDelays, "Analyse du plan de prévention des risques", 1, "PPR / règlement de risque applicable");
  }

  if (location.sis || location.formerIcpe || flags.soilInformationSector || flags.formerIcpeSiteDifferentUse) {
    pushDelay(additionalDelays, "Vérification sols pollués ou ancien site ICPE", 1, "Secteur d'information sur les sols / ICPE");
  }

  const totalDelay = baseDelay + additionalDelays.reduce((sum, delay) => sum + delay.duration, 0);
  const legalDeadlineDate = addMonths(startDateOf(input.startDate), totalDelay);

  return {
    baseDelay,
    additionalDelays,
    totalDelay,
    legalDeadlineDate,
  };
}
