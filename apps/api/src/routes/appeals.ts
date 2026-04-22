import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  appealsTable,
  appealPartiesTable,
  appealGroundsTable,
  appealDocumentsTable,
  appealDocumentAnalysesTable,
  appealGroundSuggestionsTable,
  appealEventsTable,
  appealNotificationsTable,
  appealDeadlinesTable,
  appealMessagesTable,
  dossiersTable,
  usersTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";
import { NotificationService } from "../services/notificationService.js";
import multer from "multer";
import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { analyzeAppealDocument } from "../services/appealAnalysisService.js";

const router: IRouter = Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

type IdentityPayload = {
  name?: string;
  email?: string;
  address?: string;
  quality?: string;
  interestDescription?: string;
};

function parseCommunes(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {}
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function toDateOrNull(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(input: Date, days: number) {
  const next = new Date(input);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(input: Date, months: number) {
  const next = new Date(input);
  next.setMonth(next.getMonth() + months);
  return next;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeScores(args: {
  appealType: string;
  postingEvidenceStatus?: string | null;
  groundsCount: number;
  hasAuthorityNotification: boolean;
  hasBeneficiaryNotification: boolean;
}) {
  const typeWeight: Record<string, number> = {
    signalement: 35,
    gracieux: 55,
    contentieux: 70,
    deja_engage: 80,
  };
  const admissibility =
    (typeWeight[args.appealType] ?? 40)
    + (args.postingEvidenceStatus === "justifie" ? 15 : 0)
    + (args.hasAuthorityNotification ? 10 : 0)
    + (args.hasBeneficiaryNotification ? 10 : 0)
    + Math.min(args.groundsCount * 5, 20);

  const urbanRisk =
    (args.appealType === "contentieux" || args.appealType === "deja_engage" ? 45 : 20)
    + Math.min(args.groundsCount * 10, 40)
    + (args.postingEvidenceStatus === "contestee" ? 10 : 0);

  return {
    admissibilityScore: clampScore(admissibility),
    urbanRiskScore: clampScore(urbanRisk),
  };
}

async function logAppealEvent(appealId: string, userId: string | null, type: string, description: string, metadata: Record<string, unknown> = {}) {
  await db.insert(appealEventsTable).values({
    appealId,
    userId: userId || undefined,
    type,
    description,
    metadata,
  });
}

function shouldAnalyzeAppealDocument(file: Express.Multer.File, category?: string | null) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const normalizedCategory = String(category || "").toLowerCase();
  return (file.mimetype === "application/pdf" || ext === ".pdf")
    && (normalizedCategory.includes("recours") || normalizedCategory.includes("requete") || normalizedCategory.includes("memoire"));
}

function groupSuggestions(suggestions: any[]) {
  return {
    byAdmissibility: suggestions.reduce<Record<string, any[]>>((acc, suggestion) => {
      const key = suggestion.admissibilityLabel || "a_confirmer";
      acc[key] = acc[key] || [];
      acc[key].push(suggestion);
      return acc;
    }, {}),
    byCategory: suggestions.reduce<Record<string, any[]>>((acc, suggestion) => {
      const key = suggestion.category || "autre";
      acc[key] = acc[key] || [];
      acc[key].push(suggestion);
      return acc;
    }, {}),
    byDocument: suggestions.reduce<Record<string, any[]>>((acc, suggestion) => {
      const key = suggestion.documentId || "unknown";
      acc[key] = acc[key] || [];
      acc[key].push(suggestion);
      return acc;
    }, {}),
  };
}

async function getUserContext(userId: string) {
  const [user] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    communes: usersTable.communes,
    name: usersTable.name,
    email: usersTable.email,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  return {
    user,
    role: String(user?.role || ""),
    communes: parseCommunes(user?.communes),
  };
}

function canAccessByCommune(role: string, communes: string[], commune?: string | null) {
  if (role === "admin" || role === "super_admin") return true;
  if (role !== "mairie") return false;
  if (!commune) return false;
  return communes.some((item) => item.toLowerCase() === commune.toLowerCase());
}

async function canAccessAppeal(appealId: string, reqUser: NonNullable<AuthRequest["user"]>) {
  const { role, communes } = await getUserContext(reqUser.userId);
  const [appeal] = await db.select().from(appealsTable).where(eq(appealsTable.id, appealId)).limit(1);
  if (!appeal) return { allowed: false, appeal: null as any, dossier: null as any };

  const [dossier] = appeal.linkedUrbanismCaseId
    ? await db.select().from(dossiersTable).where(eq(dossiersTable.id, appeal.linkedUrbanismCaseId)).limit(1)
    : [null];

  const ownerAccess = appeal.createdBy === reqUser.userId || dossier?.userId === reqUser.userId;
  const communeAccess = canAccessByCommune(role, communes, appeal.commune || dossier?.commune);
  const allowedRoles = ["admin", "super_admin"];
  const allowed = ownerAccess || communeAccess || allowedRoles.includes(role);

  return { allowed, appeal, dossier };
}

function buildDeadlineRows(appealId: string, payload: {
  postingStartDate?: Date | null;
  filingDate?: Date | null;
  notificationToAuthorityDate?: Date | null;
  notificationToBeneficiaryDate?: Date | null;
}) {
  const rows: Array<{
    appealId: string;
    code: string;
    label: string;
    dueDate: Date;
    status: string;
    metadata?: Record<string, unknown>;
  }> = [];

  if (payload.postingStartDate) {
    rows.push({
      appealId,
      code: "fin_affichage",
      label: "Fin théorique de la période d'affichage",
      dueDate: addMonths(payload.postingStartDate, 2),
      status: "a_surveiller",
    });
  }

  if (payload.filingDate) {
    rows.push({
      appealId,
      code: "notification_recours",
      label: "Notification du recours aux parties",
      dueDate: addDays(payload.filingDate, 15),
      status: payload.notificationToAuthorityDate && payload.notificationToBeneficiaryDate ? "respecte" : "a_surveiller",
      metadata: {
        authorityNotified: !!payload.notificationToAuthorityDate,
        beneficiaryNotified: !!payload.notificationToBeneficiaryDate,
      },
    });
  }

  return rows;
}

router.get("/options/dossiers", authenticate, async (req: AuthRequest, res) => {
  try {
    const { role, communes } = await getUserContext(req.user!.userId);
    let dossiers = await db.select({
      id: dossiersTable.id,
      title: dossiersTable.title,
      dossierNumber: dossiersTable.dossierNumber,
      address: dossiersTable.address,
      commune: dossiersTable.commune,
      typeProcedure: dossiersTable.typeProcedure,
      status: dossiersTable.status,
      userId: dossiersTable.userId,
    }).from(dossiersTable).orderBy(desc(dossiersTable.createdAt));

    if (role !== "admin" && role !== "super_admin") {
      if (role === "mairie") {
        dossiers = dossiers.filter((item) => item.commune && communes.some((commune) => commune.toLowerCase() === item.commune!.toLowerCase()));
      } else {
        dossiers = dossiers.filter((item) => item.userId === req.user!.userId);
      }
    }

    res.json({ dossiers });
  } catch (err) {
    console.error("[appeals/options/dossiers]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de charger les dossiers disponibles." });
  }
});

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { role, communes } = await getUserContext(req.user!.userId);
    const allAppeals = await db.select().from(appealsTable).orderBy(desc(appealsTable.createdAt));
    const dossierIds = allAppeals.map((appeal) => appeal.linkedUrbanismCaseId).filter(Boolean) as string[];
    const linkedDossiers = dossierIds.length > 0
      ? await db.select().from(dossiersTable).where(inArray(dossiersTable.id, dossierIds))
      : [];
    const dossierMap = new Map(linkedDossiers.map((dossier) => [dossier.id, dossier]));

    let appeals = allAppeals.filter((appeal) => {
      const dossier = appeal.linkedUrbanismCaseId ? dossierMap.get(appeal.linkedUrbanismCaseId) : null;
      if (role === "admin" || role === "super_admin") return true;
      if (appeal.createdBy === req.user!.userId || dossier?.userId === req.user!.userId) return true;
      if (role === "mairie" && (appeal.commune || dossier?.commune)) {
        return communes.some((commune) => commune.toLowerCase() === String(appeal.commune || dossier?.commune).toLowerCase());
      }
      return false;
    });

    const { type, status, commune, dossierId, deadline } = req.query as Record<string, string | undefined>;
    if (type) appeals = appeals.filter((appeal) => appeal.appealType === type);
    if (status) appeals = appeals.filter((appeal) => appeal.status === status);
    if (commune) appeals = appeals.filter((appeal) => (appeal.commune || "").toLowerCase().includes(commune.toLowerCase()));
    if (dossierId) appeals = appeals.filter((appeal) => appeal.linkedUrbanismCaseId === dossierId);

    const deadlines = appeals.length > 0
      ? await db.select().from(appealDeadlinesTable).where(inArray(appealDeadlinesTable.appealId, appeals.map((appeal) => appeal.id)))
      : [];
    const grounds = appeals.length > 0
      ? await db.select().from(appealGroundsTable).where(inArray(appealGroundsTable.appealId, appeals.map((appeal) => appeal.id)))
      : [];
    const documents = appeals.length > 0
      ? await db.select().from(appealDocumentsTable).where(inArray(appealDocumentsTable.appealId, appeals.map((appeal) => appeal.id)))
      : [];
    const documentAnalyses = appeals.length > 0
      ? await db.select().from(appealDocumentAnalysesTable).where(inArray(appealDocumentAnalysesTable.appealId, appeals.map((appeal) => appeal.id)))
      : [];
    const groundSuggestions = appeals.length > 0
      ? await db.select().from(appealGroundSuggestionsTable).where(inArray(appealGroundSuggestionsTable.appealId, appeals.map((appeal) => appeal.id)))
      : [];

    const now = new Date();
    const enriched = appeals.map((appeal) => {
      const appealDeadlines = deadlines.filter((item) => item.appealId === appeal.id);
      const nextDeadline = appealDeadlines
        .slice()
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
      const appealAnalyses = documentAnalyses.filter((item) => item.appealId === appeal.id);
      const latestAnalysis = appealAnalyses
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const appealSuggestions = groundSuggestions.filter((item) => item.appealId === appeal.id);

      return {
        ...appeal,
        dossier: appeal.linkedUrbanismCaseId ? dossierMap.get(appeal.linkedUrbanismCaseId) || null : null,
        groundsCount: grounds.filter((item) => item.appealId === appeal.id).length,
        documentsCount: documents.filter((item) => item.appealId === appeal.id).length,
        documentAnalysesCount: appealAnalyses.length,
        latestAnalysisStatus: latestAnalysis?.status || null,
        groundSuggestionsCount: appealSuggestions.length,
        pendingGroundSuggestionsCount: appealSuggestions.filter((item) => item.status === "suggested").length,
        nextDeadline,
        deadlineState: nextDeadline
          ? (new Date(nextDeadline.dueDate).getTime() < now.getTime() ? "depasse" : (new Date(nextDeadline.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= 7 ? "proche" : "ok")
          : "none",
      };
    }).filter((appeal) => {
      if (!deadline || deadline === "all") return true;
      return appeal.deadlineState === deadline;
    });

    res.json({ appeals: enriched });
  } catch (err) {
    console.error("[appeals/list]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de charger les recours." });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      linkedUrbanismCaseId,
      appealType,
      claimantRole,
      claimantIdentity,
      beneficiaryIdentity,
      authorityIdentity,
      projectAddress,
      decisionReference,
      permitType,
      postingStartDate,
      postingEvidenceStatus,
      filingDate,
      notificationToAuthorityDate,
      notificationToBeneficiaryDate,
      summary,
      grounds,
      status,
    } = req.body as Record<string, any>;

    if (!linkedUrbanismCaseId || !appealType || !claimantRole || !summary) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Dossier lié, type de recours, qualité du requérant et synthèse sont requis." });
      return;
    }

    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, linkedUrbanismCaseId)).limit(1);
    if (!dossier) {
      res.status(404).json({ error: "NOT_FOUND", message: "Dossier d'urbanisme introuvable." });
      return;
    }

    const { role, communes, user } = await getUserContext(req.user!.userId);
    const canAccessDossier =
      role === "admin"
      || role === "super_admin"
      || dossier.userId === req.user!.userId
      || canAccessByCommune(role, communes, dossier.commune);

    if (!canAccessDossier) {
      res.status(403).json({ error: "FORBIDDEN", message: "Vous ne pouvez pas ouvrir un recours sur ce dossier." });
      return;
    }

    const postingStart = toDateOrNull(postingStartDate);
    const filing = toDateOrNull(filingDate);
    const authorityNotification = toDateOrNull(notificationToAuthorityDate);
    const beneficiaryNotification = toDateOrNull(notificationToBeneficiaryDate);
    const normalizedGrounds = Array.isArray(grounds) ? grounds.filter((ground) => ground?.title && ground?.description) : [];
    const computedScores = computeScores({
      appealType,
      postingEvidenceStatus,
      groundsCount: normalizedGrounds.length,
      hasAuthorityNotification: !!authorityNotification,
      hasBeneficiaryNotification: !!beneficiaryNotification,
    });

    const [appeal] = await db.insert(appealsTable).values({
      linkedUrbanismCaseId,
      appealType,
      status: status || "nouveau",
      claimantRole,
      claimantIdentity: claimantIdentity || {},
      beneficiaryIdentity: beneficiaryIdentity || {},
      authorityIdentity: authorityIdentity || {},
      projectAddress: projectAddress || dossier.address || null,
      decisionReference: decisionReference || dossier.dossierNumber || null,
      permitType: permitType || dossier.typeProcedure || null,
      postingStartDate: postingStart,
      postingEvidenceStatus: postingEvidenceStatus || "a_confirmer",
      filingDate: filing,
      notificationToAuthorityDate: authorityNotification,
      notificationToBeneficiaryDate: beneficiaryNotification,
      admissibilityScore: computedScores.admissibilityScore,
      urbanRiskScore: computedScores.urbanRiskScore,
      summary,
      commune: dossier.commune || null,
      metadata: {
        qualification: appealType,
        preContentieux: appealType === "signalement" || appealType === "gracieux",
        createdFromRole: role,
      },
      createdBy: req.user!.userId,
    }).returning();

    await db.insert(appealPartiesTable).values([
      { appealId: appeal.id, partyRole: "claimant", identity: claimantIdentity || { name: user?.name, email: user?.email } },
      { appealId: appeal.id, partyRole: "beneficiary", identity: beneficiaryIdentity || {} },
      { appealId: appeal.id, partyRole: "authority", identity: authorityIdentity || { commune: dossier.commune } },
    ]);

    if (normalizedGrounds.length > 0) {
      await db.insert(appealGroundsTable).values(
        normalizedGrounds.map((ground) => ({
          appealId: appeal.id,
          category: ground.category || "urbanisme",
          title: ground.title,
          description: ground.description,
          linkedPluArticle: ground.linkedPluArticle || null,
          linkedDocumentId: ground.linkedDocumentId || null,
          linkedExtractedMetric: ground.linkedExtractedMetric || null,
          seriousnessScore: ground.seriousnessScore || null,
          responseDraft: ground.responseDraft || null,
          status: ground.status || "a_qualifier",
        })),
      );
    }

    const deadlineRows = buildDeadlineRows(appeal.id, {
      postingStartDate: postingStart,
      filingDate: filing,
      notificationToAuthorityDate: authorityNotification,
      notificationToBeneficiaryDate: beneficiaryNotification,
    });
    if (deadlineRows.length > 0) {
      await db.insert(appealDeadlinesTable).values(deadlineRows);
    }

    await db.insert(appealNotificationsTable).values([
      {
        appealId: appeal.id,
        type: "notification_autorite",
        status: authorityNotification ? "envoye" : "a_envoyer",
        targetRole: "mairie",
        dueAt: filing ? addDays(filing, 15) : null,
        sentAt: authorityNotification,
        notes: "Notification à l'auteur de la décision",
      },
      {
        appealId: appeal.id,
        type: "notification_beneficiaire",
        status: beneficiaryNotification ? "envoye" : "a_envoyer",
        targetRole: "beneficiaire",
        dueAt: filing ? addDays(filing, 15) : null,
        sentAt: beneficiaryNotification,
        notes: "Notification au bénéficiaire de l'autorisation",
      },
    ]);

    await logAppealEvent(
      appeal.id,
      req.user!.userId,
      "CREATION",
      `Recours ${appealType} créé et rattaché au dossier ${dossier.dossierNumber || dossier.title}.`,
      { status: appeal.status, claimantRole, linkedUrbanismCaseId },
    );

    if (dossier.commune) {
      await NotificationService.notifyRoleInCommune({
        role: "mairie",
        commune: dossier.commune,
        dossierId: dossier.id,
        type: "STATUS_CHANGE",
        title: `Nouveau recours sur ${dossier.dossierNumber || dossier.title}`,
        message: `Un recours de type ${appealType} vient d'être enregistré pour le dossier ${dossier.title}.`,
        priority: "HIGH",
      });
    }

    res.status(201).json({ appeal });
  } catch (err) {
    console.error("[appeals/create]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de créer le recours." });
  }
});

