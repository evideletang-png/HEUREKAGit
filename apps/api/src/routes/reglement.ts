import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  regulatoryCalibrationZonesTable,
  regulatoryControlsTable,
  reglementAnalysisTable,
  townHallDocumentsTable,
  zoneRegulatoryRulesTable,
  regulatoryValidationHistoryTable,
  type RegulatoryControl,
  type ZoneRegulatoryRule,
} from "@workspace/db";
import { authenticate, requireMairie, type AuthRequest } from "../middlewares/authenticate.js";
import { parseNotebookAnalysis } from "../services/reglementParser.js";
import { extractZonesFromAnalysis } from "../services/zoneExtractionService.js";
import { buildReglementSummary } from "../services/reglementSummaryService.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate, requireMairie);

function normalizeCommuneId(value: unknown) {
  return String(value || "").trim();
}

function normalizeSource(value: unknown) {
  const source = String(value || "manual").trim().toLowerCase();
  return ["notebook", "manual", "ia"].includes(source) ? source : "manual";
}

function canWritePlu(req: AuthRequest) {
  const role = String(req.user?.role || "");
  const permissions = Array.isArray((req.user as any)?.permissions) ? (req.user as any).permissions : [];
  return ["extra_super_admin", "super_admin", "admin"].includes(role)
    || permissions.includes("plu.write")
    || permissions.includes("users.manage");
}

function requirePluWrite(req: AuthRequest, res: any) {
  if (canWritePlu(req)) return true;
  res.status(403).json({ error: "FORBIDDEN", message: "Droit insuffisant pour modifier le règlement." });
  return false;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function nullableNumber(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function recordHistory(args: {
  communeId: string;
  entityType: string;
  entityId: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  userId?: string | null;
  note?: string | null;
  snapshot?: Record<string, unknown>;
}) {
  await db.insert(regulatoryValidationHistoryTable).values({
    communeId: args.communeId,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    fromStatus: args.fromStatus || null,
    toStatus: args.toStatus || null,
    userId: args.userId || null,
    note: args.note || null,
    snapshot: args.snapshot || {},
  });
}

router.post("/import-analysis", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const communeId = normalizeCommuneId(req.body.communeId || req.body.commune);
    if (!communeId) {
      return res.status(400).json({ error: "MISSING_COMMUNE", message: "Commune obligatoire pour importer une analyse réglementaire." });
    }

    const fileContent = req.file?.buffer ? req.file.buffer.toString("utf8") : "";
    const rawContent = String(req.body.rawContent || req.body.text || req.body.analysis || fileContent || "").trim();
    if (!rawContent) {
      return res.status(400).json({ error: "EMPTY_ANALYSIS", message: "Colle une analyse ou importe un fichier texte." });
    }

    const documentId = req.body.documentId ? String(req.body.documentId) : null;
    if (documentId) {
      const [document] = await db.select({ id: townHallDocumentsTable.id }).from(townHallDocumentsTable)
        .where(eq(townHallDocumentsTable.id, documentId))
        .limit(1);
      if (!document) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND", message: "Document source introuvable." });
    }

    const parsed = parseNotebookAnalysis(rawContent);
    const [analysis] = await db.insert(reglementAnalysisTable).values({
      communeId,
      documentId,
      source: normalizeSource(req.body.source),
      rawContent,
      structuredContent: parsed as unknown as Record<string, unknown>,
      notebookUrl: req.body.notebookUrl ? String(req.body.notebookUrl) : null,
      notebookSummary: req.body.notebookSummary ? String(req.body.notebookSummary) : null,
      status: "draft",
      createdBy: req.user!.userId,
    }).returning();

    const extraction = await extractZonesFromAnalysis({
      communeId,
      analysisId: analysis.id,
      parsed,
      documentId,
      userId: req.user!.userId,
    });

    return res.status(201).json({
      analysis,
      parsed,
      extraction,
      fallbackLegacy: parsed.zones.length === 0,
    });
  } catch (err) {
    return res.status(500).json({
      error: "REGLEMENT_IMPORT_FAILED",
      message: err instanceof Error ? err.message : "Impossible d'importer l'analyse réglementaire.",
    });
  }
});

