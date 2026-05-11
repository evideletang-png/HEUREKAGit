import assert from "node:assert/strict";
import { fieldIsVisible, getCerfaSections, getCerfaSectionStatus, getMissingRequiredFields } from "./cerfaFormSchema";
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

const identity = pcmiSections.find((section) => section.id === "identity");
assert.ok(identity);
const coApplicantName = identity.fields.find((field) => field.id === "coApplicant.fullName");
assert.ok(coApplicantName);
assert.equal(fieldIsVisible(coApplicantName, { "coApplicant.enabled": false }), false);
assert.equal(fieldIsVisible(coApplicantName, { "coApplicant.enabled": true }), true);

const noCoApplicantMissing = getMissingRequiredFields(pcmiSections, {
  "project.title": "Extension",
  "project.dossierType": "PCMI",
  "applicant.fullName": "Evi Deletang",
  "applicant.quality": "owner",
  "coApplicant.enabled": false,
});
assert.ok(!noCoApplicantMissing.some((item) => item.field.id.startsWith("coApplicant.")), "inactive co-applicant fields do not block validation");

const otherQualityMissing = getMissingRequiredFields(pcmiSections, {
  "project.title": "Extension",
  "project.dossierType": "PCMI",
  "applicant.fullName": "Evi Deletang",
  "applicant.quality": "other",
});
assert.ok(otherQualityMissing.some((item) => item.field.id === "applicant.qualityOther"), "other applicant quality requires manual detail");

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
