import assert from "node:assert/strict";
import { DEMO_DOSSIER_ID, demoDossier } from "./demoSeedData";
import { getDemoStepById, getDemoSteps } from "./demoScenario";
import { resolveDemoStepRoute } from "./demoRoutes";
import { getDemoScopedRoute } from "./demoModeStore";

const favorableSteps = getDemoSteps("decision_favorable");
assert(favorableSteps.length >= 12, "Le scenario favorable doit couvrir le parcours complet");
assert.equal(favorableSteps[0].route, "/citoyen", "La demo commence par le vrai portail citoyen");
assert.equal(getDemoStepById("depot-pcmi").route, "/citoyen/nouveau", "Le depot PCMI utilise le vrai formulaire citoyen");
assert(favorableSteps.some((step) => step.route === `/citoyen/dossier/${DEMO_DOSSIER_ID}`), "Le suivi citoyen utilise la vraie route dossier");
assert(favorableSteps.some((step) => step.route === "/dashboard-mairie"), "Le dashboard mairie reel est dans le scenario");
assert(favorableSteps.some((step) => step.route === `/portail-abf/${DEMO_DOSSIER_ID}`), "Le portail ABF reel est dans le scenario");
assert(favorableSteps.some((step) => step.role === "signatory"), "Le scenario inclut le role signataire");

const piecesSteps = getDemoSteps("pieces_complementaires");
assert(piecesSteps.some((step) => step.id === "pieces-complementaires"), "La variante pieces complementaires doit inclure sa bifurcation");
assert(!favorableSteps.some((step) => step.id === "pieces-complementaires"), "La variante favorable ne doit pas jouer la bifurcation pieces");
assert.equal(resolveDemoStepRoute("consultations", "decision_favorable"), "/portail-mairie/services-consultes");
assert.equal(getDemoScopedRoute("/citoyen"), "/citoyen?demo=1", "Les vraies routes demo doivent etre scopees par URL");
assert.equal(getDemoScopedRoute("/citoyen/dossier/demo?tab=messages"), "/citoyen/dossier/demo?tab=messages&demo=1");
assert.equal(demoDossier.documents.length, 8, "Le seed demo depose les pieces PCMI1 a PCMI8");
assert.deepEqual(demoDossier.documents.map((document) => document.code), ["PCMI1", "PCMI2", "PCMI3", "PCMI4", "PCMI5", "PCMI6", "PCMI7", "PCMI8"]);

console.info("[demoOrchestrator] scenario demo reel OK");
