import type { GeoConstraint } from "./geoConstraintsService.js";
import type { ParcelData } from "./parcel.js";
import type { ZoningInfo } from "./planning.js";

export type ParcelAnalysisStateItem = {
  id: string;
  type: string;
  label: string;
  description?: string | null;
  severity?: "high" | "medium" | "low" | "info";
  source: string;
  confidence: number;
  raw?: unknown;
};

export type ParcelAnalysisConsultation = {
  service: "ABF" | "SDIS" | "DDT" | "Métropole" | "ARS" | "Préfecture" | "Gestionnaire voirie" | "Parc national" | "SPANC" | "Autre";
  required: boolean;
  probable: boolean;
  reason: string;
  source: string;
  delayImpactMonths?: number;
  workflowStep: string;
};

export type ParcelAnalysisDelay = {
  reason: string;
  durationMonths: number;
  source: string;
  confidence: number;
};

export type ParcelAnalysisRequiredDocument = {
  code?: string;
  label: string;
  reason: string;
  source: string;
  required: boolean;
  confidence: number;
};

export type ParcelInstructionWorkflowStep = {
  step: string;
  label: string;
  required: boolean;
  blocking: boolean;
  service?: string;
  reason: string;
};

export type ParcelAnalysisState = {
  parcel: {
    idu?: string | null;
    fullReference?: string | null;
    section?: string | null;
    number?: string | null;
    surfaceM2?: number | null;
    geometry?: unknown;
    parcelInfoUrl?: string | null;
  };
  zoning: ParcelAnalysisStateItem[];
  prescriptions: ParcelAnalysisStateItem[];
  informations: ParcelAnalysisStateItem[];
  servitudes: ParcelAnalysisStateItem[];
  risks: ParcelAnalysisStateItem[];
  heritage: ParcelAnalysisStateItem[];
  environment: ParcelAnalysisStateItem[];
  utilityNetworks: ParcelAnalysisStateItem[];
  constraints: ParcelAnalysisStateItem[];
  consultations: ParcelAnalysisConsultation[];
  delays: ParcelAnalysisDelay[];
  requiredDocuments: ParcelAnalysisRequiredDocument[];
  instructionWorkflow: ParcelInstructionWorkflowStep[];
  regulatoryDocuments: ParcelAnalysisStateItem[];
  warnings: string[];
  sources: ParcelAnalysisStateItem[];
  debug: {
    apiCalls: string[];
    appliedRules: string[];
    unresolvedChecks: string[];
  };
};

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function compact<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item != null);
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function itemFromConstraint(constraint: GeoConstraint, index: number): ParcelAnalysisStateItem {
  const corpus = normalizeText(`${constraint.category} ${constraint.title} ${constraint.description} ${constraint.source}`);
  const type =
    /abf|monument historique|patrimonial|zppaup|avap|\bac1\b|\bac2\b/.test(corpus) ? "ABF" :
    /ppri|inond|pm1/.test(corpus) ? "PPRI" :
    /pprn|risque naturel|mouvement|cavite|argile|seism|pm2/.test(corpus) ? "PPRN" :
    /pprt|technologique|pm3/.test(corpus) ? "PPRT" :
    /natura/.test(corpus) ? "NATURA_2000" :
    /parc national/.test(corpus) ? "PARC_NATIONAL" :
    /reserve naturelle|znieff|parc naturel|zone humide/.test(corpus) ? "ENVIRONMENT" :
    /assainissement|spanc|eaux usees|eau potable|reseau|canalisation|electric|gaz|\bi3\b|\bi4\b/.test(corpus) ? "UTILITY_NETWORK" :
    /servitude|sup|\bpt1\b|\bpt2\b|\bpt3\b/.test(corpus) ? "SUP" :
    /prescription|emplacement reserve|ebc|espace boise/.test(corpus) ? "PRESCRIPTION" :
    constraint.category.toUpperCase();

  return {
    id: `${type.toLowerCase()}-${index}`,
    type,
    label: constraint.title,
    description: constraint.description,
    severity: constraint.severity,
    source: constraint.source,
    confidence: constraint.source.includes("IGN") || constraint.source.includes("GPU") ? 0.82 : 0.62,
    raw: constraint,
  };
}

