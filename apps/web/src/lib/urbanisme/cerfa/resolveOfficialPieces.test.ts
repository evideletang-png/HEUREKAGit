import { resolveOfficialPieces } from "./resolveOfficialPieces";
import type { DossierType, ProjectContext } from "./officialPieces.types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function context(dossierType: DossierType, flags: ProjectContext["projectFlags"] = {}, location: ProjectContext["locationContext"] = {}): ProjectContext {
  return { dossierType, projectFlags: flags, locationContext: location };
}

function codes(ctx: ProjectContext) {
  return resolveOfficialPieces(ctx).map((piece) => piece.code);
}

function onlyCodes(ctx: ProjectContext, expected: string[]) {
  const actual = codes(ctx);
  assert(actual.join(",") === expected.join(","), `Codes attendus ${expected.join(",")} mais reçus ${actual.join(",")}`);
}

onlyCodes(context("PCMI"), ["PCMI1", "PCMI2", "PCMI3", "PCMI4", "PCMI5", "PCMI6", "PCMI7", "PCMI8"]);
assert(codes(context("PCMI", { deforestationRequired: true })).includes("PCMI17"), "PCMI défrichement doit ajouter PCMI17");
assert(codes(context("PCMI", { demolitionRequired: true })).includes("PCMI18"), "PCMI démolition séparée doit ajouter PCMI18");
assert(codes(context("PCMI", { pcIncludesDemolition: true })).includes("PCMI19"), "PCMI valant démolition doit ajouter PCMI19");
assert(codes(context("PCMI", {}, { spr: true })).includes("PCMI21"), "PCMI en SPR/ABF doit ajouter PCMI21");

onlyCodes(context("DPC"), ["DPC1"]);
assert(codes(context("DPC", { modifiesFacadesOrRoof: true })).includes("DPC4"), "DPC façade doit ajouter DPC4");
const visibleDpc = codes(context("DPC", { visibleFromPublicSpace: true }));
assert(["DPC6", "DPC7", "DPC8"].every((code) => visibleDpc.includes(code)), "DPC visible doit ajouter DPC6, DPC7, DPC8");

onlyCodes(context("PC"), ["PC1", "PC2", "PC3", "PC4", "PC5", "PC6", "PC7", "PC8"]);
assert(codes(context("PC", { deforestationRequired: true })).includes("PC24"), "PC défrichement doit ajouter PC24");
assert(codes(context("PC", { icpeDeclaration: true })).includes("PC25"), "PC ICPE déclaration doit ajouter PC25");
assert(codes(context("PC", { icpeRegistration: true })).includes("PC25-1"), "PC ICPE enregistrement doit ajouter PC25-1");
const pcLotissement = codes(context("PC", { lotissement: true }));
assert(["PC28", "PC29", "PC29-1"].every((code) => pcLotissement.includes(code)), "PC lotissement doit ajouter PC28, PC29, PC29-1");

onlyCodes(context("PA"), ["PA1", "PA2", "PA3", "PA4"]);
const paLotissement = codes(context("PA", { lotissement: true }));
assert(["PA5", "PA6", "PA7", "PA8", "PA9", "PA10", "PA11", "PA12"].every((code) => paLotissement.includes(code)), "PA lotissement doit ajouter PA5 à PA12");
assert(codes(context("PA", { deforestationRequired: true })).includes("PA16"), "PA défrichement doit ajouter PA16");
assert(codes(context("PA", { requiresNatura2000Assessment: true })).includes("PA15-1"), "PA Natura 2000 doit ajouter PA15-1");

onlyCodes(context("PD"), ["PD1", "PD2", "PD3"]);
assert(codes(context("PD", {}, { spr: true })).includes("PD9"), "PD SPR/abords MH doit ajouter PD9");

assert(!codes(context("DPC")).some((code) => code.startsWith("PCMI")), "Changement PCMI vers DPC : les PCMI disparaissent");
assert(!codes(context("PA")).some((code) => code.startsWith("DPC")), "Changement DPC vers PA : les DPC disparaissent");
assert(resolveOfficialPieces(context("DPC")).every((piece) => /^[A-Z]+[0-9]+(?:-[0-9]+)?$/.test(piece.code)), "Tous les codes affichés doivent être des codes CERFA");

console.info("[resolveOfficialPieces] checklist CERFA officielle OK");
