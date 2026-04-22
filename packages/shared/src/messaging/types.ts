export type MessagingActorType = "MAIRIE" | "METROPOLE" | "ABF" | "CITOYEN";
export type MessagingVisibility = "PUBLIC" | "INTERNAL" | "RESTRICTED";
export type MessagingParticipantRole = "OWNER" | "PARTICIPANT" | "OBSERVER";

export type MessagingActorContext = {
  actorType: MessagingActorType;
  actorId: string;
  isParticipant: boolean;
  canSeeInternal: boolean;
  hasDossierScope: boolean;
};

export type MessagingVisibilityDecision = {
  allowed: boolean;
  reason: string;
};

export type MessagingConversationSummary = {
  id: string;
  dossierId: string;
  subject: string | null;
  visibility: MessagingVisibility;
  createdAt: string;
  updatedAt: string;
};