router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal, dossier } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé à ce recours." });
      return;
    }

    const [grounds, parties, documents, documentAnalyses, groundSuggestions, events, notifications, deadlines, messages] = await Promise.all([
      db.select().from(appealGroundsTable).where(eq(appealGroundsTable.appealId, appeal.id)).orderBy(desc(appealGroundsTable.createdAt)),
      db.select().from(appealPartiesTable).where(eq(appealPartiesTable.appealId, appeal.id)),
      db.select().from(appealDocumentsTable).where(eq(appealDocumentsTable.appealId, appeal.id)).orderBy(desc(appealDocumentsTable.createdAt)),
      db.select().from(appealDocumentAnalysesTable).where(eq(appealDocumentAnalysesTable.appealId, appeal.id)).orderBy(desc(appealDocumentAnalysesTable.createdAt)),
      db.select().from(appealGroundSuggestionsTable).where(eq(appealGroundSuggestionsTable.appealId, appeal.id)).orderBy(desc(appealGroundSuggestionsTable.createdAt)),
      db.select().from(appealEventsTable).where(eq(appealEventsTable.appealId, appeal.id)).orderBy(desc(appealEventsTable.createdAt)),
      db.select().from(appealNotificationsTable).where(eq(appealNotificationsTable.appealId, appeal.id)).orderBy(desc(appealNotificationsTable.createdAt)),
      db.select().from(appealDeadlinesTable).where(eq(appealDeadlinesTable.appealId, appeal.id)).orderBy(asc(appealDeadlinesTable.dueDate)),
      db.select().from(appealMessagesTable).where(eq(appealMessagesTable.appealId, appeal.id)).orderBy(asc(appealMessagesTable.createdAt)),
    ]);

    res.json({
      appeal,
      dossier,
      grounds,
      parties,
      documents,
      documentAnalyses,
      groundSuggestions,
      groundSuggestionsGrouped: groupSuggestions(groundSuggestions),
      events,
      notifications,
      deadlines,
      messages,
    });
  } catch (err) {
    console.error("[appeals/get]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de charger le recours." });
  }
});

