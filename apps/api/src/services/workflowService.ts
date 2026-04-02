import { db, dossiersTable, dossierEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger.js";

/**
 * Workflow Manager Service
 * Handles state transitions for dossiers and historization.
 */
export const DOSSIER_STATUS = {
  BROUILLON: "BROUILLON",
  DEPOSE: "DEPOSE",
  PRE_INSTRUCTION: "PRE_INSTRUCTION",
  INCOMPLET: "INCOMPLET",
  TRANSMIS_METROPOLE: "TRANSMIS_METROPOLE",
  EN_INSTRUCTION: "EN_INSTRUCTION",
  ATTENTE_ABF: "ATTENTE_ABF",
  AVIS_ABF_RECU: "AVIS_ABF_RECU",
  DECISION_EN_COURS: "DECISION_EN_COURS",
  ACCEPTE: "ACCEPTE",
  REFUSE: "REFUSE",
  ACCORD_PRESCRIPTION: "ACCORD_PRESCRIPTION"
};

export class WorkflowService {
  /**
   * Transition de statut avec historisation
   */
  static async transitionStatus(
    dossierId: string, 
    toStatus: string, 
    actorId: string, 
    description: string,
    metadata: any = {}
  ) {
    logger.info(`[Workflow] Transitioning dossier ${dossierId} to ${toStatus}`, { actorId });

    return await db.transaction(async (tx) => {
      // 1. Fetch current status
      const [dossier] = await tx.select({ status: dossiersTable.status }).from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
      
      const fromStatus = dossier?.status || "UNKNOWN";

      // 2. Update Dossier
      await tx.update(dossiersTable)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(eq(dossiersTable.id, dossierId));

      // 3. Create Event record for timeline
      await tx.insert(dossierEventsTable).values({
        dossierId,
        userId: actorId,
        type: "STATUS_CHANGE",
        fromStatus,
        toStatus,
        description,
        metadata
      });

      return { dossierId, fromStatus, toStatus };
    });
  }

  /**
   * Demande de pièces complémentaires (Passage en INCOMPLET)
   */
  static async setIncomplete(dossierId: string, actorId: string, missingPieces: string[]) {
    const description = `Dossier déclaré incomplet. Pièces manquantes : ${missingPieces.join(", ")}`;
    return this.transitionStatus(dossierId, DOSSIER_STATUS.INCOMPLET, actorId, description, { missingPieces });
  }

  /**
   * Transmission à la Métropole
   */
  static async transmitToMetropole(dossierId: string, actorId: string, metropoleId: string) {
    logger.info(`[Workflow] Transmitting to Metropole ${metropoleId}`);
    
    return await db.transaction(async (tx) => {
      await tx.update(dossiersTable)
        .set({ 
          status: DOSSIER_STATUS.TRANSMIS_METROPOLE, 
          assignedMetropoleId: metropoleId,
          updatedAt: new Date() 
        })
        .where(eq(dossiersTable.id, dossierId));

      await tx.insert(dossierEventsTable).values({
        dossierId,
        userId: actorId,
        type: "ASSIGNMENT",
        toStatus: DOSSIER_STATUS.TRANSMIS_METROPOLE,
        description: "Dossier transmis au service instructeur de la Métropole.",
        metadata: { metropoleId }
      });
    });
  }

  /**
   * Engagement automatique de l'ABF
   */
  static async engageABF(dossierId: string, reason: string = "Périmètre protégé détecté") {
    return await db.transaction(async (tx) => {
      await tx.update(dossiersTable)
        .set({ 
          status: DOSSIER_STATUS.ATTENTE_ABF, 
          isAbfConcerned: true,
          updatedAt: new Date() 
        })
        .where(eq(dossiersTable.id, dossierId));

      await tx.insert(dossierEventsTable).values({
        dossierId,
        type: "STATUS_CHANGE",
        toStatus: DOSSIER_STATUS.ATTENTE_ABF,
        description: `Consultation de l'ABF requise : ${reason}`,
        metadata: { trigger: "AUTO_DETECTION" }
      });
    });
  }
}