router.get("/summary", async (req: AuthRequest, res) => {
  const communeId = normalizeCommuneId(req.query.communeId || req.query.commune);
  if (!communeId) return res.status(400).json({ error: "MISSING_COMMUNE" });
  const summary = await buildReglementSummary(communeId);
  return res.json({ communeId, summary });
});

router.get("/zones", async (req: AuthRequest, res) => {
  const communeId = normalizeCommuneId(req.query.communeId || req.query.commune);
  if (!communeId) return res.status(400).json({ error: "MISSING_COMMUNE" });
  const zones = await db.select().from(regulatoryCalibrationZonesTable)
    .where(eq(regulatoryCalibrationZonesTable.communeId, communeId));
  const zoneIds = zones.map((zone) => zone.id);
  const [rules, controls] = await Promise.all([
    zoneIds.length > 0 ? db.select().from(zoneRegulatoryRulesTable).where(inArray(zoneRegulatoryRulesTable.zoneId, zoneIds)) : Promise.resolve([] as ZoneRegulatoryRule[]),
    zoneIds.length > 0 ? db.select().from(regulatoryControlsTable).where(inArray(regulatoryControlsTable.zoneId, zoneIds)) : Promise.resolve([] as RegulatoryControl[]),
  ]);
  return res.json({
    communeId,
    zones: zones.map((zone) => ({
      ...zone,
      ruleCount: rules.filter((rule) => rule.zoneId === zone.id).length,
      controlCount: controls.filter((control) => control.zoneId === zone.id).length,
      documentCount: new Set([
        ...rules.filter((rule) => rule.zoneId === zone.id).map((rule) => rule.sourceDocumentId).filter(Boolean),
        ...controls.filter((control) => control.zoneId === zone.id).map((control) => control.sourceDocumentId).filter(Boolean),
      ]).size,
      warnings: [
        ...(zone.status !== "validated" ? ["Zone à valider"] : []),
        ...(rules.some((rule) => rule.zoneId === zone.id && rule.validationStatus !== "validated") ? ["Règles non validées"] : []),
      ],
    })),
  });
});

router.get("/zones/:id", async (req: AuthRequest, res) => {
  const [zone] = await db.select().from(regulatoryCalibrationZonesTable)
    .where(eq(regulatoryCalibrationZonesTable.id, String(req.params.id)))
    .limit(1);
  if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });
  const [rules, controls] = await Promise.all([
    db.select().from(zoneRegulatoryRulesTable).where(eq(zoneRegulatoryRulesTable.zoneId, zone.id)),
    db.select().from(regulatoryControlsTable).where(eq(regulatoryControlsTable.zoneId, zone.id)),
  ]);
  const documentIds = Array.from(new Set([
    ...rules.map((rule) => rule.sourceDocumentId).filter((value): value is string => !!value),
    ...controls.map((control) => control.sourceDocumentId).filter((value): value is string => !!value),
    zone.referenceDocumentId,
  ].filter((value): value is string => !!value)));
  const documents = documentIds.length > 0
    ? await db.select({
        id: townHallDocumentsTable.id,
        title: townHallDocumentsTable.title,
        fileName: townHallDocumentsTable.fileName,
        documentType: townHallDocumentsTable.documentType,
        isOpposable: townHallDocumentsTable.isOpposable,
        explanatoryNote: townHallDocumentsTable.explanatoryNote,
        structuredContent: townHallDocumentsTable.structuredContent,
        notebookUrl: townHallDocumentsTable.notebookUrl,
        notebookSummary: townHallDocumentsTable.notebookSummary,
      }).from(townHallDocumentsTable).where(inArray(townHallDocumentsTable.id, documentIds))
    : [];
  const history = await db.select().from(regulatoryValidationHistoryTable)
    .where(and(
      eq(regulatoryValidationHistoryTable.entityType, "regulatory_zone"),
      eq(regulatoryValidationHistoryTable.entityId, zone.id),
    ));
  return res.json({ zone, rules, controls, documents, history });
});