router.patch("/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Modification non autorisée." });
      return;
    }

    const payload = req.body as Record<string, any>;
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    const allowedFields = [
      "status",
      "summary",
      "appealType",
      "projectAddress",
      "decisionReference",
      "permitType",
      "postingEvidenceStatus",
      "claimantIdentity",
      "beneficiaryIdentity",
      "authorityIdentity",
      "metadata",
    ];
    for (const field of allowedFields) {
      if (field in payload) updates[field] = payload[field];
    }
    if ("postingStartDate" in payload) updates.postingStartDate = toDateOrNull(payload.postingStartDate);
    if ("filingDate" in payload) updates.filingDate = toDateOrNull(payload.filingDate);
    if ("notificationToAuthorityDate" in payload) updates.notificationToAuthorityDate = toDateOrNull(payload.notificationToAuthorityDate);
    if ("notificationToBeneficiaryDate" in payload) updates.notificationToBeneficiaryDate = toDateOrNull(payload.notificationToBeneficiaryDate);

    const [updated] = await db.update(appealsTable).set(updates).where(eq(appealsTable.id, appeal.id)).returning();
    await logAppealEvent(appeal.id, req.user!.userId, "UPDATE", "Recours mis à jour.", { fields: Object.keys(updates) });

    res.json({ appeal: updated });
  } catch (err) {
    console.error("[appeals/update]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de mettre à jour le recours." });
  }
});

