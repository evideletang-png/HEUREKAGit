import type { ProjectContext } from "../cerfa/officialPieces.types";

export type ConsultationService = "ABF" | "SDIS" | "DDT" | "Métropole";
export type ConsultationStatus = "pending" | "sent" | "received";

export interface Consultation {
  service: ConsultationService;
  required: boolean;
  reason: string;
  status: ConsultationStatus;
  sentAt?: string | null;
  receivedAt?: string | null;
  response?: string | null;
  messagingTarget?: string;
}

export interface ResolvedConsultations {
  consultations: Consultation[];
}

function consultation(
  service: ConsultationService,
  required: boolean,
  reason: string,
  messagingTarget: string,
): Consultation | null {
  if (!required) return null;

  return {
    service,
    required,
    reason,
    status: "pending",
    sentAt: null,
    receivedAt: null,
    response: null,
    messagingTarget,
  };
}

export function resolveConsultations(context: ProjectContext): ResolvedConsultations {
  const flags = context.projectFlags;
  const location = context.locationContext;

  const abfRequired = location.spr === true || location.monumentHistoriqueAbords === true || location.abf === true;
  const sdisRequired = flags.erp === true || flags.accessibilityDerogation === true || flags.publicSafetyStudyRequired === true;
  const ddtRequired =
    flags.environmentalAuthorization === true ||
    flags.iotaDeclaration === true ||
    flags.requiresImpactStudy === true ||
    flags.requiresUpdatedImpactStudy === true ||
    flags.requiresNatura2000Assessment === true ||
    flags.protectedSpeciesDerogation === true ||
    location.natura2000 === true ||
    location.reserveNaturelle === true ||
    location.siteClasse === true ||
    location.siteInscrit === true;
  const metropoleRequired =
    flags.metropoleCompetence === true ||
    flags.roadOrPublicSpaceModification === true ||
    flags.constructionOnPublicDomain === true ||
    flags.overPublicDomain === true;

  const consultations = [
    consultation(
      "ABF",
      abfRequired,
      "Terrain situé ou susceptible d'être situé en site patrimonial remarquable, aux abords d'un monument historique ou dans un périmètre ABF.",
      "@ABF",
    ),
    consultation(
      "SDIS",
      sdisRequired,
      "Projet signalé comme ERP, soumis à dérogation accessibilité ou nécessitant une étude de sécurité publique.",
      "@SDIS",
    ),
    consultation(
      "DDT",
      ddtRequired,
      "Projet ou localisation concerné par une procédure environnementale, loi sur l'eau, Natura 2000, étude d'impact ou espace protégé.",
      "@DDT",
    ),
    consultation(
      "Métropole",
      metropoleRequired,
      "Projet relevant d'une compétence métropolitaine ou affectant le domaine public, la voirie ou l'espace public.",
      "@Metropole",
    ),
  ].filter((item): item is Consultation => item !== null);

  return { consultations };
}
