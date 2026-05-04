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
      }).from(townHallDocumentsTable).where(inArray(townHallDocumentsTable.id, documentIds))
    : [];
  return res.json({ zone, rules, controls, documents });
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
