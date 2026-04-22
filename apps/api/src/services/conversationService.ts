import { db } from "@workspace/db";
import {
  dossierEventsTable,
  dossiersTable,
  messagingConversationParticipantsTable,
  messagingConversationsTable,
  messagingMessageMentionsTable,
  messagingMessagesTable,
  messagingNotificationEventsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import {
  actorTypeFromRole,
  canActorCreateMessage,
  canActorSeeConversation,
  canActorSeeMessage,
  canMentionActor,
  defaultInternalAccess,
  type MessagingActorContext,
  type MessagingActorType,
  type MessagingVisibility,
} from "@workspace/shared/messaging";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

type UserContext = {
  userId: string;
  email?: string | null;
  role: string;
  communes: string[];
};

type ConversationParticipantInput = {
  actorType: MessagingActorType;
  actorId: string;
  role?: "OWNER" | "PARTICIPANT" | "OBSERVER";
  canSeeInternal?: boolean;
};

function normalizeVisibility(value: unknown, fallback: MessagingVisibility): MessagingVisibility {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "PUBLIC" || normalized === "INTERNAL" || normalized === "RESTRICTED") return normalized;
  return fallback;
}

function parseMentions(body: string) {
  const matches = body.match(/@([A-Za-zÀ-ÖØ-öø-ÿ0-9_.-]+)/g) || [];
  return [...new Set(matches.map((match) => match.slice(1).toLowerCase()))];
}

function actorTypeForMention(raw: string): MessagingActorType | null {
  const token = raw.toLowerCase().replace(/[0-9]/g, "");
  if (token === "mairie" || token === "admin") return "MAIRIE";
  if (token === "metropole" || token === "métropole") return "METROPOLE";
  if (token === "abf") return "ABF";
  if (token === "citoyen" || token === "petitionnaire" || token === "pétitionnaire") return "CITOYEN";
  return null;
}

function parseCommunes(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof parsed === "string") return [parsed.trim()].filter(Boolean);
  } catch {}
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

async function getUserContext(userId: string): Promise<UserContext> {
  const [user] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    communes: usersTable.communes,
    email: usersTable.email,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  return {
    userId,
    email: user?.email,
    role: String(user?.role || "citoyen"),
    communes: parseCommunes(user?.communes),
  };
}

function hasDossierScope(user: UserContext, dossier: typeof dossiersTable.$inferSelect) {
  const role = user.role.toLowerCase();
  if (role === "admin" || role === "super_admin") return true;
  if (dossier.userId === user.userId) return true;
  if ((role === "mairie" || role === "metropole") && dossier.commune) {
    return user.communes.some((commune) => commune.toLowerCase() === dossier.commune!.toLowerCase());
  }
  return false;
}

function toActorContext(args: {
  user: UserContext;
  participants: Array<typeof messagingConversationParticipantsTable.$inferSelect>;
  dossier: typeof dossiersTable.$inferSelect;
}) {
  const actorType = actorTypeFromRole(args.user.role);
  const participant = args.participants.find((item) => item.actorType === actorType && item.actorId === args.user.userId && !item.leftAt);
  const scope = hasDossierScope(args.user, args.dossier);
  const actor: MessagingActorContext = {
    actorType,
    actorId: args.user.userId,
    isParticipant: !!participant,
    canSeeInternal: participant?.canSeeInternal ?? defaultInternalAccess(actorType),
    hasDossierScope: scope,
  };
  return actor;
}

async function loadConversation(conversationId: string) {
  const [conversation] = await db.select().from(messagingConversationsTable)
    .where(eq(messagingConversationsTable.id, conversationId))
    .limit(1);
  if (!conversation) return null;
  const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, conversation.dossierId)).limit(1);
  if (!dossier) return null;
  const participants = await db.select().from(messagingConversationParticipantsTable)
    .where(eq(messagingConversationParticipantsTable.conversationId, conversation.id));
  return { conversation, dossier, participants };
}