router.patch("/zones/:id", async (req: AuthRequest, res) => {
  if (!requirePluWrite(req, res)) return;
  const [zone] = await db.select().from(regulatoryCalibrationZonesTable)
    .where(eq(regulatoryCalibrationZonesTable.id, String(req.params.id)))
    .limit(1);
  if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });
  const allowedStatus = new Set(["draft", "to_review", "validated"]);
  const nextStatus = String(req.body.status || zone.status);
  const [updated] = await db.update(regulatoryCalibrationZonesTable).set({
    zoneCode: req.body.zoneCode != null ? String(req.body.zoneCode).trim().toUpperCase() : zone.zoneCode,
    zoneLabel: req.body.zoneLabel != null ? String(req.body.zoneLabel).trim() || null : zone.zoneLabel,
    zoneType: req.body.zoneType != null ? String(req.body.zoneType).trim() || null : zone.zoneType,
    summary: req.body.summary != null ? String(req.body.summary) : zone.summary,
    guidanceNotes: req.body.guidanceNotes != null ? String(req.body.guidanceNotes) : zone.guidanceNotes,
    status: allowedStatus.has(nextStatus) ? nextStatus : zone.status,
    confidenceScore: nullableNumber(req.body.confidenceScore) ?? zone.confidenceScore,
    linkedDocumentIds: req.body.linkedDocumentIds != null ? asStringArray(req.body.linkedDocumentIds) : zone.linkedDocumentIds,
    constraints: req.body.constraints != null ? asStringArray(req.body.constraints) : zone.constraints,
    notebookUrl: req.body.notebookUrl !== undefined ? String(req.body.notebookUrl || "") || null : zone.notebookUrl,
    notebookSummary: req.body.notebookSummary !== undefined ? String(req.body.notebookSummary || "") || null : zone.notebookSummary,
    updatedBy: req.user!.userId,
    updatedAt: new Date(),
  }).where(eq(regulatoryCalibrationZonesTable.id, zone.id)).returning();
  await recordHistory({
    communeId: zone.communeId,
    entityType: "regulatory_zone",
    entityId: zone.id,
    action: "manual_update",
    fromStatus: zone.status,
    toStatus: updated.status,
    userId: req.user!.userId,
    snapshot: { before: zone, after: updated },
  });
  return res.json({ zone: updated });
});

router.post("/zones/:id/rules", async (req: AuthRequest, res) => {
  if (!requirePluWrite(req, res)) return;
  const [zone] = await db.select().from(regulatoryCalibrationZonesTable)
    .where(eq(regulatoryCalibrationZonesTable.id, String(req.params.id)))
    .limit(1);
  if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });
  const [rule] = await db.insert(zoneRegulatoryRulesTable).values({
    zoneId: zone.id,
    articleNumber: nullableNumber(req.body.articleNumber),
    articleTitle: req.body.articleTitle ? String(req.body.articleTitle) : null,
    topic: String(req.body.topic || "general"),
    ruleText: String(req.body.ruleText || req.body.rawContent || "Nouvelle règle"),
    rawContent: req.body.rawContent ? String(req.body.rawContent) : null,
    summary: req.body.summary ? String(req.body.summary) : null,
    conditions: req.body.conditions ? String(req.body.conditions) : null,
    exceptions: req.body.exceptions ? String(req.body.exceptions) : null,
    valueMin: nullableNumber(req.body.valueMin),
    valueMax: nullableNumber(req.body.valueMax),
    valueExact: nullableNumber(req.body.valueExact),
    unit: req.body.unit ? String(req.body.unit) : null,
    destination: req.body.destination ? String(req.body.destination) : null,
    projectType: req.body.projectType ? String(req.body.projectType) : null,
    sourceDocumentId: req.body.sourceDocumentId || null,
    sourcePage: nullableNumber(req.body.sourcePage),
    sourceExcerpt: req.body.sourceExcerpt ? String(req.body.sourceExcerpt) : null,
    confidenceScore: nullableNumber(req.body.confidenceScore) ?? 0.5,
    validationStatus: canWritePlu(req) ? String(req.body.validationStatus || "draft") : "proposed",
    instructorNote: req.body.instructorNote ? String(req.body.instructorNote) : null,
  }).returning();
  await recordHistory({ communeId: zone.communeId, entityType: "zone_regulatory_rule", entityId: rule.id, action: "manual_create", userId: req.user!.userId, snapshot: { rule } });
  return res.status(201).json({ rule });
});

