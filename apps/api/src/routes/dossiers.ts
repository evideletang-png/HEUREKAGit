import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dossiersTable, documentReviewsTable, dossierMessagesTable, usersTable, municipalitySettingsTable, communesTable } from "@workspace/db";
import { eq, desc, and, sql, asc } from "drizzle-orm";
import { authenticate, requireMairie, type AuthRequest } from "../middlewares/authenticate.js";
import { NotificationService } from "../services/notificationService.js";
import { ConversationService } from "../services/conversationService.js";
import { DOSSIER_STATUS } from "../constants/dossierStatus.js";
import { createInstructionEvent, INSTRUCTION_EVENT_TYPES } from "../services/instructionEventsService.js";
import { refreshInstructionDeadline } from "../services/instructionDeadlineService.js";

const router: IRouter = Router();

const CITIZEN_EDITABLE_FIELDS = new Set(["typeProcedure", "title", "address", "commune", "metadata"]);
const MAIRIE_EDITABLE_FIELDS = new Set(["typeProcedure", "title", "address", "commune", "metadata"]);
const FORBIDDEN_DIRECT_FIELDS = new Set([
  "status",
  "instructionStatus",
  "assignedMetropoleId",
  "assignedAbfId",
  "isTacite",
  "dateLimiteInstruction",
  "timeline",
  "instructionStartedAt",
]);

function pickAllowedUpdates(body: Record<string, unknown>, allowedFields: Set<string>) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowedFields.has(key)));
}

function parseCommunes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((value) => value.trim()).filter(Boolean);
    if (typeof parsed === "string") return [parsed.trim()].filter(Boolean);
    return [];
  } catch {
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
}

function pickCitizenPortalCommune(args: {
  assignedCommunes: string[];
  latestDossierCommune?: string | null;
  latestDocumentCommune?: string | null;
}) {
  const normalizedAssigned = args.assignedCommunes.filter(Boolean);
  const dossierCommune = String(args.latestDossierCommune || "").trim();
  const documentCommune = String(args.latestDocumentCommune || "").trim();

  if (normalizedAssigned.length === 1) {
    return { commune: normalizedAssigned[0], source: "user_commune" as const };
  }
  if (dossierCommune) {
    return { commune: dossierCommune, source: "latest_dossier" as const };
  }
  if (documentCommune) {
    return { commune: documentCommune, source: "latest_document" as const };
  }
  if (normalizedAssigned.length > 1) {
    return { commune: normalizedAssigned[0], source: "first_user_commune" as const };
  }
  return { commune: null, source: "unresolved" as const };
}

function toLegacyMessage(message: {
  id: string;
  authorId: string;
  authorActorType: string;
  body: string;
  parentMessageId?: string | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    fromUserId: message.authorId,
    fromRole: message.authorActorType.toLowerCase(),
    content: message.body,
    parentId: message.parentMessageId || null,
    mentions: [],
    createdAt: message.createdAt,
  };
}

// GET /api/dossiers
router.get("/", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const { userId } = req.user;
  const dossiers = await db.select().from(dossiersTable)
    .where(eq(dossiersTable.userId, userId))
    .orderBy(desc(dossiersTable.createdAt));
  return res.json({ dossiers });
});