router.patch("/:id/status", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal, dossier } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    const { role, communes } = await getUserContext(req.user!.userId);
    const canModerate = role === "admin" || role === "super_admin" || canAccessByCommune(role, communes, appeal.commune || dossier?.commune);
    if (!allowed || !canModerate) {
      res.status(403).json({ error: "FORBIDDEN", message: "Seuls les services instructeurs peuvent changer ce statut." });
      return;
    }

    const { status } = req.body as { status?: string };
    if (!status) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Le statut est requis." });
      return;
    }

    const [updated] = await db.update(appealsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(appealsTable.id, appeal.id))
      .returning();

    await logAppealEvent(appeal.id, req.user!.userId, "STATUS_CHANGE", `Statut du recours mis à jour en ${status}.`, { from: appeal.status, to: status });

    res.json({ appeal: updated });
  } catch (err) {
    console.error("[appeals/status]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de mettre à jour le statut." });
  }
});

router.post("/:id/grounds", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Ajout de grief non autorisé." });
      return;
    }

    const {
      category,
      title,
      description,
      linkedPluArticle,
      linkedDocumentId,
      linkedExtractedMetric,
      seriousnessScore,
      responseDraft,
      status,
    } = req.body as Record<string, any>;

    if (!title || !description) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Titre et description du grief sont requis." });
      return;
    }

    const [ground] = await db.insert(appealGroundsTable).values({
      appealId: appeal.id,
      category: category || "urbanisme",
      title,
      description,
      linkedPluArticle: linkedPluArticle || null,
      linkedDocumentId: linkedDocumentId || null,
      linkedExtractedMetric: linkedExtractedMetric || null,
      seriousnessScore: seriousnessScore || null,
      responseDraft: responseDraft || null,
      status: status || "a_qualifier",
    }).returning();

    await logAppealEvent(appeal.id, req.user!.userId, "GROUND_ADDED", `Nouveau grief ajouté: ${title}.`, { category: ground.category });

    res.status(201).json({ ground });
  } catch (err) {
    console.error("[appeals/grounds/create]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'ajouter le grief." });
  }
});

