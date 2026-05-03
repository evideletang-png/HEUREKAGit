import { db, dossiersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeDeadline, isTacite } from "./deadline_engine.service.js";
import { generateAlerts } from "./instruction_alerts.service.js";

export function buildInstructionSnapshot(dossier: typeof dossiersTable.$inferSelect) {
  const dateLimiteInstruction = computeDeadline(dossier);
  const tacite = isTacite({ ...dossier, dateLimiteInstruction });
  const systemAlerts = generateAlerts({ ...dossier, dateLimiteInstruction }).alerts;

  return {
    instructionStatus: dossier.instructionStatus || "depose",
    dateDepot: dossier.dateDepot,
    dateCompletude: dossier.dateCompletude,
    dateLimiteInstruction,
    isTacite: tacite,
    alerts: systemAlerts,
  };
}

export async function onDossierUpdated(dossier: typeof dossiersTable.$inferSelect) {
  const snapshot = buildInstructionSnapshot(dossier);
  await db.update(dossiersTable)
    .set({
      dateLimiteInstruction: snapshot.dateLimiteInstruction,
      isTacite: snapshot.isTacite,
      updatedAt: new Date(),
    })
    .where(eq(dossiersTable.id, dossier.id));
  return snapshot;
}