// GET /api/dossiers/portal-context
router.get("/portal-context", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });

  const { userId } = req.user;
  const [user] = await db.select({
    name: usersTable.name,
    communes: usersTable.communes,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const [latestDossier] = await db.select({
    commune: dossiersTable.commune,
  }).from(dossiersTable)
    .where(and(eq(dossiersTable.userId, userId), sql`${dossiersTable.commune} IS NOT NULL`))
    .orderBy(desc(dossiersTable.updatedAt), desc(dossiersTable.createdAt))
    .limit(1);

  const [latestDocument] = await db.select({
    commune: documentReviewsTable.commune,
  }).from(documentReviewsTable)
    .where(and(eq(documentReviewsTable.userId, userId), sql`${documentReviewsTable.commune} IS NOT NULL`))
    .orderBy(desc(documentReviewsTable.createdAt))
    .limit(1);

  const resolution = pickCitizenPortalCommune({
    assignedCommunes: parseCommunes(user?.communes),
    latestDossierCommune: latestDossier?.commune,
    latestDocumentCommune: latestDocument?.commune,
  });

  if (!resolution.commune) {
    return res.json({
      portalContext: {
        commune: null,
        townHallName: null,
        addressLine1: null,
        addressLine2: null,
        postalCode: null,
        city: null,
        phone: null,
        email: null,
        hours: null,
        source: resolution.source,
      },
    });
  }

  const [settings] = await db.select().from(municipalitySettingsTable)
    .where(eq(sql`lower(${municipalitySettingsTable.commune})`, resolution.commune.toLowerCase()))
    .limit(1);

  const [communeRow] = await db.select({
    name: communesTable.name,
    zipCode: communesTable.zipCode,
  }).from(communesTable)
    .where(eq(sql`lower(${communesTable.name})`, resolution.commune.toLowerCase()))
    .limit(1);

  const resolvedCity = settings?.citizenPortalCity || communeRow?.name || resolution.commune;
  const resolvedPostalCode = settings?.citizenPortalPostalCode || communeRow?.zipCode || null;

  return res.json({
    portalContext: {
      commune: resolution.commune,
      townHallName: settings?.citizenPortalTownHallName || `Mairie de ${resolvedCity}`,
      addressLine1: settings?.citizenPortalAddressLine1 || null,
      addressLine2: settings?.citizenPortalAddressLine2 || null,
      postalCode: resolvedPostalCode,
      city: resolvedCity,
      phone: settings?.citizenPortalPhone || null,
      email: settings?.citizenPortalEmail || null,
      hours: settings?.citizenPortalHours || null,
      source: resolution.source,
    },
  });
});

// GET /api/dossiers/:id
router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const { id } = req.params;
  const { userId } = req.user;

  const [dossier] = await db.select().from(dossiersTable)
    .where(eq(dossiersTable.id, id as any))
    .limit(1);

  if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

  // Access control: owner OR authorized mairie
  if (dossier.userId !== userId) {
    if (req.user!.role !== "mairie" && req.user!.role !== "admin") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
  }

  if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

  const documents = await db.select().from(documentReviewsTable)
    .where(eq(documentReviewsTable.dossierId, id as any));

  return res.json({ dossier, documents });
});

// POST /api/dossiers
router.post("/", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const { userId } = req.user;
  const { typeProcedure, title, address, commune, metadata } = req.body;

  if (!typeProcedure || !title) {
    return res.status(400).json({ error: "Type de procédure et titre requis" });
  }

  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const dossierNumber = `${typeProcedure}-${year}-${random}`;

  const [dossier] = await db.insert(dossiersTable).values({
    userId,
    typeProcedure,
    dossierNumber,
    title,
    address,
    commune,
    metadata: metadata || {},
    status: DOSSIER_STATUS.DEPOSE,
    instructionStatus: "depose",
    dateDepot: new Date(),
  }).returning();

  return res.status(201).json({ dossier });
});

// PATCH /api/dossiers/:id
router.patch("/:id", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const { id } = req.params;
  const { userId } = req.user;
  const body = (req.body || {}) as Record<string, unknown>;
  const role = (req.user.role || "").toLowerCase();
  const allowedFields = role === "mairie" || role === "admin" ? MAIRIE_EDITABLE_FIELDS : CITIZEN_EDITABLE_FIELDS;
  const updates = pickAllowedUpdates(body, allowedFields);
  const receivedKeys = Object.keys(body);
  const forbiddenKeys = receivedKeys.filter((key) => FORBIDDEN_DIRECT_FIELDS.has(key) || !allowedFields.has(key));

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: "NO_ALLOWED_FIELDS",
      message: forbiddenKeys.length > 0
        ? "Aucun champ fourni ne peut être modifié directement sur ce dossier."
        : "Aucun champ modifiable fourni.",
      forbiddenFields: forbiddenKeys,
      allowedFields: Array.from(allowedFields),
    });
  }

  const whereClause = role === "mairie" || role === "admin"
    ? eq(dossiersTable.id, id as any)
    : and(eq(dossiersTable.id, id as any), eq(dossiersTable.userId, userId));

  const [dossier] = await db.update(dossiersTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(whereClause)
    .returning();

  if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

  return res.json({ dossier });
});