router.post("/:id/documents", authenticate, upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const { allowed, appeal, dossier } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      if (file?.path) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      if (file?.path) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      res.status(403).json({ error: "FORBIDDEN", message: "Ajout de pièce non autorisé." });
      return;
    }

    if (!file) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Fichier requis." });
      return;
    }

    const ext = path.extname(file.originalname || "") || ".bin";
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    const uploadDir = path.resolve(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const finalPath = path.join(uploadDir, storedFileName);
    fs.copyFileSync(file.path, finalPath);
    try { fs.unlinkSync(file.path); } catch {}

    const [document] = await db.insert(appealDocumentsTable).values({
      appealId: appeal.id,
      uploadedBy: req.user!.userId,
      title: req.body.title || file.originalname,
      category: req.body.category || "piece_recours",
      fileName: storedFileName,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    }).returning();

    await logAppealEvent(appeal.id, req.user!.userId, "DOCUMENT_UPLOAD", `Pièce ajoutée au recours: ${document.title}.`, { documentId: document.id });

    const launchAnalysis = shouldAnalyzeAppealDocument(file, document.category);
    if (launchAnalysis) {
      setImmediate(() => {
        analyzeAppealDocument({
          appeal,
          dossier,
          document,
          filePath: finalPath,
          userId: req.user!.userId,
        }).catch((error) => {
          console.error("[appeals/documents/analysis/background]", error);
        });
      });
    }

    res.status(201).json({ document: { ...document, analysisStatus: launchAnalysis ? "processing" : null } });
  } catch (err) {
    console.error("[appeals/documents/create]", err);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file?.path) {
      try { fs.unlinkSync(file.path); } catch {}
    }
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'ajouter la pièce." });
  }
});

