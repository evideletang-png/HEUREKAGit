import type { ProjectContext } from "../cerfa/officialPieces.types";
import { resolveConsultations } from "./resolveConsultations";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function context(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    dossierType: "PCMI",
    projectFlags: {},
    locationContext: {},
    ...overrides,
    projectFlags: { ...(overrides.projectFlags || {}) },
    locationContext: { ...(overrides.locationContext || {}) },
  };
}

const none = resolveConsultations(context());
assert(none.consultations.length === 0, "Aucune consultation ne doit être générée sans déclencheur");

const abf = resolveConsultations(context({ locationContext: { spr: true } }));
assert(abf.consultations.some((item) => item.service === "ABF"), "SPR doit déclencher ABF");
assert(abf.consultations[0]?.status === "pending", "Le statut initial doit être pending");

const sdis = resolveConsultations(context({ projectFlags: { erp: true } }));
assert(sdis.consultations.some((item) => item.service === "SDIS"), "ERP doit déclencher SDIS");

const ddt = resolveConsultations(context({ projectFlags: { iotaDeclaration: true } }));
assert(ddt.consultations.some((item) => item.service === "DDT"), "Loi eau / IOTA doit déclencher DDT");

const ddtEnvironment = resolveConsultations(context({ locationContext: { natura2000: true } }));
assert(ddtEnvironment.consultations.some((item) => item.service === "DDT"), "Natura 2000 doit déclencher DDT");

const metropole = resolveConsultations(context({ projectFlags: { roadOrPublicSpaceModification: true } }));
assert(metropole.consultations.some((item) => item.service === "Métropole"), "Voirie / espace public doit déclencher Métropole");

const multiple = resolveConsultations(context({
  projectFlags: { erp: true, environmentalAuthorization: true, metropoleCompetence: true },
  locationContext: { monumentHistoriqueAbords: true },
}));
assert(multiple.consultations.length === 4, "Les quatre services doivent pouvoir être déclenchés ensemble");
assert(multiple.consultations.every((item) => item.required === true), "Les consultations retournées doivent être obligatoires");
assert(multiple.consultations.every((item) => item.messagingTarget), "Chaque consultation doit exposer une cible messagerie");

console.info("[resolveConsultations] consultations obligatoires OK");
