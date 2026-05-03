import { strict as assert } from "node:assert";
import { computeDeadline, isTacite } from "./deadline_engine.service.js";
import { generateAlerts } from "./instruction_alerts.service.js";

const completeDate = new Date("2026-03-15T00:00:00.000Z");

assert.equal(computeDeadline({ typeProcedure: "DP", dateCompletude: null }), null, "dossier sans complétude → pas de délai");

assert.equal(
  computeDeadline({ typeProcedure: "DP", dateCompletude: completeDate })?.toISOString(),
  "2026-04-15T00:00:00.000Z",
  "DP complétée → délai +1 mois",
);

assert.equal(
  computeDeadline({ typeProcedure: "PC", dateCompletude: completeDate })?.toISOString(),
  "2026-05-15T00:00:00.000Z",
  "PC complété → délai +2 mois",
);

assert.equal(
  isTacite({ typeProcedure: "PC", dateCompletude: completeDate, dateLimiteInstruction: new Date("2026-04-01T00:00:00.000Z") }, new Date("2026-04-02T00:00:00.000Z")),
  true,
  "délai dépassé → tacite true",
);

assert.equal(
  generateAlerts({ typeProcedure: "PC", dateCompletude: completeDate, dateLimiteInstruction: new Date("2026-04-01T00:00:00.000Z") }).alerts.some((alert) => alert.type === "tacite_risk"),
  true,
  "alertes générées correctement",
);

console.log("instruction deadline tests passed");