router.post("/:id/ground-suggestions/:suggestionId/accept", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Conversion de suggestion non autorisée." });
      return;
    }

    const [suggestion] = await db.select().from(appealGroundSuggestionsTable)
      .where(and(
        eq(appealGroundSuggestionsTable.id, req.params.suggestionId as string),
        eq(appealGroundSuggestionsTable.appealId, appeal.id),
      ))
      .limit(1);
    if (!suggestion) {
      res.status(404).json({ error: "NOT_FOUND", message: "Suggestion introuvable." });
      return;
    }

    const responseDraft = [
      suggestion.responseDraft,
      "",
      "Analyse automatique prudente:",
      `Recevabilité: ${suggestion.admissibilityLabel}`,
      `Opposabilité/fond: ${suggestion.opposabilityLabel}`,
      `Confiance: ${suggestion.confidence}`,
      suggestion.proceduralAssessment ? `Procédure: ${JSON.stringify(suggestion.proceduralAssessment)}` : "",
      suggestion.substantiveAssessment ? `Fond: ${JSON.stringify(suggestion.substantiveAssessment)}` : "",
      Array.isArray(suggestion.requiredChecks) && suggestion.requiredChecks.length > 0
        ? `Vérifications requises: ${suggestion.requiredChecks.join(" ; ")}`
        : "",
    ].filter(Boolean).join("\n");

    const [ground] = await db.insert(appealGroundsTable).values({
      appealId: appeal.id,
      category: suggestion.category,
      title: suggestion.title,
      description: suggestion.claimantArgument || suggestion.sourceText,
      linkedDocumentId: suggestion.documentId,
      seriousnessScore: suggestion.seriousnessScore,
      responseDraft,
      status: "a_qualifier",
    }).returning();

    await db.update(appealGroundSuggestionsTable)
      .set({
        status: "accepted",
        acceptedGroundId: ground.id,
        updatedAt: new Date(),
      })
      .where(eq(appealGroundSuggestionsTable.id, suggestion.id));

    const [grounds, notifications] = await Promise.all([
      db.select().from(appealGroundsTable).where(eq(appealGroundsTable.appealId, appeal.id)),
      db.select().from(appealNotificationsTable).where(eq(appealNotificationsTable.appealId, appeal.id)),
    ]);
    const computedScores = computeScores({
      appealType: appeal.appealType,
      postingEvidenceStatus: appeal.postingEvidenceStatus,
      groundsCount: grounds.length,
      hasAuthorityNotification: notifications.some((item) => item.type === "notification_autorite" && item.status === "envoye"),
      hasBeneficiaryNotification: notifications.some((item) => item.type === "notification_beneficiaire" && item.status === "envoye"),
    });
    await db.update(appealsTable)
      .set({ ...computedScores, updatedAt: new Date() })
      .where(eq(appealsTable.id, appeal.id));

    await logAppealEvent(
      appeal.id,
      req.user!.userId,
      "GROUND_SUGGESTION_ACCEPTED",
      `Suggestion convertie en grief: ${ground.title}.`,
      { suggestionId: suggestion.id, groundId: ground.id },
    );

    res.status(201).json({ ground, suggestion: { ...suggestion, status: "accepted", acceptedGroundId: ground.id } });
  } catch (err) {
    console.error("[appeals/ground-suggestions/accept]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de convertir cette suggestion en grief." });
  }
});

