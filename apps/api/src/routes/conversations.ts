import { Router, type IRouter } from "express";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";
import { ConversationService } from "../services/conversationService.js";
import type { MessagingActorType, MessagingVisibility } from "@workspace/shared/messaging";

const router: IRouter = Router();

function sendError(res: any, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "DOSSIER_NOT_FOUND" || message === "CONVERSATION_NOT_FOUND") {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  if (message === "FORBIDDEN") {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  if (message === "EMPTY_MESSAGE" || message === "MESSAGE_TOO_LONG" || message === "INVALID_MENTION_VISIBILITY") {
    res.status(400).json({ error: message });
    return;
  }
  console.error("[conversations]", error);
  res.status(500).json({ error: "INTERNAL_ERROR" });
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const dossierId = String(req.query.dossier_id || req.query.dossierId || "");
    if (!dossierId) {
      res.status(400).json({ error: "DOSSIER_ID_REQUIRED" });
      return;
    }
    const conversations = await ConversationService.listForDossier(dossierId, req.user!.userId);
    res.json({ conversations });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { dossier_id, dossierId, subject, visibility, initial_participants } = req.body as {
      dossier_id?: string;
      dossierId?: string;
      subject?: string;
      visibility?: MessagingVisibility;
      initial_participants?: Array<{
        actor_type?: MessagingActorType;
        actorType?: MessagingActorType;
        actor_id?: string;
        actorId?: string;
        role?: "OWNER" | "PARTICIPANT" | "OBSERVER";
        can_see_internal?: boolean;
        canSeeInternal?: boolean;
      }>;
    };
    const targetDossierId = dossier_id || dossierId;
    if (!targetDossierId) {
      res.status(400).json({ error: "DOSSIER_ID_REQUIRED" });
      return;
    }
    const conversation = await ConversationService.createConversation({
      dossierId: targetDossierId,
      userId: req.user!.userId,
      subject,
      visibility,
      participants: (initial_participants || []).map((participant) => ({
        actorType: participant.actorType || participant.actor_type || "MAIRIE",
        actorId: participant.actorId || participant.actor_id || "",
        role: participant.role || "PARTICIPANT",
        canSeeInternal: participant.canSeeInternal ?? participant.can_see_internal,
      })).filter((participant) => participant.actorId),
    });
    res.status(201).json({ conversation });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const loaded = await ConversationService.getConversation(req.params.id as string, req.user!.userId);
    res.json(loaded);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const messages = await ConversationService.getMessages(req.params.id as string, req.user!.userId);
    res.json({ messages });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const { text, body, content, visibility, parent_id, parentMessageId } = req.body as {
      text?: string;
      body?: string;
      content?: string;
      visibility?: MessagingVisibility;
      parent_id?: string;
      parentMessageId?: string;
    };
    const message = await ConversationService.sendMessage({
      conversationId: req.params.id as string,
      userId: req.user!.userId,
      body: text || body || content || "",
      visibility,
      parentMessageId: parentMessageId || parent_id || null,
    });
    res.status(201).json({ message });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/participants", authenticate, async (req: AuthRequest, res) => {
  try {
    const { actor_type, actorType, actor_id, actorId, role, can_see_internal, canSeeInternal } = req.body as {
      actor_type?: MessagingActorType;
      actorType?: MessagingActorType;
      actor_id?: string;
      actorId?: string;
      role?: "OWNER" | "PARTICIPANT" | "OBSERVER";
      can_see_internal?: boolean;
      canSeeInternal?: boolean;
    };
    const participant = await ConversationService.addParticipant({
      conversationId: req.params.id as string,
      userId: req.user!.userId,
      participant: {
        actorType: actorType || actor_type || "MAIRIE",
        actorId: actorId || actor_id || "",
        role: role || "PARTICIPANT",
        canSeeInternal: canSeeInternal ?? can_see_internal,
      },
    });
    res.status(201).json({ participant });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
