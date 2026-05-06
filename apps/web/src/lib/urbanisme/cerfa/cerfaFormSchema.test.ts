import assert from "node:assert/strict";
import { getCerfaSections, getCerfaSectionStatus, getMissingRequiredFields } from "./cerfaFormSchema";
import { getProjectFlagsFromCerfaValues } from "./cerfaFieldMapping";

const pcmiSections = getCerfaSections("PCMI");

assert.ok(pcmiSections.some((section) => section.id === "pieces"), "PCMI exposes the official pieces section");
assert.ok(pcmiSections.some((section) => section.id === "verification"), "PCMI exposes the verification section");
assert.ok(pcmiSections.some((section) => section.id === "transmission"), "PCMI exposes the transmission section");

const flags = getProjectFlagsFromCerfaValues({
  "related.deforestationRequired": true,
  "demolition.pcIncludesDemolition": true,
  "works.modifiesFacadesOrRoof": false,
});

assert.equal(flags.deforestationRequired, true);
assert.equal(flags.pcIncludesDemolition, true);
assert.equal(flags.modifiesFacadesOrRoof, false);

const missing = getMissingRequiredFields(pcmiSections, {
  "project.title": "Extension",
  "project.dossierType": "PCMI",
});

assert.ok(missing.some((item) => item.field.id === "applicant.fullName"), "missing applicant identity is reported");

const receipt = pcmiSections.find((section) => section.id === "receipt");
assert.ok(receipt);
assert.equal(
  getCerfaSectionStatus({
    section: receipt,
    values: { "project.title": "Extension", "project.dossierType": "PCMI" },
  }),
  "complete",
);

console.log("cerfaFormSchema tests passed");