router.post("/:id/ground-suggestions/:suggestionId/reject", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Écart de suggestion non autorisé." });
      return;
    }

    const [suggestion] = await db.update(appealGroundSuggestionsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(
        eq(appealGroundSuggestionsTable.id, req.params.suggestionId as string),
        eq(appealGroundSuggestionsTable.appealId, appeal.id),
      ))
      .returning();

    if (!suggestion) {
      res.status(404).json({ error: "NOT_FOUND", message: "Suggestion introuvable." });
      return;
    }

    await logAppealEvent(
      appeal.id,
      req.user!.userId,
      "GROUND_SUGGESTION_REJECTED",
      `Suggestion écartée: ${suggestion.title}.`,
      { suggestionId: suggestion.id },
    );

    res.json({ suggestion });
  } catch (err) {
    console.error("[appeals/ground-suggestions/reject]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'écarter cette suggestion." });
  }
});

router.get("/documents/:documentId/view", authenticate, async (req: AuthRequest, res) => {
  try {
    const [document] = await db.select().from(appealDocumentsTable).where(eq(appealDocumentsTable.id, req.params.documentId as string)).limit(1);
    if (!document) {
      res.status(404).json({ error: "NOT_FOUND", message: "Pièce introuvable." });
      return;
    }

    const { allowed } = await canAccessAppeal(document.appealId, req.user!);
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé à cette pièce." });
      return;
    }

    const filePath = path.resolve(process.cwd(), "uploads", document.fileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "NOT_FOUND", message: "Fichier indisponible." });
      return;
    }

    if (document.mimeType) res.contentType(document.mimeType);
    res.sendFile(filePath);
  } catch (err) {
    console.error("[appeals/documents/view]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'afficher la pièce." });
  }
});