function parcelInfoUrl(idu?: string | null) {
  if (!idu) return null;
  const clean = idu.trim().toUpperCase();
  if (!clean) return null;
  return `https://www.geoportail-urbanisme.gouv.fr/map/parcel-info/${encodeURIComponent(clean)}/`;
}

function addConsultation(
  target: ParcelAnalysisConsultation[],
  debugRules: string[],
  consultation: ParcelAnalysisConsultation,
) {
  if (target.some((item) => item.service === consultation.service && item.workflowStep === consultation.workflowStep)) return;
  target.push(consultation);
  debugRules.push(`${consultation.workflowStep}: ${consultation.reason}`);
}

function addDelay(target: ParcelAnalysisDelay[], delay: ParcelAnalysisDelay) {
  if (target.some((item) => item.reason === delay.reason && item.source === delay.source)) return;
  target.push(delay);
}

function addDocument(target: ParcelAnalysisRequiredDocument[], document: ParcelAnalysisRequiredDocument) {
  if (target.some((item) => item.label === document.label && item.source === document.source)) return;
  target.push(document);
}

function addWorkflow(target: ParcelInstructionWorkflowStep[], step: ParcelInstructionWorkflowStep) {
  if (target.some((item) => item.step === step.step)) return;
  target.push(step);
}

