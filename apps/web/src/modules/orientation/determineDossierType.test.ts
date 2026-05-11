import assert from "node:assert/strict";
import { determineDossierType } from "./determineDossierType";

const newHouse = determineDossierType(["new_house"]);
assert.equal(newHouse.recommendedDossierType, "PCMI");
assert.equal(newHouse.projectFlags.createsConstruction, true);

const smallExtension = determineDossierType(["extension"], { extensionSurfaceM2: 18, visibleFromPublicSpace: true });
assert.equal(smallExtension.recommendedDossierType, "DPC");
assert.equal(smallExtension.projectFlags.visibleFromPublicSpace, true);

const largeExtension = determineDossierType(["extension"], { extensionSurfaceM2: 55 });
assert.equal(largeExtension.recommendedDossierType, "PCMI");
assert.ok(largeExtension.alternativeDossierTypes.includes("DPC"));

const demolition = determineDossierType(["demolition"], { demolitionIntegrated: false });
assert.equal(demolition.recommendedDossierType, "PD");
assert.equal(demolition.projectFlags.demolitionRequired, true);

const composite = determineDossierType(["garage_to_habitation", "facade_modification"], { garageFacadeModified: true, garageSurfaceM2: 16 });
assert.equal(composite.recommendedDossierType, "DPC");
assert.equal(composite.projectFlags.modifiesFacadesOrRoof, true);

const heritage = determineDossierType(["facade_modification"], {
  abf: true,
  commune: "Tours",
  parcel: "CL 0954",
  pluZone: "UB",
  visibleFromPublicSpace: true,
});
assert.equal(heritage.recommendedDossierType, "DPC");
assert.ok(heritage.locationConstraints.some((constraint) => constraint.type === "ABF" && constraint.detected));
assert.ok(heritage.expectedConsultations.some((consultation) => consultation.service === "ABF"));
assert.equal(heritage.estimatedInstructionTimeline.estimatedTotalDelayMonths, 2);

const erp = determineDossierType(["destination_change"], {
  projectDescription: "Transformation en commerce recevant du public",
  facadeOrStructureChanged: true,
});
assert.equal(erp.recommendedDossierType, "PC");
assert.ok(erp.locationConstraints.some((constraint) => constraint.type === "ERP" && constraint.detected));
assert.ok(erp.expectedConsultations.some((consultation) => consultation.service === "SDIS"));

console.log("determineDossierType tests passed");