router.patch("/rules/:id", async (req: AuthRequest, res) => {
  if (!requirePluWrite(req, res)) return;
  const [existing] = await db.select().from(zoneRegulatoryRulesTable).where(eq(zoneRegulatoryRulesTable.id, String(req.params.id))).limit(1);
  if (!existing) return res.status(404).json({ error: "RULE_NOT_FOUND" });
  const [zone] = await db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, existing.zoneId)).limit(1);
  const [rule] = await db.update(zoneRegulatoryRulesTable).set({
    articleNumber: req.body.articleNumber !== undefined ? nullableNumber(req.body.articleNumber) : existing.articleNumber,
    articleTitle: req.body.articleTitle !== undefined ? String(req.body.articleTitle || "") || null : existing.articleTitle,
    topic: req.body.topic !== undefined ? String(req.body.topic || "general") : existing.topic,
    ruleText: req.body.ruleText !== undefined ? String(req.body.ruleText || "") : existing.ruleText,
    rawContent: req.body.rawContent !== undefined ? String(req.body.rawContent || "") || null : existing.rawContent,
    summary: req.body.summary !== undefined ? String(req.body.summary || "") || null : existing.summary,
    conditions: req.body.conditions !== undefined ? String(req.body.conditions || "") || null : existing.conditions,
    exceptions: req.body.exceptions !== undefined ? String(req.body.exceptions || "") || null : existing.exceptions,
    valueMin: req.body.valueMin !== undefined ? nullableNumber(req.body.valueMin) : existing.valueMin,
    valueMax: req.body.valueMax !== undefined ? nullableNumber(req.body.valueMax) : existing.valueMax,
    valueExact: req.body.valueExact !== undefined ? nullableNumber(req.body.valueExact) : existing.valueExact,
    unit: req.body.unit !== undefined ? String(req.body.unit || "") || null : existing.unit,
    destination: req.body.destination !== undefined ? String(req.body.destination || "") || null : existing.destination,
    projectType: req.body.projectType !== undefined ? String(req.body.projectType || "") || null : existing.projectType,
    sourceDocumentId: req.body.sourceDocumentId !== undefined ? req.body.sourceDocumentId || null : existing.sourceDocumentId,
    sourcePage: req.body.sourcePage !== undefined ? nullableNumber(req.body.sourcePage) : existing.sourcePage,
    sourceExcerpt: req.body.sourceExcerpt !== undefined ? String(req.body.sourceExcerpt || "") || null : existing.sourceExcerpt,
    confidenceScore: req.body.confidenceScore !== undefined ? nullableNumber(req.body.confidenceScore) : existing.confidenceScore,
    validationStatus: req.body.validationStatus !== undefined ? String(req.body.validationStatus || "draft") : existing.validationStatus,
    instructorNote: req.body.instructorNote !== undefined ? String(req.body.instructorNote || "") || null : existing.instructorNote,
    updatedAt: new Date(),
  }).where(eq(zoneRegulatoryRulesTable.id, existing.id)).returning();
  await recordHistory({
    communeId: zone?.communeId || "unknown",
    entityType: "zone_regulatory_rule",
    entityId: rule.id,
    action: "manual_update",
    fromStatus: existing.validationStatus,
    toStatus: rule.validationStatus,
    userId: req.user!.userId,
    snapshot: { before: existing, after: rule },
  });
  return res.json({ rule });
});

router.delete("/rules/:id", async (req: AuthRequest, res) => {
  if (!requirePluWrite(req, res)) return;
  const [existing] = await db.select().from(zoneRegulatoryRulesTable).where(eq(zoneRegulatoryRulesTable.id, String(req.params.id))).limit(1);
  if (!existing) return res.status(404).json({ error: "RULE_NOT_FOUND" });
  const [zone] = await db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, existing.zoneId)).limit(1);
  await db.delete(zoneRegulatoryRulesTable).where(eq(zoneRegulatoryRulesTable.id, existing.id));
  await recordHistory({ communeId: zone?.communeId || "unknown", entityType: "zone_regulatory_rule", entityId: existing.id, action: "manual_delete", userId: req.user!.userId, snapshot: { before: existing } });
  return res.json({ ok: true });
});

