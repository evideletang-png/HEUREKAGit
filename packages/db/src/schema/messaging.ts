import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { dossiersTable } from "./dossiers";
import { usersTable } from "./users";

export const messagingConversationsTable = pgTable("messaging_conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dossierId: uuid("dossier_id").notNull().references(() => dossiersTable.id, { onDelete: "cascade" }),
  subject: text("subject"),
  visibility: text("visibility").notNull().default("INTERNAL"),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dossierIdx: index("messaging_conversations_dossier_idx").on(table.dossierId),
  visibilityIdx: index("messaging_conversations_visibility_idx").on(table.visibility),
}));

export const messagingConversationParticipantsTable = pgTable("messaging_conversation_participants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").notNull().references(() => messagingConversationsTable.id, { onDelete: "cascade" }),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  role: text("role").notNull().default("PARTICIPANT"),
  canSeeInternal: boolean("can_see_internal").notNull().default(false),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
}, (table) => ({
  conversationIdx: index("messaging_participants_conversation_idx").on(table.conversationId),
  actorIdx: index("messaging_participants_actor_idx").on(table.actorType, table.actorId),
}));

export const messagingMessagesTable = pgTable("messaging_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").notNull().references(() => messagingConversationsTable.id, { onDelete: "cascade" }),
  authorActorType: text("author_actor_type").notNull(),
  authorId: text("author_id").notNull().references(() => usersTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("INTERNAL"),
  parentMessageId: uuid("parent_message_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  editedAt: timestamp("edited_at"),
}, (table) => ({
  conversationIdx: index("messaging_messages_conversation_idx").on(table.conversationId),
  visibilityIdx: index("messaging_messages_visibility_idx").on(table.visibility),
  createdAtIdx: index("messaging_messages_created_at_idx").on(table.createdAt),
}));

export const messagingMessageMentionsTable = pgTable("messaging_message_mentions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid("message_id").notNull().references(() => messagingMessagesTable.id, { onDelete: "cascade" }),
  mentionedActorType: text("mentioned_actor_type").notNull(),
  mentionedActorId: text("mentioned_actor_id").notNull(),
  notifiedAt: timestamp("notified_at"),
}, (table) => ({
  messageIdx: index("messaging_mentions_message_idx").on(table.messageId),
  actorIdx: index("messaging_mentions_actor_idx").on(table.mentionedActorType, table.mentionedActorId),
}));

export const messagingAttachmentsTable = pgTable("messaging_attachments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid("message_id").notNull().references(() => messagingMessagesTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  scanStatus: text("scan_status").notNull().default("PENDING"),
  scanCompletedAt: timestamp("scan_completed_at"),
  scanDetails: jsonb("scan_details").default({}),
  uploadedByActorType: text("uploaded_by_actor_type").notNull(),
  uploadedById: text("uploaded_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  messageIdx: index("messaging_attachments_message_idx").on(table.messageId),
  scanStatusIdx: index("messaging_attachments_scan_status_idx").on(table.scanStatus),
}));

export const messagingNotificationEventsTable = pgTable("messaging_notification_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientActorType: text("recipient_actor_type").notNull(),
  recipientId: text("recipient_id").notNull(),
  eventType: text("event_type").notNull(),
  conversationId: uuid("conversation_id").notNull().references(() => messagingConversationsTable.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => messagingMessagesTable.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at"),
  sentChannels: jsonb("sent_channels").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index("messaging_notification_events_recipient_idx").on(table.recipientActorType, table.recipientId),
  conversationIdx: index("messaging_notification_events_conversation_idx").on(table.conversationId),
}));

export type MessagingConversation = typeof messagingConversationsTable.$inferSelect;
export type MessagingMessage = typeof messagingMessagesTable.$inferSelect;
