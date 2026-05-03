import { db, dossiersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeDeadline, isTacite } from "./instruction/deadline_engine.service.js";

export type InstructionDeadlineDossier = {
  id?: string;
  typeProcedure?: string | null;
  dateDepot?: Date | string | null;
  dateCompletude?: Date | string | null;
  dateLimiteInstruction?: Date | string | null;
  isTacite?: boolean | null;
};

export function computeInstructionDeadline(dossier: InstructionDeadlineDossier) {
  return computeDeadline(dossier);
}

export function computeTaciteRisk(dossier: InstructionDeadlineDossier, now = new Date()) {
  return isTacite(dossier, now);
}

export async function refreshInstructionDeadline(dossierId: string) {
  const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
  if (!dossier) return null;

  const dateLimiteInstruction = computeInstructionDeadline(dossier);
  const isTacite = computeTaciteRisk({ ...dossier, dateLimiteInstruction });

  const [updated] = await db.update(dossiersTable)
    .set({
      dateLimiteInstruction,
      isTacite,
      updatedAt: new Date(),
    })
    .where(eq(dossiersTable.id, dossierId))
    .returning();

  return updated;
}