async function notifyParticipants(args: {
  conversationId: string;
  messageId: string;
  dossierId: string;
  authorId: string;
  title: string;
  body: string;
  participants: Array<typeof messagingConversationParticipantsTable.$inferSelect>;
  messageVisibility: MessagingVisibility;
}) {
  const recipients = args.participants
    .filter((participant) => participant.actorId !== args.authorId && !participant.leftAt)
    .filter((participant) => {
      if (participant.actorType === "CITOYEN") return args.messageVisibility === "PUBLIC";
      return true;
    });

  if (recipients.length === 0) return;

  await db.insert(messagingNotificationEventsTable).values(recipients.map((recipient) => ({
    recipientActorType: recipient.actorType,
    recipientId: recipient.actorId,
    eventType: "MESSAGE_RECEIVED",
    conversationId: args.conversationId,
    messageId: args.messageId,
    sentChannels: { in_app: new Date().toISOString() },
  })));

  const userRecipients = recipients.filter((recipient) => recipient.actorId);
  if (userRecipients.length > 0) {
    await db.insert(notificationsTable).values(userRecipients.map((recipient) => ({
      userId: recipient.actorId,
      dossierId: args.dossierId,
      type: "MESSAGE",
      title: args.title,
      message: args.body,
      priority: args.messageVisibility === "PUBLIC" ? "MEDIUM" : "LOW",
    }))).catch(() => undefined);
  }
}

export class ConversationService {
  static async listForDossier(dossierId: string, userId: string) {
    const user = await getUserContext(userId);
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
    if (!dossier) throw new Error("DOSSIER_NOT_FOUND");

    const conversations = await db.select().from(messagingConversationsTable)
      .where(and(eq(messagingConversationsTable.dossierId, dossier.id), isNull(messagingConversationsTable.archivedAt)))
      .orderBy(asc(messagingConversationsTable.createdAt));
    if (conversations.length === 0) {
      const created = await this.ensureDefaultConversation(dossierId, userId);
      return [created.conversation];
    }

    const participants = await db.select().from(messagingConversationParticipantsTable)
      .where(inArray(messagingConversationParticipantsTable.conversationId, conversations.map((conversation) => conversation.id)));

    return conversations.filter((conversation) => {
      const actor = toActorContext({
        user,
        dossier,
        participants: participants.filter((participant) => participant.conversationId === conversation.id),
      });
      return canActorSeeConversation({
        actor,
        conversationVisibility: normalizeVisibility(conversation.visibility, "INTERNAL"),
      }).allowed;
    });
  }

  static async ensureDefaultConversation(dossierId: string, userId: string) {
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
    if (!dossier) throw new Error("DOSSIER_NOT_FOUND");
    const user = await getUserContext(userId);
    if (!hasDossierScope(user, dossier)) throw new Error("FORBIDDEN");

    const [existing] = await db.select().from(messagingConversationsTable)
      .where(and(eq(messagingConversationsTable.dossierId, dossierId), eq(messagingConversationsTable.subject, "Fil principal")))
      .limit(1);
    if (existing) {
      const participants = await db.select().from(messagingConversationParticipantsTable)
        .where(eq(messagingConversationParticipantsTable.conversationId, existing.id));
      return { conversation: existing, participants };
    }

    const actorType = actorTypeFromRole(user.role);

    const [conversation] = await db.insert(messagingConversationsTable).values({
      dossierId,
      subject: "Fil principal",
      visibility: "PUBLIC",
      createdBy: userId,
    }).returning();

    const participants: ConversationParticipantInput[] = [
      { actorType, actorId: userId, role: "OWNER", canSeeInternal: defaultInternalAccess(actorType) },
    ];
    if (dossier.userId && dossier.userId !== userId) {
      participants.push({ actorType: "CITOYEN", actorId: dossier.userId, role: "PARTICIPANT", canSeeInternal: false });
    }

    await db.insert(messagingConversationParticipantsTable).values(participants.map((participant) => ({
      conversationId: conversation.id,
      actorType: participant.actorType,
      actorId: participant.actorId,
      role: participant.role || "PARTICIPANT",
      canSeeInternal: participant.canSeeInternal ?? defaultInternalAccess(participant.actorType),
    })));

    const savedParticipants = await db.select().from(messagingConversationParticipantsTable)
      .where(eq(messagingConversationParticipantsTable.conversationId, conversation.id));
    return { conversation, participants: savedParticipants };
  }