// PATCH /api/dossiers/:id/submit
import { executePreControl } from "../services/preControlService.js";

router.patch("/:id/submit", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const { id } = req.params;
  const { userId } = req.user;

  // Verify access
  const exist = await db.select({ id: dossiersTable.id }).from(dossiersTable).where(and(eq(dossiersTable.id, id as any), eq(dossiersTable.userId, userId))).limit(1);
  if (exist.length === 0) return res.status(404).json({ error: "Dossier introuvable ou accès refusé" });

  try {
    // 1. Execute Pre-Control
    const preControlReport = await executePreControl(id as string);
    const newStatus = preControlReport.completude === "100%" ? DOSSIER_STATUS.EN_INSTRUCTION : DOSSIER_STATUS.INCOMPLET;

    // 2. Update Dossier
    const [dossier] = await db.update(dossiersTable)
      .set({ 
        status: newStatus, 
        updatedAt: new Date(),
        metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{preControl}', ${JSON.stringify(preControlReport)}::jsonb)`
      })
      .where(eq(dossiersTable.id, id as any))
      .returning();

    // Notify Mairie agents
    if (newStatus === DOSSIER_STATUS.EN_INSTRUCTION) {
      await NotificationService.notifyRoleInCommune({
        role: "mairie",
        commune: dossier.commune || "",
        dossierId: dossier.id,
        type: "NEW_DOSSIER",
        title: `Nouveau dossier déposé : ${dossier.dossierNumber}`,
        message: `Un nouveau dossier de type ${dossier.typeProcedure} a été déposé à ${dossier.commune}.`,
        priority: "HIGH"
      });
    }

    return res.json({ dossier, preControl: preControlReport });
  } catch (error: any) {
    return res.status(500).json({ error: "PRE_CONTROL_FAILED", message: error.message });
  }
});

// GET /api/dossiers/:id/precontrol
router.get("/:id/precontrol", authenticate, async (req: AuthRequest, res) => {
  try {
    const report = await executePreControl(req.params.id as string);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: "PRE_CONTROL_FAILED", message: err.message });
  }
});

// PATCH /api/dossiers/:id/start-instruction
router.patch("/:id/start-instruction", authenticate, requireMairie, async (req: AuthRequest, res) => {
  const { id } = req.params;

  const [dossier] = await db.update(dossiersTable)
    .set({ 
      status: DOSSIER_STATUS.EN_INSTRUCTION,
      instructionStatus: "instruction_demarre",
      instructionStartedAt: new Date(),
      updatedAt: new Date() 
    })
    .where(eq(dossiersTable.id, id as any))
    .returning();

  if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

  await createInstructionEvent(id as string, INSTRUCTION_EVENT_TYPES.INSTRUCTION_DEMARREE, {
    description: "Instruction démarrée",
    author: req.user!.email || "Mairie",
  });
  await refreshInstructionDeadline(id as string);

  return res.json({ dossier });
});
// GET /api/dossiers/:id/messages
router.get("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { conversation } = await ConversationService.ensureDefaultConversation(id as string, req.user!.userId);
    const messages = await ConversationService.getMessages(conversation.id, req.user!.userId);
    return res.json({ messages: messages.map(toLegacyMessage) });
  } catch {
    const { id } = req.params;
    const messages = await db.select().from(dossierMessagesTable)
      .where(eq(dossierMessagesTable.dossierId, id as string))
      .orderBy(asc(dossierMessagesTable.createdAt));
    return res.json({ messages });
  }
});

