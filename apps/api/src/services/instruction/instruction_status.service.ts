import { db, dossiersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeDeadline, isTacite } from "./deadline_engine.service.js";
import { createEvent, INSTRUCTION_EVENT_TYPES } from "./instruction_events.service.js";

export async function updateInstructionStatus(dossierId: string, status: string) {
  const [current] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
  const dateLimiteInstruction = current ? computeDeadline({ ...current, instructionStatus: status }) : null;
  const tacite = current ? isTacite({ ...current, dateLimiteInstruction }) : false;

  const [updated] = await db.update(dossiersTable)
    .set({
      instructionStatus: status,
      dateLimiteInstruction,
      isTacite: tacite,
      updatedAt: new Date(),
    })
    .where(eq(dossiersTable.id, dossierId))
    .returning();

  await createEvent(dossierId, INSTRUCTION_EVENT_TYPES.STATUT_CHANGE, {
    fromStatus: current?.instructionStatus,
    toStatus: status,
    description: `Statut d'instruction mis à jour : ${status}`,
  });

  return updated;
}

export async function markAsComplete(dossierId: string) {
  const now = new Date();
  const [current] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
  const dateLimiteInstruction = computeDeadline({ ...current, dateCompletude: now });

  const [updated] = await db.update(dossiersTable)
    .set({
      instructionStatus: "complet",
      dateCompletude: now,
      dateLimiteInstruction,
      isTacite: isTacite({ ...current, dateCompletude: now, dateLimiteInstruction }),
      updatedAt: now,
    })
    .where(eq(dossiersTable.id, dossierId))
    .returning();

  await createEvent(dossierId, INSTRUCTION_EVENT_TYPES.PIECE_RECUE, {
    description: "Dossier marqué complet.",
    dateCompletude: now.toISOString(),
    dateLimiteInstruction: dateLimiteInstruction?.toISOString() || null,
  });

  return updated;
}

export async function markAsIncomplete(dossierId: string) {
  const [updated] = await db.update(dossiersTable)
    .set({
      instructionStatus: "incomplet",
      dateCompletude: null,
      dateLimiteInstruction: null,
      isTacite: false,
      updatedAt: new Date(),
    })
    .where(eq(dossiersTable.id, dossierId))
    .returning();

  await createEvent(dossierId, INSTRUCTION_EVENT_TYPES.PIECE_DEMANDEE, {
    description: "Dossier marqué incomplet, demande de pièces complémentaires.",
  });

  return updated;
}