  static async createConversation(args: {
    dossierId: string;
    userId: string;
    subject?: string;
    visibility?: MessagingVisibility;
    participants?: ConversationParticipantInput[];
  }) {
    const user = await getUserContext(args.userId);
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, args.dossierId)).limit(1);
    if (!dossier) throw new Error("DOSSIER_NOT_FOUND");
    if (!hasDossierScope(user, dossier)) throw new Error("FORBIDDEN");

    const visibility = normalizeVisibility(args.visibility, "INTERNAL");
    const actorType = actorTypeFromRole(user.role);
    const [conversation] = await db.insert(messagingConversationsTable).values({
      dossierId: args.dossierId,
      subject: args.subject || "Nouvelle conversation",
      visibility,
      createdBy: args.userId,
    }).returning();

    const participants = [
      { actorType, actorId: args.userId, role: "OWNER" as const, canSeeInternal: defaultInternalAccess(actorType) },
      ...(args.participants || []),
    ];
    const uniqueParticipants = new Map<string, ConversationParticipantInput>();
    for (const participant of participants) {
      uniqueParticipants.set(`${participant.actorType}:${participant.actorId}`, participant);
    }

    await db.insert(messagingConversationParticipantsTable).values([...uniqueParticipants.values()].map((participant) => ({
      conversationId: conversation.id,
      actorType: participant.actorType,
      actorId: participant.actorId,
      role: participant.role || "PARTICIPANT",
      canSeeInternal: participant.canSeeInternal ?? defaultInternalAccess(participant.actorType),
    })));

    await db.insert(dossierEventsTable).values({
      dossierId: args.dossierId,
      userId: args.userId,
      type: "MESSAGE",
      description: `Conversation créée: ${conversation.subject || "Sans sujet"}.`,
      metadata: { conversationId: conversation.id, visibility },
    });

    return conversation;
  }

  static async getConversation(conversationId: string, userId: string) {
    const loaded = await loadConversation(conversationId);
    if (!loaded) throw new Error("CONVERSATION_NOT_FOUND");
    const user = await getUserContext(userId);
    const actor = toActorContext({ user, dossier: loaded.dossier, participants: loaded.participants });
    const decision = canActorSeeConversation({
      actor,
      conversationVisibility: normalizeVisibility(loaded.conversation.visibility, "INTERNAL"),
    });
    if (!decision.allowed) throw new Error("FORBIDDEN");
    return loaded;
  }

  static async getMessages(conversationId: string, userId: string) {
    const loaded = await this.getConversation(conversationId, userId);
    const user = await getUserContext(userId);
    const actor = toActorContext({ user, dossier: loaded.dossier, participants: loaded.participants });
    const conversationVisibility = normalizeVisibility(loaded.conversation.visibility, "INTERNAL");
    const messages = await db.select().from(messagingMessagesTable)
      .where(and(eq(messagingMessagesTable.conversationId, conversationId), isNull(messagingMessagesTable.deletedAt)))
      .orderBy(asc(messagingMessagesTable.createdAt));

    return messages.filter((message) => canActorSeeMessage({
      actor,
      conversationVisibility,
      messageVisibility: normalizeVisibility(message.visibility, conversationVisibility),
    }).allowed);
  }

  static async sendMessage(args: {
    conversationId: string;
    userId: string;
    body: string;
    visibility?: MessagingVisibility;
    parentMessageId?: string | null;
  }) {
    const loaded = await this.getConversation(args.conversationId, args.userId);
    const user = await getUserContext(args.userId);
    const actor = toActorContext({ user, dossier: loaded.dossier, participants: loaded.participants });
    const conversationVisibility = normalizeVisibility(loaded.conversation.visibility, "INTERNAL");
    const messageVisibility = normalizeVisibility(args.visibility, conversationVisibility);
    const writeDecision = canActorCreateMessage({ actor, conversationVisibility, messageVisibility });
    if (!writeDecision.allowed) throw new Error("FORBIDDEN");

    const body = args.body.trim();
    if (!body) throw new Error("EMPTY_MESSAGE");
    if (body.length > 4000) throw new Error("MESSAGE_TOO_LONG");

    const mentionTokens = parseMentions(body);
    const mentionActors = mentionTokens
      .map((token) => ({ token, actorType: actorTypeForMention(token) }))
      .filter((mention): mention is { token: string; actorType: MessagingActorType } => !!mention.actorType);

    for (const mention of mentionActors) {
      const decision = canMentionActor({ messageVisibility, mentionedActorType: mention.actorType });
      if (!decision.allowed) throw new Error("INVALID_MENTION_VISIBILITY");
    }

    const [message] = await db.insert(messagingMessagesTable).values({
      conversationId: args.conversationId,
      authorActorType: actor.actorType,
      authorId: args.userId,
      body,
      visibility: messageVisibility,
      parentMessageId: args.parentMessageId || null,
    }).returning();

    const mentionRows = mentionActors.flatMap((mention) => {
      const matchingParticipants = loaded.participants.filter((participant) => participant.actorType === mention.actorType && !participant.leftAt);
      return matchingParticipants.map((participant) => ({
        messageId: message.id,
        mentionedActorType: participant.actorType,
        mentionedActorId: participant.actorId,
      }));
    });
    if (mentionRows.length > 0) {
      await db.insert(messagingMessageMentionsTable).values(mentionRows);
    }

    await notifyParticipants({
      conversationId: loaded.conversation.id,
      messageId: message.id,
      dossierId: loaded.dossier.id,
      authorId: args.userId,
      title: `Nouveau message sur ${loaded.dossier.dossierNumber || loaded.dossier.title}`,
      body: messageVisibility === "PUBLIC"
        ? `${user.email || "Un utilisateur"} a ajouté un message.`
        : "Un échange interne a été ajouté au dossier.",
      participants: loaded.participants,
      messageVisibility,
    });

    await db.insert(dossierEventsTable).values({
      dossierId: loaded.dossier.id,
      userId: args.userId,
      type: "MESSAGE",
      description: `Message ${messageVisibility.toLowerCase()} ajouté dans la conversation ${loaded.conversation.subject || loaded.conversation.id}.`,
      metadata: { conversationId: loaded.conversation.id, messageId: message.id, mentions: mentionTokens },
    });

    return message;
  }

  static async addParticipant(args: {
    conversationId: string;
    userId: string;
    participant: ConversationParticipantInput;
  }) {
    const loaded = await this.getConversation(args.conversationId, args.userId);
    const user = await getUserContext(args.userId);
    if (!hasDossierScope(user, loaded.dossier)) throw new Error("FORBIDDEN");

    const [participant] = await db.insert(messagingConversationParticipantsTable).values({
      conversationId: args.conversationId,
      actorType: args.participant.actorType,
      actorId: args.participant.actorId,
      role: args.participant.role || "PARTICIPANT",
      canSeeInternal: args.participant.canSeeInternal ?? defaultInternalAccess(args.participant.actorType),
    }).returning();

    await db.insert(dossierEventsTable).values({
      dossierId: loaded.dossier.id,
      userId: args.userId,
      type: "MESSAGE",
      description: `Participant ajouté à la conversation: ${participant.actorType}.`,
      metadata: { conversationId: args.conversationId, participantId: participant.id },
    });

    return participant;
  }
}