// POST /api/dossiers/:id/messages
router.post("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { content, documentId } = req.body;
  
  if (!content) return res.status(400).json({ error: "Content is required" });

  const role = req.user!.role.toLowerCase();
  try {
    const { conversation } = await ConversationService.ensureDefaultConversation(id as string, req.user!.userId);
    const message = await ConversationService.sendMessage({
      conversationId: conversation.id,
      userId: req.user!.userId,
      body: content,
      visibility: role === "citoyen" || role === "user" ? "PUBLIC" : undefined,
    });
    return res.status(201).json({ message: toLegacyMessage(message) });
  } catch (error) {
    if (error instanceof Error && ["FORBIDDEN", "DOSSIER_NOT_FOUND", "INVALID_MENTION_VISIBILITY"].includes(error.message)) {
      return res.status(error.message === "FORBIDDEN" ? 403 : 400).json({ error: error.message });
    }
  }
  
  // 1. Insert message
  const [message] = await db.insert(dossierMessagesTable).values({
    dossierId: id as string,
    fromUserId: req.user!.userId || "user",
    fromRole: role,
    content,
    documentId
  }).returning();

  // 3. Notification Logic (Module Collaboration)
  const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id as any)).limit(1);
  if (dossier) {
    const serviceMentions = content.match(/@(ABF|METROPOLE|MAIRIE|ADMIN)[0-9]*/gi);
    const resolvedCommune = dossier.commune || dossier.address?.split(',').pop()?.trim() || ""; // Heuristic fallback
    
    console.log(`[Dossiers] Detected mentions in message: ${JSON.stringify(serviceMentions)}`);
    if (serviceMentions) {
      for (const mention of serviceMentions) {
        // Normalize role name: @ABF37 -> abf
        const targetRole = mention.substring(1).toLowerCase().replace(/[0-9]/g, '');
        console.log(`[Dossiers] Normalizing mention ${mention} to role ${targetRole} for commune ${resolvedCommune}`);
        
        await NotificationService.notifyRoleInCommune({
          role: targetRole,
          commune: resolvedCommune,
          dossierId: dossier.id,
          type: "MENTION",
          title: `Nouvelle mention : ${dossier.dossierNumber || "Dossier sans numéro"}`,
          message: `${req.user!.email} vous a mentionné dans le dossier ${dossier.title} (${resolvedCommune}).`,
          priority: "HIGH"
        });
      }
    }

    // Notify applicant if message is from an agent
    if (role !== "citoyen" && role !== "user" && dossier.userId) {
      await NotificationService.createNotification({
        userId: dossier.userId,
        dossierId: dossier.id,
        type: "MESSAGE",
        title: `Nouveau message sur votre dossier ${dossier.dossierNumber}`,
        message: `${req.user!.email} a ajouté un message concernant votre dossier.`,
        priority: "MEDIUM"
      });
    }
  }

  // 2. Identify @tags for smart piece tracking (Module 7)
  if (role === 'mairie' || role === 'admin') {
     const mentions = content.match(/@([A-Z0-9]+)/g);
     if (mentions) {
       for (const mention of mentions) {
         const cleanCode = mention.substring(1).toUpperCase(); // e.g. PCMI2
         // Ignore roles already handled
         if (['ABF', 'METROPOLE', 'MAIRIE', 'ADMIN'].includes(cleanCode)) continue;
         
         const existingDocs = await db.select().from(documentReviewsTable)
           .where(and(
             eq(documentReviewsTable.dossierId, id as string),
             eq(documentReviewsTable.pieceCode, cleanCode)
           )).limit(1);

         if (existingDocs.length > 0) {
           // Tag existing document as requested & invalid
           await db.update(documentReviewsTable)
             .set({ isRequested: true, pieceStatus: "incorrecte", updatedAt: new Date() })
             .where(eq(documentReviewsTable.id, existingDocs[0].id));
         } else {
           // Create a virtual missing piece to track
           await db.insert(documentReviewsTable).values({
             userId: req.user!.userId,
             dossierId: id as string,
             title: `Pièce Complémentaire : ${cleanCode}`,
             documentType: "autre",
             pieceCode: cleanCode,
             pieceStatus: "manquante",
             isRequested: true
           });
         }
       }
       
       // Force dossier status to incomplete if pieces requested
       await db.update(dossiersTable)
         .set({ status: DOSSIER_STATUS.INCOMPLET, updatedAt: new Date() })
         .where(eq(dossiersTable.id, id as string));
     }
  }

  return res.status(201).json({ message });
});

export default router;
