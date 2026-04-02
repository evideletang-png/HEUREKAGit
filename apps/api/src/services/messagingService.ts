import { db, dossierMessagesTable, dossierEventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

/**
 * Messaging Service
 * Handles threaded discussions and mentions (@role) for dossiers.
 */
export class MessagingService {
  /**
   * Envoi d'un message avec détection de mentions
   */
  static async sendMessage(
    dossierId: string, 
    fromUserId: string, 
    fromRole: string, 
    content: string, 
    parentId?: number,
    documentId?: string
  ) {
    logger.info(`[Messaging] Message from ${fromRole} on dossier ${dossierId}`);

    // 1. Détection des mentions (@ABF, @Metropole, @Mairie)
    const mentionRegex = /@([A-Za-zÀ-ÖØ-öø-ÿ0-9]+)/g;
    const mentions = content.match(mentionRegex) || [];
    
    return await db.transaction(async (tx) => {
      // 2. Insert Message
      const [newMsg] = await tx.insert(dossierMessagesTable).values({
        dossierId,
        fromUserId,
        fromRole,
        content,
        parentId,
        documentId,
        mentions
      }).returning();

      // 3. Log event if specific labels are mentioned (Alerting)
      if (mentions.length > 0) {
        await tx.insert(dossierEventsTable).values({
          dossierId,
          userId: fromUserId,
          type: "MESSAGE",
          description: `Message avec mention de ${mentions.join(", ")} ajouté par ${fromRole}.`,
          metadata: { messageId: newMsg.id, mentions }
        });
      }

      return newMsg;
    });
  }

  /**
   * Récupération du thread complet
   */
  static async getThread(dossierId: string) {
    return await db.select()
      .from(dossierMessagesTable)
      .where(eq(dossierMessagesTable.dossierId, dossierId))
      .orderBy(sql`${dossierMessagesTable.createdAt} ASC`);
  }
}