router.post("/rules/:id/convert-control", async (req: AuthRequest, res) => {
  if (!requirePluWrite(req, res)) return;
  const [rule] = await db.select().from(zoneRegulatoryRulesTable).where(eq(zoneRegulatoryRulesTable.id, String(req.params.id))).limit(1);
  if (!rule) return res.status(404).json({ error: "RULE_NOT_FOUND" });
  const [control] = await db.insert(regulatoryControlsTable).values({
    zoneId: rule.zoneId,
    controlType: String(req.body.controlType || rule.topic || "general"),
    rule: rule.ruleText,
    sourceArticle: rule.articleNumber ? `Article ${rule.articleNumber}` : null,
    sourceDocumentId: rule.sourceDocumentId,
    confidenceScore: rule.confidenceScore,
    validationStatus: "draft",
    sourceExcerpt: rule.sourceExcerpt,
  }).returning();
  const [zone] = await db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, rule.zoneId)).limit(1);
  await recordHistory({ communeId: zone?.communeId || "unknown", entityType: "regulatory_control", entityId: control.id, action: "converted_from_rule", userId: req.user!.userId, snapshot: { rule, control } });
  return res.status(201).json({ control });
});

router.patch("/documents/:id", async (req: AuthRequest, res) => {
  if (!requirePluWrite(req, res)) return;
  const [document] = await db.select().from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, String(req.params.id))).limit(1);
  if (!document) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
  const currentStructured = document.structuredContent && typeof document.structuredContent === "object" ? document.structuredContent as Record<string, unknown> : {};
  const metadata = {
    ...currentStructured,
    reglementMetadata: {
      ...(currentStructured.reglementMetadata as Record<string, unknown> | undefined),
      perimeter: req.body.perimeter,
      zones: asStringArray(req.body.zones),
      approvalDate: req.body.approvalDate || null,
      modificationDate: req.body.modificationDate || null,
      version: req.body.version || null,
      officialSource: req.body.officialSource || null,
      shortSummary: req.body.shortSummary || null,
      detailedSummary: req.body.detailedSummary || null,
      keyPoints: asStringArray(req.body.keyPoints),
      uncertainties: req.body.uncertainties || null,
      humanReviewRequired: req.body.humanReviewRequired === true,
      internalNotes: req.body.internalNotes || null,
    },
  };
  const [updated] = await db.update(townHallDocumentsTable).set({
    title: req.body.title !== undefined ? String(req.body.title || document.title) : document.title,
    documentType: req.body.documentType !== undefined ? String(req.body.documentType || "") || null : document.documentType,
    isOpposable: req.body.opposability === "opposable" ? true : req.body.opposability === "informatif" ? false : document.isOpposable,
    explanatoryNote: req.body.shortSummary !== undefined ? String(req.body.shortSummary || "") || null : document.explanatoryNote,
    zone: req.body.zones !== undefined ? asStringArray(req.body.zones).join(", ") || null : document.zone,
    structuredContent: metadata,
    notebookUrl: req.body.notebookUrl !== undefined ? String(req.body.notebookUrl || "") || null : document.notebookUrl,
    notebookSummary: req.body.notebookSummary !== undefined ? String(req.body.notebookSummary || "") || null : document.notebookSummary,
    updatedAt: new Date(),
  }).where(eq(townHallDocumentsTable.id, document.id)).returning();
  await recordHistory({ communeId: document.commune || "unknown", entityType: "town_hall_document", entityId: document.id, action: "metadata_update", userId: req.user!.userId, snapshot: { before: document, after: updated } });
  return res.json({ document: updated });
});

router.post("/zones/:id/validate", async (req: AuthRequest, res) => {
  const [zone] = await db.update(regulatoryCalibrationZonesTable)
    .set({ status: "validated", updatedBy: req.user!.userId, updatedAt: new Date() })
    .where(eq(regulatoryCalibrationZonesTable.id, String(req.params.id)))
    .returning();
  if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });
  await Promise.all([
    db.update(zoneRegulatoryRulesTable)
      .set({ validationStatus: "validated", updatedAt: new Date() })
      .where(and(eq(zoneRegulatoryRulesTable.zoneId, zone.id), eq(zoneRegulatoryRulesTable.validationStatus, "draft"))),
    db.update(regulatoryControlsTable)
      .set({ validationStatus: "validated", updatedAt: new Date() })
      .where(and(eq(regulatoryControlsTable.zoneId, zone.id), eq(regulatoryControlsTable.validationStatus, "draft"))),
  ]);
  return res.json({ zone });
});

export default router;
