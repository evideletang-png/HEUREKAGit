import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";
import { logger } from "../utils/logger.js";

/**
 * Notification Service
 * Manages the creation and retrieval of user alerts and tasks.
 */
export class NotificationService {
  /**
   * Create a single notification for a specific user
   */
  static async createNotification(data: {
    userId: string;
    dossierId?: string;
    type: 'MENTION' | 'MESSAGE' | 'NEW_DOSSIER' | 'STATUS_CHANGE';
    title: string;
    message: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  }) {
    try {
      const [notif] = await db.insert(notificationsTable).values({
        userId: data.userId,
        dossierId: data.dossierId as any,
        type: data.type,
        title: data.title,
        message: data.message,
        priority: data.priority || 'MEDIUM',
      }).returning();
      
      logger.info(`[Notification] Created ${data.type} for user ${data.userId}`);
      return notif;
    } catch (error) {
      logger.error(`[NotificationService] Error creating notification: ${error}`);
      return null;
    }
  }

  /**
   * Notify all users of a specific role belonging to a commune
   */
  static async notifyRoleInCommune(data: {
    role: string;
    commune: string;
    dossierId: string;
    type: 'MENTION' | 'MESSAGE' | 'NEW_DOSSIER' | 'STATUS_CHANGE';
    title: string;
    message: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  }) {
    try {
      // Find all users with this role and commune (JSONB containment check)
      console.log(`[NotificationService] Searching for users in ${data.commune} with role ${data.role}`);
      const targetUsers = await db.select().from(usersTable)
        .where(and(
          eq(usersTable.role, data.role.toLowerCase() as any),
          or(
            sql`${usersTable.communes}::jsonb @> ${JSON.stringify([data.commune])}::jsonb`,
            ilike(usersTable.communes, `%${data.commune}%`)
          )
        ));

      console.log(`[NotificationService] Found ${targetUsers.length} users: ${targetUsers.map(u => u.email).join(', ')}`);

      const creations = targetUsers.map(user => 
        this.createNotification({
          userId: user.id,
          dossierId: data.dossierId,
          type: data.type,
          title: data.title,
          message: data.message,
          priority: data.priority,
        })
      );

      await Promise.all(creations);
      logger.info(`[Notification] Batch notified ${targetUsers.length} users with role ${data.role} in ${data.commune}`);
    } catch (error) {
      logger.error(`[NotificationService] Error notifying role ${data.role}: ${error}`);
    }
  }

  /**
   * List notifications for a user
   */
  static async getUserNotifications(userId: string, limit = 50) {
    return await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(id: string, userId: string) {
    return await db.update(notificationsTable)
      .set({ isRead: true })
      .where(and(
        eq(notificationsTable.id, id as any),
        eq(notificationsTable.userId, userId)
      ))
      .returning();
  }

  /**
   * Mark all as read
   */
  static async markAllRead(userId: string) {
    return await db.update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, userId))
      .returning();
  }
}
