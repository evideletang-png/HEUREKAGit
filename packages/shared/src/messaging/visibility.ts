import type { MessagingActorContext, MessagingActorType, MessagingVisibility, MessagingVisibilityDecision } from "./types.js";

export function actorTypeFromRole(role?: string | null): MessagingActorType {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "metropole") return "METROPOLE";
  if (normalized === "abf") return "ABF";
  if (normalized === "citoyen" || normalized === "user") return "CITOYEN";
  return "MAIRIE";
}

export function canActorSeeConversation(args: {
  actor: MessagingActorContext;
  conversationVisibility: MessagingVisibility;
}): MessagingVisibilityDecision {
  const { actor, conversationVisibility } = args;
  if (actor.actorType === "CITOYEN") {
    return actor.isParticipant && conversationVisibility === "PUBLIC"
      ? { allowed: true, reason: "citizen_public_participant" }
      : { allowed: false, reason: "citizen_public_participant_required" };
  }

  if (conversationVisibility === "RESTRICTED") {
    return actor.isParticipant
      ? { allowed: true, reason: "restricted_participant" }
      : { allowed: false, reason: "restricted_participant_required" };
  }

  if (actor.actorType === "ABF") {
    return actor.isParticipant
      ? { allowed: true, reason: "abf_explicit_participant" }
      : { allowed: false, reason: "abf_explicit_participant_required" };
  }

  if (actor.isParticipant || actor.hasDossierScope) {
    return { allowed: true, reason: "service_scope_or_participant" };
  }

  return { allowed: false, reason: "scope_or_participant_required" };
}

export function canActorSeeMessage(args: {
  actor: MessagingActorContext;
  conversationVisibility: MessagingVisibility;
  messageVisibility: MessagingVisibility;
}): MessagingVisibilityDecision {
  const conversationDecision = canActorSeeConversation({
    actor: args.actor,
    conversationVisibility: args.conversationVisibility,
  });
  if (!conversationDecision.allowed) return conversationDecision;

  if (args.actor.actorType === "CITOYEN") {
    return args.messageVisibility === "PUBLIC" && args.actor.isParticipant
      ? { allowed: true, reason: "citizen_public_message" }
      : { allowed: false, reason: "citizen_never_internal_or_restricted" };
  }

  if (args.messageVisibility === "PUBLIC") {
    return { allowed: true, reason: "public_message" };
  }

  if (args.messageVisibility === "INTERNAL") {
    if (args.actor.actorType === "ABF") {
      return args.actor.isParticipant && args.actor.canSeeInternal
        ? { allowed: true, reason: "abf_internal_participant" }
        : { allowed: false, reason: "abf_internal_participant_required" };
    }
    return args.actor.canSeeInternal && (args.actor.isParticipant || args.actor.hasDossierScope)
      ? { allowed: true, reason: "internal_service_scope" }
      : { allowed: false, reason: "internal_scope_required" };
  }

  return args.actor.isParticipant
    ? { allowed: true, reason: "restricted_message_participant" }
    : { allowed: false, reason: "restricted_message_participant_required" };
}

export function canActorCreateMessage(args: {
  actor: MessagingActorContext;
  conversationVisibility: MessagingVisibility;
  messageVisibility: MessagingVisibility;
}): MessagingVisibilityDecision {
  const readDecision = canActorSeeConversation({
    actor: args.actor,
    conversationVisibility: args.conversationVisibility,
  });
  if (!readDecision.allowed) return readDecision;

  if (args.actor.actorType === "CITOYEN") {
    return args.actor.isParticipant && args.messageVisibility === "PUBLIC"
      ? { allowed: true, reason: "citizen_public_write" }
      : { allowed: false, reason: "citizen_can_only_write_public" };
  }

  if (args.messageVisibility === "PUBLIC") return { allowed: true, reason: "service_public_write" };
  if (args.messageVisibility === "INTERNAL") {
    return args.actor.canSeeInternal
      ? { allowed: true, reason: "service_internal_write" }
      : { allowed: false, reason: "internal_write_requires_internal_access" };
  }
  return args.actor.isParticipant
    ? { allowed: true, reason: "restricted_write_participant" }
    : { allowed: false, reason: "restricted_write_requires_participant" };
}

export function canMentionActor(args: {
  messageVisibility: MessagingVisibility;
  mentionedActorType: MessagingActorType;
}): MessagingVisibilityDecision {
  if (args.mentionedActorType === "CITOYEN" && args.messageVisibility !== "PUBLIC") {
    return { allowed: false, reason: "citizen_mention_requires_public_message" };
  }
  return { allowed: true, reason: "mention_allowed" };
}

export function defaultInternalAccess(actorType: MessagingActorType) {
  return actorType !== "CITOYEN";
}