export function buildParcelAnalysisState(args: {
  parcelData: ParcelData;
  zoningInfo?: ZoningInfo | null;
  geoConstraints?: GeoConstraint[];
  procedureType?: "DP" | "DPC" | "DPA" | "PCMI" | "PC" | "PA" | "PD";
  projectFlags?: Record<string, unknown>;
}): ParcelAnalysisState {
  const parcelData = args.parcelData;
  const geoConstraints = args.geoConstraints || [];
  const stateItems = uniqueBy(geoConstraints.map(itemFromConstraint), (item) => `${item.type}:${item.label}:${item.source}`);
  const corpus = normalizeText(stateItems.map((item) => `${item.type} ${item.label} ${item.description || ""}`).join("\n"));
  const consultations: ParcelAnalysisConsultation[] = [];
  const delays: ParcelAnalysisDelay[] = [];
  const requiredDocuments: ParcelAnalysisRequiredDocument[] = [];
  const instructionWorkflow: ParcelInstructionWorkflowStep[] = [];
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  const hasHeritage = /abf|monument historique|patrimonial|zppaup|avap|\bac1\b|\bac2\b|site inscrit|site classe/.test(corpus);
  const hasPpr = /ppri|pprn|pprt|inond|risque naturel|risque technologique|pm1|pm2|pm3/.test(corpus);
  const hasPpri = /ppri|inond|pm1/.test(corpus);
  const hasEnvironment = /natura|znieff|reserve naturelle|parc national|parc naturel|zone humide/.test(corpus);
  const hasNatura = /natura/.test(corpus);
  const hasParcNational = /parc national/.test(corpus);
  const hasUtilityNetwork = /assainissement|spanc|eaux usees|eau potable|reseau|canalisation|electric|gaz|\bi3\b|\bi4\b/.test(corpus);
  const hasRoadOrPublicDomain = /voirie|alignement|emplacement reserve|domaine public|acces/.test(corpus);
  const hasOap = /oap|orientation d amenagement|orientation d'amenagement/.test(corpus);

  if (hasHeritage) {
    addConsultation(consultations, appliedRules, {
      service: "ABF",
      required: true,
      probable: true,
      reason: "Périmètre patrimonial, abords de monument historique, SPR ou servitude AC détecté par intersection réglementaire.",
      source: "parcel_analysis_state.heritage",
      delayImpactMonths: 1,
      workflowStep: "consultation_abf",
    });
    addDelay(delays, { reason: "Consultation patrimoniale / ABF", durationMonths: 1, source: "Code de l'urbanisme - patrimoine", confidence: 0.82 });
    addDocument(requiredDocuments, {
      label: "Justifications d'insertion, matériaux, teintes, façades, photographies et documents graphiques à rattacher aux pièces CERFA applicables",
      reason: "Le terrain est concerné par un périmètre patrimonial.",
      source: "heritage",
      required: true,
      confidence: 0.82,
    });
    addWorkflow(instructionWorkflow, {
      step: "consultation_abf",
      label: "Consultation ABF",
      required: true,
      blocking: true,
      service: "ABF",
      reason: "Avis patrimonial requis ou probable.",
    });
  }

  if (hasPpr) {
    addConsultation(consultations, appliedRules, {
      service: "DDT",
      required: hasPpri,
      probable: true,
      reason: "Plan de prévention des risques ou contrainte de risque détecté sur la parcelle.",
      source: "parcel_analysis_state.risks",
      delayImpactMonths: 1,
      workflowStep: "risk_review",
    });
    addDelay(delays, { reason: "Analyse du plan de prévention des risques", durationMonths: 1, source: "PPR / règlement de risque", confidence: hasPpri ? 0.78 : 0.62 });
    addDocument(requiredDocuments, {
      label: "Notice de prise en compte du risque, cotes altimétriques ou étude exigée par le règlement PPR si applicable",
      reason: hasPpri ? "Terrain potentiellement soumis au risque inondation." : "Risque réglementaire superposé à confirmer.",
      source: "risk",
      required: hasPpri,
      confidence: hasPpri ? 0.78 : 0.62,
    });
    addWorkflow(instructionWorkflow, {
      step: "risk_review",
      label: "Vérification risques",
      required: true,
      blocking: hasPpri,
      service: "DDT",
      reason: "Risque ou PPR à recouper avant décision.",
    });
    warnings.push(hasPpri ? "Terrain soumis ou susceptible d'être soumis à un risque inondation." : "Risque réglementaire détecté : vérifier le règlement applicable.");
  }

  if (hasEnvironment) {
    addConsultation(consultations, appliedRules, {
      service: hasParcNational ? "Parc national" : "DDT",
      required: hasParcNational || hasNatura,
      probable: true,
      reason: "Protection environnementale, Natura 2000, réserve ou parc détecté par intersection.",
      source: "parcel_analysis_state.environment",
      delayImpactMonths: 1,
      workflowStep: hasParcNational ? "consultation_parc_national" : "environment_review",
    });
    addDelay(delays, { reason: "Protection environnementale ou paysagère à consulter", durationMonths: 1, source: "Code de l'environnement / protections locales", confidence: hasNatura || hasParcNational ? 0.76 : 0.58 });
    addDocument(requiredDocuments, {
      label: "Notice environnementale ou évaluation des incidences à confirmer selon le projet et le site détecté",
      reason: "Protection environnementale intersectée avec la parcelle.",
      source: "environment",
      required: hasNatura,
      confidence: hasNatura ? 0.76 : 0.58,
    });
    addWorkflow(instructionWorkflow, {
      step: hasParcNational ? "consultation_parc_national" : "environment_review",
      label: hasParcNational ? "Consultation Parc national" : "Analyse environnementale",
      required: hasNatura || hasParcNational,
      blocking: hasParcNational,
      service: hasParcNational ? "Parc national" : "DDT",
      reason: "Protection environnementale à vérifier.",
    });
  }

  if (hasUtilityNetwork) {
    addConsultation(consultations, appliedRules, {
      service: /assainissement|spanc/.test(corpus) ? "SPANC" : "Autre",
      required: /assainissement|spanc/.test(corpus),
      probable: true,
      reason: "Réseau, canalisation ou assainissement détecté sur ou à proximité de la parcelle.",
      source: "parcel_analysis_state.utilityNetworks",
      workflowStep: "network_review",
    });
    addDocument(requiredDocuments, {
      label: "Accord, étude ou avis du gestionnaire de réseau si le projet affecte l'ouvrage ou l'assainissement",
      reason: "Servitude ou réseau public intersecté.",
      source: "utility_network",
      required: /assainissement|spanc/.test(corpus),
      confidence: 0.64,
    });
    addWorkflow(instructionWorkflow, {
      step: "network_review",
      label: "Vérification réseaux",
      required: /assainissement|spanc/.test(corpus),
      blocking: false,
      reason: "Réseau ou servitude technique à confirmer.",
    });
  }

  if (hasRoadOrPublicDomain) {
    addConsultation(consultations, appliedRules, {
      service: "Gestionnaire voirie",
      required: false,
      probable: true,
      reason: "Contrainte d'accès, voirie, alignement ou domaine public détectée.",
      source: "parcel_analysis_state.road",
      workflowStep: "road_authority_review",
    });
  }

  if (hasOap) {
    addDocument(requiredDocuments, {
      label: "Justification de compatibilité avec l'OAP à intégrer dans la notice ou les pièces graphiques officielles",
      reason: "OAP ou orientation d'aménagement détectée sur la parcelle.",
      source: "oap",
      required: true,
      confidence: 0.7,
    });
    warnings.push("OAP détectée : la compatibilité du projet devra être vérifiée.");
  }

  const zoningItem = args.zoningInfo?.zoneCode
    ? [{
        id: `zone-${args.zoningInfo.zoneCode}`,
        type: "ZONE_PLU",
        label: args.zoningInfo.zoningLabel || `Zone ${args.zoningInfo.zoneCode}`,
        description: args.zoningInfo.rawText || null,
        severity: "info" as const,
        source: args.zoningInfo.sourceUrl || "GPU / document d'urbanisme",
        confidence: 0.78,
        raw: args.zoningInfo,
      }]
    : [];

  const prescriptions = stateItems.filter((item) => item.type === "PRESCRIPTION");
  const servitudes = stateItems.filter((item) => item.type === "SUP" || item.type === "UTILITY_NETWORK" || item.label.toLowerCase().includes("servitude"));
  const risks = stateItems.filter((item) => ["PPRI", "PPRN", "PPRT"].includes(item.type));
  const heritage = stateItems.filter((item) => item.type === "ABF");
  const environment = stateItems.filter((item) => ["NATURA_2000", "PARC_NATIONAL", "ENVIRONMENT"].includes(item.type));
  const utilityNetworks = stateItems.filter((item) => item.type === "UTILITY_NETWORK");
  const informations = stateItems.filter((item) => item.type === "INFORMATION");

  const parcelIdu = String(parcelData.metadata?.idu || "").split(",")[0]?.trim() || null;
  const parcelReference = [[parcelData.cadastralSection, parcelData.parcelNumber].filter(Boolean).join(" ")].filter(Boolean)[0] || null;

  return {
    parcel: {
      idu: parcelIdu,
      fullReference: parcelReference,
      section: parcelData.cadastralSection || null,
      number: parcelData.parcelNumber || null,
      surfaceM2: parcelData.parcelSurfaceM2 || null,
      geometry: parcelData.geometryJson || null,
      parcelInfoUrl: parcelInfoUrl(parcelIdu),
    },
    zoning: zoningItem,
    prescriptions,
    informations,
    servitudes,
    risks,
    heritage,
    environment,
    utilityNetworks,
    constraints: stateItems,
    consultations,
    delays,
    requiredDocuments,
    instructionWorkflow,
    regulatoryDocuments: compact([
      args.zoningInfo?.sourceUrl
        ? {
            id: "plu-source",
            type: "PLU_DOCUMENT",
            label: args.zoningInfo.zoningLabel || "Document d'urbanisme applicable",
            description: args.zoningInfo.rawText || null,
            severity: "info" as const,
            source: args.zoningInfo.sourceUrl,
            confidence: 0.72,
          }
        : null,
    ]),
    warnings,
    sources: uniqueBy(
      [
        ...stateItems.map((item) => ({
          id: `source-${item.id}`,
          type: item.type,
          label: item.label,
          description: item.description,
          severity: item.severity,
          source: item.source,
          confidence: item.confidence,
        })),
        ...zoningItem.map((item) => ({ ...item, id: `source-${item.id}` })),
      ],
      (item) => `${item.source}:${item.label}`,
    ),
    debug: {
      apiCalls: [
        "geocodeAddress",
        "getParcelByCoords / getParcelSelectionPreview",
        "getZoningByCoords",
        "fetchGeoConstraints: IGN apicarto nature + GPU intersections",
        parcelIdu ? `GPU parcel-info URL: ${parcelInfoUrl(parcelIdu)}` : "GPU parcel-info URL unresolved",
      ],
      appliedRules,
      unresolvedChecks: [
        stateItems.length === 0 ? "Aucune contrainte réglementaire intersectée ou API indisponible." : null,
        !args.zoningInfo?.zoneCode ? "Zone PLU non déterminée." : null,
      ].filter((item): item is string => Boolean(item)),
    },
  };
}
