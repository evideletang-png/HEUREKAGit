import type { DelayEngineResult, TimelineStep, TriggeredConsultation, TimelineAlert } from "./timeline.types";

type EngineDossier = {
  typeProcedure?: string | null;
  dateDepot?: string | null;
  dateCompletude?: string | null;
  dateLimiteInstruction?: string | null;
  instructionStatus?: string | null;
  status?: string | null;
  isTacite?: boolean | null;
  metadata?: Record<string, any> | null;
  documents?: Array<{
    status?: string | null;
    pieceStatus?: string | null;
    isRequested?: boolean | null;
    isResolved?: boolean | null;
  }> | null;
};

function normalizeType(raw?: string | null): string {
  const t = (raw || "").toUpperCase().trim();
  if (t.startsWith("DP") || t.includes("DECLARATION")) return "DP";
  if (t.startsWith("PCMI") || t.includes("PCMI")) return "PCMI";
  if (t.startsWith("PC") || t.includes("PERMIS DE CONSTRUIRE")) return "PC";
  if (t.startsWith("PA") || t.includes("PERMIS D'AMENAGER") || t.includes("PERMIS AMENAGER")) return "PA";
  if (t.startsWith("PD") || t.includes("PERMIS DE DÉMOLIR") || t.includes("PERMIS DE DEMOLIR")) return "PD";
  if (t.startsWith("CU")) return "DP";
  return "PC";
}