router.get("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé à la messagerie." });
      return;
    }

    const messages = await db.select().from(appealMessagesTable)
      .where(eq(appealMessagesTable.appealId, appeal.id))
      .orderBy(asc(appealMessagesTable.createdAt));

    res.json({ messages });
  } catch (err) {
    console.error("[appeals/messages/list]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de charger les messages." });
  }
});

router.post("/:id/messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const { allowed, appeal, dossier } = await canAccessAppeal(req.params.id as string, req.user!);
    if (!appeal) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recours introuvable." });
      return;
    }
    if (!allowed) {
      res.status(403).json({ error: "FORBIDDEN", message: "Envoi de message non autorisé." });
      return;
    }

    const { content } = req.body as { content?: string };
    if (!content?.trim()) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Le contenu du message est requis." });
      return;
    }

    const [message] = await db.insert(appealMessagesTable).values({
      appealId: appeal.id,
      fromUserId: req.user!.userId,
      fromRole: req.user!.role,
      content: content.trim(),
    }).returning();

    await logAppealEvent(appeal.id, req.user!.userId, "MESSAGE", "Nouveau message sur le recours.", {});

    if (dossier?.commune && req.user!.role !== "mairie" && req.user!.role !== "admin" && req.user!.role !== "super_admin") {
      await NotificationService.notifyRoleInCommune({
        role: "mairie",
        commune: dossier.commune,
        dossierId: dossier.id,
        type: "MESSAGE",
        title: `Nouveau message sur un recours lié à ${dossier.dossierNumber || dossier.title}`,
        message: `${req.user!.email} a ajouté un message dans le module Recours.`,
        priority: "HIGH",
      });
    }

    res.status(201).json({ message });
  } catch (err) {
    console.error("[appeals/messages/create]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'envoyer le message." });
  }
});

export default router;
