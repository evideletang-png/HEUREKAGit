import { db, instructionEventsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export const INSTRUCTION_EVENT_TYPES = {
  DEPOT: "depot",
  PIECE_DEMANDEE: "piece_demandee",
  PIECE_RECUE: "piece_recue",
  STATUT_CHANGE: "statut_change",
  INSTRUCTION_DEMARREE: "instruction_demarree",
} as const;

export type InstructionEventType = typeof INSTRUCTION_EVENT_TYPES[keyof typeof INSTRUCTION_EVENT_TYPES];

export async function createInstructionEvent(
  dossierId: string,
  type: InstructionEventType | string,
  metadata: Record<string, unknown> = {},
) {
  const [event] = await db.insert(instructionEventsTable).values({
    dossierId,
    type,
    metadata,
  }).returning();

  return event;
}

export async function getInstructionTimeline(dossierId: string) {
  return db.select()
    .from(instructionEventsTable)
    .where(eq(instructionEventsTable.dossierId, dossierId))
    .orderBy(desc(instructionEventsTable.createdAt));
}
