import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dossiersTable, documentReviewsTable, dossierMessagesTable } from "@workspace/db";
import { eq, desc, and, sql, asc } from "drizzle-orm";
import { authenticate, requireMairie, type AuthRequest } from "../middlewares/authenticate.js";
import { NotificationService } from "../services/notificationService.js";

const router: IRouter = Router();

// GET /api/dossiers
router.get("/", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const { userId } = req.user;
  const dossiers = await db.select().from(dossiersTable)
    .where(eq(dossiersTable.userId, userId))
    .orderBy(desc(dossiersTable.createdAt));
  return res.json({ dossiers });
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
    status: "DEPOSE",
  }).returning();

  return res.status(201).json({ dossier });
});

// PATCH /api/dossiers/:id
router.patch("/:id", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const { id } = req.params;
  const { userId } = req.user;
  const updates = req.body;

  const [dossier] = await db.update(dossiersTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(dossiersTable.id, id as any), eq(dossiersTable.userId, userId)))
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
    const newStatus = preControlReport.completude === "100%" ? "EN_COURS" : "INCOMPLET";

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
    if (newStatus === "EN_COURS") {
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
      status: "EN_COURS", 
      instructionStartedAt: new Date(),
      timeline: [{ 
        event: "Instruction démarrée", 
        date: new Date().toISOString(), 
        author: req.user!.email || "Mairie" 
      }],
      updatedAt: new Date() 
    })
    .where(eq(dossiersTable.id, id as any))
    .returning();

  if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

  return res.json({ dossier });
});
// GET /api/dossiers/:id/messages
router.get("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const messages = await db.select().from(dossierMessagesTable)
    .where(eq(dossierMessagesTable.dossierId, id as string))
    .orderBy(asc(dossierMessagesTable.createdAt));
  return res.json({ messages });
});

// POST /api/dossiers/:id/messages
router.post("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { content, documentId } = req.body;
  
  if (!content) return res.status(400).json({ error: "Content is required" });

  const role = req.user!.role.toLowerCase();
  
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
         .set({ status: "INCOMPLET", updatedAt: new Date() })
         .where(eq(dossiersTable.id, id as string));
     }
  }

  return res.status(201).json({ message });
});

export default router;