function baseDelayFor(type: string): number {
  if (type === "PCMI") return 2;
  if (type === "DP") return 1;
  if (type === "PC") return 3;
  if (type === "PA") return 3;
  if (type === "PD") return 2;
  return 2;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < originalDay) next.setDate(0);
  return next;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function daysBetween(a: Date, b: Date): number {
  const diff = a.getTime() - b.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatCompactDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function formatFullDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

type ExtractedConstraints = {
  abf: boolean;
  spr: boolean;
  monumentHistoriqueAbords: boolean;
  siteClasse: boolean;
  siteInscrit: boolean;
  natura2000: boolean;
  reserveNaturelle: boolean;
  parcNationalCore: boolean;
  pprRequiresStudy: boolean;
  sis: boolean;
  formerIcpe: boolean;
  erp: boolean;
  requiresImpactStudy: boolean;
  environmentalAuthorization: boolean;
  iotaDeclaration: boolean;
  icpeDeclaration: boolean;
  metropoleCompetence: boolean;
  roadOrPublicSpaceModification: boolean;
  constructionOnPublicDomain: boolean;
};

function extractConstraints(metadata?: Record<string, any> | null): ExtractedConstraints {
  const parcelAnalysis = metadata?.parcelAnalysis || {};
  const orientationContext = metadata?.orientationContext as
    | { locationConstraints?: Array<{ type: string; label: string; detected: boolean }> }
    | undefined;
  const constraints = Array.isArray(orientationContext?.locationConstraints)
    ? orientationContext.locationConstraints.filter((c) => c.detected)
    : [];
  const flags = metadata?.projectFlags || {};
  const location = metadata?.locationContext || {};

  const has = (pattern: RegExp) =>
    constraints.some((c) => pattern.test(`${c.type} ${c.label}`)) ||
    Object.entries(location).some(([k, v]) => pattern.test(k) && v === true) ||
    Object.entries(parcelAnalysis).some(([k, v]) => pattern.test(k) && v === true);

  return {
    abf: has(/abf/i) || Boolean(parcelAnalysis.abf),
    spr: has(/spr|site patrimonial/i) || Boolean(parcelAnalysis.spr),
    monumentHistoriqueAbords: has(/abords|monument/i) || Boolean(parcelAnalysis.monumentHistoriqueAbords),
    siteClasse: has(/site.?classe/i) || Boolean(parcelAnalysis.siteClasse),
    siteInscrit: has(/site.?inscrit/i) || Boolean(parcelAnalysis.siteInscrit),
    natura2000: has(/natura/i) || Boolean(parcelAnalysis.natura2000),
    reserveNaturelle: has(/reserve.?naturelle/i) || Boolean(parcelAnalysis.reserveNaturelle),
    parcNationalCore: has(/parc.?national|coeur/i) || Boolean(parcelAnalysis.parcNationalCore),
    pprRequiresStudy: has(/ppri|pprn|pprt|inondation|risque/i) || Boolean(parcelAnalysis.pprRequiresStudy || parcelAnalysis.ppri),
    sis: has(/sis|sols|icpe/i) || Boolean(parcelAnalysis.sis),
    formerIcpe: has(/ancien.?icpe|icpe/i) || Boolean(parcelAnalysis.formerIcpe),
    erp: has(/erp|accessibilite/i) || Boolean(flags.erp),
    requiresImpactStudy: Boolean(flags.requiresImpactStudy || flags.requiresUpdatedImpactStudy),
    environmentalAuthorization: Boolean(flags.environmentalAuthorization),
    iotaDeclaration: Boolean(flags.iotaDeclaration),
    icpeDeclaration: Boolean(flags.icpeDeclaration || flags.icpeRegistration),
    metropoleCompetence: Boolean(flags.metropoleCompetence),
    roadOrPublicSpaceModification: Boolean(flags.roadOrPublicSpaceModification),
    constructionOnPublicDomain: Boolean(flags.constructionOnPublicDomain || flags.overPublicDomain),
  };
}

type AdditionalDelay = { reason: string; duration: number; service: string; source: string };

function computeAdditionalDelays(c: ExtractedConstraints): AdditionalDelay[] {
  const result: AdditionalDelay[] = [];

  if (c.abf || c.spr || c.monumentHistoriqueAbords) {
    result.push({
      reason: "Consultation patrimoniale ABF",
      duration: 1,
      service: "ABF",
      source: "Périmètre patrimonial (monument historique, SPR, ABF)",
    });
  }

  if (c.requiresImpactStudy) {
    result.push({
      reason: "Étude d'impact environnemental",
      duration: 2,
      service: "DDT",
      source: "Code de l'environnement",
    });
  }

  if (c.environmentalAuthorization || c.iotaDeclaration || c.icpeDeclaration) {
    result.push({
      reason: "Consultation services extérieurs",
      duration: 1,
      service: "DDT",
      source: "Procédure environnementale (Loi sur l'eau, ICPE)",
    });
  }

  if (c.parcNationalCore) {
    result.push({
      reason: "Coeur de parc national",
      duration: 1,
      service: "Parc national",
      source: "Code de l'urbanisme",
    });
  }

  if (c.siteClasse || c.siteInscrit || c.reserveNaturelle || c.natura2000) {
    result.push({
      reason: "Protection environnementale ou paysagère",
      duration: 1,
      service: "DDT",
      source: "Code de l'environnement",
    });
  }

  if (c.pprRequiresStudy) {
    result.push({
      reason: "Plan de prévention des risques",
      duration: 1,
      service: "DDT",
      source: "PPR / règlement de risque applicable",
    });
  }

  if (c.sis || c.formerIcpe) {
    result.push({
      reason: "Vérification sols pollués / ancien site ICPE",
      duration: 1,
      service: "DDT",
      source: "Secteur d'information sur les sols",
    });
  }

  return result;
}

function computeOverallStatus(args: {
  status?: string | null;
  instructionStatus?: string | null;
  dateDepot?: string | null;
  dateCompletude?: string | null;
  dateLimiteInstruction?: string | null;
  isTacite?: boolean | null;
  hasMissingPieces: boolean;
  hasRequestedPieces: boolean;
}): DelayEngineResult["status"] {
  const status = (args.status || "").toUpperCase();
  const instructionStatus = (args.instructionStatus || "").toLowerCase();

  if (["ACCEPTE", "REFUSE", "ACCORD_PRESCRIPTION"].includes(status)) return "decided";
  if (args.isTacite) return "overdue";
  if (args.hasRequestedPieces) return "suspended";
  if (instructionStatus === "dossier_incomplet" || args.hasMissingPieces) return "incomplete";
  if (args.dateCompletude) return "in_progress";
  if (args.dateDepot) return "pending_completeness";
  return "pre_deposit";
}

function buildConsultations(c: ExtractedConstraints, additionalDelays: AdditionalDelay[]): TriggeredConsultation[] {
  const result: TriggeredConsultation[] = [];

  if (c.abf || c.spr || c.monumentHistoriqueAbords) {
    result.push({
      type: "ABF",
      label: "Architecte des Bâtiments de France",
      reason: c.monumentHistoriqueAbords
        ? "Aux abords d'un monument historique"
        : c.spr
          ? "Site patrimonial remarquable"
          : "Périmètre ABF",
      impact: "+1 mois",
      status: "pending",
    });
  }

  if (c.erp) {
    result.push({
      type: "SDIS",
      label: "Service départemental d'incendie et de secours",
      reason: "ERP ou accessibilité",
      impact: "+1 mois",
      status: "pending",
    });
  }

  if (c.requiresImpactStudy || c.environmentalAuthorization || c.iotaDeclaration || c.icpeDeclaration) {
    result.push({
      type: "DDT",
      label: "Direction départementale des territoires",
      reason: "Procédure environnementale",
      impact: "+1 à +2 mois",
      status: "pending",
    });
  }

  if (c.metropoleCompetence || c.roadOrPublicSpaceModification || c.constructionOnPublicDomain) {
    result.push({
      type: "Métropole",
      label: "Métropole / voirie",
      reason: "Compétence métropolitaine ou domaine public",
      impact: "+1 mois",
      status: "pending",
    });
  }

  if (c.parcNationalCore) {
    result.push({
      type: "Parc national",
      label: "Gestionnaire du parc national",
      reason: "Coeur de parc national",
      impact: "+1 mois",
      status: "pending",
    });
  }

  return result;
}

function buildTimelineSteps(args: {
  depositDate: string;
  completenessDate: string | null;
  deadlineDate: string | null;
  remainingDays: number | null;
  hasDeadline: boolean;
  status: DelayEngineResult["status"];
  adjustedDelayMonths: number;
  baseDelayMonths: number;
  triggeredConsultations: TriggeredConsultation[];
}): TimelineStep[] {
  const steps: TimelineStep[] = [];

  const isDecided = args.status === "decided";
  const isOverdue = args.status === "overdue";
  const isSuspended = args.status === "suspended";
  const isIncomplete = args.status === "incomplete";
  const isPendingCompleteness = args.status === "pending_completeness";
  const isInProgress = args.status === "in_progress";

  steps.push({
    key: "depot",
    label: "Dépôt",
    date: args.depositDate,
    status: "done",
    description: "Dossier déposé par le demandeur",
  });

  if (isPendingCompleteness) {
    steps.push({
      key: "completude",
      label: "Complétude",
      date: null,
      status: "warning",
      description: "Complétude non confirmée — délai non déclenché",
    });
  } else if (isIncomplete) {
    steps.push({
      key: "completude",
      label: "Complétude",
      date: null,
      status: "blocked",
      description: "Dossier incomplet — pièces manquantes",
    });
  } else if (isSuspended) {
    steps.push({
      key: "completude",
      label: "Complétude",
      date: args.completenessDate,
      status: "blocked",
      description: "Pièces complémentaires demandées — délai suspendu",
    });
  } else {
    steps.push({
      key: "completude",
      label: "Complétude",
      date: args.completenessDate,
      status: "done",
      description: "Dossier complet",
    });
  }

  if (isDecided) {
    steps.push({
      key: "instruction",
      label: "Instruction",
      date: null,
      status: "done",
      description: "Instruction terminée",
    });
  } else if (isSuspended) {
    steps.push({
      key: "instruction",
      label: "Instruction",
      date: null,
      status: "blocked",
      description: "Suspendu — en attente de pièces",
    });
  } else if (isPendingCompleteness || isIncomplete) {
    steps.push({
      key: "instruction",
      label: "Instruction",
      date: null,
      status: "pending",
      description: `Délai de ${args.adjustedDelayMonths} mois${args.adjustedDelayMonths !== args.baseDelayMonths ? " (dont majorations)" : ""}`,
    });
  } else {
    steps.push({
      key: "instruction",
      label: "Instruction",
      date: null,
      status: "current",
      description: `Délai de ${args.adjustedDelayMonths} mois`,
    });
  }

  if (args.triggeredConsultations.length > 0) {
    const allReceived = args.triggeredConsultations.every((c) => c.status === "received");
    const anySent = args.triggeredConsultations.some((c) => c.status === "sent" || c.status === "received");

    steps.push({
      key: "consultations",
      label: "Consultations",
      date: null,
      status: allReceived ? "done" : anySent ? "current" : isDecided ? "done" : "pending",
      description: args.triggeredConsultations.map((c) => c.label).join(", "),
    });
  }

  if (isOverdue) {
    steps.push({
      key: "echeance",
      label: "Échéance",
      date: args.deadlineDate,
      status: "warning",
      description: "Délai dépassé — risque de décision tacite",
    });
  } else if (isDecided) {
    steps.push({
      key: "echeance",
      label: "Décision",
      date: null,
      status: "done",
      description: "Décision rendue",
    });
  } else if (args.hasDeadline) {
    steps.push({
      key: "echeance",
      label: "Échéance",
      date: args.deadlineDate,
      status: "current",
      description: args.remainingDays !== null
        ? `${args.remainingDays} jour${args.remainingDays > 1 ? "s" : ""} restant${args.remainingDays > 1 ? "s" : ""}`
        : "Date limite calculée",
    });
  } else {
    steps.push({
      key: "echeance",
      label: "Échéance",
      date: null,
      status: "pending",
      description: "En attente de complétude",
    });
  }

  return steps;
}

function buildAlerts(args: {
  status: DelayEngineResult["status"];
  remainingDays: number | null;
  hasDeadline: boolean;
  completenessDate: string | null;
  isSuspended: boolean;
  triggeredConsultations: TriggeredConsultation[];
  adjustedDelayMonths: number;
  baseDelayMonths: number;
}): TimelineAlert[] {
  const alerts: TimelineAlert[] = [];

  if (args.status === "overdue") {
    alerts.push({ level: "critical", message: "Délai d'instruction dépassé — risque de décision tacite" });
  }

  if (args.status === "pending_completeness") {
    alerts.push({ level: "warning", message: "Complétude non confirmée — le délai n'a pas commencé" });
  }

  if (args.status === "incomplete") {
    alerts.push({ level: "warning", message: "Dossier incomplet — pièces manquantes à fournir" });
  }

  if (args.isSuspended) {
    alerts.push({ level: "warning", message: "Instruction suspendue — en attente de réception des pièces demandées" });
  }

  if (args.remainingDays !== null && args.remainingDays <= 7 && args.remainingDays > 0) {
    alerts.push({ level: "warning", message: `Échéance dans ${args.remainingDays} jour${args.remainingDays > 1 ? "s" : ""}` });
  }

  if (args.adjustedDelayMonths > args.baseDelayMonths) {
    const extra = args.adjustedDelayMonths - args.baseDelayMonths;
    alerts.push({
      level: "info",
      message: `Majoration de délai : +${extra} mois (${extra > 1 ? "contraintes identifiées" : "contrainte identifiée"})`,
    });
  }

  const pendingConsultations = args.triggeredConsultations.filter((c) => c.status !== "received" && c.status !== "not_required");
  if (pendingConsultations.length > 0) {
    alerts.push({
      level: "info",
      message: `Consultation${pendingConsultations.length > 1 ? "s" : ""} en attente : ${pendingConsultations.map((c) => c.label).join(", ")}`,
    });
  }

  return alerts;
}

export function computeTimeline(dossier: EngineDossier): DelayEngineResult {
  const type = normalizeType(dossier.typeProcedure);
  const baseDelayMonths = baseDelayFor(type);
  const constraints = extractConstraints(dossier.metadata);
  const additionalDelays = computeAdditionalDelays(constraints);
  const adjustedDelayMonths = baseDelayMonths + additionalDelays.reduce((sum, d) => sum + d.duration, 0);

  const depositDate = dossier.dateDepot || "";
  const completenessDate = dossier.dateCompletude || null;
  const hasMissingPieces = (dossier.documents || []).some((doc) => doc.pieceStatus === "manquante" || doc.status === "missing");
  const hasRequestedPieces = (dossier.documents || []).some((doc) => doc.isRequested && !doc.isResolved);

  const status = computeOverallStatus({
    status: dossier.status,
    instructionStatus: dossier.instructionStatus,
    dateDepot: dossier.dateDepot,
    dateCompletude: dossier.dateCompletude,
    dateLimiteInstruction: dossier.dateLimiteInstruction,
    isTacite: dossier.isTacite,
    hasMissingPieces,
    hasRequestedPieces,
  });

  const isSuspended = status === "suspended";
  const suspensionReason = isSuspended ? "Pièces complémentaires demandées en attente" : null;

  // Determine deadline
  let deadlineDate: string | null = dossier.dateLimiteInstruction || null;
  let hasDeadline = false;

  if (!deadlineDate && completenessDate) {
    const start = parseDate(completenessDate);
    if (start) {
      deadlineDate = toISODate(addMonths(start, adjustedDelayMonths));
      hasDeadline = true;
    }
  } else if (deadlineDate) {
    hasDeadline = true;
  }

  // Start date for display
  let startDate: string | null = completenessDate;
  if (!startDate && depositDate) startDate = depositDate;

  // Remaining days
  let remainingDays: number | null = null;
  if (hasDeadline && deadlineDate) {
    const deadline = parseDate(deadlineDate);
    if (deadline) {
      remainingDays = daysBetween(deadline, new Date());
    }
  }

  // For overdue status
  const isActuallyOverdue = status === "overdue" || (remainingDays !== null && remainingDays < 0);

  // Consultations
  const triggeredConsultations = buildConsultations(constraints, additionalDelays);

  // Timeline steps
  const timelineSteps = buildTimelineSteps({
    depositDate,
    completenessDate,
    deadlineDate,
    remainingDays,
    hasDeadline,
    status: isActuallyOverdue ? "overdue" : status,
    adjustedDelayMonths,
    baseDelayMonths,
    triggeredConsultations,
  });

  // Alerts
  const alerts = buildAlerts({
    status: isActuallyOverdue ? "overdue" : status,
    remainingDays,
    hasDeadline,
    completenessDate,
    isSuspended,
    triggeredConsultations,
    adjustedDelayMonths,
    baseDelayMonths,
  });

  return {
    baseDelayMonths,
    adjustedDelayMonths,
    startDate,
    depositDate,
    completenessDate,
    deadlineDate,
    remainingDays,
    hasDeadline,
    status: isActuallyOverdue ? "overdue" : status,
    isSuspended,
    suspensionReason,
    triggeredConsultations,
    timelineSteps,
    alerts,
  };
}

export { formatCompactDate, formatFullDate };
