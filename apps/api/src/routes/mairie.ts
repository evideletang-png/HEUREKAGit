import { Router, type IRouter } from "express";
import { db, runMigrations } from "@workspace/db";
import { desc, eq, sql, and, inArray, or, ne } from "drizzle-orm";
import { 
  dossiersTable, 
  documentReviewsTable, 
  usersTable, 
  analysesTable, 
  dossierMessagesTable, 
  townHallPromptsTable, 
  baseIABatchesTable,
  baseIADocumentsTable,
  baseIAEmbeddingsTable,
  municipalitySettingsTable,
  dossierEventsTable,
  ruleArticlesTable,
  zoneAnalysesTable,
} from "@workspace/db";
import { townHallDocumentsTable } from "../../../../packages/db/src/schema/townHallDocuments.js";
import { townHallDocumentFilesTable } from "../../../../packages/db/src/schema/townHallDocumentFiles.js";
import { townHallUploadSessionsTable } from "../../../../packages/db/src/schema/townHallUploadSessions.js";
import { documentKnowledgeProfilesTable } from "../../../../packages/db/src/schema/documentKnowledgeProfiles.js";
import { regulatoryUnitsTable } from "../../../../packages/db/src/schema/regulatoryUnits.js";
import { urbanRuleConflictsTable } from "../../../../packages/db/src/schema/urbanRuleConflicts.js";
import { urbanRulesTable } from "../../../../packages/db/src/schema/urbanRules.js";
import { regulatoryZoneSectionsTable } from "../../../../packages/db/src/schema/regulatoryZoneSections.js";
import { regulatoryCalibrationZonesTable } from "../../../../packages/db/src/schema/regulatoryCalibrationZones.js";
import { regulatoryOverlaysTable } from "../../../../packages/db/src/schema/regulatoryOverlays.js";
import { overlayDocumentBindingsTable } from "../../../../packages/db/src/schema/overlayDocumentBindings.js";
import { regulatoryThemeTaxonomyTable } from "../../../../packages/db/src/schema/regulatoryThemeTaxonomy.js";
import { calibratedExcerptsTable } from "../../../../packages/db/src/schema/calibratedExcerpts.js";
import { indexedRegulatoryRulesTable } from "../../../../packages/db/src/schema/indexedRegulatoryRules.js";
import { regulatoryCalibrationPermissionsTable } from "../../../../packages/db/src/schema/regulatoryCalibrationPermissions.js";
import { ruleRelationsTable } from "../../../../packages/db/src/schema/ruleRelations.js";
import { regulatoryValidationHistoryTable } from "../../../../packages/db/src/schema/regulatoryValidationHistory.js";
import { regulatoryRuleConflictsTable } from "../../../../packages/db/src/schema/regulatoryRuleConflicts.js";
import { zoneThematicSegmentsTable } from "../../../../packages/db/src/schema/zoneThematicSegments.js";
import { createHash } from "crypto";
import { logger } from "../utils/logger.js";
import { processDocumentForRAG } from "../services/baseIAIngestion.js";
import { generateGlobalSynthesis, type ExtractedDocumentData } from "../services/pluAnalysis.js";
import { persistRegulatoryUnitsForDocument } from "../services/regulatoryUnitService.js";
import { extractRegulatoryZoneSections, persistRegulatoryZoneSectionsForDocument } from "../services/regulatoryZoneSectionService.js";
import { persistDocumentKnowledgeProfile } from "../services/documentKnowledgeService.js";
import { persistUrbanRulesForDocument } from "../services/urbanRuleExtractionService.js";
import {
  buildLogicalMarkdownFileName,
  isMarkdownUpload,
  parseConsolidatedMarkdownKnowledge,
  type ConsolidatedMarkdownLogicalDocument,
  type ParsedConsolidatedMarkdownKnowledge,
} from "../services/consolidatedMarkdownKnowledgeService.js";
import {
  buildStructuredPluBundleStructuredContent,
  isStructuredPluJsonUpload,
  parseStructuredPluBundle,
  renderStructuredPluBundleText,
  type StructuredPluBundle,
} from "../services/structuredPluBundleService.js";
import { buildMunicipalityTextFilter, normalizeMunicipalityName } from "../services/municipalityAliasService.js";
import {
  REGULATORY_ARTICLE_REFERENCE,
  REGULATORY_NORMATIVE_EFFECTS,
  REGULATORY_OVERLAY_TYPES,
  REGULATORY_PROCEDURAL_EFFECTS,
  REGULATORY_RELATION_RESOLUTION_STATUSES,
  REGULATORY_RELATION_TYPES,
  REGULATORY_RULE_ANCHOR_TYPES,
  REGULATORY_STRUCTURE_MODES,
  buildCalibrationSuggestionsForDocument,
  detectRuleRelationSignals,
  ensureRegulatoryThemeTaxonomySeed,
  listDocumentCalibrationData,
  listCommuneRegulatoryOverlays,
  listPublishedRulesForCommune,
  recordRegulatoryValidationHistory,
  recomputeIndexedRuleConflicts,
  recomputeIndexedRuleRelationResolution,
  splitDocumentIntoCalibrationPages,
  validateIndexedRuleForPublication,
  type CalibrationPage,
} from "../services/regulatoryCalibrationService.js";
import {
  buildExpertZoneAnalysisWithAdjudication,
  buildZoneThematicSegmentsFromPages,
  listZoneThematicSegments,
  rebuildThematicSegmentsForZone,
} from "../services/expertZoneAnalysisService.js";
import { authenticate, requireMairie, type AuthRequest } from "../middlewares/authenticate.js";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";
import { VisionService } from "../services/visionService.js";
import { orchestrateDossierAnalysis } from "../services/orchestrator.js";
import { MessagingService } from "../services/messagingService.js";
import { WorkflowService, DOSSIER_STATUS } from "../services/workflowService.js";
import { DocumentGenerationService } from "../services/documentGenerationService.js";
import { AUTHORITY_POLICY } from "@workspace/ai-core";
import { assessExtractedTextQuality, hasUsableExtractedText, isTextLikelyGarbled, normalizeExtractedText, repairExtractedText, scoreTextQuality } from "../services/textQualityService.js";
import { execFileSync } from "child_process";

// dossierEventsTable is now imported above

// municipalitySettingsTable is now imported directly from @workspace/db

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRIMARY_UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
const LEGACY_UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const TOWN_HALL_UPLOAD_DIRS = Array.from(new Set([PRIMARY_UPLOADS_DIR, LEGACY_UPLOADS_DIR]));
const TOWN_HALL_UPLOAD_SESSION_DIR = path.join(PRIMARY_UPLOADS_DIR, ".town-hall-upload-sessions");
const RESUMABLE_UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

const router: IRouter = Router();

router.use(authenticate, requireMairie);

let calibrationSchemaReady = false;
let calibrationSchemaPromise: Promise<void> | null = null;

async function ensureCalibrationSchemaReady() {
  if (calibrationSchemaReady) return;
  if (!calibrationSchemaPromise) {
    calibrationSchemaPromise = (async () => {
      await runMigrations();
      await ensureRegulatoryThemeTaxonomySeed();
      calibrationSchemaReady = true;
    })().catch((err) => {
      calibrationSchemaPromise = null;
      throw err;
    });
  }
  await calibrationSchemaPromise;
}

// ─── DECISION GENERATION ───────────────────────────────────────────────────
router.post("/dossiers/:id/generate-decision", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const draft = await DocumentGenerationService.generateArreteDraft(id as string, req.user!.userId);
    return res.json({ draft });
  } catch (err) {
    return res.status(500).json({ error: "GENERATION_FAILED" });
  }
});

// ─── HELPER: parse communes from a user row ───────────────────────────────────
function parseCommunes(raw: string | null): string[] {
  if (!raw) return [];
  try { 
    const parsed = JSON.parse(raw); 
    if (Array.isArray(parsed)) return parsed.map(String);
    if (typeof parsed === "string") return [parsed];
    return [];
  } catch { 
    return raw.split(",").map(c => c.trim()).filter(Boolean); 
  }
}

function canAccessCommune(role: string | null | undefined, assignedCommunes: string[], commune: string | null | undefined): boolean {
  if (role === "admin" || role === "super_admin") return true;
  const normalized = normalizeMunicipalityName(commune);
  const assignedNormalized = assignedCommunes.map(normalizeMunicipalityName);
  return !!normalized && assignedNormalized.includes(normalized);
}

function parseDocumentTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map(tag => tag.trim()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).map(tag => tag.trim()).filter(Boolean);
    } catch {
      return raw.split(",").map(tag => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

function authorityForCanonicalType(canonicalType: string): number {
  if (canonicalType === "plu_reglement") return AUTHORITY_POLICY.REGULATION_LOCAL;
  if (canonicalType === "oap") return AUTHORITY_POLICY.PLANNING_OAP;
  if (canonicalType === "plu_annexe") return AUTHORITY_POLICY.ANNEX_TECHNICAL;
  if (canonicalType === "padd") return AUTHORITY_POLICY.ADMIN_GUIDE;
  return AUTHORITY_POLICY.UNKNOWN;
}

function buildMunicipalityAliasFilter(column: any, aliases: string[]) {
  return buildMunicipalityTextFilter(column, aliases);
}

function buildDeleteScopeFilter(clauses: Array<any>) {
  const validClauses = clauses.filter(Boolean);
  if (validClauses.length === 0) return sql`FALSE`;
  if (validClauses.length === 1) return validClauses[0];
  return or(...validClauses)!;
}

async function hydrateRuleRelations(relations: Array<typeof ruleRelationsTable.$inferSelect>) {
  if (relations.length === 0) return [];

  const sourceRuleIds = Array.from(new Set(relations.map((relation) => relation.sourceRuleId)));
  const targetRuleIds = Array.from(new Set(relations.map((relation) => relation.targetRuleId).filter((value): value is string => !!value)));
  const docIds = Array.from(new Set([
    ...relations.map((relation) => relation.sourceDocumentId),
    ...relations.map((relation) => relation.targetDocumentId).filter((value): value is string => !!value),
  ]));

  const [rules, docs, zones, overlays] = await Promise.all([
    db.select({
      id: indexedRegulatoryRulesTable.id,
      ruleLabel: indexedRegulatoryRulesTable.ruleLabel,
      status: indexedRegulatoryRulesTable.status,
      resolutionStatus: indexedRegulatoryRulesTable.resolutionStatus,
      zoneId: indexedRegulatoryRulesTable.zoneId,
      overlayId: indexedRegulatoryRulesTable.overlayId,
    })
      .from(indexedRegulatoryRulesTable)
      .where(inArray(indexedRegulatoryRulesTable.id, Array.from(new Set([...sourceRuleIds, ...targetRuleIds])))),
    docIds.length > 0
      ? db.select({
          id: townHallDocumentsTable.id,
          title: townHallDocumentsTable.title,
          fileName: townHallDocumentsTable.fileName,
        }).from(townHallDocumentsTable).where(inArray(townHallDocumentsTable.id, docIds))
      : Promise.resolve([]),
    db.select({
      id: regulatoryCalibrationZonesTable.id,
      zoneCode: regulatoryCalibrationZonesTable.zoneCode,
    }).from(regulatoryCalibrationZonesTable),
    db.select({
      id: regulatoryOverlaysTable.id,
      overlayCode: regulatoryOverlaysTable.overlayCode,
      overlayType: regulatoryOverlaysTable.overlayType,
    }).from(regulatoryOverlaysTable),
  ]);

  const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));
  const docMap = new Map(docs.map((doc) => [doc.id, doc.title || doc.fileName || "Document"]));
  const zoneMap = new Map(zones.map((zone) => [zone.id, zone.zoneCode]));
  const overlayMap = new Map(overlays.map((overlay) => [overlay.id, `${overlay.overlayCode}${overlay.overlayType ? ` · ${overlay.overlayType}` : ""}`]));

  return relations.map((relation) => {
    const sourceRule = ruleMap.get(relation.sourceRuleId) || null;
    const targetRule = relation.targetRuleId ? ruleMap.get(relation.targetRuleId) || null : null;
    return {
      ...relation,
      sourceRuleLabel: sourceRule?.ruleLabel || "Règle source",
      sourceRuleStatus: sourceRule?.status || null,
      sourceResolutionStatus: sourceRule?.resolutionStatus || null,
      targetRuleLabel: targetRule?.ruleLabel || null,
      targetRuleStatus: targetRule?.status || null,
      targetRuleTarget: targetRule?.zoneId
        ? zoneMap.get(targetRule.zoneId) || null
        : targetRule?.overlayId
          ? overlayMap.get(targetRule.overlayId) || null
          : null,
      sourceDocumentLabel: docMap.get(relation.sourceDocumentId) || null,
      targetDocumentLabel: relation.targetDocumentId ? docMap.get(relation.targetDocumentId) || null : null,
    };
  });
}

async function purgeMunicipalityStructuredKnowledge(args: {
  requestedCommune: string;
  municipalityAliases: string[];
  townHallDocumentIds: string[];
}) {
  const municipalityFilter = buildMunicipalityAliasFilter(baseIADocumentsTable.municipalityId, args.municipalityAliases);

  const [baseDocs, profileBaseDocs, sectionBaseDocs, unitBaseDocs, urbanRuleBaseDocs, calibrationZones] = await Promise.all([
    db.select({ id: baseIADocumentsTable.id })
      .from(baseIADocumentsTable)
      .where(municipalityFilter),
    args.townHallDocumentIds.length > 0
      ? db.select({ baseIADocumentId: documentKnowledgeProfilesTable.baseIADocumentId })
          .from(documentKnowledgeProfilesTable)
          .where(inArray(documentKnowledgeProfilesTable.townHallDocumentId, args.townHallDocumentIds))
      : Promise.resolve([]),
    args.townHallDocumentIds.length > 0
      ? db.select({ baseIADocumentId: regulatoryZoneSectionsTable.baseIADocumentId })
          .from(regulatoryZoneSectionsTable)
          .where(inArray(regulatoryZoneSectionsTable.townHallDocumentId, args.townHallDocumentIds))
      : Promise.resolve([]),
    args.townHallDocumentIds.length > 0
      ? db.select({ baseIADocumentId: regulatoryUnitsTable.baseIADocumentId })
          .from(regulatoryUnitsTable)
          .where(inArray(regulatoryUnitsTable.townHallDocumentId, args.townHallDocumentIds))
      : Promise.resolve([]),
    args.townHallDocumentIds.length > 0
      ? db.select({ baseIADocumentId: urbanRulesTable.baseIADocumentId })
          .from(urbanRulesTable)
          .where(inArray(urbanRulesTable.townHallDocumentId, args.townHallDocumentIds))
      : Promise.resolve([]),
    db.select({ id: regulatoryCalibrationZonesTable.id })
      .from(regulatoryCalibrationZonesTable)
      .where(buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, args.municipalityAliases)),
  ]);
  const overlays = await db.select({ id: regulatoryOverlaysTable.id })
    .from(regulatoryOverlaysTable)
    .where(buildMunicipalityAliasFilter(regulatoryOverlaysTable.communeId, args.municipalityAliases));

  const baseDocIds = Array.from(new Set([
    ...baseDocs.map((doc) => doc.id),
    ...profileBaseDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
    ...sectionBaseDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
    ...unitBaseDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
    ...urbanRuleBaseDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
  ]));
  const calibrationZoneIds = calibrationZones.map((zone) => zone.id);
  const overlayIds = overlays.map((overlay) => overlay.id);

  const excerpts = await db.select({ id: calibratedExcerptsTable.id })
    .from(calibratedExcerptsTable)
    .where(buildDeleteScopeFilter([
      buildMunicipalityAliasFilter(calibratedExcerptsTable.communeId, args.municipalityAliases),
      args.townHallDocumentIds.length > 0 ? inArray(calibratedExcerptsTable.documentId, args.townHallDocumentIds) : null,
      calibrationZoneIds.length > 0 ? inArray(calibratedExcerptsTable.zoneId, calibrationZoneIds) : null,
      overlayIds.length > 0 ? inArray(calibratedExcerptsTable.overlayId, overlayIds) : null,
    ]));
  const excerptIds = excerpts.map((excerpt) => excerpt.id);

  const indexedRules = await db.select({ id: indexedRegulatoryRulesTable.id })
    .from(indexedRegulatoryRulesTable)
    .where(buildDeleteScopeFilter([
      buildMunicipalityAliasFilter(indexedRegulatoryRulesTable.communeId, args.municipalityAliases),
      args.townHallDocumentIds.length > 0 ? inArray(indexedRegulatoryRulesTable.documentId, args.townHallDocumentIds) : null,
      calibrationZoneIds.length > 0 ? inArray(indexedRegulatoryRulesTable.zoneId, calibrationZoneIds) : null,
      overlayIds.length > 0 ? inArray(indexedRegulatoryRulesTable.overlayId, overlayIds) : null,
      excerptIds.length > 0 ? inArray(indexedRegulatoryRulesTable.excerptId, excerptIds) : null,
    ]));
  const indexedRuleIds = indexedRules.map((rule) => rule.id);

  return db.transaction(async (tx) => {
    const deletedValidationHistory = await tx.delete(regulatoryValidationHistoryTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(regulatoryValidationHistoryTable.communeId, args.municipalityAliases),
        calibrationZoneIds.length > 0
          ? and(eq(regulatoryValidationHistoryTable.entityType, "zone"), inArray(regulatoryValidationHistoryTable.entityId, calibrationZoneIds))
          : null,
        excerptIds.length > 0
          ? and(eq(regulatoryValidationHistoryTable.entityType, "excerpt"), inArray(regulatoryValidationHistoryTable.entityId, excerptIds))
          : null,
        indexedRuleIds.length > 0
          ? and(eq(regulatoryValidationHistoryTable.entityType, "rule"), inArray(regulatoryValidationHistoryTable.entityId, indexedRuleIds))
          : null,
      ]))
      .returning({ id: regulatoryValidationHistoryTable.id });

    const deletedCalibrationConflicts = await tx.delete(regulatoryRuleConflictsTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(regulatoryRuleConflictsTable.communeId, args.municipalityAliases),
        calibrationZoneIds.length > 0 ? inArray(regulatoryRuleConflictsTable.zoneId, calibrationZoneIds) : null,
        indexedRuleIds.length > 0 ? inArray(regulatoryRuleConflictsTable.leftRuleId, indexedRuleIds) : null,
        indexedRuleIds.length > 0 ? inArray(regulatoryRuleConflictsTable.rightRuleId, indexedRuleIds) : null,
      ]))
      .returning({ id: regulatoryRuleConflictsTable.id });

    const deletedOverlayBindings = await tx.delete(overlayDocumentBindingsTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(overlayDocumentBindingsTable.communeId, args.municipalityAliases),
        overlayIds.length > 0 ? inArray(overlayDocumentBindingsTable.overlayId, overlayIds) : null,
        args.townHallDocumentIds.length > 0 ? inArray(overlayDocumentBindingsTable.documentId, args.townHallDocumentIds) : null,
      ]))
      .returning({ id: overlayDocumentBindingsTable.id });

    const deletedIndexedRules = await tx.delete(indexedRegulatoryRulesTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(indexedRegulatoryRulesTable.communeId, args.municipalityAliases),
        args.townHallDocumentIds.length > 0 ? inArray(indexedRegulatoryRulesTable.documentId, args.townHallDocumentIds) : null,
        calibrationZoneIds.length > 0 ? inArray(indexedRegulatoryRulesTable.zoneId, calibrationZoneIds) : null,
        overlayIds.length > 0 ? inArray(indexedRegulatoryRulesTable.overlayId, overlayIds) : null,
        excerptIds.length > 0 ? inArray(indexedRegulatoryRulesTable.excerptId, excerptIds) : null,
      ]))
      .returning({ id: indexedRegulatoryRulesTable.id });

    const deletedExcerpts = await tx.delete(calibratedExcerptsTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(calibratedExcerptsTable.communeId, args.municipalityAliases),
        args.townHallDocumentIds.length > 0 ? inArray(calibratedExcerptsTable.documentId, args.townHallDocumentIds) : null,
        calibrationZoneIds.length > 0 ? inArray(calibratedExcerptsTable.zoneId, calibrationZoneIds) : null,
        overlayIds.length > 0 ? inArray(calibratedExcerptsTable.overlayId, overlayIds) : null,
      ]))
      .returning({ id: calibratedExcerptsTable.id });

    const deletedCalibrationZones = await tx.delete(regulatoryCalibrationZonesTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, args.municipalityAliases),
        calibrationZoneIds.length > 0 ? inArray(regulatoryCalibrationZonesTable.id, calibrationZoneIds) : null,
      ]))
      .returning({ id: regulatoryCalibrationZonesTable.id });

    const deletedOverlays = await tx.delete(regulatoryOverlaysTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(regulatoryOverlaysTable.communeId, args.municipalityAliases),
        overlayIds.length > 0 ? inArray(regulatoryOverlaysTable.id, overlayIds) : null,
      ]))
      .returning({ id: regulatoryOverlaysTable.id });

    const deletedConflicts = await tx.delete(urbanRuleConflictsTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(urbanRuleConflictsTable.municipalityId, args.municipalityAliases),
      ]))
      .returning({ id: urbanRuleConflictsTable.id });

    const deletedRules = await tx.delete(urbanRulesTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(urbanRulesTable.municipalityId, args.municipalityAliases),
        args.townHallDocumentIds.length > 0 ? inArray(urbanRulesTable.townHallDocumentId, args.townHallDocumentIds) : null,
        baseDocIds.length > 0 ? inArray(urbanRulesTable.baseIADocumentId, baseDocIds) : null,
      ]))
      .returning({ id: urbanRulesTable.id });

    const deletedUnits = await tx.delete(regulatoryUnitsTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(regulatoryUnitsTable.municipalityId, args.municipalityAliases),
        args.townHallDocumentIds.length > 0 ? inArray(regulatoryUnitsTable.townHallDocumentId, args.townHallDocumentIds) : null,
        baseDocIds.length > 0 ? inArray(regulatoryUnitsTable.baseIADocumentId, baseDocIds) : null,
      ]))
      .returning({ id: regulatoryUnitsTable.id });

    const deletedSections = await tx.delete(regulatoryZoneSectionsTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(regulatoryZoneSectionsTable.municipalityId, args.municipalityAliases),
        args.townHallDocumentIds.length > 0 ? inArray(regulatoryZoneSectionsTable.townHallDocumentId, args.townHallDocumentIds) : null,
        baseDocIds.length > 0 ? inArray(regulatoryZoneSectionsTable.baseIADocumentId, baseDocIds) : null,
      ]))
      .returning({ id: regulatoryZoneSectionsTable.id });

    const deletedProfiles = await tx.delete(documentKnowledgeProfilesTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(documentKnowledgeProfilesTable.municipalityId, args.municipalityAliases),
        args.townHallDocumentIds.length > 0 ? inArray(documentKnowledgeProfilesTable.townHallDocumentId, args.townHallDocumentIds) : null,
        baseDocIds.length > 0 ? inArray(documentKnowledgeProfilesTable.baseIADocumentId, baseDocIds) : null,
      ]))
      .returning({ id: documentKnowledgeProfilesTable.id });

    const deletedEmbeddings = baseDocIds.length > 0
      ? await tx.delete(baseIAEmbeddingsTable)
          .where(
            or(
              inArray(baseIAEmbeddingsTable.documentId, baseDocIds),
              buildMunicipalityAliasFilter(baseIAEmbeddingsTable.municipalityId, args.municipalityAliases),
              sql`lower(${baseIAEmbeddingsTable.metadata}->>'commune') = lower(${args.requestedCommune})`,
            )!,
          )
          .returning({ id: baseIAEmbeddingsTable.id })
      : await tx.delete(baseIAEmbeddingsTable)
          .where(
            or(
              buildMunicipalityAliasFilter(baseIAEmbeddingsTable.municipalityId, args.municipalityAliases),
              sql`lower(${baseIAEmbeddingsTable.metadata}->>'commune') = lower(${args.requestedCommune})`,
            )!,
          )
          .returning({ id: baseIAEmbeddingsTable.id });

    const deletedBaseDocs = await tx.delete(baseIADocumentsTable)
      .where(buildDeleteScopeFilter([
        buildMunicipalityAliasFilter(baseIADocumentsTable.municipalityId, args.municipalityAliases),
        baseDocIds.length > 0 ? inArray(baseIADocumentsTable.id, baseDocIds) : null,
      ]))
      .returning({ id: baseIADocumentsTable.id });

    return {
      deletedProfiles: deletedProfiles.length,
      deletedCalibrationZones: deletedCalibrationZones.length,
      deletedExcerpts: deletedExcerpts.length,
      deletedIndexedRules: deletedIndexedRules.length,
      deletedOverlayBindings: deletedOverlayBindings.length,
      deletedCalibrationConflicts: deletedCalibrationConflicts.length,
      deletedOverlays: deletedOverlays.length,
      deletedValidationHistory: deletedValidationHistory.length,
      deletedZoneSections: deletedSections.length,
      deletedUnits: deletedUnits.length,
      deletedRules: deletedRules.length,
      deletedConflicts: deletedConflicts.length,
      deletedEmbeddings: deletedEmbeddings.length,
      deletedBaseDocs: deletedBaseDocs.length,
    };
  });
}

async function purgeTownHallDocumentStructuredKnowledge(docId: string) {
  const [sourceDoc] = await db.select({ structuredContent: townHallDocumentsTable.structuredContent })
    .from(townHallDocumentsTable)
    .where(eq(townHallDocumentsTable.id, docId))
    .limit(1);
  const structuredBaseDocId = typeof (sourceDoc?.structuredContent as any)?.baseIADocumentId === "string"
    ? (sourceDoc?.structuredContent as any).baseIADocumentId as string
    : null;
  const relatedProfileDocs = await db.select({ baseIADocumentId: documentKnowledgeProfilesTable.baseIADocumentId })
    .from(documentKnowledgeProfilesTable)
    .where(eq(documentKnowledgeProfilesTable.townHallDocumentId, docId));
  const relatedSectionDocs = await db.select({ baseIADocumentId: regulatoryZoneSectionsTable.baseIADocumentId })
    .from(regulatoryZoneSectionsTable)
    .where(eq(regulatoryZoneSectionsTable.townHallDocumentId, docId));
  const relatedUnitDocs = await db.select({ baseIADocumentId: regulatoryUnitsTable.baseIADocumentId })
    .from(regulatoryUnitsTable)
    .where(eq(regulatoryUnitsTable.townHallDocumentId, docId));
  const relatedRuleDocs = await db.select({ baseIADocumentId: urbanRulesTable.baseIADocumentId })
    .from(urbanRulesTable)
    .where(eq(urbanRulesTable.townHallDocumentId, docId));

  const baseDocIds = Array.from(new Set([
    structuredBaseDocId,
    ...relatedProfileDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
    ...relatedSectionDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
    ...relatedUnitDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
    ...relatedRuleDocs.map((row) => row.baseIADocumentId).filter((value): value is string => !!value),
  ].filter((value): value is string => !!value)));

  return db.transaction(async (tx) => {
    const deletedOverlayBindings = await tx.delete(overlayDocumentBindingsTable)
      .where(eq(overlayDocumentBindingsTable.documentId, docId))
      .returning({ id: overlayDocumentBindingsTable.id });

    const deletedIndexedRules = await tx.delete(indexedRegulatoryRulesTable)
      .where(eq(indexedRegulatoryRulesTable.documentId, docId))
      .returning({ id: indexedRegulatoryRulesTable.id });

    const deletedExcerpts = await tx.delete(calibratedExcerptsTable)
      .where(eq(calibratedExcerptsTable.documentId, docId))
      .returning({ id: calibratedExcerptsTable.id });

    const deletedRules = await tx.delete(urbanRulesTable)
      .where(eq(urbanRulesTable.townHallDocumentId, docId))
      .returning({ id: urbanRulesTable.id });

    const deletedUnits = await tx.delete(regulatoryUnitsTable)
      .where(eq(regulatoryUnitsTable.townHallDocumentId, docId))
      .returning({ id: regulatoryUnitsTable.id });

    const deletedSections = await tx.delete(regulatoryZoneSectionsTable)
      .where(eq(regulatoryZoneSectionsTable.townHallDocumentId, docId))
      .returning({ id: regulatoryZoneSectionsTable.id });

    const deletedProfiles = await tx.delete(documentKnowledgeProfilesTable)
      .where(eq(documentKnowledgeProfilesTable.townHallDocumentId, docId))
      .returning({ id: documentKnowledgeProfilesTable.id });

    const deletedEmbeddings = baseDocIds.length > 0
      ? await tx.delete(baseIAEmbeddingsTable)
          .where(inArray(baseIAEmbeddingsTable.documentId, baseDocIds))
          .returning({ id: baseIAEmbeddingsTable.id })
      : [];

    const deletedBaseDocs = baseDocIds.length > 0
      ? await tx.delete(baseIADocumentsTable)
          .where(inArray(baseIADocumentsTable.id, baseDocIds))
          .returning({ id: baseIADocumentsTable.id })
      : [];

    return {
      deletedCalibrationExcerpts: deletedExcerpts.length,
      deletedIndexedRules: deletedIndexedRules.length,
      deletedProfiles: deletedProfiles.length,
      deletedZoneSections: deletedSections.length,
      deletedUnits: deletedUnits.length,
      deletedRules: deletedRules.length,
      deletedEmbeddings: deletedEmbeddings.length,
      deletedBaseDocs: deletedBaseDocs.length,
      deletedOverlayBindings: deletedOverlayBindings.length,
    };
  });
}

function normalizeConfiguredZoneCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.replace(/\s+/g, "").trim().toUpperCase();
  return /^(?:\d{1,2})?[A-Z]{1,4}[A-Z0-9-]*$/.test(normalized) ? normalized : null;
}

function deriveParentZoneCode(zoneCode: string | null): string | null {
  const normalized = normalizeConfiguredZoneCode(zoneCode);
  if (!normalized) return null;

  // Only infer an automatic parent when the zone clearly carries a numeric prefix
  // such as 1AU / 2AU. Other parent relationships stay user-configurable.
  const withoutNumericPrefix = normalized.replace(/^\d+/, "");
  return withoutNumericPrefix && withoutNumericPrefix !== normalized ? withoutNumericPrefix : null;
}

function normalizeZoneSearchKeywords(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(
      raw
        .map((keyword) => String(keyword).trim())
        .filter((keyword) => keyword.length > 0),
    ));
  }

  if (typeof raw === "string") {
    return Array.from(new Set(
      raw
        .split(/[\n,;]+/)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0),
    ));
  }

  return [];
}

function normalizeOptionalPositivePage(raw: unknown): number | null {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  const value = Math.trunc(numeric);
  return value > 0 ? value : null;
}

function parseNullableNumericInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim().length === 0) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeZoneRuleValueNumeric(rule: {
  operator?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
}) {
  if (typeof rule.valueNumeric !== "number" || !Number.isFinite(rule.valueNumeric)) return null;
  const hasOperator = typeof rule.operator === "string" && rule.operator.trim().length > 0;
  const hasTextValue = typeof rule.valueText === "string" && rule.valueText.trim().length > 0;
  const hasUnit = typeof rule.unit === "string" && rule.unit.trim().length > 0;
  if (rule.valueNumeric === 0 && !hasOperator && !hasTextValue && !hasUnit) {
    return null;
  }
  return rule.valueNumeric;
}

async function resolveCalibrationReferenceDocumentId(args: {
  communeAliases: string[];
  requestedId: unknown;
}) {
  if (typeof args.requestedId !== "string" || args.requestedId.trim().length === 0) {
    return null;
  }

  const [doc] = await db.select({
    id: townHallDocumentsTable.id,
  }).from(townHallDocumentsTable)
    .where(
      and(
        eq(townHallDocumentsTable.id, args.requestedId.trim()),
        buildMunicipalityAliasFilter(townHallDocumentsTable.commune, args.communeAliases),
      ),
    )
    .limit(1);

  if (!doc) {
    throw new Error("REFERENCE_DOCUMENT_NOT_FOUND");
  }

  return doc.id;
}

function normalizeReviewedArticleNumber(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return String(Math.trunc(raw));
  }

  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "manual") return "manual";

  const digits = trimmed.match(/\d{1,2}/)?.[0];
  return digits || null;
}

function buildReviewedSourceArticle(articleNumber: string | null) {
  if (!articleNumber || articleNumber === "manual") return null;
  return `Article ${articleNumber}`;
}

function inferArticleCodeFromCalibrationText(rawText: string | null | undefined) {
  if (!rawText) return null;
  const match = rawText.match(/\b(?:ARTICLE|ART\.?)\s*(\d{1,2})\b/i);
  return match?.[1] || null;
}

function normalizeSearchableText(rawText: string | null | undefined) {
  return (rawText || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildZoneKeywordMatchSnippet(lines: string[], index: number) {
  const window = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2));
  return window.join(" ").replace(/\s+/g, " ").trim();
}

function buildPseudoPagesFromBoundedZoneText(args: {
  text: string;
  startPage: number;
  endPage: number;
}) {
  const normalizedText = (args.text || "").trim();
  if (!normalizedText) return [] as Array<{ pageNumber: number; text: string; startOffset: number; endOffset: number }>;

  const pageCount = Math.max(1, args.endPage - args.startPage + 1);
  if (pageCount === 1) {
    return [{
      pageNumber: args.startPage,
      text: normalizedText,
      startOffset: 0,
      endOffset: normalizedText.length,
    }];
  }

  const articleBlocks = Array.from(
    normalizedText.matchAll(/(^|\n)\s*((?:[A-Z0-9-]+\s*-\s*)?ARTICLE\s*(\d{1,2})\s*:?[^\n]*)/gim),
  ).map((match, index, allMatches) => {
    const start = match.index + (match[1]?.length || 0);
    const next = allMatches[index + 1];
    const end = next ? next.index + (next[1]?.length || 0) : normalizedText.length;
    return normalizedText.slice(start, end).trim();
  }).filter((block) => block.length > 0);

  const paragraphBlocks = normalizedText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const blocks = (articleBlocks.length >= 2 ? articleBlocks : paragraphBlocks).filter((block) => block.length > 0);
  if (blocks.length === 0) {
    return [{
      pageNumber: args.startPage,
      text: normalizedText,
      startOffset: 0,
      endOffset: normalizedText.length,
    }];
  }

  const totalLength = blocks.reduce((sum, block) => sum + block.length, 0);
  const targetLength = Math.max(1, Math.ceil(totalLength / pageCount));
  const pages: Array<{ pageNumber: number; text: string; startOffset: number; endOffset: number }> = [];
  let currentBlocks: string[] = [];
  let currentLength = 0;
  let cursor = 0;

  const flushPage = () => {
    if (currentBlocks.length === 0) return;
    const text = currentBlocks.join("\n\n").trim();
    if (!text) return;
    pages.push({
      pageNumber: args.startPage + pages.length,
      text,
      startOffset: cursor,
      endOffset: cursor + text.length,
    });
    cursor += text.length + 2;
    currentBlocks = [];
    currentLength = 0;
  };

  blocks.forEach((block, index) => {
    currentBlocks.push(block);
    currentLength += block.length;
    const remainingBlocks = blocks.length - index - 1;
    const remainingPages = pageCount - pages.length - 1;
    if (
      pages.length < pageCount - 1 &&
      currentLength >= targetLength &&
      remainingBlocks >= remainingPages
    ) {
      flushPage();
    }
  });
  flushPage();

  while (pages.length < pageCount) {
    pages.push({
      pageNumber: args.startPage + pages.length,
      text: "",
      startOffset: cursor,
      endOffset: cursor,
    });
  }

  return pages.filter((page) => page.pageNumber >= args.startPage && page.pageNumber <= args.endPage);
}

function normalizePdfLabelNumber(raw: string | null | undefined) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const numeric = Number.parseInt(trimmed.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function detectPrintedPageNumberFromText(text: string | null | undefined) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const candidates = [
    ...lines.slice(0, 2),
    ...lines.slice(-4),
  ];

  for (const candidate of candidates) {
    const strictMatch = candidate.match(/^page\s+(\d{1,4})$/i);
    if (strictMatch?.[1]) {
      const parsed = Number.parseInt(strictMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  for (const candidate of candidates) {
    const embeddedMatch = candidate.match(/\bpage\s+(\d{1,4})\b/i);
    if (embeddedMatch?.[1]) {
      const parsed = Number.parseInt(embeddedMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  for (const candidate of lines.slice(-2)) {
    const rawMatch = candidate.match(/^(?:[-–—\[\(]?\s*)?(\d{1,4})(?:\s*[-–—\]\)]|\s*\/\s*\d{1,4})?$/);
    if (rawMatch?.[1]) {
      const parsed = Number.parseInt(rawMatch[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return null;
}

function inferDisplayedPdfPageNumbers(args: {
  pageCount: number;
  pdfLabels?: Array<number | null> | null;
  rawPages?: Array<{ pageNumber: number; text: string }> | null;
}) {
  const resolved: Array<number | null> = Array.from({ length: args.pageCount }, () => null);

  if (Array.isArray(args.pdfLabels)) {
    args.pdfLabels.forEach((label, index) => {
      if (index >= args.pageCount) return;
      if (typeof label === "number" && Number.isFinite(label) && label > 0) {
        resolved[index] = label;
      }
    });
  }

  if (Array.isArray(args.rawPages)) {
    args.rawPages.forEach((page, index) => {
      if (index >= args.pageCount) return;
      if (resolved[index] !== null) return;
      const detected = detectPrintedPageNumberFromText(page.text);
      if (typeof detected === "number" && Number.isFinite(detected) && detected > 0) {
        resolved[index] = detected;
      }
    });
  }

  const knownIndices = resolved
    .map((value, index) => ({ index, value }))
    .filter((entry): entry is { index: number; value: number } => typeof entry.value === "number" && Number.isFinite(entry.value));

  for (let cursor = 0; cursor < knownIndices.length - 1; cursor += 1) {
    const current = knownIndices[cursor];
    const next = knownIndices[cursor + 1];
    const gap = next.index - current.index;
    if (gap <= 1) continue;
    if (next.value - current.value !== gap) continue;
    for (let step = 1; step < gap; step += 1) {
      resolved[current.index + step] = current.value + step;
    }
  }

  const firstKnown = knownIndices[0];
  if (firstKnown) {
    for (let index = firstKnown.index - 1; index >= 0; index -= 1) {
      const inferred = firstKnown.value - (firstKnown.index - index);
      resolved[index] = inferred > 0 ? inferred : null;
    }
  }

  const lastKnown = knownIndices[knownIndices.length - 1];
  if (lastKnown) {
    for (let index = lastKnown.index + 1; index < resolved.length; index += 1) {
      resolved[index] = lastKnown.value + (index - lastKnown.index);
    }
  }

  const offsets = knownIndices
    .map(({ index, value }) => value - (index + 1))
    .filter((value) => Number.isFinite(value));
  if (offsets.length > 0) {
    const offsetFrequencies = new Map<number, number>();
    offsets.forEach((offset) => {
      offsetFrequencies.set(offset, (offsetFrequencies.get(offset) || 0) + 1);
    });
    const dominantOffset = [...offsetFrequencies.entries()]
      .sort((left, right) => right[1] - left[1])[0]?.[0];
    if (typeof dominantOffset === "number" && Number.isFinite(dominantOffset)) {
      resolved.forEach((value, index) => {
        if (value !== null) return;
        const inferred = index + 1 + dominantOffset;
        resolved[index] = inferred > 0 ? inferred : null;
      });
    }
  }

  return resolved;
}

function toRoman(value: number, uppercase: boolean) {
  if (!Number.isFinite(value) || value <= 0) return String(value);
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Math.trunc(value);
  let result = "";
  for (const [amount, glyph] of numerals) {
    while (remaining >= amount) {
      result += glyph;
      remaining -= amount;
    }
  }
  return uppercase ? result : result.toLowerCase();
}

function toAlphabetic(value: number, uppercase: boolean) {
  if (!Number.isFinite(value) || value <= 0) return String(value);
  let remaining = Math.trunc(value);
  let result = "";
  while (remaining > 0) {
    remaining -= 1;
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return uppercase ? result : result.toLowerCase();
}

function decodePdfStringLike(value: unknown) {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText().trim() || null;
  }
  return null;
}

function decodePdfNumberLike(value: unknown) {
  if (value instanceof PDFNumber) {
    const parsed = value.asNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function collectPdfPageLabelEntries(node: PDFDict | null, entries: Array<{ pageIndex: number; dict: PDFDict }> = []) {
  if (!node) return entries;

  const nums = node.lookup(PDFName.of("Nums"), PDFArray);
  if (nums) {
    for (let index = 0; index < nums.size(); index += 2) {
      const pageIndex = decodePdfNumberLike(nums.lookup(index));
      const labelDict = nums.lookup(index + 1, PDFDict);
      if (pageIndex !== null && labelDict) {
        entries.push({ pageIndex, dict: labelDict });
      }
    }
  }

  const kids = node.lookup(PDFName.of("Kids"), PDFArray);
  if (kids) {
    for (let index = 0; index < kids.size(); index += 1) {
      const child = kids.lookup(index, PDFDict);
      if (child) collectPdfPageLabelEntries(child, entries);
    }
  }

  return entries;
}

function buildPdfPageLabelSeries(pageCount: number, entries: Array<{ pageIndex: number; dict: PDFDict }>) {
  if (!entries.length) return [] as Array<number | null>;

  const sortedEntries = [...entries]
    .filter((entry) => entry.pageIndex >= 0 && entry.pageIndex < pageCount)
    .sort((left, right) => left.pageIndex - right.pageIndex);

  if (!sortedEntries.length) return [] as Array<number | null>;

  const labels: Array<number | null> = Array.from({ length: pageCount }, () => null);

  sortedEntries.forEach((entry, index) => {
    const nextPageIndex = sortedEntries[index + 1]?.pageIndex ?? pageCount;
    const style = entry.dict.lookup(PDFName.of("S"), PDFName)?.decodeText?.() || "D";
    const prefix = decodePdfStringLike(entry.dict.lookup(PDFName.of("P"))) || "";
    const start = decodePdfNumberLike(entry.dict.lookup(PDFName.of("St"))) || 1;

    for (let pageIndex = entry.pageIndex; pageIndex < nextPageIndex; pageIndex += 1) {
      const ordinal = start + (pageIndex - entry.pageIndex);
      let rendered = "";
      switch (style) {
        case "r":
          rendered = `${prefix}${toRoman(ordinal, false)}`;
          break;
        case "R":
          rendered = `${prefix}${toRoman(ordinal, true)}`;
          break;
        case "a":
          rendered = `${prefix}${toAlphabetic(ordinal, false)}`;
          break;
        case "A":
          rendered = `${prefix}${toAlphabetic(ordinal, true)}`;
          break;
        case "D":
        default:
          rendered = `${prefix}${ordinal}`;
          break;
      }
      labels[pageIndex] = normalizePdfLabelNumber(rendered);
    }
  });

  return labels;
}

async function extractPdfPageLabelData(documentId: string, fileName: string | null | undefined) {
  try {
    const source = await ensureTownHallDocumentPersistentSource(documentId, fileName);
    let buffer: Buffer | null = null;
    if (source.filePath && fs.existsSync(source.filePath)) {
      buffer = fs.readFileSync(source.filePath);
    } else {
      buffer = (await loadTownHallDocumentBlob(documentId))?.buffer || null;
    }
    if (!buffer?.length) return null;

    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    const catalogDict = (pdf.catalog as unknown as { dict: PDFDict }).dict;
    const pageLabelsNode = catalogDict.lookup(PDFName.of("PageLabels"), PDFDict);
    if (!pageLabelsNode) {
      return { pageCount, labels: null as Array<number | null> | null };
    }

    const entries = collectPdfPageLabelEntries(pageLabelsNode);
    const labels = buildPdfPageLabelSeries(pageCount, entries);
    return {
      pageCount,
      labels: labels.length === pageCount ? labels : null,
    };
  } catch {
    return null;
  }
}

function extractPdfTextByPage(filePath: string, actualPageNumber: number) {
  const runPdftotext = (mode: "layout" | "raw") => {
    const args = mode === "layout"
      ? ["-layout", "-f", String(actualPageNumber), "-l", String(actualPageNumber), "-enc", "UTF-8", filePath, "-"]
      : ["-raw", "-f", String(actualPageNumber), "-l", String(actualPageNumber), "-enc", "UTF-8", filePath, "-"];
    return execFileSync("pdftotext", args, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 16,
      stdio: ["ignore", "pipe", "ignore"],
    });
  };

  try {
    const layout = normalizeExtractedText(runPdftotext("layout"));
    if (layout) return layout;
  } catch {}

  try {
    const raw = normalizeExtractedText(runPdftotext("raw"));
    if (raw) return raw;
  } catch {}

  return "";
}

async function buildCalibrationPagesForDocument(doc: {
  id: string;
  fileName: string | null | undefined;
  rawText: string | null | undefined;
}, options?: {
  startPage?: number | null;
  endPage?: number | null;
}) {
  const rawPages = splitDocumentIntoCalibrationPages(doc.rawText || "");
  const pageLabelData = await extractPdfPageLabelData(doc.id, doc.fileName);
  const source = await ensureTownHallDocumentPersistentSource(doc.id, doc.fileName);
  const resolvedDisplayedPages = inferDisplayedPdfPageNumbers({
    pageCount: pageLabelData?.pageCount || rawPages.length,
    pdfLabels: pageLabelData?.labels || null,
    rawPages,
  });

  if (source.filePath && pageLabelData?.pageCount) {
    const actualPages = Array.from({ length: pageLabelData.pageCount }, (_, index) => index + 1);
    let candidateActualPages =
      (options?.startPage || options?.endPage)
        ? actualPages.filter((actualPageNumber) => {
            const displayedPage = resolvedDisplayedPages[actualPageNumber - 1] ?? null;
            if (displayedPage === null) return false;
            if (options?.startPage && displayedPage < options.startPage) return false;
            if (options?.endPage && displayedPage > options.endPage) return false;
            return true;
          })
        : actualPages;

    if (candidateActualPages.length === 0) {
      candidateActualPages = actualPages;
    }

    const extractedPdfPages = candidateActualPages.map((actualPageNumber) => {
      const text = extractPdfTextByPage(source.filePath!, actualPageNumber);
      const displayedPageNumber =
        resolvedDisplayedPages[actualPageNumber - 1]
        || detectPrintedPageNumberFromText(text)
        || actualPageNumber;
      return {
        pageNumber: displayedPageNumber,
        actualPageNumber,
        text,
        startOffset: 0,
        endOffset: text.length,
      };
    }).filter((page) => {
      if (options?.startPage && page.pageNumber < options.startPage) return false;
      if (options?.endPage && page.pageNumber > options.endPage) return false;
      return true;
    });

    const hasUsableExtractedPdfText = extractedPdfPages.some((page) => String(page.text || "").replace(/\s+/g, " ").trim().length >= 40);
    if (extractedPdfPages.length > 0 && hasUsableExtractedPdfText) {
      return extractedPdfPages;
    }
  }

  if (rawPages.length === 0) {
    return [] as Array<CalibrationPage & { actualPageNumber: number }>;
  }

  return rawPages.map((page, index) => {
    const displayPageNumber =
      resolvedDisplayedPages[index]
      || detectPrintedPageNumberFromText(page.text)
      || page.pageNumber;

    return {
      ...page,
      actualPageNumber: page.pageNumber,
      pageNumber: displayPageNumber,
    };
  }).filter((page) => {
    if (options?.startPage && page.pageNumber < options.startPage) return false;
    if (options?.endPage && page.pageNumber > options.endPage) return false;
    return true;
  });
}

function buildZoneKeywordMatches(args: {
  pages: Array<{ pageNumber: number; text: string }>;
  keywords: string[];
}) {
  const normalizedKeywords = args.keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
  if (normalizedKeywords.length === 0) return [];

  return normalizedKeywords.flatMap((keyword) => {
    const normalizedKeyword = normalizeSearchableText(keyword);
    return args.pages.flatMap((page) => {
      const lines = page.text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return lines.flatMap((line, index) => {
        if (!normalizeSearchableText(line).includes(normalizedKeyword)) return [];
        const snippet = buildZoneKeywordMatchSnippet(lines, index);
        return [{
          keyword,
          pageNumber: page.pageNumber,
          snippet,
          articleCode: inferArticleCodeFromCalibrationText(snippet),
        }];
      });
    });
  }).filter((hit, index, all) => all.findIndex((candidate) => candidate.keyword === hit.keyword && candidate.pageNumber === hit.pageNumber && candidate.snippet === hit.snippet) === index);
}

function buildZoneArticleAnchors(pages: Array<{ pageNumber: number; text: string }>) {
  const nonEmptyPages = pages.filter((page) => page.text.trim().length > 0);
  if (nonEmptyPages.length === 0) return [];

  const offsetRanges: Array<{ start: number; end: number; pageNumber: number }> = [];
  let cursor = 0;
  const combinedText = nonEmptyPages.map((page) => {
    const text = page.text.trim();
    offsetRanges.push({
      start: cursor,
      end: cursor + text.length,
      pageNumber: page.pageNumber,
    });
    cursor += text.length + 2;
    return text;
  }).join("\n\n");

  const matches = Array.from(
    combinedText.matchAll(/(^|\n)\s*((?:[A-Z0-9-]+\s*-\s*)?ARTICLE\s*(\d{1,2})\s*:?[^\n]*)/gim),
  );

  const anchors = matches.flatMap((match, index) => {
    const articleCode = match[3] || null;
    if (!articleCode) return [];

    const startOffset = match.index + (match[1]?.length || 0);
    const next = matches[index + 1];
    const endOffset = next ? next.index + (next[1]?.length || 0) : combinedText.length;
    const blockText = combinedText.slice(startOffset, endOffset).trim();
    const [headingLine, ...restLines] = blockText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const snippet = restLines.join(" ").replace(/\s+/g, " ").trim();
    if (!snippet && (!headingLine || headingLine.replace(/\s+/g, "").length <= 12)) {
      return [];
    }

    const range = offsetRanges.find((candidate) => startOffset >= candidate.start && startOffset <= candidate.end);
    return [{
      articleCode,
      pageNumber: range?.pageNumber || nonEmptyPages[0]?.pageNumber || 1,
      label: headingLine || match[2].replace(/\s+/g, " ").trim(),
      snippet: snippet.slice(0, 500),
    }];
  });

  const bestByArticle = new Map<string, typeof anchors[number]>();
  for (const anchor of anchors) {
    const existing = bestByArticle.get(anchor.articleCode);
    const currentScore = (anchor.snippet?.length || 0) * 10 - anchor.pageNumber;
    const existingScore = existing ? ((existing.snippet?.length || 0) * 10 - existing.pageNumber) : -1;
    if (!existing || currentScore > existingScore) {
      bestByArticle.set(anchor.articleCode, anchor);
    }
  }

  return Array.from(bestByArticle.values());
}

function normalizeDocumentFingerprintPart(raw: string | null | undefined) {
  return (raw || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTownHallDocumentVersionSignature(args: {
  title?: string | null;
  fileName?: string | null;
  canonicalType?: string | null;
}) {
  const sourceName = normalizeDocumentFingerprintPart(args.title || args.fileName || "");
  const canonicalType = (args.canonicalType || "other").trim().toLowerCase();
  return `${canonicalType}::${sourceName}`;
}

function isLikelyPluZoneCode(raw: unknown, options?: { allowSingleLetter?: boolean }) {
  const normalized = normalizeConfiguredZoneCode(raw);
  if (!normalized) return null;

  const blockedCodes = new Set([
    "PLU",
    "PADD",
    "OAP",
    "ABF",
    "PPRI",
    "PPRT",
    "SPR",
    "AVAP",
    "RNU",
    "SUP",
    "EBC",
    "ER",
    "ARTICLE",
    "AVEC",
    "AVOIR",
    "AYANT",
    "UNE",
    "NON",
    "NUM",
    "PAGES",
    "PAGE",
    "COMMUNE",
  ]);

  if (blockedCodes.has(normalized)) return null;
  if (normalized.includes("ARTICLE")) return null;
  if (/^(ART|ANN|PAGE|PLAN|CARTE|ZONE)\b/.test(normalized)) return null;
  if (/^\d{1,2}AU[A-Z0-9-]*$/.test(normalized)) return normalized;
  if (/^[UNA][A-Z0-9-]{1,4}$/.test(normalized)) return normalized;
  if (options?.allowSingleLetter && /^(?:U|A|N)$/.test(normalized)) return normalized;
  return null;
}

function isLikelyZoningLikeSource(args: {
  rawText?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
}) {
  const hint = [args.sourceName || "", args.sourceType || "", args.rawText?.slice(0, 1200) || ""]
    .join(" ")
    .toLowerCase();

  return hint.includes("zonage")
    || hint.includes("zoning map")
    || hint.includes("document graphique")
    || hint.includes("planche")
    || hint.includes("légende")
    || hint.includes("legende")
    || hint.includes("legend");
}

function extractCalibrationZoneCodes(rawText: string, options?: { zoningLike?: boolean }) {
  if (!rawText || rawText.trim().length < (options?.zoningLike ? 20 : 80)) return [];

  const detected = new Set<string>();
  const zoneCodePattern = String.raw`(?:\d{1,2}AU[A-Za-z0-9-]{0,4}|[UNA][A-Za-z0-9-]{0,4})`;
  const addZoneCode = (raw: unknown, options?: { allowSingleLetter?: boolean }) => {
    const zoneCode = isLikelyPluZoneCode(raw, options);
    if (zoneCode) detected.add(zoneCode);
  };

  for (const section of extractRegulatoryZoneSections(rawText)) {
    addZoneCode(section.zoneCode, { allowSingleLetter: true });
  }

  const explicitZonePatterns = [
    new RegExp(`\\br[èée]glement\\s+de\\s+la\\s+zone\\s+(${zoneCodePattern})\\b`, "gi"),
    new RegExp(`\\bdispositions\\s+applicables\\s+(?:à|a)\\s+la\\s+zone\\s+(${zoneCodePattern})\\b`, "gi"),
    new RegExp(`\\bzone\\s+(${zoneCodePattern})\\b`, "gi"),
  ];

  for (const pattern of explicitZonePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawText)) !== null) {
      addZoneCode(match[1], { allowSingleLetter: true });
    }
  }

  if (options?.zoningLike) {
    const inlineTokenPattern = new RegExp(`\\b${zoneCodePattern}\\b`, "g");
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlineTokenPattern.exec(rawText)) !== null) {
      addZoneCode(inlineMatch[0], { allowSingleLetter: true });
    }
  }

  for (const line of rawText.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;

    const looksLikeZoneInventory =
      /\b(?:zones?|sous[- ]zones?|secteurs?|sous[- ]secteurs?)\b/i.test(trimmed)
      && /[\/,;()]/.test(trimmed);

    if (looksLikeZoneInventory) {
      const listedTokens = trimmed.match(new RegExp(`\\b${zoneCodePattern}\\b`, "g")) || [];
      for (const token of listedTokens) {
        addZoneCode(token, { allowSingleLetter: true });
      }
    }

    const maxLineLength = options?.zoningLike ? 96 : 36;
    if (trimmed.length > maxLineLength) continue;

    const headingMatch = trimmed.match(new RegExp(`^(?:r[èée]glement\\s+de\\s+la\\s+zone|dispositions\\s+applicables\\s+(?:à|a)\\s+la\\s+zone|zone)\\s+(${zoneCodePattern})(?:\\s*\\([^)]*\\))?$`, "i"));
    if (headingMatch?.[1]) {
      addZoneCode(headingMatch[1], { allowSingleLetter: true });
      continue;
    }

    const prefixedMatch = trimmed.match(new RegExp(`^zone\\s+(${zoneCodePattern})(?:\\s*\\([^)]*\\))?$`, "i"));
    if (prefixedMatch?.[1]) {
      addZoneCode(prefixedMatch[1], { allowSingleLetter: true });
      continue;
    }

    if (!options?.zoningLike) {
      const standaloneZoneMatch = trimmed.match(new RegExp(`^(${zoneCodePattern})(?:\\s*\\([^)]*\\))?$`, "i"));
      if (standaloneZoneMatch?.[1]) {
        addZoneCode(standaloneZoneMatch[1], { allowSingleLetter: true });
      }
      continue;
    }

    const lineLeadMatch = trimmed.match(new RegExp(`^(?:zone\\s+)?(${zoneCodePattern})\\b`, "i"));
    if (lineLeadMatch?.[1]) {
      addZoneCode(lineLeadMatch[1], { allowSingleLetter: true });
    }

    const tokens = trimmed.match(new RegExp(`\\b${zoneCodePattern}\\b`, "g")) || [];
    for (const token of tokens) {
      addZoneCode(token, { allowSingleLetter: true });
    }
  }

  return Array.from(detected.values()).sort((left, right) => left.localeCompare(right, "fr"));
}

async function ensureCalibrationZonesForCommune(args: {
  communeKey: string;
  communeAliases: string[];
  rawText: string;
  sourceName?: string | null;
  sourceType?: string | null;
  referenceDocumentId?: string | null;
  userId?: string | null;
}) {
  const extractedSections = extractRegulatoryZoneSections(args.rawText);
  const sectionByZoneCode = new Map(
    extractedSections
      .map((section) => [normalizeConfiguredZoneCode(section.zoneCode), section] as const)
      .filter((entry): entry is [string, (typeof extractedSections)[number]] => !!entry[0]),
  );

  const zoneCodes = Array.from(new Set([
    ...Array.from(sectionByZoneCode.keys()),
    ...extractCalibrationZoneCodes(args.rawText, {
      zoningLike: isLikelyZoningLikeSource({
        rawText: args.rawText,
        sourceName: args.sourceName,
        sourceType: args.sourceType,
      }),
    }),
  ]));
  if (zoneCodes.length === 0) {
    return { detected: 0, created: 0, updated: 0 };
  }

  const [existingZones, deletedZones] = await Promise.all([
    db.select({
      id: regulatoryCalibrationZonesTable.id,
      zoneCode: regulatoryCalibrationZonesTable.zoneCode,
      displayOrder: regulatoryCalibrationZonesTable.displayOrder,
      guidanceNotes: regulatoryCalibrationZonesTable.guidanceNotes,
      searchKeywords: regulatoryCalibrationZonesTable.searchKeywords,
      referenceDocumentId: regulatoryCalibrationZonesTable.referenceDocumentId,
      referenceStartPage: regulatoryCalibrationZonesTable.referenceStartPage,
      referenceEndPage: regulatoryCalibrationZonesTable.referenceEndPage,
      parentZoneCode: regulatoryCalibrationZonesTable.parentZoneCode,
      sectorCode: regulatoryCalibrationZonesTable.sectorCode,
    })
      .from(regulatoryCalibrationZonesTable)
      .where(buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, args.communeAliases)),
    db.select({
      snapshot: regulatoryValidationHistoryTable.snapshot,
    })
      .from(regulatoryValidationHistoryTable)
      .where(
        and(
          buildMunicipalityAliasFilter(regulatoryValidationHistoryTable.communeId, args.communeAliases),
          eq(regulatoryValidationHistoryTable.entityType, "zone"),
          eq(regulatoryValidationHistoryTable.action, "zone_deleted"),
        ),
      ),
  ]);

  const existingZoneByCode = new Map(
    existingZones
      .map((zone) => [normalizeConfiguredZoneCode(zone.zoneCode), zone] as const)
      .filter((entry): entry is [string, (typeof existingZones)[number]] => !!entry[0]),
  );
  const existingZoneCodes = new Set(existingZoneByCode.keys());
  const deletedZoneCodes = new Set(
    deletedZones
      .map((entry) => normalizeConfiguredZoneCode((entry.snapshot as Record<string, unknown> | null | undefined)?.zoneCode))
      .filter((zoneCode): zoneCode is string => !!zoneCode),
  );

  let updated = 0;
  for (const zoneCode of zoneCodes) {
    const existingZone = existingZoneByCode.get(zoneCode);
    if (!existingZone) continue;

    const section = sectionByZoneCode.get(zoneCode) || null;
    const autoKeywords = normalizeZoneSearchKeywords([
      zoneCode,
      `zone ${zoneCode}`,
      section?.heading || "",
    ]);
    const nextReferenceStartPage = existingZone.referenceStartPage ?? section?.startPage ?? null;
    const nextReferenceEndPage = existingZone.referenceEndPage ?? section?.endPage ?? null;
    const nextReferenceDocumentId = existingZone.referenceDocumentId ?? args.referenceDocumentId ?? null;
    const nextGuidanceNotes = existingZone.guidanceNotes ?? section?.heading ?? (
      args.sourceName
        ? `Zone détectée automatiquement depuis ${args.sourceName}${args.sourceType ? ` (${args.sourceType})` : ""}.`
        : "Zone détectée automatiquement depuis un document réglementaire."
    );
    const nextParentZoneCode = existingZone.parentZoneCode ?? section?.parentZoneCode ?? deriveParentZoneCode(zoneCode);
    const nextSectorCode = existingZone.sectorCode ?? (section?.isSubZone ? zoneCode : null);
    const existingKeywords = Array.isArray(existingZone.searchKeywords) ? existingZone.searchKeywords : [];
    const mergedKeywords = Array.from(new Set([...existingKeywords, ...autoKeywords]));
    const sameKeywords =
      mergedKeywords.length === existingKeywords.length
      && mergedKeywords.every((keyword, index) => keyword === existingKeywords[index]);

    const shouldUpdate =
      nextReferenceStartPage !== existingZone.referenceStartPage
      || nextReferenceEndPage !== existingZone.referenceEndPage
      || nextReferenceDocumentId !== existingZone.referenceDocumentId
      || nextGuidanceNotes !== existingZone.guidanceNotes
      || nextParentZoneCode !== existingZone.parentZoneCode
      || nextSectorCode !== existingZone.sectorCode
      || !sameKeywords;

    if (!shouldUpdate) continue;

    await db.update(regulatoryCalibrationZonesTable)
      .set({
        parentZoneCode: nextParentZoneCode,
        sectorCode: nextSectorCode,
        guidanceNotes: nextGuidanceNotes,
        searchKeywords: mergedKeywords,
        referenceDocumentId: nextReferenceDocumentId,
        referenceStartPage: nextReferenceStartPage,
        referenceEndPage: nextReferenceEndPage,
        updatedBy: args.userId || null,
        updatedAt: new Date(),
      })
      .where(eq(regulatoryCalibrationZonesTable.id, existingZone.id));
    updated += 1;
  }

  const nextDisplayOrder = existingZones.reduce((maxOrder, zone) => Math.max(maxOrder, zone.displayOrder || 0), 0) + 1;
  const zonesToCreate = zoneCodes
    .filter((zoneCode) => !existingZoneCodes.has(zoneCode))
    .filter((zoneCode) => !deletedZoneCodes.has(zoneCode));

  if (zonesToCreate.length === 0) {
    return { detected: zoneCodes.length, created: 0, updated };
  }

  const createdZones = await db.insert(regulatoryCalibrationZonesTable).values(
    zonesToCreate.map((zoneCode, index) => {
      const section = sectionByZoneCode.get(zoneCode) || null;
      return {
        communeId: args.communeKey,
        zoneCode,
        zoneLabel: section?.isSubZone ? `Sous-zone ${zoneCode}` : `Zone ${zoneCode}`,
        parentZoneCode: section?.parentZoneCode ?? deriveParentZoneCode(zoneCode),
        sectorCode: section?.isSubZone ? zoneCode : null,
        guidanceNotes: section?.heading || (
          args.sourceName
            ? `Zone détectée automatiquement depuis ${args.sourceName}${args.sourceType ? ` (${args.sourceType})` : ""}.`
            : "Zone détectée automatiquement depuis un document réglementaire."
        ),
        searchKeywords: normalizeZoneSearchKeywords([
          zoneCode,
          `zone ${zoneCode}`,
          section?.heading || "",
        ]),
        referenceDocumentId: args.referenceDocumentId || null,
        referenceStartPage: section?.startPage ?? null,
        referenceEndPage: section?.endPage ?? null,
        displayOrder: nextDisplayOrder + index,
        isActive: true,
        createdBy: args.userId || null,
        updatedBy: args.userId || null,
      };
    }),
  ).returning();

  await Promise.all(
    createdZones.map((zone) =>
      safeRecordRegulatoryValidationHistory({
        communeId: args.communeKey,
        entityType: "zone",
        entityId: zone.id,
        action: "zone_auto_detected",
        userId: args.userId || null,
        snapshot: zone as Record<string, unknown>,
      }),
    ),
  );

  return {
    detected: zoneCodes.length,
    created: createdZones.length,
    updated,
  };
}

function inferCanonicalDocumentType(documentType: string | null | undefined, category?: string | null, subCategory?: string | null) {
  const hint = [documentType || "", category || "", subCategory || ""].join(" ").toLowerCase();
  if (hint.includes("padd")) return "other";
  if (hint.includes("oap") || hint.includes("orientation")) return "oap";
  if (hint.includes("plan") || hint.includes("graphique") || hint.includes("carte") || hint.includes("zonage") || hint.includes("annexe")) {
    return "plu_annexe";
  }
  if (hint.includes("reglement") || hint.includes("règlement") || hint.includes("plu")) {
    return "plu_reglement";
  }
  return "other";
}

function inferCriticalRuleTheme(theme: string | null | undefined, articleNumber: number | null | undefined, sourceText: string | null | undefined) {
  const haystack = `${theme || ""} ${sourceText || ""}`.toLowerCase();
  if (articleNumber === 1 || articleNumber === 2 || /destination|usage|occupation du sol|interdit|autoris/gi.test(haystack)) {
    return { key: "usages_destination", label: "Usages & destinations" };
  }
  if (articleNumber === 3 || /acc[eè]s|voirie|desserte|voie publique/gi.test(haystack)) {
    return { key: "voirie_acces", label: "Voirie & accès" };
  }
  if (articleNumber === 6 || /alignement|recul|voie/gi.test(haystack)) {
    return { key: "implantation_voie", label: "Implantation par rapport à la voie" };
  }
  if (articleNumber === 7 || /limite s[eé]parative|limites s[eé]paratives|prospect/gi.test(haystack)) {
    return { key: "implantation_limites", label: "Implantation sur limites séparatives" };
  }
  if (articleNumber === 9 || /emprise|\bces\b|coefficient d[' ]emprise/gi.test(haystack)) {
    return { key: "emprise_densite", label: "Emprise & densité" };
  }
  if (articleNumber === 10 || /hauteur|gabarit|fa[iî]tage|egout|égout/gi.test(haystack)) {
    return { key: "hauteur_gabarit", label: "Hauteur & gabarit" };
  }
  if (articleNumber === 12 || /stationnement|parking|garage/gi.test(haystack)) {
    return { key: "stationnement", label: "Accès & stationnement" };
  }
  if (articleNumber === 13 || /pleine terre|espace vert|espaces verts|plantation/gi.test(haystack)) {
    return { key: "espaces_verts", label: "Espaces verts & pleine terre" };
  }
  return { key: "autres", label: theme?.trim() || "Autres règles" };
}

function confidenceRank(level: string | null | undefined) {
  switch ((level || "").toLowerCase()) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function formatUrbanRuleValueHint(rule: {
  ruleValueType?: string | null;
  ruleValueMin?: number | null;
  ruleValueMax?: number | null;
  ruleValueExact?: number | null;
  ruleUnit?: string | null;
}) {
  const unit = rule.ruleUnit ? ` ${rule.ruleUnit}` : "";
  switch (rule.ruleValueType) {
    case "exact":
      return rule.ruleValueExact != null ? `${rule.ruleValueExact}${unit}` : null;
    case "min":
      return rule.ruleValueMin != null ? `>= ${rule.ruleValueMin}${unit}` : null;
    case "max":
      return rule.ruleValueMax != null ? `<= ${rule.ruleValueMax}${unit}` : null;
    case "range":
      return rule.ruleValueMin != null && rule.ruleValueMax != null ? `${rule.ruleValueMin}${unit} à ${rule.ruleValueMax}${unit}` : null;
    default:
      return null;
  }
}

function mapCanonicalTypeToBaseIAType(canonicalType: string) {
  if (canonicalType === "plu_reglement" || canonicalType === "plu_annexe") return "plu";
  if (canonicalType === "oap") return "oap";
  return "other";
}

function isCanonicalTypeOpposable(canonicalType: string) {
  return canonicalType === "plu_reglement" || canonicalType === "plu_annexe";
}

function isRegulatoryLikeDocument(documentType: string | null | undefined, category?: string | null, subCategory?: string | null) {
  const hint = [documentType || "", category || "", subCategory || ""].join(" ").toLowerCase();
  return hint.includes("plu")
    || hint.includes("reglement")
    || hint.includes("règlement")
    || hint.includes("zonage")
    || hint.includes("annexe")
    || hint.includes("oap")
    || hint.includes("orientation")
    || hint.includes("padd");
}

async function resolveInseeCode(commune: string): Promise<string | null> {
  const value = (commune || "").trim();
  if (!value) return null;
  if (/^\d{5}$/.test(value)) return value;

  const [settings] = await db.select({ inseeCode: municipalitySettingsTable.inseeCode })
    .from(municipalitySettingsTable)
    .where(buildMunicipalityAliasFilter(municipalitySettingsTable.commune, [value]))
    .limit(1);
  if (settings?.inseeCode) return settings.inseeCode;

  const [markdownDoc] = await db.select({
    inseeCode: sql<string | null>`${townHallDocumentsTable.structuredContent}->'consolidatedMarkdownMetadata'->>'inseeCode'`,
  })
    .from(townHallDocumentsTable)
    .where(buildMunicipalityAliasFilter(
      sql`${townHallDocumentsTable.structuredContent}->'consolidatedMarkdownMetadata'->>'commune'`,
      [value],
    ))
    .limit(1);
  if (markdownDoc?.inseeCode) return markdownDoc.inseeCode;

  return null;
}

async function resolveAuthorizedTownHallCommune(userId: string, requestedCommune?: string) {
  const [currentUser] = await db.select({ role: usersTable.role, communes: usersTable.communes })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const assignedCommunes = parseCommunes(currentUser?.communes);
  const targetCommune = requestedCommune || assignedCommunes[0];

  if (!targetCommune) {
    return {
      ok: false as const,
      status: 400,
      error: { error: "BAD_REQUEST", message: "Commune requise pour indexer dans la Base IA." }
    };
  }

  if (
    currentUser?.role !== "admin"
    && currentUser?.role !== "super_admin"
    && !assignedCommunes.some(c => normalizeMunicipalityName(c) === normalizeMunicipalityName(targetCommune))
  ) {
    return {
      ok: false as const,
      status: 403,
      error: { error: "FORBIDDEN", message: "Vous n'avez pas accès à cette commune." }
    };
  }

  return {
    ok: true as const,
    currentUser,
    assignedCommunes,
    targetCommune,
  };
}

async function resolveCommuneAliases(commune: string) {
  const inseeCode = await resolveInseeCode(commune);
  return {
    inseeCode,
    communeAliases: Array.from(new Set([commune, inseeCode].filter((value): value is string => !!value))),
    communeKey: inseeCode || commune,
  };
}

type CalibrationPermissionSet = {
  communeId: string;
  mode: "legacy" | "controlled" | "admin";
  canEditCalibration: boolean;
  canPublishRules: boolean;
  canManagePermissions: boolean;
};

async function listEligibleCalibrationUsersForCommune(commune: string) {
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    communes: usersTable.communes,
  }).from(usersTable);

  return users.filter((user) => {
    if (user.role === "admin" || user.role === "super_admin") return true;
    if (user.role !== "mairie") return false;
    return canAccessCommune(user.role, parseCommunes(user.communes), commune);
  });
}

async function resolveCalibrationPermissions(args: {
  userId: string;
  role: string;
  commune: string;
}): Promise<CalibrationPermissionSet> {
  await ensureCalibrationSchemaReady();
  const { communeKey } = await resolveCommuneAliases(args.commune);

  if (args.role === "admin" || args.role === "super_admin") {
    return {
      communeId: communeKey,
      mode: "admin",
      canEditCalibration: true,
      canPublishRules: true,
      canManagePermissions: true,
    };
  }

  const existingRows = await db.select()
    .from(regulatoryCalibrationPermissionsTable)
    .where(eq(regulatoryCalibrationPermissionsTable.communeId, communeKey));

  if (existingRows.length === 0) {
    return {
      communeId: communeKey,
      mode: "legacy",
      canEditCalibration: true,
      canPublishRules: true,
      canManagePermissions: false,
    };
  }

  const currentRow = existingRows.find((row) => row.userId === args.userId);
  return {
    communeId: communeKey,
    mode: "controlled",
    canEditCalibration: !!currentRow?.canEditCalibration,
    canPublishRules: !!currentRow?.canPublishRules,
    canManagePermissions: !!currentRow?.canManagePermissions,
  };
}

function denyCalibrationPermission(res: any, message: string) {
  return res.status(403).json({ error: "FORBIDDEN", message });
}

async function safeRecordRegulatoryValidationHistory(args: {
  communeId: string;
  entityType: "zone" | "overlay" | "binding" | "segment" | "excerpt" | "rule" | "conflict" | "relation";
  entityId: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  action: string;
  note?: string | null;
  userId?: string | null;
  snapshot?: Record<string, unknown>;
}) {
  try {
    await recordRegulatoryValidationHistory(args);
  } catch (err) {
    logger.warn("[mairie/regulatory-calibration/history]", {
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function persistStructuredKnowledgeForDocument(args: {
  baseIADocumentId?: string | null;
  townHallDocumentId?: string | null;
  municipalityId: string;
  documentType: string;
  documentSubtype?: string | null;
  sourceName: string;
  sourceUrl?: string | null;
  versionDate?: string | null;
  sourceAuthority: number;
  opposable: boolean;
  rawText: string;
  rawClassification?: Record<string, unknown>;
}) {
  await persistDocumentKnowledgeProfile({
    baseIADocumentId: args.baseIADocumentId || null,
    townHallDocumentId: args.townHallDocumentId || null,
    municipalityId: args.municipalityId,
    documentType: args.documentType,
    documentSubtype: args.documentSubtype || null,
    sourceName: args.sourceName,
    sourceUrl: args.sourceUrl || null,
    versionDate: args.versionDate || null,
    opposable: args.opposable,
    sourceAuthority: args.sourceAuthority,
    rawText: args.rawText,
    rawClassification: args.rawClassification || {},
  });

  await persistUrbanRulesForDocument({
    baseIADocumentId: args.baseIADocumentId || null,
    townHallDocumentId: args.townHallDocumentId || null,
    municipalityId: args.municipalityId,
    documentType: args.documentType,
    sourceAuthority: args.sourceAuthority,
    isOpposable: args.opposable,
  });
}

function buildConsolidatedMarkdownStructuredContent(args: {
  parsed: ParsedConsolidatedMarkdownKnowledge;
  parentDocumentId?: string | null;
  parentBaseIADocumentId?: string | null;
  baseIADocumentId?: string | null;
  logicalDocument?: ConsolidatedMarkdownLogicalDocument | null;
  sourceFileName: string;
}) {
  const base = {
    sourceFormat: "consolidated_markdown",
    sourceMarkdownFileName: args.sourceFileName,
    authoritativeCommuneContext: args.parsed.promptBlock,
    consolidatedMarkdownMetadata: args.parsed.metadata,
  };

  if (!args.logicalDocument) {
    return {
      ...base,
      isConsolidatedMarkdownParent: true,
      baseIADocumentId: args.baseIADocumentId || null,
      logicalDocuments: args.parsed.documents.map((document) => ({
        logicalDocumentIndex: document.logicalDocumentIndex,
        sourceMarkdownHeading: document.sourceMarkdownHeading,
        title: document.title,
        canonicalType: document.canonicalType,
        documentType: document.documentType,
        sourceAuthority: document.sourceAuthority,
        isOpposable: document.isOpposable,
      })),
    };
  }

  return {
    ...base,
    isConsolidatedMarkdownPart: true,
    parentDocumentId: args.parentDocumentId || null,
    parentBaseIADocumentId: args.parentBaseIADocumentId || null,
    baseIADocumentId: args.baseIADocumentId || null,
    logicalDocumentIndex: args.logicalDocument.logicalDocumentIndex,
    sourceMarkdownHeading: args.logicalDocument.sourceMarkdownHeading,
    canonicalType: args.logicalDocument.canonicalType,
    sourceAuthority: args.logicalDocument.sourceAuthority,
  };
}

async function upsertConsolidatedMarkdownPrompt(args: {
  communeAliases: string[];
  promptBlock: string | null;
  sourceName: string;
}) {
  const promptBlock = args.promptBlock?.trim();
  if (!promptBlock) return;

  const markerStart = "<!-- HEUREKA_CONSOLIDATED_MARKDOWN_PROMPT_START -->";
  const markerEnd = "<!-- HEUREKA_CONSOLIDATED_MARKDOWN_PROMPT_END -->";
  const wrappedBlock = [
    markerStart,
    `Source: ${args.sourceName}`,
    promptBlock,
    markerEnd,
  ].join("\n");
  const generatedBlockRegex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "g");

  for (const commune of args.communeAliases) {
    if (!commune?.trim()) continue;
    const [existing] = await db.select({
      id: townHallPromptsTable.id,
      content: townHallPromptsTable.content,
    })
      .from(townHallPromptsTable)
      .where(buildMunicipalityAliasFilter(townHallPromptsTable.commune, [commune]))
      .limit(1);

    if (existing) {
      const manualContent = String(existing.content || "").replace(generatedBlockRegex, "").trim();
      const content = [manualContent, wrappedBlock].filter(Boolean).join("\n\n");
      await db.update(townHallPromptsTable)
        .set({ content, updatedAt: new Date() })
        .where(eq(townHallPromptsTable.id, existing.id));
      continue;
    }

    await db.insert(townHallPromptsTable).values({
      commune,
      content: wrappedBlock,
    });
  }
}

async function ensureMarkdownMunicipalitySettings(parsed: ParsedConsolidatedMarkdownKnowledge) {
  const commune = parsed.metadata.commune?.trim();
  const inseeCode = parsed.metadata.inseeCode?.trim();
  if (!commune && !inseeCode) return;

  const aliases = [commune, inseeCode].filter((value): value is string => !!value);
  const [existing] = await db.select({
    id: municipalitySettingsTable.id,
    inseeCode: municipalitySettingsTable.inseeCode,
  })
    .from(municipalitySettingsTable)
    .where(or(
      buildMunicipalityAliasFilter(municipalitySettingsTable.commune, aliases),
      inseeCode ? eq(municipalitySettingsTable.inseeCode, inseeCode) : sql`FALSE`,
    ))
    .limit(1);

  if (existing) {
    if (inseeCode && existing.inseeCode !== inseeCode) {
      await db.update(municipalitySettingsTable)
        .set({ inseeCode, updatedAt: new Date() })
        .where(eq(municipalitySettingsTable.id, existing.id));
    }
    return;
  }

  if (commune) {
    await db.insert(municipalitySettingsTable).values({
      commune,
      inseeCode: inseeCode || null,
    }).onConflictDoNothing();
  }
}

async function ensureStructuredPluMunicipalitySettings(bundle: StructuredPluBundle) {
  const commune = bundle.commune?.trim();
  const inseeCode = bundle.insee_code?.trim();
  if (!commune && !inseeCode) return;

  const aliases = [commune, inseeCode].filter((value): value is string => !!value);
  const [existing] = await db.select({
    id: municipalitySettingsTable.id,
    inseeCode: municipalitySettingsTable.inseeCode,
  })
    .from(municipalitySettingsTable)
    .where(or(
      aliases.length > 0 ? buildMunicipalityAliasFilter(municipalitySettingsTable.commune, aliases) : sql`FALSE`,
      inseeCode ? eq(municipalitySettingsTable.inseeCode, inseeCode) : sql`FALSE`,
    ))
    .limit(1);

  if (existing) {
    if (inseeCode && existing.inseeCode !== inseeCode) {
      await db.update(municipalitySettingsTable)
        .set({ inseeCode, updatedAt: new Date() })
        .where(eq(municipalitySettingsTable.id, existing.id));
    }
    return;
  }

  if (commune) {
    await db.insert(municipalitySettingsTable).values({
      commune,
      inseeCode: inseeCode || null,
    }).onConflictDoNothing();
  }
}

async function processKnowledgeDocumentThroughPipeline(args: {
  baseIADocumentId: string;
  townHallDocumentId: string;
  municipalityKey: string;
  communeAliases: string[];
  rawText: string;
  canonicalType: string;
  documentSubtype: string | null;
  sourceName: string;
  sourceAuthority: number;
  isOpposable: boolean;
  zoneCode?: string | null;
  userId?: string | null;
  rawClassification: Record<string, unknown>;
}) {
  await processDocumentForRAG(args.baseIADocumentId, args.municipalityKey, args.rawText, {
    document_id: args.baseIADocumentId,
    document_type: args.canonicalType,
    pool_id: `${args.municipalityKey}-PLU-ACTIVE`,
    status: "active",
    commune: args.municipalityKey,
    zone: args.zoneCode || undefined,
    source_authority: args.sourceAuthority,
    provenance: "base_ia_plu",
  } as any);

  await persistRegulatoryUnitsForDocument({
    baseIADocumentId: args.baseIADocumentId,
    townHallDocumentId: args.townHallDocumentId,
    municipalityId: args.municipalityKey,
    zoneCode: args.zoneCode || null,
    documentType: args.canonicalType,
    sourceAuthority: args.sourceAuthority,
    isOpposable: args.isOpposable,
    rawText: args.rawText,
  });

  await persistRegulatoryZoneSectionsForDocument({
    baseIADocumentId: args.baseIADocumentId,
    townHallDocumentId: args.townHallDocumentId,
    municipalityId: args.municipalityKey,
    documentType: args.canonicalType,
    sourceAuthority: args.sourceAuthority,
    isOpposable: args.isOpposable,
    rawText: args.rawText,
  });

  await ensureCalibrationZonesForCommune({
    communeKey: args.municipalityKey,
    communeAliases: args.communeAliases,
    rawText: args.rawText,
    sourceName: args.sourceName,
    sourceType: args.documentSubtype,
    referenceDocumentId: args.townHallDocumentId,
    userId: args.userId || null,
  });

  await persistStructuredKnowledgeForDocument({
    baseIADocumentId: args.baseIADocumentId,
    townHallDocumentId: args.townHallDocumentId,
    municipalityId: args.municipalityKey,
    documentType: args.canonicalType,
    documentSubtype: args.documentSubtype,
    sourceName: args.sourceName,
    sourceAuthority: args.sourceAuthority,
    opposable: args.isOpposable,
    rawText: args.rawText,
    rawClassification: args.rawClassification,
  });
}

async function materializeConsolidatedMarkdownDocuments(args: {
  parsed: ParsedConsolidatedMarkdownKnowledge;
  parentTownHallDocumentId: string;
  parentBaseIADocumentId: string;
  sourceFileName: string;
  uploadBatchId: string;
  municipalityKey: string;
  communeAliases: string[];
  targetCommune: string;
  userId?: string | null;
  zoneCode?: string | null;
}) {
  const createdDocuments = [];

  for (const logicalDocument of args.parsed.documents) {
    const logicalFileName = buildLogicalMarkdownFileName(args.sourceFileName, logicalDocument.logicalDocumentIndex);
    const logicalHash = createHash("sha256")
      .update(`${args.parentBaseIADocumentId}:${logicalDocument.logicalDocumentIndex}:${logicalDocument.rawText}`)
      .digest("hex");
    const canonicalType = logicalDocument.canonicalType === "contextual" ? "other" : logicalDocument.canonicalType;

    const [baseIADoc] = await db.insert(baseIADocumentsTable).values({
      batchId: args.uploadBatchId,
      municipalityId: args.municipalityKey,
      zoneCode: args.zoneCode || null,
      category: logicalDocument.category,
      subCategory: logicalDocument.subCategory,
      tags: logicalDocument.tags,
      type: mapCanonicalTypeToBaseIAType(canonicalType),
      fileName: logicalFileName,
      fileHash: logicalHash,
      status: "parsing",
      rawText: logicalDocument.rawText,
    }).returning();

    const structuredContent = buildConsolidatedMarkdownStructuredContent({
      parsed: args.parsed,
      parentDocumentId: args.parentTownHallDocumentId,
      parentBaseIADocumentId: args.parentBaseIADocumentId,
      baseIADocumentId: baseIADoc.id,
      logicalDocument,
      sourceFileName: args.sourceFileName,
    });

    const [townHallDoc] = await db.insert(townHallDocumentsTable).values({
      userId: args.userId || null,
      commune: args.targetCommune,
      title: logicalDocument.title,
      fileName: logicalFileName,
      mimeType: "text/markdown",
      fileSize: Buffer.byteLength(logicalDocument.rawText, "utf-8"),
      hasStoredBlob: false,
      rawText: logicalDocument.rawText,
      category: logicalDocument.category,
      subCategory: logicalDocument.subCategory,
      documentType: logicalDocument.documentType,
      isRegulatory: true,
      isOpposable: logicalDocument.isOpposable,
      tags: logicalDocument.tags,
      zone: args.zoneCode || null,
      structuredContent,
    }).returning({ id: townHallDocumentsTable.id });

    try {
      await processKnowledgeDocumentThroughPipeline({
        baseIADocumentId: baseIADoc.id,
        townHallDocumentId: townHallDoc.id,
        municipalityKey: args.municipalityKey,
        communeAliases: args.communeAliases,
        rawText: logicalDocument.rawText,
        canonicalType,
        documentSubtype: logicalDocument.documentType,
        sourceName: logicalDocument.title,
        sourceAuthority: logicalDocument.sourceAuthority,
        isOpposable: logicalDocument.isOpposable,
        zoneCode: args.zoneCode || null,
        userId: args.userId || null,
        rawClassification: {
          category: logicalDocument.category,
          subCategory: logicalDocument.subCategory,
          resolvedDocumentType: logicalDocument.documentType,
          source: "consolidated_markdown_logical_document",
          parentTownHallDocumentId: args.parentTownHallDocumentId,
          parentBaseIADocumentId: args.parentBaseIADocumentId,
          logicalDocumentIndex: logicalDocument.logicalDocumentIndex,
          sourceMarkdownHeading: logicalDocument.sourceMarkdownHeading,
        },
      });

      await db.update(baseIADocumentsTable)
        .set({ status: "indexed" })
        .where(eq(baseIADocumentsTable.id, baseIADoc.id));
    } catch (err) {
      logger.error("[mairie/markdown] Logical document indexing failed", err, {
        parentTownHallDocumentId: args.parentTownHallDocumentId,
        logicalDocumentIndex: logicalDocument.logicalDocumentIndex,
      });
      await db.update(baseIADocumentsTable)
        .set({ status: "vectorization_failed" })
        .where(eq(baseIADocumentsTable.id, baseIADoc.id));
    }

    createdDocuments.push({
      townHallDocumentId: townHallDoc.id,
      baseIADocumentId: baseIADoc.id,
      logicalDocumentIndex: logicalDocument.logicalDocumentIndex,
      title: logicalDocument.title,
      sourceMarkdownHeading: logicalDocument.sourceMarkdownHeading,
    });
  }

  return createdDocuments;
}

router.get("/plu-knowledge-summary", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const targetCommune = access.targetCommune;
    const inseeCode = await resolveInseeCode(targetCommune);
    const municipalityAliases = Array.from(new Set([targetCommune, inseeCode].filter((value): value is string => !!value)));

    const docs = await db.select({
      id: townHallDocumentsTable.id,
      title: townHallDocumentsTable.title,
      fileName: townHallDocumentsTable.fileName,
      mimeType: townHallDocumentsTable.mimeType,
      hasStoredBlob: townHallDocumentsTable.hasStoredBlob,
      commune: townHallDocumentsTable.commune,
      rawText: townHallDocumentsTable.rawText,
      category: townHallDocumentsTable.category,
      subCategory: townHallDocumentsTable.subCategory,
      documentType: townHallDocumentsTable.documentType,
      isOpposable: townHallDocumentsTable.isOpposable,
      isRegulatory: townHallDocumentsTable.isRegulatory,
      structuredContent: townHallDocumentsTable.structuredContent,
      createdAt: townHallDocumentsTable.createdAt,
    }).from(townHallDocumentsTable)
      .where(buildMunicipalityAliasFilter(townHallDocumentsTable.commune, municipalityAliases))
      .orderBy(desc(townHallDocumentsTable.createdAt));

    let profiles = await db.select().from(documentKnowledgeProfilesTable)
      .where(inArray(documentKnowledgeProfilesTable.municipalityId, municipalityAliases))
      .orderBy(desc(documentKnowledgeProfilesTable.updatedAt));

    if (profiles.length === 0) {
      const municipalityKey = inseeCode || targetCommune;
      for (const doc of docs) {
        const classification = await maybeSyncTownHallDocumentClassification(doc);
        const canonicalType = classification.canonicalType;
        if (!classification.isRegulatory) continue;
        if (!hasUsableTownHallText(doc.rawText)) continue;

        await persistRegulatoryZoneSectionsForDocument({
          townHallDocumentId: doc.id,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          sourceAuthority: authorityForCanonicalType(canonicalType),
          isOpposable: !!doc.isOpposable,
          rawText: doc.rawText,
        });

        await persistRegulatoryUnitsForDocument({
          townHallDocumentId: doc.id,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          sourceAuthority: authorityForCanonicalType(canonicalType),
          isOpposable: !!doc.isOpposable,
          rawText: doc.rawText,
        });

        await ensureCalibrationZonesForCommune({
          communeKey: municipalityKey,
          communeAliases: municipalityAliases,
          rawText: doc.rawText,
          sourceName: doc.title || doc.fileName,
          sourceType: classification.resolved.documentType || null,
          referenceDocumentId: doc.id,
          userId: req.user!.userId,
        });

        await persistStructuredKnowledgeForDocument({
          townHallDocumentId: doc.id,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          documentSubtype: classification.resolved.documentType || null,
          sourceName: doc.title,
          sourceAuthority: authorityForCanonicalType(canonicalType),
          opposable: classification.isOpposable,
          rawText: doc.rawText,
          rawClassification: {
            category: classification.resolved.category,
            subCategory: classification.resolved.subCategory,
            requestedDocumentType: doc.documentType,
            resolvedDocumentType: classification.resolved.documentType,
            autoCorrected: classification.autoCorrected,
            source: "knowledge_summary_backfill",
          },
        });
      }

      profiles = await db.select().from(documentKnowledgeProfilesTable)
        .where(inArray(documentKnowledgeProfilesTable.municipalityId, municipalityAliases))
        .orderBy(desc(documentKnowledgeProfilesTable.updatedAt));
    }

    const rules = await db.select().from(urbanRulesTable)
      .where(inArray(urbanRulesTable.municipalityId, municipalityAliases));

    const conflicts = await db.select().from(urbanRuleConflictsTable)
      .where(
        and(
          inArray(urbanRuleConflictsTable.municipalityId, municipalityAliases),
          ne(urbanRuleConflictsTable.status, "resolved"),
        )
      );

    const profileByTownHallDocId = new Map(
      profiles
        .filter((profile) => !!profile.townHallDocumentId)
        .map((profile) => [profile.townHallDocumentId as string, profile]),
    );

    const rulesByDocumentId = new Map<string, number>();
    for (const rule of rules) {
      if (!rule.sourceDocumentId) continue;
      rulesByDocumentId.set(rule.sourceDocumentId, (rulesByDocumentId.get(rule.sourceDocumentId) || 0) + 1);
    }

    const allZones = new Set<string>();
    for (const profile of profiles) {
      if (Array.isArray(profile.detectedZones)) {
        for (const zone of profile.detectedZones) {
          if (zone && typeof zone === "object" && typeof (zone as Record<string, unknown>).zoneCode === "string") {
            allZones.add(String((zone as Record<string, unknown>).zoneCode));
          }
        }
      }
    }

    const knowledgeDocuments = await Promise.all(docs.map(async (doc) => {
      const profile = profileByTownHallDocId.get(doc.id);
      const availability = await resolveTownHallDocumentAvailability(doc);
      const classification = resolveTownHallClassification({
        rawText: doc.rawText || "",
        fileName: doc.title || doc.fileName || "document",
        category: doc.category,
        subCategory: doc.subCategory,
        documentType: doc.documentType,
      });
      const zones = Array.isArray(profile?.detectedZones) ? profile.detectedZones : [];
      const topics = Array.isArray(profile?.structuredTopics) ? profile.structuredTopics : [];
      return {
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        documentType: classification.resolved.documentType,
        opposable: !!doc.isOpposable || isCanonicalTypeOpposable(classification.canonicalType),
        structuredContent: doc.structuredContent,
        isConsolidatedMarkdownParent: !!(doc.structuredContent as any)?.isConsolidatedMarkdownParent,
        isConsolidatedMarkdownPart: !!(doc.structuredContent as any)?.isConsolidatedMarkdownPart,
        parentDocumentId: (doc.structuredContent as any)?.parentDocumentId || null,
        sourceMarkdownHeading: (doc.structuredContent as any)?.sourceMarkdownHeading || null,
        hasStoredFile: availability.hasStoredFile,
        availabilityStatus: availability.availabilityStatus,
        availabilityMessage: availability.availabilityMessage,
        textQualityLabel: availability.textQualityLabel,
        textQualityScore: availability.textQualityScore,
        profile: profile ? {
          id: profile.id,
          status: profile.status,
          extractionMode: profile.extractionMode,
          extractionReliability: profile.extractionReliability,
          manualReviewRequired: profile.manualReviewRequired,
          detectedZonesCount: zones.length,
          structuredTopicsCount: topics.length,
          reasoningSummary: (profile as any).reasoningSummary || null,
          reasoningJson: (profile as any).reasoningJson || null,
        } : null,
        extractedRuleCount: rulesByDocumentId.get(doc.id) || 0,
      };
    }));

    return res.json({
      commune: targetCommune,
      municipalityId: inseeCode || targetCommune,
      summary: {
        documentCount: docs.length,
        structuredDocumentCount: profiles.length,
        zoneCount: allZones.size,
        ruleCount: rules.length,
        conflictCount: conflicts.length,
        manualReviewCount:
          profiles.filter((profile) => profile.manualReviewRequired).length
          + rules.filter((rule) => rule.requiresManualValidation).length
          + conflicts.filter((conflict) => conflict.requiresManualValidation).length,
      },
      documents: knowledgeDocuments,
      conflicts: conflicts
        .sort((left, right) => {
          const leftScore = left.requiresManualValidation ? 1 : 0;
          const rightScore = right.requiresManualValidation ? 1 : 0;
          return rightScore - leftScore;
        })
        .slice(0, 8)
        .map((conflict) => ({
          id: conflict.id,
          zoneCode: conflict.zoneCode,
          ruleFamily: conflict.ruleFamily,
          ruleTopic: conflict.ruleTopic,
          conflictType: conflict.conflictType,
          conflictSummary: conflict.conflictSummary,
          status: conflict.status,
          requiresManualValidation: conflict.requiresManualValidation,
        })),
    });
  } catch (err) {
    logger.error("[mairie/plu-knowledge-summary GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.use("/regulatory-calibration", async (_req, res, next) => {
  try {
    await ensureCalibrationSchemaReady();
    return next();
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/bootstrap]", err);
    return res.status(503).json({
      error: "CALIBRATION_SCHEMA_UNAVAILABLE",
      message: "Le module de calibration est en cours d'initialisation. Réessaie dans quelques instants.",
    });
  }
});

// ─── DOSSIERS LIST ────────────────────────────────────────────────────────────
router.get("/dossiers", async (req: AuthRequest, res) => {
  try {
    const currentUser = await db
      .select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    const communes = currentUser[0] ? parseCommunes(currentUser[0].communes) : [];
    const isAdmin = currentUser[0]?.role === "admin";

    const dossiers = await db
      .select({
        id: dossiersTable.id,
        title: dossiersTable.title,
        typeProcedure: dossiersTable.typeProcedure,
        status: dossiersTable.status,
        createdAt: dossiersTable.createdAt,
        updatedAt: dossiersTable.updatedAt,
        commune: dossiersTable.commune,
        address: dossiersTable.address,
        dossierNumber: dossiersTable.dossierNumber,
        metadata: dossiersTable.metadata,
        assignedMetropoleId: dossiersTable.assignedMetropoleId,
        assignedAbfId: dossiersTable.assignedAbfId,
        isAbfConcerned: dossiersTable.isAbfConcerned,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(dossiersTable)
      .innerJoin(usersTable, eq(dossiersTable.userId, usersTable.id))
      .orderBy(desc(dossiersTable.createdAt));

    const requestedCommune = req.query.commune as string | undefined;

    // Filter logic
    const filtered = dossiers.filter(d => {
      const city = normalizeMunicipalityName(d.commune);
      const requestedKey = normalizeMunicipalityName(requestedCommune);
      const role = currentUser[0]?.role;

      if (role === "admin" || role === "super_admin") {
        if (requestedCommune && requestedCommune !== "all") {
          return city === requestedKey;
        }
        return true;
      }
      
      if (role === "metropole") {
        // Metropole sees dossiers assigned to them
        return d.assignedMetropoleId === req.user!.userId;
      }

      if (role === "abf") {
        // ABF sees dossiers where their avis is requested
        return d.isAbfConcerned === true;
      }

      // Mairie role filtering
      if (requestedCommune) {
        const canAccess = communes.some(c => normalizeMunicipalityName(c) === requestedKey);
        if (!canAccess) return false;
        return city === requestedKey;
      }
      
      return communes.some(c => normalizeMunicipalityName(c) === city);
    });

    const enrichedDossiers = filtered.map(d => {
      const meta = (d.metadata as any) || {};
      const missingPiecesCount = meta.preControl?.pieces_manquantes?.length || 0;
      const nonCompliantRulesCount = meta.pluAnalysis?.controles?.filter((c: any) => c.statut === "NON_CONFORME").length || 0;
      
      let criticalityScore = 0;
      // Extreme Priority: Missing pieces halting the instruction
      if (d.status === "INCOMPLET") criticalityScore += 100 + missingPiecesCount;
      // High Priority: Instruction blocked by PLU rules
      if (nonCompliantRulesCount > 0) criticalityScore += 50 + nonCompliantRulesCount;
      // Small bump for recent submissions to review
      if (d.status === "DEPOSE") criticalityScore += 10;

      return {
        ...d,
        anomalyCount: missingPiecesCount + nonCompliantRulesCount,
        criticalityScore,
        metadata: meta // Expose to frontend
      };
    });

    // Sort by criticality descending, then date
    enrichedDossiers.sort((a, b) => {
      if (b.criticalityScore !== a.criticalityScore) {
        return b.criticalityScore - a.criticalityScore;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return res.json({ dossiers: enrichedDossiers });
  } catch (err) {
    console.error("[mairie/dossiers]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// ─── DOSSIER DETAIL ───────────────────────────────────────────────────────────
router.get("/dossiers/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch the dossier first
    const [dossier] = await db
      .select({
        id: dossiersTable.id,
        title: dossiersTable.title,
        typeProcedure: dossiersTable.typeProcedure,
        status: dossiersTable.status,
        commune: dossiersTable.commune,
        address: dossiersTable.address,
        parcelRef: sql`metadata->>'parcel_ref'`,
        metadata: dossiersTable.metadata,
        userName: usersTable.name,
        userEmail: usersTable.email,
        createdAt: dossiersTable.createdAt,
      })
      .from(dossiersTable)
      .innerJoin(usersTable, eq(dossiersTable.userId, usersTable.id))
      .where(eq(dossiersTable.id, id as string))
      .limit(1);

    // If not found in dossiersTable, maybe it is a standalone document review (legacy)
    if (!dossier) {
      const [doc] = await db
        .select({
          id: documentReviewsTable.id,
          title: documentReviewsTable.title,
          status: documentReviewsTable.status,
          commune: documentReviewsTable.commune,
          address: documentReviewsTable.address,
          userName: usersTable.name,
          userEmail: usersTable.email,
          dossierId: documentReviewsTable.dossierId,
        })
        .from(documentReviewsTable)
        .leftJoin(usersTable, sql`${documentReviewsTable.userId}::text = ${usersTable.id}::text`)
        .where(eq(documentReviewsTable.id, id as string))
        .limit(1);

      if (!doc) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Dossier introuvable." });
      }

      // If it's a legacy doc, redirect or handle as dossier
      const dossierId = doc.dossierId || doc.id;
      const allDocuments = await db
        .select({
          id: documentReviewsTable.id,
          title: documentReviewsTable.title,
          fileName: documentReviewsTable.fileName,
          documentType: documentReviewsTable.documentType,
          status: documentReviewsTable.status,
          createdAt: documentReviewsTable.createdAt,
        })
        .from(documentReviewsTable)
        .where(sql`${documentReviewsTable.dossierId} = ${dossierId} OR ${documentReviewsTable.id} = ${dossierId}`)
        .orderBy(documentReviewsTable.createdAt);

      return res.json({ ...doc, documents: allDocuments });
    }

    // Standard Dossier flow
    const allDocuments = await db
      .select({
        id: documentReviewsTable.id,
        title: documentReviewsTable.title,
        fileName: documentReviewsTable.fileName,
        documentType: documentReviewsTable.documentType,
        pieceCode: documentReviewsTable.pieceCode,
        pieceStatus: documentReviewsTable.pieceStatus,
        isRequested: documentReviewsTable.isRequested,
        status: documentReviewsTable.status,
        createdAt: documentReviewsTable.createdAt,
      })
      .from(documentReviewsTable)
      .where(eq(documentReviewsTable.dossierId, dossier.id as string))
      .orderBy(documentReviewsTable.createdAt);

    const allMessages = await db
      .select()
      .from(dossierMessagesTable)
      .where(eq(dossierMessagesTable.dossierId, dossier.id as string))
      .orderBy(dossierMessagesTable.createdAt);

    return res.json({ ...dossier, documents: allDocuments, messages: allMessages });
  } catch (err) {
    console.error("[mairie/dossiers/:id]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// ─── DOSSIER TIMELINE ────────────────────────────────────────────────────────
router.get("/dossiers/:id/timeline", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const events = await db.select()
      .from(dossierEventsTable)
      .where(eq(dossierEventsTable.dossierId, id as string))
      .orderBy(desc(dossierEventsTable.createdAt));
    return res.json({ events });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── MESSAGING ───────────────────────────────────────────────────────────────
router.get("/dossiers/:id/messages", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const messages = await MessagingService.getThread(id as string);
    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/dossiers/:id/messages", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content, parentId, documentId } = req.body;
    
    // Fetch User Role for the message
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    const msg = await MessagingService.sendMessage(
      id as string,
      req.user!.userId,
      user?.role || "unknown",
      content,
      parentId,
      documentId
    );
    return res.json({ success: true, message: msg });
  } catch (err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── WORKFLOW ACTIONS ────────────────────────────────────────────────────────

// 1. Transmission à la Métropole (par la Mairie)
router.post("/dossiers/:id/transmit", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { metropoleId } = req.body;
    
    await WorkflowService.transmitToMetropole(id as string, req.user!.userId, metropoleId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "TRANSMIT_FAILED" });
  }
});

// 1.5 Saisir l'ABF (par la Mairie/Métropole)
router.post("/dossiers/:id/request-abf", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // Toggle isAbfConcerned and set status to ATTENTE_ABF
    await db.update(dossiersTable)
      .set({ 
        isAbfConcerned: true, 
        status: DOSSIER_STATUS.ATTENTE_ABF,
        updatedAt: new Date() 
      })
      .where(eq(dossiersTable.id, id as string));

    await WorkflowService.transitionStatus(
      id as string,
      DOSSIER_STATUS.ATTENTE_ABF,
      req.user!.userId,
      "Saisine manuelle de l'Architecte des Bâtiments de France (ABF)."
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "ABF_REQUEST_FAILED" });
  }
});

// 2. Décision ABF (par l'ABF)
router.post("/dossiers/:id/abf-avis", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { decision, motivation } = req.body;
    
    // Check if user is ABF
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (user?.role !== "abf" && user?.role !== "admin") return res.status(403).json({ error: "FORBIDDEN" });

    await WorkflowService.transitionStatus(
      id as string,
      DOSSIER_STATUS.AVIS_ABF_RECU,
      req.user!.userId,
      `Avis ABF rendu : ${decision}. ${motivation}`,
      { decision, motivation }
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "ABF_ACTION_FAILED" });
  }
});

router.patch("/dossiers/:id/metadata", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { metadata } = req.body;

    if (!metadata || typeof metadata !== "object") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Metadata invalide." });
    }

    const [existing] = await db.select({ metadata: dossiersTable.metadata }).from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    const newMetadata = {
      ...(existing.metadata as any),
      ...metadata
    };

    await db.update(dossiersTable)
      .set({ metadata: newMetadata, updatedAt: new Date() })
      .where(eq(dossiersTable.id, id as string));

    // Optional: Re-run orchestrator for financials?
    // For now, return OK and let frontend trigger refetch
    return res.json({ success: true, metadata: newMetadata });
  } catch (err) {
    console.error("[mairie/dossiers/:id/metadata]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/dossiers/:id/re-analyze", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // 1. Fetch dossier to get commune and user
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    if (!dossier) return res.status(404).json({ error: "NOT_FOUND" });

    // 2. Run orchestrator
    const result = await orchestrateDossierAnalysis(
      dossier.id,
      [], // No docs pre-loaded
      { userId: dossier.userId },
      (dossier.metadata as any)?.analysisId || null
    );

    // 3. Update dossier with analysis ID in metadata
    if (result.analysisResult?.id) {
       const newMeta = {
         ...(dossier.metadata as any || {}),
         analysisId: result.analysisResult.id
       };
       await db.update(dossiersTable)
         .set({ metadata: newMeta, updatedAt: new Date() })
         .where(eq(dossiersTable.id, dossier.id));
    }

    return res.json({ success: true, result });
  } catch (err: any) {
    console.error("[mairie/dossiers/:id/re-analyze]", err);
    return res.status(500).json({ error: "ORCHESTRATOR_FAILED", message: err.message });
  }
});

router.get("/dossiers/:id/summary", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Get the dossier first
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id as string)).limit(1);
    
    let dossierId: string;
    let allDocs: any[] = [];
    let initialDoc: any = null;

    if (dossier) {
      dossierId = dossier.id;
      allDocs = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.dossierId, dossierId));
      initialDoc = allDocs[0] || {};
    } else {
      // Legacy document review flow
      const [doc] = await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as string)).limit(1);
      if (!doc) return res.status(404).json({ error: "NOT_FOUND" });
      dossierId = doc.dossierId || doc.id;
      allDocs = await db.select().from(documentReviewsTable)
        .where(sql`${documentReviewsTable.dossierId} = ${dossierId} OR ${documentReviewsTable.id} = ${dossierId}`);
      initialDoc = doc;
    }

    if (allDocs.length === 0 && !dossier) return res.status(404).json({ error: "NO_DOCUMENTS" });

    // 3. Get PLU context (zone, city, custom prompts)
    const docWithContext = allDocs.find(d => d.analysisId) || initialDoc || allDocs[0] || {};
    const dossierMeta = (dossier?.metadata || {}) as any;
    let pluContext: any = {
      zoneCode: docWithContext?.zoneCode || dossierMeta?.zone?.code || "N/A",
      zoneLabel: docWithContext?.zoneLabel || dossierMeta?.zone?.label || "N/A",
      cityName: docWithContext?.commune || dossier?.commune || undefined,
    };

    // 3.5 Fetch Financial and Vision data from latest analysis
    const [latestAnalysis] = await db.select().from(analysesTable)
      .where(eq(analysesTable.id, (dossier as any)?.analysisId || (docWithContext as any)?.analysisId || ""))
      .limit(1);
    
    const financialData = (latestAnalysis as any)?.comparisonResultJson ? JSON.parse((latestAnalysis as any).comparisonResultJson).financialAnalysis : null;
    const visionReports = allDocs.filter(d => d.hasVisionAnalysis).map(d => ({
      title: d.title,
      report: d.visionResultText
    }));

    if (pluContext.cityName) {
      const [prompt] = await db.select().from(townHallPromptsTable)
        .where(buildMunicipalityAliasFilter(townHallPromptsTable.commune, [pluContext.cityName])).limit(1);
      if (prompt) pluContext.townHallCustomPrompt = prompt.content;
    }

    // 4. Prepare data for AI
    const apiDocs = allDocs.map(d => ({
      title: d.title,
      type: d.documentType,
      extractedData: d.extractedDataJson ? JSON.parse(d.extractedDataJson) : {},
      analysis: d.comparisonResultJson ? JSON.parse(d.comparisonResultJson) : { 
        summary: "Non analysé", 
        global_status: "indéterminé", 
        points_attention: [], 
        inconsistencies: [] 
      }
    }));

    // 5. Generate synthesis
    const synthesis = await generateGlobalSynthesis(apiDocs, pluContext);

    // 6. Inject pieceChecklist if available in dossier metadata
    const pieceChecklist = dossierMeta?.pieceChecklist;
    if (pieceChecklist) {
      (synthesis as any).pieceChecklist = pieceChecklist;
    }

    // 7. Inject Financial & Vision context
    (synthesis as any).financial = financialData;
    (synthesis as any).visionSummaries = visionReports;
    (synthesis as any).marketData = (latestAnalysis as any)?.comparisonResultJson ? JSON.parse((latestAnalysis as any).comparisonResultJson).marketData : null;

    return res.json(synthesis);
  } catch (err) {
    console.error("[mairie/dossiers/:id/summary]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── MESSAGERIE ───────────────────────────────────────────────────────────────

router.get("/messages/:dossierId", async (req: AuthRequest, res) => {
  try {
    const { dossierId } = req.params;
    const { documentId } = req.query;

    let whereClause = eq(dossierMessagesTable.dossierId, dossierId as string);
    if (documentId) {
      whereClause = and(whereClause, eq(dossierMessagesTable.documentId, documentId as string)) as any;
    }

    const messages = await db
      .select()
      .from(dossierMessagesTable)
      .where(whereClause)
      .orderBy(dossierMessagesTable.createdAt);

    res.json({ messages });
  } catch (err) {
    console.error("[mairie/messages/:dossierId]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.post("/messages/:dossierId", async (req: AuthRequest, res) => {
  try {
    const { dossierId } = req.params;
    const { content, documentId } = req.body as { content?: string; documentId?: string };

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Le message ne peut pas être vide." });
      return;
    }
    if (content.trim().length > 2000) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Message trop long (max 2000 caractères)." });
      return;
    }

    // Check dossier exists
    const dossier = await db
      .select({ id: documentReviewsTable.id, dossierId: documentReviewsTable.dossierId })
      .from(documentReviewsTable)
      .where(sql`${documentReviewsTable.id}::text = ${dossierId} OR ${documentReviewsTable.dossierId}::text = ${dossierId}`)
      .limit(1);

    if (!dossier.length) {
      res.status(404).json({ error: "NOT_FOUND", message: "Dossier introuvable." });
      return;
    }

    // Get current user's role
    const fromRole = req.user!.role === "admin" ? "admin" : "mairie";

    const [inserted] = await db.insert(dossierMessagesTable).values({
      dossierId: dossierId as string,
      fromUserId: req.user!.userId,
      fromRole,
      content: content.trim(),
      documentId: documentId || null,
    }).returning();

    // 2. Identify @tags for smart piece tracking (Module 7)
    const mentions = content.match(/@([A-Z0-9]+)/g);
    if (mentions) {
       for (const mention of mentions) {
         const cleanCode = mention.substring(1).toUpperCase(); // e.g. PCMI2
         
         const existingDocs = await db.select().from(documentReviewsTable)
           .where(and(
             eq(documentReviewsTable.dossierId, dossierId as string),
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
             dossierId: dossierId as string,
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
         .where(eq(dossiersTable.id, dossierId as string));
    }

    res.json({ message: inserted });
  } catch (err) {
    console.error("[mairie/messages/:dossierId POST]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});


// ─── AUTO-SUGGEST CLASSIFICATION ───────────────────────────────────────────

interface SuggestedClassification {
  category: string;
  subCategory: string;
  documentType: string;
  tags: string[];
  confidence: number;
  reason?: string;
}

interface TownHallExtractionContext {
  originalName?: string;
  documentType?: string | null;
  category?: string | null;
  subCategory?: string | null;
}

function normalizeTownHallClassification(input: {
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
}) {
  const category = (input.category || "").trim();
  const subCategory = (input.subCategory || "").trim();
  const documentType = (input.documentType || "").trim();

  if (!category || category === "OTHER") {
    return {
      category: "ANNEXES",
      subCategory: "MISC",
      documentType: documentType || "Other",
    };
  }

  if (category === "ANNEXES" && !subCategory) {
    return {
      category,
      subCategory: "MISC",
      documentType: documentType || "Other",
    };
  }

  return {
    category,
    subCategory,
    documentType,
  };
}

function countPatternMatches(content: string, pattern: RegExp) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function autoSuggestClassification(text: string, fileName: string): SuggestedClassification {
  const content = `${text || ""}\n${fileName || ""}`.toLowerCase();
  const firstWindow = content.slice(0, 20000);

  const writtenRegulationScore =
    countPatternMatches(firstWindow, /r[èée]glement\s+de\s+la\s+zone\s+[a-z0-9-]+/gi) * 6 +
    countPatternMatches(firstWindow, /dispositions\s+applicables\s+(?:à|a)\s+la\s+zone\s+[a-z0-9-]+/gi) * 6 +
    countPatternMatches(firstWindow, /article\s+(?:1|2|3|4|6|7|8|9|10|11|12|13|14)\b/gi) * 2 +
    countPatternMatches(firstWindow, /implantation\s+par\s+rapport\s+aux\s+voies/gi) * 3 +
    countPatternMatches(firstWindow, /emprise\s+au\s+sol/gi) * 3 +
    countPatternMatches(firstWindow, /hauteur\s+(?:des\s+constructions|maximale|au\s+fa[iî]tage|à?\s+l['’]égout)/gi) * 3 +
    countPatternMatches(firstWindow, /stationnement/gi) * 2 +
    countPatternMatches(firstWindow, /espaces?\s+libres?|pleine\s+terre|plantations/gi) * 2 +
    (firstWindow.includes("sommaire") && firstWindow.includes("règlement de la zone") ? 5 : 0) +
    (firstWindow.includes("sommaire") && firstWindow.includes("reglement de la zone") ? 5 : 0);

  const oapScore =
    countPatternMatches(firstWindow, /\boap\b/gi) * 6 +
    countPatternMatches(firstWindow, /orientation(?:s)?\s+d['’]am[ée]nagement(?:\s+et\s+de\s+programmation)?/gi) * 7 +
    countPatternMatches(firstWindow, /principes?\s+d['’]am[ée]nagement/gi) * 3 +
    countPatternMatches(firstWindow, /sch[eé]ma\s+d['’]am[ée]nagement/gi) * 3;

  const paddScore =
    countPatternMatches(firstWindow, /\bpadd\b/gi) * 7 +
    countPatternMatches(firstWindow, /projet\s+d['’]am[ée]nagement\s+et\s+de\s+d[ée]veloppement\s+durables/gi) * 8;

  const zoningMapScore =
    countPatternMatches(firstWindow, /plan\s+de\s+zonage/gi) * 7 +
    countPatternMatches(firstWindow, /document\s+graphique/gi) * 6 +
    countPatternMatches(firstWindow, /planche\s+de\s+zonage/gi) * 6 +
    countPatternMatches(firstWindow, /zonage\s+r[èée]glementaire/gi) * 5 +
    countPatternMatches(firstWindow, /l[ée]gende/gi) * 2;

  const administrativeActScore =
    countPatternMatches(firstWindow, /arr[eê]t[eé]/gi) * 5 +
    countPatternMatches(firstWindow, /d[ée]lib[ée]ration/gi) * 5 +
    countPatternMatches(firstWindow, /approbation/gi) * 3 +
    countPatternMatches(firstWindow, /modification\s+simplifi[ée]e?/gi) * 4 +
    countPatternMatches(firstWindow, /mise\s+[àa]\s+jour/gi) * 2;

  const riskScore =
    countPatternMatches(firstWindow, /\bpprn\b/gi) * 7 +
    countPatternMatches(firstWindow, /\bpprt\b/gi) * 7 +
    countPatternMatches(firstWindow, /inondation|zone\s+inondable|al[ée]a/gi) * 3;

  const heritageScore =
    countPatternMatches(firstWindow, /\babf\b/gi) * 6 +
    countPatternMatches(firstWindow, /monuments?\s+historiques?|patrimoine|site\s+class[ée]/gi) * 3;

  const networkScore =
    countPatternMatches(firstWindow, /\baep\b|eau\s+potable|assainissement|r[ée]seau|gaz|electricit[ée]/gi) * 3;

  const candidates: SuggestedClassification[] = [
    {
      category: "REGULATORY",
      subCategory: "PLU",
      documentType: "Written regulation",
      tags: ["PLU", writtenRegulationScore >= 8 ? "Article" : ""].filter(Boolean),
      confidence: Math.min(1, writtenRegulationScore / 14),
      reason: "chapter_based_regulation_detection",
    },
    {
      category: "REGULATORY",
      subCategory: "PLU",
      documentType: "OAP",
      tags: ["PLU", "OAP"],
      confidence: Math.min(1, oapScore / 10),
      reason: "oap_detection",
    },
    {
      category: "REGULATORY",
      subCategory: "PLU",
      documentType: "PADD",
      tags: ["PLU", "PADD"],
      confidence: Math.min(1, paddScore / 9),
      reason: "padd_detection",
    },
    {
      category: "ZONING",
      subCategory: "PLANS",
      documentType: "Zoning map",
      tags: ["PLU", "Zoning"],
      confidence: Math.min(1, zoningMapScore / 10),
      reason: "graphic_zoning_detection",
    },
    {
      category: "REGULATORY",
      subCategory: "PLU",
      documentType: "Administrative Act",
      tags: ["PLU", "Administrative"],
      confidence: Math.min(1, administrativeActScore / 8),
      reason: "administrative_act_detection",
    },
    {
      category: "ANNEXES",
      subCategory: "RISKS",
      documentType: firstWindow.includes("pprn") ? "PPRN" : (firstWindow.includes("pprt") ? "PPRT" : "Risk Map"),
      tags: ["Risk", firstWindow.includes("inondation") ? "Flood_risk" : ""].filter(Boolean),
      confidence: Math.min(1, riskScore / 8),
      reason: "risk_detection",
    },
    {
      category: "ANNEXES",
      subCategory: "HERITAGE",
      documentType: "ABF perimeter",
      tags: ["Heritage", "ABF"],
      confidence: Math.min(1, heritageScore / 7),
      reason: "heritage_detection",
    },
    {
      category: "INFRASTRUCTURE",
      subCategory: "NETWORKS",
      documentType: firstWindow.includes("assainissement") ? "Sanitation" : (firstWindow.includes("eau") ? "Water" : "Electricity"),
      tags: ["Infrastructure", "Network"],
      confidence: Math.min(1, networkScore / 6),
      reason: "network_detection",
    },
  ];

  const best = candidates
    .sort((left, right) => right.confidence - left.confidence)[0];

  if (best && best.confidence >= 0.3) {
    return best;
  }

  return {
    category: "ANNEXES",
    subCategory: "MISC",
    documentType: "Other",
    tags: [],
    confidence: 0,
    reason: "fallback_other",
  };
}

function resolveTownHallClassification(input: {
  rawText: string;
  fileName: string;
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
  requestedTags?: string[];
}) {
  const requested = normalizeTownHallClassification({
    category: input.category,
    subCategory: input.subCategory,
    documentType: input.documentType,
  });
  const suggestion = autoSuggestClassification(input.rawText, input.fileName);
  const requestedCanonical = inferCanonicalDocumentType(requested.documentType, requested.category, requested.subCategory);
  const suggestionCanonical = inferCanonicalDocumentType(suggestion.documentType, suggestion.category, suggestion.subCategory);
  const hasExplicitDocType = Boolean((input.documentType || "").trim());
  const requestedTypeLower = requested.documentType.toLowerCase();

  const shouldTrustSuggestion =
    !hasExplicitDocType
    || requested.documentType === "Other"
    || requested.documentType === "Administrative Act"
    || (
      suggestion.confidence >= 0.7
      && suggestionCanonical === "plu_reglement"
      && requestedCanonical !== "plu_reglement"
    )
    || (
      suggestion.confidence >= 0.75
      && requestedCanonical === "other"
      && suggestionCanonical !== "other"
    )
    || (
      suggestion.confidence >= 0.8
      && requestedTypeLower === "oap"
      && suggestion.documentType === "Written regulation"
    );

  const resolved = shouldTrustSuggestion ? suggestion : {
    ...requested,
    tags: input.requestedTags && input.requestedTags.length > 0 ? input.requestedTags : suggestion.tags,
    confidence: suggestion.confidence,
    reason: "manual_or_slot_preserved",
  };
  const canonicalType = inferCanonicalDocumentType(
    resolved.documentType,
    resolved.category,
    resolved.subCategory,
  );

  return {
    requested,
    suggestion,
    resolved: {
      category: resolved.category,
      subCategory: resolved.subCategory,
      documentType: resolved.documentType,
      tags: input.requestedTags && input.requestedTags.length > 0 ? input.requestedTags : resolved.tags,
    },
    canonicalType,
    autoCorrected: shouldTrustSuggestion && (
      requested.category !== resolved.category
      || requested.subCategory !== resolved.subCategory
      || requested.documentType !== resolved.documentType
    ),
    suggestionConfidence: suggestion.confidence,
    suggestionReason: suggestion.reason,
  };
}

// ─── PLU KNOWLEDGE BASE ───────────────────────────────────────────────────────

function shouldRunRegulatoryVision(context: TownHallExtractionContext, currentText: string): boolean {
  const hint = [
    context.originalName || "",
    context.documentType || "",
    context.category || "",
    context.subCategory || "",
    currentText.slice(0, 400),
  ].join(" ").toLowerCase();

  return currentText.trim().length < 400
    || hint.includes("zonage")
    || hint.includes("zoning")
    || hint.includes("plan")
    || hint.includes("graphique")
    || hint.includes("carte")
    || hint.includes("schéma")
    || hint.includes("schema")
    || hint.includes("croquis")
    || hint.includes("oap");
}

async function extractTextFromFile(filePath: string, mimetype: string, context: TownHallExtractionContext = {}): Promise<string> {
  if (isStructuredPluJsonUpload(context.originalName || filePath, mimetype)) {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (isMarkdownUpload(context.originalName || filePath, mimetype)) {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (mimetype === "application/pdf") {
    const pickBestText = (...candidates: string[]) => {
      const normalizedCandidates = candidates
        .map((candidate) => repairExtractedText(candidate))
        .filter((candidate) => candidate.length > 0);

      return normalizedCandidates
        .sort((left, right) => {
          const qualityDelta = scoreTextQuality(right) - scoreTextQuality(left);
          if (Math.abs(qualityDelta) > 0.03) return qualityDelta;
          return right.length - left.length;
        })[0] || "";
    };

    const extractWithPdfToText = (mode: "layout" | "raw") => {
      try {
        const args = mode === "layout"
          ? ["-layout", "-enc", "UTF-8", filePath, "-"]
          : ["-raw", "-enc", "UTF-8", filePath, "-"];
        return execFileSync("pdftotext", args, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60000,
        });
      } catch (err) {
        console.warn("[pdftotext]", mode, err instanceof Error ? err.message : String(err));
        return "";
      }
    };

    try {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const buffer = fs.readFileSync(filePath);
      const result = await pdfParse(buffer);
      const pdfParseText = result.text || "";
      const pdfToTextLayout = extractWithPdfToText("layout");
      const pdfToTextRaw = extractWithPdfToText("raw");
      let extractedText = pickBestText(pdfParseText, pdfToTextLayout, pdfToTextRaw);

      const hint = [context.originalName || "", context.documentType || "", context.category || "", context.subCategory || ""].join(" ").toLowerCase();
      const isPriorityRegulatoryDocument =
        hint.includes("plu")
        || hint.includes("reglement")
        || hint.includes("règlement")
        || hint.includes("oap")
        || hint.includes("padd")
        || hint.includes("zonage");
      const shouldForceOcr =
        extractedText.trim().length < 400
        || isTextLikelyGarbled(extractedText)
        || (isPriorityRegulatoryDocument && scoreTextQuality(extractedText) < 0.9);

      if (shouldForceOcr) {
        const ocrPages = isPriorityRegulatoryDocument ? 12 : 8;
        const ocrText = await VisionService.extractTextFromScannedPDF(filePath, ocrPages);
        const bestCandidate = pickBestText(extractedText, ocrText);
        if (scoreTextQuality(bestCandidate) >= scoreTextQuality(extractedText)) {
          extractedText = bestCandidate;
        }
      }

      if (shouldRunRegulatoryVision(context, extractedText)) {
        const visualSummary = await VisionService.analyzeRegulatoryDocument(
          filePath,
          [context.documentType, context.originalName].filter(Boolean).join(" · ")
        );
        if (visualSummary.trim().length > 80) {
          extractedText = `${extractedText.trim()}\n\n--- ANALYSE VISUELLE REGLEMENTAIRE ---\n${visualSummary}`.trim();
        }
      }

      return repairExtractedText(extractedText);
    } catch (e) {
      console.error("[pdf-parse]", e);
      const pdfToTextLayout = extractWithPdfToText("layout");
      const pdfToTextRaw = extractWithPdfToText("raw");
      const ocrText = await VisionService.extractTextFromScannedPDF(filePath, 12);
      const extractedText = repairExtractedText(
        [pdfToTextLayout, pdfToTextRaw, ocrText]
          .sort((left, right) => scoreTextQuality(right) - scoreTextQuality(left))[0] || ""
      );
      if (extractedText.trim().length > 0) {
        return extractedText;
      }
      return "[Impossible d'extraire le texte du PDF automatiquement]";
    }
  }

  if (mimetype.startsWith("image/")) {
    const visualSummary = await VisionService.analyzeRegulatoryDocument(
      filePath,
      [context.documentType, context.originalName].filter(Boolean).join(" · ")
    );
    return visualSummary.trim().length > 0
      ? `--- ANALYSE VISUELLE REGLEMENTAIRE ---\n${visualSummary}`
      : "[Impossible d'extraire le texte de l'image automatiquement]";
  }

  return fs.readFileSync(filePath, "utf-8");
}

function ensureTownHallUploadsDir() {
  if (!fs.existsSync(PRIMARY_UPLOADS_DIR)) {
    fs.mkdirSync(PRIMARY_UPLOADS_DIR, { recursive: true });
  }
}

function ensureTownHallUploadSessionDir() {
  ensureTownHallUploadsDir();
  if (!fs.existsSync(TOWN_HALL_UPLOAD_SESSION_DIR)) {
    fs.mkdirSync(TOWN_HALL_UPLOAD_SESSION_DIR, { recursive: true });
  }
}

function resolveTownHallUploadSessionPath(sessionId: string): string {
  ensureTownHallUploadSessionDir();
  return path.join(TOWN_HALL_UPLOAD_SESSION_DIR, `${sessionId}.part`);
}

function resolveTownHallDocumentPath(id: string, fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const ext = path.extname(fileName || "");
  for (const uploadDir of TOWN_HALL_UPLOAD_DIRS) {
    const primaryPath = path.join(uploadDir, fileName);
    if (fs.existsSync(primaryPath)) return primaryPath;

    const legacyPath = path.join(uploadDir, `${id}${ext}`);
    if (fs.existsSync(legacyPath)) return legacyPath;
  }
  return null;
}

async function loadTownHallDocumentBlob(documentId: string) {
  const [storedFile] = await db.select({
    documentId: townHallDocumentFilesTable.documentId,
    mimeType: townHallDocumentFilesTable.mimeType,
    fileSize: townHallDocumentFilesTable.fileSize,
    fileBase64: townHallDocumentFilesTable.fileBase64,
  })
    .from(townHallDocumentFilesTable)
    .where(eq(townHallDocumentFilesTable.documentId, documentId))
    .limit(1);

  if (!storedFile?.fileBase64) return null;

  return {
    mimeType: storedFile.mimeType || "application/pdf",
    fileSize: storedFile.fileSize || null,
    buffer: Buffer.from(storedFile.fileBase64, "base64"),
  };
}

async function backfillTownHallDocumentBlobFromDisk(args: {
  documentId: string;
  filePath: string;
  mimeType?: string | null;
}) {
  const existing = await loadTownHallDocumentBlob(args.documentId);
  if (existing || !fs.existsSync(args.filePath)) return;

  const buffer = fs.readFileSync(args.filePath);
  if (!buffer.length) return;

  await db.insert(townHallDocumentFilesTable).values({
    documentId: args.documentId,
    mimeType: args.mimeType || "application/pdf",
    fileSize: buffer.length,
    fileBase64: buffer.toString("base64"),
  }).onConflictDoNothing();

  await db.update(townHallDocumentsTable)
    .set({
      hasStoredBlob: true,
      updatedAt: new Date(),
    })
    .where(eq(townHallDocumentsTable.id, args.documentId));
}

async function ensureTownHallDocumentPersistentSource(documentId: string, fileName: string | null | undefined) {
  const diskPath = resolveTownHallDocumentPath(documentId, fileName);
  if (diskPath && fs.existsSync(diskPath)) {
    return { filePath: diskPath, fromBlob: false, mimeType: null as string | null, fileSize: null as number | null };
  }

  if (!fileName) {
    return { filePath: null, fromBlob: false, mimeType: null as string | null, fileSize: null as number | null };
  }

  const storedBlob = await loadTownHallDocumentBlob(documentId);
  if (!storedBlob) {
    return { filePath: null, fromBlob: false, mimeType: null as string | null, fileSize: null as number | null };
  }

  ensureTownHallUploadsDir();
  const restoredPath = path.join(PRIMARY_UPLOADS_DIR, fileName);
  fs.writeFileSync(restoredPath, storedBlob.buffer);

  return {
    filePath: restoredPath,
    fromBlob: true,
    mimeType: storedBlob.mimeType,
    fileSize: storedBlob.fileSize,
  };
}

function hasUsableTownHallText(rawText: string | null | undefined): boolean {
  return hasUsableExtractedText(rawText);
}

function getTownHallDocumentAvailability(doc: {
  id: string;
  title?: string | null;
  fileName: string | null;
  rawText: string | null;
  documentType?: string | null;
  hasVisionAnalysis?: boolean | null;
  hasStoredBlob?: boolean | null;
  structuredContent?: unknown;
}) {
  const filePath = resolveTownHallDocumentPath(doc.id, doc.fileName);
  const hasStoredFile = !!filePath || !!doc.hasStoredBlob;
  const hasExtractedText = hasUsableTownHallText(doc.rawText);
  const textQuality = assessExtractedTextQuality(doc.rawText);
  if ((doc.structuredContent as any)?.isConsolidatedMarkdownPart) {
    return {
      filePath: null,
      hasStoredFile: false,
      hasExtractedText,
      availabilityStatus: hasExtractedText ? "indexed" as const : "processing" as const,
      availabilityMessage: hasExtractedText
        ? "Pièce logique extraite du Markdown consolidé et exploitable par l'analyse."
        : "Pièce logique Markdown créée, indexation texte en cours.",
      textQualityScore: Math.round(textQuality.score * 100),
      textQualityLabel: textQuality.label,
      textQualityMessage: textQuality.message,
      extractionHint: "written_regulation",
      hasVisualRegulatoryAnalysis: false,
    };
  }
  const lowerType = String(doc.documentType || "").toLowerCase();
  const hasVisualRegulatoryAnalysis = !!doc.hasVisionAnalysis || String(doc.rawText || "").includes("--- ANALYSE VISUELLE REGLEMENTAIRE ---");
  const extractionHint = hasVisualRegulatoryAnalysis
    ? "ocr_or_vision"
    : lowerType.includes("written regulation") || lowerType.includes("reglement") || lowerType.includes("règlement")
      ? "written_regulation"
      : "standard";

  let availabilityStatus: "indexed" | "processing" | "indexed_without_source_file" | "missing_file" | "broken" = "processing";
  let availabilityMessage = "Document recu, indexation en cours.";

  if (hasStoredFile && hasExtractedText) {
    availabilityStatus = "indexed";
    availabilityMessage = filePath
      ? "Document disponible et exploitable par l'analyse."
      : "Document disponible depuis le stockage persistant et exploitable par l'analyse.";
  } else if (!hasStoredFile && hasExtractedText) {
    availabilityStatus = "indexed_without_source_file";
    availabilityMessage = "Le texte du document est indexe, mais le fichier source persistant est indisponible.";
  } else if (hasStoredFile && !hasExtractedText) {
    availabilityStatus = "processing";
    availabilityMessage = filePath
      ? "Le fichier est present, mais le texte n'est pas encore exploitable pour l'analyse."
      : "Le document est stocke de façon persistante, mais le texte n'est pas encore exploitable pour l'analyse.";
  } else if (doc.fileName) {
    availabilityStatus = "missing_file";
    availabilityMessage = "Le fichier source persistant est introuvable et aucun texte exploitable n'a ete indexe.";
  } else {
    availabilityStatus = "broken";
    availabilityMessage = "Le document est incomplet et doit etre reimporte.";
  }

  return {
    filePath,
    hasStoredFile,
    hasExtractedText,
    availabilityStatus,
    availabilityMessage,
    textQualityScore: Math.round(textQuality.score * 100),
    textQualityLabel: textQuality.label,
    textQualityMessage: textQuality.message,
    extractionHint,
    hasVisualRegulatoryAnalysis,
  };
}

async function hasTownHallDocumentBlob(documentId: string) {
  const [storedFile] = await db.select({
    documentId: townHallDocumentFilesTable.documentId,
  })
    .from(townHallDocumentFilesTable)
    .where(eq(townHallDocumentFilesTable.documentId, documentId))
    .limit(1);

  return !!storedFile?.documentId;
}

async function resolveTownHallDocumentAvailability(doc: {
  id: string;
  title?: string | null;
  fileName: string | null;
  rawText: string | null;
  documentType?: string | null;
  hasVisionAnalysis?: boolean | null;
  hasStoredBlob?: boolean | null;
  structuredContent?: unknown;
}) {
  const syncAvailability = getTownHallDocumentAvailability(doc);
  if (syncAvailability.hasStoredFile) {
    return syncAvailability;
  }

  const hasBlob = await hasTownHallDocumentBlob(doc.id);
  if (!hasBlob) {
    return syncAvailability;
  }

  return getTownHallDocumentAvailability({
    ...doc,
    hasStoredBlob: true,
  });
}

async function maybeSyncTownHallDocumentClassification(doc: {
  id: string;
  title?: string | null;
  fileName: string | null;
  rawText: string | null;
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
  tags?: unknown;
  structuredContent?: unknown;
  isRegulatory?: boolean | null;
  isOpposable?: boolean | null;
}) {
  const structuredContent = doc.structuredContent as Record<string, unknown> | null | undefined;
  if (structuredContent?.sourceFormat === "structured_plu_json") {
    return {
      resolved: {
        category: doc.category || "REGULATORY",
        subCategory: doc.subCategory || "PLU",
        documentType: doc.documentType || "Structured PLU regulation",
        tags: parseDocumentTags(doc.tags),
      },
      canonicalType: "plu_reglement",
      isRegulatory: true,
      isOpposable: true,
      autoCorrected: false,
      suggestionConfidence: "high",
      suggestionReason: "Classification conservee depuis le PLU JSON structure.",
    };
  }

  if (structuredContent?.isConsolidatedMarkdownParent || structuredContent?.isConsolidatedMarkdownPart) {
    const category = doc.category || (structuredContent?.isConsolidatedMarkdownParent ? "CONSOLIDATED" : "REGULATORY");
    const subCategory = doc.subCategory || (structuredContent?.isConsolidatedMarkdownParent ? "MARKDOWN" : "PLU");
    const documentType = doc.documentType || (structuredContent?.isConsolidatedMarkdownParent ? "Consolidated Markdown PLU" : "Consolidated Markdown section");
    const tags = parseDocumentTags(doc.tags);
    const canonicalType = inferCanonicalDocumentType(documentType, category, subCategory);
    return {
      resolved: {
        category,
        subCategory,
        documentType,
        tags,
      },
      canonicalType,
      isRegulatory: !!doc.isRegulatory || structuredContent?.isConsolidatedMarkdownParent === true || structuredContent?.isConsolidatedMarkdownPart === true,
      isOpposable: !!doc.isOpposable,
      autoCorrected: false,
      suggestionConfidence: "high",
      suggestionReason: "Classification conservee depuis le Markdown consolide.",
    };
  }

  const resolved = resolveTownHallClassification({
    rawText: doc.rawText || "",
    fileName: doc.title || doc.fileName || "document",
    category: doc.category,
    subCategory: doc.subCategory,
    documentType: doc.documentType,
    requestedTags: parseDocumentTags(doc.tags),
  });

  const canonicalType = inferCanonicalDocumentType(
    resolved.resolved.documentType,
    resolved.resolved.category,
    resolved.resolved.subCategory,
  );
  const isRegulatory = isRegulatoryLikeDocument(
    resolved.resolved.documentType,
    resolved.resolved.category,
    resolved.resolved.subCategory,
  );
  const isOpposable = isCanonicalTypeOpposable(canonicalType);

  if (resolved.autoCorrected) {
    await db.update(townHallDocumentsTable)
      .set({
        category: resolved.resolved.category,
        subCategory: resolved.resolved.subCategory,
        documentType: resolved.resolved.documentType,
        tags: resolved.resolved.tags,
        isRegulatory,
        isOpposable,
        updatedAt: new Date(),
      })
      .where(eq(townHallDocumentsTable.id, doc.id));
  }

  return {
    ...resolved,
    canonicalType,
    isRegulatory,
    isOpposable,
  };
}

async function queueTownHallDocumentIndexing(args: {
  docId: string;
  persistentPath: string;
  mimeType: string;
  originalName: string;
  targetCommune: string;
  userId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  documentType?: string | null;
  requestedTags: string[];
  zone?: string | null;
}) {
  setImmediate(async () => {
    try {
      const rawText = await extractTextFromFile(args.persistentPath, args.mimeType, {
        originalName: args.originalName,
        documentType: args.documentType,
        category: args.category,
        subCategory: args.subCategory,
      });

      const parsedStructuredPlu = isStructuredPluJsonUpload(args.originalName, args.mimeType)
        ? parseStructuredPluBundle(rawText, args.originalName)
        : null;
      if (parsedStructuredPlu) {
        await ensureStructuredPluMunicipalitySettings(parsedStructuredPlu);
        const resolvedInseeCode = await resolveInseeCode(args.targetCommune || parsedStructuredPlu.commune || "");
        const municipalityKey = parsedStructuredPlu.insee_code || resolvedInseeCode || args.targetCommune || parsedStructuredPlu.commune || "";
        if (!municipalityKey) {
          throw new Error("Impossible de rattacher le PLU structure a une commune.");
        }

        const renderedText = renderStructuredPluBundleText(parsedStructuredPlu);
        const targetCommune = parsedStructuredPlu.commune || args.targetCommune || municipalityKey;
        const communeAliases = Array.from(new Set([
          targetCommune,
          args.targetCommune,
          parsedStructuredPlu.commune,
          parsedStructuredPlu.insee_code,
          resolvedInseeCode,
        ].filter((value): value is string => !!value)));
        const uploadBatchId = crypto.randomUUID();
        const fileHash = createHash("sha256").update(rawText).digest("hex");
        const canonicalType = "plu_reglement";
        const sourceAuthority = authorityForCanonicalType(canonicalType);
        const tags = Array.from(new Set([...args.requestedTags, "structured-plu", "json-canonique"]));
        const [baseIADoc] = await db.insert(baseIADocumentsTable).values({
          batchId: uploadBatchId,
          municipalityId: municipalityKey,
          zoneCode: args.zone || null,
          category: "REGULATORY",
          subCategory: "PLU",
          tags,
          type: mapCanonicalTypeToBaseIAType(canonicalType),
          fileName: args.originalName,
          fileHash,
          status: "parsing",
          rawText: renderedText,
        }).returning();

        const structuredContent = {
          ...buildStructuredPluBundleStructuredContent(parsedStructuredPlu, args.originalName),
          baseIADocumentId: baseIADoc.id,
        };

        await db.update(townHallDocumentsTable)
          .set({
            rawText,
            commune: targetCommune,
            category: "REGULATORY",
            subCategory: "PLU",
            documentType: "Structured PLU regulation",
            tags,
            isRegulatory: true,
            isOpposable: true,
            structuredContent,
            updatedAt: new Date(),
          })
          .where(eq(townHallDocumentsTable.id, args.docId));

        await processDocumentForRAG(baseIADoc.id, municipalityKey, renderedText, {
          document_id: baseIADoc.id,
          document_type: canonicalType,
          pool_id: `${municipalityKey}-PLU-ACTIVE`,
          status: "active",
          commune: municipalityKey,
          zone: args.zone || undefined,
          source_authority: sourceAuthority,
          provenance: "base_ia_plu_structured_json",
        } as any);

        await persistRegulatoryUnitsForDocument({
          baseIADocumentId: baseIADoc.id,
          townHallDocumentId: args.docId,
          municipalityId: municipalityKey,
          zoneCode: args.zone || null,
          documentType: canonicalType,
          sourceAuthority,
          isOpposable: true,
          rawText,
        });

        await persistRegulatoryZoneSectionsForDocument({
          baseIADocumentId: baseIADoc.id,
          townHallDocumentId: args.docId,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          sourceAuthority,
          isOpposable: true,
          rawText: renderedText,
        });

        await ensureCalibrationZonesForCommune({
          communeKey: municipalityKey,
          communeAliases,
          rawText: renderedText,
          sourceName: args.originalName,
          sourceType: "Structured PLU regulation",
          referenceDocumentId: args.docId,
          userId: args.userId || null,
        });

        await persistStructuredKnowledgeForDocument({
          baseIADocumentId: baseIADoc.id,
          townHallDocumentId: args.docId,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          documentSubtype: "structured_plu_json",
          sourceName: args.originalName,
          sourceAuthority,
          opposable: true,
          rawText: renderedText,
          rawClassification: {
            source: "structured_plu_json",
            category: "REGULATORY",
            subCategory: "PLU",
            resolvedDocumentType: "Structured PLU regulation",
            zoneCount: parsedStructuredPlu.zones.length,
            articleCount: parsedStructuredPlu.zones.reduce((sum, zone) => sum + zone.articles.length, 0),
            parsedRuleCount: parsedStructuredPlu.effective_zone_rules.length,
          },
        });

        await db.update(baseIADocumentsTable)
          .set({ status: "indexed" })
          .where(eq(baseIADocumentsTable.id, baseIADoc.id));

        logger.info("[mairie/structured-plu] Structured PLU JSON indexed", {
          docId: args.docId,
          municipalityKey,
          zoneCount: parsedStructuredPlu.zones.length,
          parsedRuleCount: parsedStructuredPlu.effective_zone_rules.length,
        });
        return;
      }

      const classification = resolveTownHallClassification({
        rawText,
        fileName: args.originalName,
        category: args.category,
        subCategory: args.subCategory,
        documentType: args.documentType,
        requestedTags: args.requestedTags,
      });
      const category = classification.resolved.category;
      const subCategory = classification.resolved.subCategory;
      const documentType = classification.resolved.documentType;
      const tags = classification.resolved.tags;
      const canonicalType = inferCanonicalDocumentType(documentType, category, subCategory);
      const isOpposable = isCanonicalTypeOpposable(canonicalType);
      const isRegulatory = isRegulatoryLikeDocument(documentType, category, subCategory);

      const parsedMarkdown = isMarkdownUpload(args.originalName, args.mimeType)
        ? parseConsolidatedMarkdownKnowledge(rawText, args.originalName)
        : null;
      if (parsedMarkdown) {
        await ensureMarkdownMunicipalitySettings(parsedMarkdown);
        const resolvedInseeCode = await resolveInseeCode(args.targetCommune || parsedMarkdown.metadata.commune || "");
        const municipalityKey = parsedMarkdown.metadata.inseeCode || resolvedInseeCode || args.targetCommune || parsedMarkdown.metadata.commune || "";
        if (!municipalityKey) {
          throw new Error("Impossible de rattacher le Markdown consolide a une commune.");
        }
        const targetCommune = parsedMarkdown.metadata.commune || args.targetCommune || municipalityKey;
        const communeAliases = Array.from(new Set([
          targetCommune,
          parsedMarkdown.metadata.commune || parsedMarkdown.metadata.inseeCode ? null : args.targetCommune,
          parsedMarkdown.metadata.commune,
          parsedMarkdown.metadata.inseeCode,
          resolvedInseeCode,
        ].filter((value): value is string => !!value)));
        const uploadBatchId = crypto.randomUUID();
        const fileHash = createHash("sha256").update(rawText).digest("hex");
        const [parentBaseIADoc] = await db.insert(baseIADocumentsTable).values({
          batchId: uploadBatchId,
          municipalityId: municipalityKey,
          zoneCode: args.zone || null,
          category: "CONSOLIDATED",
          subCategory: "MARKDOWN",
          tags: Array.from(new Set([...tags, "markdown-consolide", "source-parent"])),
          type: "other",
          fileName: path.basename(args.persistentPath),
          fileHash,
          status: "indexed",
          rawText,
        }).returning();

        const structuredContent = buildConsolidatedMarkdownStructuredContent({
          parsed: parsedMarkdown,
          baseIADocumentId: parentBaseIADoc.id,
          sourceFileName: args.originalName,
        });

        await db.update(townHallDocumentsTable)
          .set({
            rawText,
            commune: targetCommune,
            category: "CONSOLIDATED",
            subCategory: "MARKDOWN",
            documentType: "Consolidated Markdown PLU",
            tags: Array.from(new Set([...tags, "markdown-consolide", "source-parent"])),
            isRegulatory: true,
            isOpposable: false,
            structuredContent,
            updatedAt: new Date(),
          })
          .where(eq(townHallDocumentsTable.id, args.docId));

        await upsertConsolidatedMarkdownPrompt({
          communeAliases,
          promptBlock: parsedMarkdown.promptBlock,
          sourceName: args.originalName,
        });

        const children = await materializeConsolidatedMarkdownDocuments({
          parsed: parsedMarkdown,
          parentTownHallDocumentId: args.docId,
          parentBaseIADocumentId: parentBaseIADoc.id,
          sourceFileName: args.originalName,
          uploadBatchId,
          municipalityKey,
          communeAliases,
          targetCommune,
          userId: args.userId || null,
          zoneCode: args.zone || null,
        });

        await db.update(townHallDocumentsTable)
          .set({
            structuredContent: {
              ...structuredContent,
              extractedLogicalDocuments: children,
            },
            updatedAt: new Date(),
          })
          .where(eq(townHallDocumentsTable.id, args.docId));

        logger.info("[mairie/markdown] Consolidated Markdown indexed", {
          docId: args.docId,
          logicalDocumentCount: children.length,
          municipalityKey,
        });
        return;
      }

      await db.update(townHallDocumentsTable)
        .set({
          rawText,
          category,
          subCategory,
          documentType,
          tags,
          isRegulatory,
          isOpposable,
          updatedAt: new Date()
        })
        .where(eq(townHallDocumentsTable.id, args.docId));

      const inseeCode = await resolveInseeCode(args.targetCommune);
      const municipalityKey = inseeCode || args.targetCommune;
      const uploadBatchId = crypto.randomUUID();
      const fileHash = createHash("sha256").update(rawText).digest("hex");
      const [baseIADoc] = await db.insert(baseIADocumentsTable).values({
        batchId: uploadBatchId,
        municipalityId: municipalityKey,
        zoneCode: args.zone || null,
        category: category || "REGULATORY",
        subCategory: subCategory || "PLU",
        type: mapCanonicalTypeToBaseIAType(canonicalType),
        fileName: path.basename(args.persistentPath),
        fileHash,
        status: "parsing",
        rawText,
      }).returning();

      await processDocumentForRAG(baseIADoc.id, municipalityKey, rawText, {
        document_id: baseIADoc.id,
        document_type: canonicalType,
        pool_id: `${municipalityKey}-PLU-ACTIVE`,
        status: "active",
        commune: municipalityKey,
        zone: args.zone || undefined,
        source_authority: authorityForCanonicalType(canonicalType),
        provenance: "base_ia_plu",
      } as any);

      await persistRegulatoryUnitsForDocument({
        baseIADocumentId: baseIADoc.id,
        townHallDocumentId: args.docId,
        municipalityId: municipalityKey,
        zoneCode: args.zone || null,
        documentType: canonicalType,
        sourceAuthority: authorityForCanonicalType(canonicalType),
        isOpposable,
        rawText,
      });

      await persistRegulatoryZoneSectionsForDocument({
        baseIADocumentId: baseIADoc.id,
        townHallDocumentId: args.docId,
        municipalityId: municipalityKey,
        documentType: canonicalType,
        sourceAuthority: authorityForCanonicalType(canonicalType),
        isOpposable,
        rawText,
      });

      await ensureCalibrationZonesForCommune({
        communeKey: municipalityKey,
        communeAliases: Array.from(new Set([args.targetCommune, inseeCode].filter((value): value is string => !!value))),
        rawText,
        sourceName: args.originalName,
        sourceType: documentType,
        referenceDocumentId: args.docId,
        userId: args.userId || null,
      });

      await persistStructuredKnowledgeForDocument({
        baseIADocumentId: baseIADoc.id,
        townHallDocumentId: args.docId,
        municipalityId: municipalityKey,
        documentType: canonicalType,
        documentSubtype: args.documentType || null,
        sourceName: args.originalName,
        sourceAuthority: authorityForCanonicalType(canonicalType),
        opposable: isOpposable,
        rawText,
        rawClassification: {
          category,
          subCategory,
          requestedDocumentType: args.documentType || null,
          resolvedDocumentType: documentType,
          autoCorrected: classification.autoCorrected,
          suggestionConfidence: classification.suggestionConfidence,
          suggestionReason: classification.suggestionReason,
          source: "mairie_upload",
        },
      });

      await db.update(baseIADocumentsTable)
        .set({ status: "indexed" })
        .where(eq(baseIADocumentsTable.id, baseIADoc.id));
      logger.debug("[mairie/upload] Successfully processed RAG", { docId: args.docId });
    } catch (ragErr) {
      logger.error("[mairie/upload] RAG vectorization failed", ragErr, { docId: args.docId });
    }
  });
}

router.post("/documents/uploads/init", async (req: AuthRequest, res) => {
  try {
    const {
      fileName,
      fileSize,
      mimeType,
      category,
      subCategory,
      documentType,
      commune,
      zone,
      title,
      tags,
    } = req.body as {
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      category?: string;
      subCategory?: string;
      documentType?: string;
      commune?: string;
      zone?: string;
      title?: string;
      tags?: unknown;
    };

    if (!fileName || typeof fileSize !== "number" || fileSize <= 0) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Nom et taille du fichier requis." });
    }

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, commune);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const ext = path.extname(fileName || "") || ".pdf";
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    const [session] = await db.insert(townHallUploadSessionsTable).values({
      userId: req.user!.userId,
      commune: access.targetCommune,
      title: title || fileName,
      originalFileName: fileName,
      storedFileName,
      mimeType: mimeType || "application/pdf",
      fileSize,
      receivedBytes: 0,
      category: category || null,
      subCategory: subCategory || null,
      documentType: documentType || null,
      zone: zone || null,
      tags: parseDocumentTags(tags),
      status: "uploading",
    }).returning();

    fs.writeFileSync(resolveTownHallUploadSessionPath(session.id), "");

    return res.json({
      sessionId: session.id,
      chunkSize: RESUMABLE_UPLOAD_CHUNK_SIZE,
      receivedBytes: 0,
      totalBytes: session.fileSize,
      status: session.status,
      targetCommune: access.targetCommune,
      fileName: session.originalFileName,
    });
  } catch (err) {
    logger.error("[mairie/uploads/init]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'initialiser l'upload." });
  }
});

router.get("/documents/uploads/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [session] = await db.select().from(townHallUploadSessionsTable)
      .where(and(eq(townHallUploadSessionsTable.id, id as string), eq(townHallUploadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Session d'upload introuvable." });
    }

    return res.json({
      sessionId: session.id,
      receivedBytes: session.receivedBytes,
      totalBytes: session.fileSize,
      status: session.status,
      documentId: session.townHallDocumentId,
      errorMessage: session.errorMessage,
      commune: session.commune,
      fileName: session.originalFileName,
      category: session.category,
      subCategory: session.subCategory,
      documentType: session.documentType,
      zone: session.zone,
      mimeType: session.mimeType,
      title: session.title,
      tags: parseDocumentTags(session.tags),
    });
  } catch (err) {
    logger.error("[mairie/uploads/status]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de recuperer la session d'upload." });
  }
});

router.post("/documents/uploads/:id/chunk", upload.single("chunk"), async (req: AuthRequest, res) => {
  const file = req.file;
  try {
    const { id } = req.params;
    if (!file) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Chunk requis." });
    }

    const [session] = await db.select().from(townHallUploadSessionsTable)
      .where(and(eq(townHallUploadSessionsTable.id, id as string), eq(townHallUploadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(404).json({ error: "NOT_FOUND", message: "Session d'upload introuvable." });
    }

    if (session.status !== "uploading") {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(409).json({ error: "INVALID_STATUS", message: "Cette session n'accepte plus de chunks." });
    }

    const start = Number(req.body.start ?? "0");
    if (!Number.isFinite(start) || start !== session.receivedBytes) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(409).json({
        error: "OFFSET_MISMATCH",
        message: "Le decalage du chunk ne correspond pas a l'etat serveur.",
        receivedBytes: session.receivedBytes,
      });
    }

    fs.appendFileSync(resolveTownHallUploadSessionPath(session.id), fs.readFileSync(file.path));
    const nextReceivedBytes = Math.min(session.receivedBytes + file.size, session.fileSize);
    const nextStatus = nextReceivedBytes >= session.fileSize ? "uploaded" : "uploading";

    await db.update(townHallUploadSessionsTable)
      .set({
        receivedBytes: nextReceivedBytes,
        status: nextStatus,
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(townHallUploadSessionsTable.id, session.id));

    try { fs.unlinkSync(file.path); } catch {}

    return res.json({
      sessionId: session.id,
      receivedBytes: nextReceivedBytes,
      totalBytes: session.fileSize,
      status: nextStatus,
      done: nextReceivedBytes >= session.fileSize,
    });
  } catch (err) {
    try { if (file?.path) fs.unlinkSync(file.path); } catch {}
    logger.error("[mairie/uploads/chunk]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible d'enregistrer ce chunk." });
  }
});

router.post("/documents/uploads/:id/complete", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [session] = await db.select().from(townHallUploadSessionsTable)
      .where(and(eq(townHallUploadSessionsTable.id, id as string), eq(townHallUploadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Session d'upload introuvable." });
    }

    if (session.status === "processing" || session.status === "completed") {
      return res.json({
        status: "processing",
        message: "Document recu, indexation en cours.",
        documentId: session.townHallDocumentId,
      });
    }

    if (session.receivedBytes < session.fileSize) {
      return res.status(409).json({
        error: "UPLOAD_INCOMPLETE",
        message: "Le fichier n'est pas encore entierement recu.",
        receivedBytes: session.receivedBytes,
        totalBytes: session.fileSize,
      });
    }

    const sessionPath = resolveTownHallUploadSessionPath(session.id);
    if (!fs.existsSync(sessionPath)) {
      await db.update(townHallUploadSessionsTable)
        .set({ status: "failed", errorMessage: "Fichier temporaire introuvable.", updatedAt: new Date() })
        .where(eq(townHallUploadSessionsTable.id, session.id));
      return res.status(500).json({ error: "FILE_MISSING", message: "Le fichier temporaire de cette session est introuvable." });
    }

    const fileBuffer = fs.readFileSync(sessionPath);
    ensureTownHallUploadsDir();
    const persistentPath = path.join(PRIMARY_UPLOADS_DIR, session.storedFileName);
    fs.renameSync(sessionPath, persistentPath);

    const [doc] = await db.transaction(async (tx) => {
      const [createdDoc] = await tx.insert(townHallDocumentsTable).values({
        userId: req.user!.userId,
        commune: session.commune,
        title: session.title || session.originalFileName,
        fileName: session.storedFileName,
        mimeType: session.mimeType || "application/pdf",
        fileSize: session.fileSize,
        hasStoredBlob: true,
        rawText: "",
        category: session.category || null,
        subCategory: session.subCategory || null,
        documentType: session.documentType || null,
        isRegulatory: true,
        tags: parseDocumentTags(session.tags),
        zone: session.zone || null
      }).returning();

      await tx.insert(townHallDocumentFilesTable).values({
        documentId: createdDoc.id,
        mimeType: session.mimeType || "application/pdf",
        fileSize: session.fileSize,
        fileBase64: fileBuffer.toString("base64"),
      });

      return [createdDoc];
    });

    await db.update(townHallUploadSessionsTable)
      .set({
        status: "processing",
        townHallDocumentId: doc.id,
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(townHallUploadSessionsTable.id, session.id));

    res.json({ status: "processing", message: "Document recu, indexation en cours.", documentId: doc.id });

    await queueTownHallDocumentIndexing({
      docId: doc.id,
      persistentPath,
      mimeType: session.mimeType || "application/pdf",
      originalName: session.originalFileName,
      targetCommune: session.commune || "",
      userId: req.user!.userId,
      category: session.category,
      subCategory: session.subCategory,
      documentType: session.documentType,
      requestedTags: parseDocumentTags(session.tags),
      zone: session.zone,
    });

    await db.update(townHallUploadSessionsTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(townHallUploadSessionsTable.id, session.id));
    return;
  } catch (err) {
    logger.error("[mairie/uploads/complete]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de finaliser cet upload." });
  }
});

router.get("/documents", async (req: AuthRequest, res) => {
  try {
    const requestedCommune = req.query.commune as string | undefined;

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);

    const docs = await db.select().from(townHallDocumentsTable).orderBy(desc(townHallDocumentsTable.createdAt));
    const filteredByAccess = docs.filter((d) => {
      const docCommune = normalizeMunicipalityName(d.commune);
      if (role === "admin" || role === "super_admin") return true;
      return !!docCommune && assignedCommunes.includes(docCommune);
    });
    const requestedCommuneKey = normalizeMunicipalityName(requestedCommune);
    const docsForCommune = requestedCommune
      ? filteredByAccess.filter(d => normalizeMunicipalityName(d.commune) === requestedCommuneKey)
      : filteredByAccess;
    
    const filteredDocs = await Promise.all(docsForCommune.map(async (d) => {
      const availability = await resolveTownHallDocumentAvailability(d);
      const classification = await maybeSyncTownHallDocumentClassification(d);
      return {
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        createdAt: d.createdAt,
        commune: d.commune,
        mimeType: d.mimeType,
        category: classification.resolved.category,
        subCategory: classification.resolved.subCategory,
        documentType: classification.resolved.documentType,
        explanatoryNote: d.explanatoryNote,
        tags: d.tags,
        structuredContent: d.structuredContent,
        isConsolidatedMarkdownParent: !!(d.structuredContent as any)?.isConsolidatedMarkdownParent,
        isConsolidatedMarkdownPart: !!(d.structuredContent as any)?.isConsolidatedMarkdownPart,
        parentDocumentId: (d.structuredContent as any)?.parentDocumentId || null,
        sourceMarkdownHeading: (d.structuredContent as any)?.sourceMarkdownHeading || null,
        hasStoredFile: availability.hasStoredFile,
        hasExtractedText: availability.hasExtractedText,
        availabilityStatus: availability.availabilityStatus,
        availabilityMessage: availability.availabilityMessage,
        textQualityScore: availability.textQualityScore,
        textQualityLabel: availability.textQualityLabel,
        textQualityMessage: availability.textQualityMessage,
        extractionHint: availability.extractionHint,
        hasVisualRegulatoryAnalysis: availability.hasVisualRegulatoryAnalysis,
        rawTextPreview: d.rawText ? normalizeExtractedText(d.rawText).slice(0, 6000) : null,
      };
    }));
    return res.json({ documents: filteredDocs });
  } catch(err) { return res.status(500).json({ error: "INTERNAL_ERROR" }); }
});

router.get("/regulatory-calibration/themes", async (_req: AuthRequest, res) => {
  try {
    const themes = await ensureRegulatoryThemeTaxonomySeed();
    return res.json({
      themes: themes.map((theme) => ({
        id: theme.id,
        code: theme.code,
        label: theme.label,
        description: theme.description,
        articleHint: theme.articleHint,
        sortOrder: theme.sortOrder,
      })),
      articleReference: REGULATORY_ARTICLE_REFERENCE,
      overlayTypes: REGULATORY_OVERLAY_TYPES,
      normativeEffects: REGULATORY_NORMATIVE_EFFECTS,
      proceduralEffects: REGULATORY_PROCEDURAL_EFFECTS,
      relationTypes: REGULATORY_RELATION_TYPES,
      relationResolutionStatuses: REGULATORY_RELATION_RESOLUTION_STATUSES,
      structureModes: REGULATORY_STRUCTURE_MODES,
      ruleAnchorTypes: REGULATORY_RULE_ANCHOR_TYPES,
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/themes GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/regulatory-calibration/permissions", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });

    const canManage = req.user!.role === "admin" || req.user!.role === "super_admin" || permissions.canManagePermissions;
    const rows = canManage
      ? await db.select()
          .from(regulatoryCalibrationPermissionsTable)
          .where(eq(regulatoryCalibrationPermissionsTable.communeId, permissions.communeId))
      : [];
    const rowsByUserId = new Map(rows.map((row) => [row.userId, row] as const));
    const eligibleUsers = canManage ? await listEligibleCalibrationUsersForCommune(access.targetCommune) : [];

    return res.json({
      commune: access.targetCommune,
      communeId: permissions.communeId,
      currentPermissions: permissions,
      users: eligibleUsers.map((user) => {
        const row = rowsByUserId.get(user.id);
        const isAdminPlus = user.role === "admin" || user.role === "super_admin";
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: {
            canEditCalibration: isAdminPlus ? true : (permissions.mode === "legacy" ? true : !!row?.canEditCalibration),
            canPublishRules: isAdminPlus ? true : (permissions.mode === "legacy" ? true : !!row?.canPublishRules),
            canManagePermissions: isAdminPlus ? true : !!row?.canManagePermissions,
            inherited: !isAdminPlus && permissions.mode === "legacy" && !row,
          },
        };
      }),
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/permissions GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.put("/regulatory-calibration/permissions/:userId", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || req.query.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const currentPermissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    const isAdminPlus = req.user!.role === "admin" || req.user!.role === "super_admin";
    if (!isAdminPlus && !currentPermissions.canManagePermissions) {
      return denyCalibrationPermission(res, "Seul un profil Administrateur+ peut distribuer les droits de calibration.");
    }

    const targetUserId = req.params.userId as string;
    const [targetUser] = await db.select({
      id: usersTable.id,
      role: usersTable.role,
      name: usersTable.name,
      email: usersTable.email,
      communes: usersTable.communes,
    }).from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    if (targetUser.role === "admin" || targetUser.role === "super_admin") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Les profils Administrateur+ disposent déjà de tous les droits." });
    }

    if (targetUser.role !== "mairie" || !canAccessCommune(targetUser.role, parseCommunes(targetUser.communes), access.targetCommune)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Cet utilisateur n’est pas rattaché à cette commune." });
    }

    const communeId = currentPermissions.communeId;
    const canEditCalibration = !!req.body.canEditCalibration;
    const canPublishRules = !!req.body.canPublishRules;
    const canManagePermissions = !!req.body.canManagePermissions;

    if (currentPermissions.mode === "legacy") {
      const existingRows = await db.select()
        .from(regulatoryCalibrationPermissionsTable)
        .where(eq(regulatoryCalibrationPermissionsTable.communeId, communeId));
      if (existingRows.length === 0) {
        const eligibleUsers = await listEligibleCalibrationUsersForCommune(access.targetCommune);
        const mairieUsers = eligibleUsers.filter((user) => user.role === "mairie");
        if (mairieUsers.length > 0) {
          await db.insert(regulatoryCalibrationPermissionsTable).values(
            mairieUsers.map((user) => ({
              communeId,
              userId: user.id,
              canEditCalibration: true,
              canPublishRules: true,
              canManagePermissions: false,
              assignedBy: req.user!.userId,
            })),
          );
        }
      }
    }

    const [existing] = await db.select()
      .from(regulatoryCalibrationPermissionsTable)
      .where(
        and(
          eq(regulatoryCalibrationPermissionsTable.communeId, communeId),
          eq(regulatoryCalibrationPermissionsTable.userId, targetUserId),
        ),
      )
      .limit(1);

    if (!canEditCalibration && !canPublishRules && !canManagePermissions) {
      if (existing) {
        await db.delete(regulatoryCalibrationPermissionsTable).where(eq(regulatoryCalibrationPermissionsTable.id, existing.id));
      }
    } else if (existing) {
      await db.update(regulatoryCalibrationPermissionsTable)
        .set({
          canEditCalibration,
          canPublishRules,
          canManagePermissions,
          assignedBy: req.user!.userId,
          updatedAt: new Date(),
        })
        .where(eq(regulatoryCalibrationPermissionsTable.id, existing.id));
    } else {
      await db.insert(regulatoryCalibrationPermissionsTable).values({
        communeId,
        userId: targetUserId,
        canEditCalibration,
        canPublishRules,
        canManagePermissions,
        assignedBy: req.user!.userId,
      });
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/permissions PUT]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/regulatory-calibration/overview", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);

    const [documents, zones, overlays, bindings, excerpts, rules, conflicts] = await Promise.all([
      db.select({ id: townHallDocumentsTable.id })
        .from(townHallDocumentsTable)
        .where(eq(sql`lower(${townHallDocumentsTable.commune})`, access.targetCommune.toLowerCase())),
      db.select({ id: regulatoryCalibrationZonesTable.id })
        .from(regulatoryCalibrationZonesTable)
        .where(buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, communeAliases)),
      db.select({ id: regulatoryOverlaysTable.id })
        .from(regulatoryOverlaysTable)
        .where(buildMunicipalityAliasFilter(regulatoryOverlaysTable.communeId, communeAliases)),
      db.select({ id: overlayDocumentBindingsTable.id })
        .from(overlayDocumentBindingsTable)
        .where(buildMunicipalityAliasFilter(overlayDocumentBindingsTable.communeId, communeAliases)),
      db.select({ id: calibratedExcerptsTable.id, status: calibratedExcerptsTable.status })
        .from(calibratedExcerptsTable)
        .where(buildMunicipalityAliasFilter(calibratedExcerptsTable.communeId, communeAliases)),
      db.select({ id: indexedRegulatoryRulesTable.id, status: indexedRegulatoryRulesTable.status, conflictFlag: indexedRegulatoryRulesTable.conflictFlag })
        .from(indexedRegulatoryRulesTable)
        .where(buildMunicipalityAliasFilter(indexedRegulatoryRulesTable.communeId, communeAliases)),
      db.select({ id: regulatoryRuleConflictsTable.id, status: regulatoryRuleConflictsTable.status })
        .from(regulatoryRuleConflictsTable)
        .where(buildMunicipalityAliasFilter(regulatoryRuleConflictsTable.communeId, communeAliases)),
    ]);

    const countByStatus = (items: Array<{ status: string | null }>, status: string) => items.filter((item) => item.status === status).length;

    return res.json({
      commune: access.targetCommune,
      communeId: communeKey,
      summary: {
        documentCount: documents.length,
        zoneCount: zones.length,
        overlayCount: overlays.length,
        overlayBindingCount: bindings.length,
        excerptCount: excerpts.length,
        ruleCount: rules.length,
        publishedRuleCount: countByStatus(rules, "published"),
        validatedRuleCount: countByStatus(rules, "validated"),
        inReviewRuleCount: countByStatus(rules, "in_review"),
        draftRuleCount: countByStatus(rules, "draft"),
        conflictCount: conflicts.length,
        openConflictCount: countByStatus(conflicts, "open"),
      },
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/overview GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/regulatory-calibration/zones", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);

    let zones = await db.select()
      .from(regulatoryCalibrationZonesTable)
      .where(buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, communeAliases))
      .orderBy(regulatoryCalibrationZonesTable.displayOrder, regulatoryCalibrationZonesTable.zoneCode);

    if (zones.length === 0) {
      const docs = await db.select({
        id: townHallDocumentsTable.id,
        title: townHallDocumentsTable.title,
        fileName: townHallDocumentsTable.fileName,
        rawText: townHallDocumentsTable.rawText,
        documentType: townHallDocumentsTable.documentType,
        category: townHallDocumentsTable.category,
        subCategory: townHallDocumentsTable.subCategory,
        createdAt: townHallDocumentsTable.createdAt,
      }).from(townHallDocumentsTable)
        .where(eq(sql`lower(${townHallDocumentsTable.commune})`, access.targetCommune.toLowerCase()))
        .orderBy(desc(townHallDocumentsTable.createdAt));

      for (const doc of docs) {
        if (!hasUsableTownHallText(doc.rawText)) continue;

        const classification = resolveTownHallClassification({
          rawText: doc.rawText,
          fileName: doc.title || doc.fileName || "document",
          category: doc.category,
          subCategory: doc.subCategory,
          documentType: doc.documentType,
        });

        if (!["plu_reglement", "plu_annexe"].includes(classification.canonicalType)) continue;
        const zoningLike = isLikelyZoningLikeSource({
          rawText: doc.rawText,
          sourceName: doc.title || doc.fileName || "document",
          sourceType: doc.documentType,
        });
        if (!doc.rawText?.trim()) continue;
        if (!zoningLike && !hasUsableTownHallText(doc.rawText)) continue;

        await ensureCalibrationZonesForCommune({
          communeKey,
          communeAliases,
          rawText: doc.rawText,
          sourceName: doc.title || doc.fileName || "document",
          sourceType: doc.documentType,
          referenceDocumentId: doc.id,
          userId: req.user!.userId,
        });
      }

      zones = await db.select()
        .from(regulatoryCalibrationZonesTable)
        .where(buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, communeAliases))
        .orderBy(regulatoryCalibrationZonesTable.displayOrder, regulatoryCalibrationZonesTable.zoneCode);
    }

    const referenceDocuments = zones
      .map((zone) => zone.referenceDocumentId)
      .filter((value): value is string => !!value);
    const referenceDocMap = new Map(
      referenceDocuments.length > 0
        ? (await db.select({
            id: townHallDocumentsTable.id,
            title: townHallDocumentsTable.title,
            fileName: townHallDocumentsTable.fileName,
            documentType: townHallDocumentsTable.documentType,
          }).from(townHallDocumentsTable)
            .where(inArray(townHallDocumentsTable.id, referenceDocuments)))
          .map((doc) => [doc.id, doc] as const)
        : [],
    );

    return res.json({
      commune: access.targetCommune,
      communeId: communeKey,
      zones: zones.map((zone) => ({
        ...zone,
        referenceDocument: zone.referenceDocumentId
          ? referenceDocMap.get(zone.referenceDocumentId) || null
          : null,
      })),
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/zones GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/regulatory-calibration/zones", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour modifier la calibration de cette commune.");
    }

    const { communeKey, communeAliases } = await resolveCommuneAliases(access.targetCommune);
    const zoneCode = normalizeConfiguredZoneCode(req.body.zoneCode);
    if (!zoneCode) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Code zone invalide." });
    }

    const existing = await db.select({ id: regulatoryCalibrationZonesTable.id })
      .from(regulatoryCalibrationZonesTable)
      .where(
        and(
          buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, communeAliases),
          eq(regulatoryCalibrationZonesTable.zoneCode, zoneCode),
        ),
      )
      .limit(1);

    let referenceDocumentId: string | null = null;
    try {
      referenceDocumentId = await resolveCalibrationReferenceDocumentId({
        communeAliases,
        requestedId: req.body.referenceDocumentId,
      });
    } catch {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Document de référence invalide pour cette commune." });
    }

    let zone;
    if (existing[0]) {
      const [updated] = await db.update(regulatoryCalibrationZonesTable)
        .set({
          zoneLabel: typeof req.body.zoneLabel === "string" ? req.body.zoneLabel.trim() || null : null,
          parentZoneCode: normalizeConfiguredZoneCode(req.body.parentZoneCode),
          sectorCode: typeof req.body.sectorCode === "string" ? req.body.sectorCode.trim() || null : null,
          guidanceNotes: typeof req.body.guidanceNotes === "string" ? req.body.guidanceNotes.trim() || null : null,
          searchKeywords: normalizeZoneSearchKeywords(req.body.searchKeywords),
          referenceDocumentId,
          referenceStartPage: normalizeOptionalPositivePage(req.body.referenceStartPage),
          referenceEndPage: normalizeOptionalPositivePage(req.body.referenceEndPage),
          displayOrder: Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : 0,
          isActive: req.body.isActive === false ? false : true,
          updatedBy: req.user!.userId,
          updatedAt: new Date(),
        })
        .where(eq(regulatoryCalibrationZonesTable.id, existing[0].id))
        .returning();
      zone = updated;
      await safeRecordRegulatoryValidationHistory({
        communeId: communeKey,
        entityType: "zone",
        entityId: zone.id,
        action: "zone_updated",
        userId: req.user!.userId,
        snapshot: zone as Record<string, unknown>,
      });
    } else {
      const [created] = await db.insert(regulatoryCalibrationZonesTable).values({
        communeId: communeKey,
        zoneCode,
        zoneLabel: typeof req.body.zoneLabel === "string" ? req.body.zoneLabel.trim() || null : null,
        parentZoneCode: normalizeConfiguredZoneCode(req.body.parentZoneCode),
        sectorCode: typeof req.body.sectorCode === "string" ? req.body.sectorCode.trim() || null : null,
        guidanceNotes: typeof req.body.guidanceNotes === "string" ? req.body.guidanceNotes.trim() || null : null,
        searchKeywords: normalizeZoneSearchKeywords(req.body.searchKeywords),
        referenceDocumentId,
        referenceStartPage: normalizeOptionalPositivePage(req.body.referenceStartPage),
        referenceEndPage: normalizeOptionalPositivePage(req.body.referenceEndPage),
        displayOrder: Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : 0,
        isActive: req.body.isActive === false ? false : true,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      }).returning();
      zone = created;
      await safeRecordRegulatoryValidationHistory({
        communeId: communeKey,
        entityType: "zone",
        entityId: zone.id,
        action: "zone_created",
        userId: req.user!.userId,
        snapshot: zone as Record<string, unknown>,
      });
    }

    if (zone.referenceDocumentId) {
      const [referenceDocument] = await db.select()
        .from(townHallDocumentsTable)
        .where(eq(townHallDocumentsTable.id, zone.referenceDocumentId))
        .limit(1);
      if (referenceDocument) {
        const mappedPages = await buildCalibrationPagesForDocument(referenceDocument, {
          startPage: zone.referenceStartPage,
          endPage: zone.referenceEndPage,
        });
        await rebuildThematicSegmentsForZone({
          zone,
          referenceDocument,
          pages: mappedPages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
          userId: req.user!.userId,
        });
      }
    }

    return res.json({ zone });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/zones POST]", err);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Impossible de creer cette zone pour la commune selectionnee.",
    });
  }
});

router.patch("/regulatory-calibration/zones/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [zone] = await db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, id)).limit(1);
    if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || zone.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour modifier la calibration de cette commune.");
    }

    let referenceDocumentId = zone.referenceDocumentId;
    try {
      if (req.body.referenceDocumentId !== undefined) {
        referenceDocumentId = await resolveCalibrationReferenceDocumentId({
          communeAliases: [access.targetCommune, zone.communeId].filter((value): value is string => !!value),
          requestedId: req.body.referenceDocumentId,
        });
      }
    } catch {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Document de référence invalide pour cette commune." });
    }

    const [updated] = await db.update(regulatoryCalibrationZonesTable)
      .set({
        zoneCode: normalizeConfiguredZoneCode(req.body.zoneCode) || zone.zoneCode,
        zoneLabel: typeof req.body.zoneLabel === "string" ? req.body.zoneLabel.trim() || null : zone.zoneLabel,
        parentZoneCode: req.body.parentZoneCode === undefined ? zone.parentZoneCode : normalizeConfiguredZoneCode(req.body.parentZoneCode),
        sectorCode: req.body.sectorCode === undefined ? zone.sectorCode : (typeof req.body.sectorCode === "string" ? req.body.sectorCode.trim() || null : null),
        guidanceNotes: req.body.guidanceNotes === undefined ? zone.guidanceNotes : (typeof req.body.guidanceNotes === "string" ? req.body.guidanceNotes.trim() || null : null),
        searchKeywords: req.body.searchKeywords === undefined ? zone.searchKeywords : normalizeZoneSearchKeywords(req.body.searchKeywords),
        referenceDocumentId,
        referenceStartPage: req.body.referenceStartPage === undefined ? zone.referenceStartPage : normalizeOptionalPositivePage(req.body.referenceStartPage),
        referenceEndPage: req.body.referenceEndPage === undefined ? zone.referenceEndPage : normalizeOptionalPositivePage(req.body.referenceEndPage),
        displayOrder: req.body.displayOrder === undefined ? zone.displayOrder : (Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : zone.displayOrder),
        isActive: req.body.isActive === undefined ? zone.isActive : !!req.body.isActive,
        updatedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(regulatoryCalibrationZonesTable.id, id))
      .returning();

    await safeRecordRegulatoryValidationHistory({
      communeId: updated.communeId,
      entityType: "zone",
      entityId: updated.id,
      action: "zone_updated",
      userId: req.user!.userId,
      snapshot: updated as Record<string, unknown>,
    });

    if (updated.referenceDocumentId) {
      const [referenceDocument] = await db.select()
        .from(townHallDocumentsTable)
        .where(eq(townHallDocumentsTable.id, updated.referenceDocumentId))
        .limit(1);
      if (referenceDocument) {
        const mappedPages = await buildCalibrationPagesForDocument(referenceDocument, {
          startPage: updated.referenceStartPage,
          endPage: updated.referenceEndPage,
        });
        await rebuildThematicSegmentsForZone({
          zone: updated,
          referenceDocument,
          pages: mappedPages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
          userId: req.user!.userId,
        });
      }
    }

    return res.json({ zone: updated });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/zones PATCH]", err);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Impossible de mettre a jour cette zone.",
    });
  }
});

router.get("/regulatory-calibration/zones/:id/workspace", async (req: AuthRequest, res) => {
  try {
    const zoneId = req.params.id as string;
    const [zone] = await db.select()
      .from(regulatoryCalibrationZonesTable)
      .where(eq(regulatoryCalibrationZonesTable.id, zoneId))
      .limit(1);

    if (!zone) {
      return res.status(404).json({ error: "ZONE_NOT_FOUND" });
    }

    const access = await resolveAuthorizedTownHallCommune(
      req.user!.userId,
      req.query.commune as string | undefined || zone.communeId,
    );
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });

    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);
    const themes = await ensureRegulatoryThemeTaxonomySeed();

    const availableDocuments = await db.select()
      .from(townHallDocumentsTable)
      .where(eq(sql`lower(${townHallDocumentsTable.commune})`, access.targetCommune.toLowerCase()))
      .orderBy(desc(townHallDocumentsTable.createdAt));

    const matchingSections = await db.select()
      .from(regulatoryZoneSectionsTable)
      .where(buildMunicipalityAliasFilter(regulatoryZoneSectionsTable.municipalityId, communeAliases));

    const normalizedZoneCode = normalizeConfiguredZoneCode(zone.zoneCode) || zone.zoneCode;
    const zoneSections = matchingSections
      .filter((section) => {
        const effectiveZoneCode = section.reviewedZoneCode || section.zoneCode;
        return normalizeConfiguredZoneCode(effectiveZoneCode) === normalizedZoneCode && section.reviewStatus !== "rejected";
      })
      .sort((left, right) => {
        const leftPage = left.reviewedStartPage ?? left.startPage ?? Number.MAX_SAFE_INTEGER;
        const rightPage = right.reviewedStartPage ?? right.startPage ?? Number.MAX_SAFE_INTEGER;
        return leftPage - rightPage;
      });

    const referenceDocumentId =
      zone.referenceDocumentId
      || zoneSections.find((section) => !!section.townHallDocumentId)?.townHallDocumentId
      || availableDocuments[0]?.id
      || null;

    const referenceDocument = referenceDocumentId
      ? availableDocuments.find((doc) => doc.id === referenceDocumentId)
        || await db.select()
          .from(townHallDocumentsTable)
          .where(eq(townHallDocumentsTable.id, referenceDocumentId))
          .limit(1)
          .then((rows) => rows[0] || null)
      : null;

    const effectiveStartPage = zone.referenceStartPage ?? zoneSections[0]?.reviewedStartPage ?? zoneSections[0]?.startPage ?? null;
    const effectiveEndPage = zone.referenceEndPage ?? zoneSections[zoneSections.length - 1]?.reviewedEndPage ?? zoneSections[zoneSections.length - 1]?.endPage ?? null;
    const allPages = referenceDocument
      ? await buildCalibrationPagesForDocument(referenceDocument, {
          startPage: effectiveStartPage,
          endPage: effectiveEndPage,
        })
      : [];
    const boundedPages = allPages.filter((page) => {
      if (effectiveStartPage && page.pageNumber < effectiveStartPage) return false;
      if (effectiveEndPage && page.pageNumber > effectiveEndPage) return false;
      return true;
    });
    const sectionTextPages = zoneSections
      .map((section) => ({
        pageNumber: section.reviewedStartPage ?? section.startPage ?? effectiveStartPage ?? 1,
        text: section.sourceText || "",
        startOffset: 0,
        endOffset: (section.sourceText || "").length,
      }))
      .filter((page) => page.text.trim().length > 0)
      .filter((page, index, all) => all.findIndex((candidate) => candidate.pageNumber === page.pageNumber && candidate.text === page.text) === index);
    const pseudoBoundedPages =
      boundedPages.length === 0 &&
      effectiveStartPage &&
      effectiveEndPage &&
      effectiveEndPage >= effectiveStartPage &&
      zoneSections.length > 0
        ? buildPseudoPagesFromBoundedZoneText({
            text: zoneSections.map((section) => section.sourceText || "").filter((value) => value.trim().length > 0).join("\n\n"),
            startPage: effectiveStartPage,
            endPage: effectiveEndPage,
          })
        : [];
    const hasStrictPdfWindow = !!(
      referenceDocumentId
      && effectiveStartPage
      && effectiveEndPage
      && effectiveEndPage >= effectiveStartPage
    );
    const analysisPages =
      boundedPages.length > 0
        ? boundedPages
        : hasStrictPdfWindow
          ? []
        : pseudoBoundedPages.length > 0
          ? pseudoBoundedPages
        : sectionTextPages.length > 0
          ? sectionTextPages
          : allPages;
    const viewerPageNumbers =
      effectiveStartPage && effectiveEndPage && effectiveEndPage >= effectiveStartPage
        ? Array.from({ length: effectiveEndPage - effectiveStartPage + 1 }, (_, index) => effectiveStartPage + index)
        : effectiveStartPage
          ? [effectiveStartPage]
          : analysisPages.map((page) => page.pageNumber);
    const workspacePages = Array.from(new Set(viewerPageNumbers)).map((pageNumber) => {
      const matchingPage = analysisPages.find((page) => page.pageNumber === pageNumber);
      return {
        pageNumber,
        text: matchingPage?.text || "",
        startOffset: matchingPage?.startOffset || 0,
        endOffset: matchingPage?.endOffset || 0,
      };
    });

    const [zoneExcerpts, zoneRules, overlays, persistedSegments] = await Promise.all([
      db.select()
        .from(calibratedExcerptsTable)
        .where(eq(calibratedExcerptsTable.zoneId, zone.id))
        .orderBy(calibratedExcerptsTable.sourcePage, calibratedExcerptsTable.createdAt),
      db.select()
        .from(indexedRegulatoryRulesTable)
        .where(eq(indexedRegulatoryRulesTable.zoneId, zone.id))
        .orderBy(indexedRegulatoryRulesTable.articleCode, indexedRegulatoryRulesTable.sourcePage, indexedRegulatoryRulesTable.updatedAt),
      listCommuneRegulatoryOverlays(communeAliases),
      listZoneThematicSegments(zone.id),
    ]);

    const boundedPersistedSegments = persistedSegments.filter((segment) => {
      if (!effectiveStartPage && !effectiveEndPage) return true;
      const segmentStart = segment.sourcePageStart || 0;
      const segmentEnd = segment.sourcePageEnd || segment.sourcePageStart || 0;
      if (effectiveStartPage && segmentEnd < effectiveStartPage) return false;
      if (effectiveEndPage && segmentStart > effectiveEndPage) return false;
      return true;
    });

    const generatedAiSegments =
      referenceDocumentId && workspacePages.some((page) => page.text.trim().length > 0)
        ? buildZoneThematicSegmentsFromPages({
            communeId: communeKey,
            zoneId: zone.id,
            documentId: referenceDocumentId,
            pages: workspacePages.map((page) => ({
              pageNumber: page.pageNumber,
              text: page.text,
            })),
          }).map((segment) => ({
            id: `generated-${segment.zoneId}-${segment.themeCode}-${segment.sourcePageStart}-${segment.anchorLabel || "segment"}`,
            communeId: segment.communeId,
            zoneId: segment.zoneId,
            overlayId: segment.overlayId,
            documentId: segment.documentId,
            sourcePageStart: segment.sourcePageStart,
            sourcePageEnd: segment.sourcePageEnd ?? null,
            anchorType: segment.anchorType,
            anchorLabel: segment.anchorLabel ?? null,
            themeCode: segment.themeCode,
            sourceTextFull: segment.sourceTextFull,
            sourceTextNormalized: segment.sourceTextNormalized ?? null,
            visualAttachmentMeta: segment.visualAttachmentMeta ?? {},
            derivedFromAi: true,
            status: "suggested",
            createdBy: null,
            updatedBy: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        : [];

    const manualPersistedSegments = boundedPersistedSegments.filter((segment) => !segment.derivedFromAi);
    const fallbackPersistedAiSegments = boundedPersistedSegments.filter((segment) => segment.derivedFromAi);
    const aiSegmentsForWorkspace =
      generatedAiSegments.length > 0
        ? generatedAiSegments
        : hasStrictPdfWindow
          ? []
          : fallbackPersistedAiSegments;
    const derivedSegments = [
      ...aiSegmentsForWorkspace,
      ...manualPersistedSegments,
    ].sort((left, right) => {
      const pageDelta = (left.sourcePageStart || Number.POSITIVE_INFINITY) - (right.sourcePageStart || Number.POSITIVE_INFINITY);
      if (pageDelta !== 0) return pageDelta;
      const endDelta = (left.sourcePageEnd || left.sourcePageStart || Number.POSITIVE_INFINITY) - (right.sourcePageEnd || right.sourcePageStart || Number.POSITIVE_INFINITY);
      if (endDelta !== 0) return endDelta;
      return String(left.anchorLabel || left.themeCode || "").localeCompare(String(right.anchorLabel || right.themeCode || ""), "fr", { numeric: true, sensitivity: "base" });
    });

    const excerptDocumentIds = Array.from(new Set(zoneExcerpts.map((excerpt) => excerpt.documentId).filter((value): value is string => !!value)));
    const ruleDocumentIds = Array.from(new Set(zoneRules.map((rule) => rule.documentId).filter((value): value is string => !!value)));
    const segmentDocumentIds = Array.from(new Set(derivedSegments.map((segment) => segment.documentId).filter((value): value is string => !!value)));
    const documentIds = Array.from(new Set([referenceDocumentId, ...excerptDocumentIds, ...ruleDocumentIds, ...segmentDocumentIds].filter((value): value is string => !!value)));
    const documentMap = new Map(
      availableDocuments
        .filter((doc) => documentIds.includes(doc.id))
        .map((doc) => [doc.id, doc] as const),
    );
    const documentProfiles = availableDocuments.length > 0
      ? await db.select()
        .from(documentKnowledgeProfilesTable)
        .where(
          and(
            inArray(documentKnowledgeProfilesTable.municipalityId, communeAliases),
            inArray(documentKnowledgeProfilesTable.townHallDocumentId, availableDocuments.map((doc) => doc.id)),
          ),
        )
      : [];

    const ruleIds = zoneRules.map((rule) => rule.id);
    const relations = ruleIds.length > 0
      ? await db.select()
        .from(ruleRelationsTable)
        .where(
          or(
            inArray(ruleRelationsTable.sourceRuleId, ruleIds),
            inArray(ruleRelationsTable.targetRuleId, ruleIds),
          )!,
        )
      : [];
    const hydratedRelations = await hydrateRuleRelations(relations);

    const conflicts = await db.select()
      .from(regulatoryRuleConflictsTable)
      .where(
        and(
          eq(regulatoryRuleConflictsTable.communeId, communeKey),
          eq(regulatoryRuleConflictsTable.zoneId, zone.id),
        ),
      );

    const suggestions = referenceDocumentId
      ? await buildCalibrationSuggestionsForDocument({ communeAliases, townHallDocumentId: referenceDocumentId })
      : { sections: [], rules: [] };

    const availabilityEntries = await Promise.all(
      availableDocuments.map(async (doc) => [doc.id, await resolveTownHallDocumentAvailability(doc)] as const),
    );
    const availabilityByDocumentId = new Map(availabilityEntries);

    const articleAnchors = buildZoneArticleAnchors(workspacePages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
    }))).sort((left, right) => {
      const leftArticle = Number.parseInt(left.articleCode || "999", 10);
      const rightArticle = Number.parseInt(right.articleCode || "999", 10);
      if (leftArticle !== rightArticle) return leftArticle - rightArticle;
      return left.pageNumber - right.pageNumber;
    });
    const keywordMatches = buildZoneKeywordMatches({
      pages: workspacePages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
      keywords: zone.searchKeywords || [],
    }).sort((left, right) => left.pageNumber - right.pageNumber);
    const excerptMap = new Map(zoneExcerpts.map((excerpt) => [excerpt.id, excerpt] as const));
    const themeMap = new Map(themes.map((theme) => [theme.code, theme]));
    const activeOverlays = overlays.filter((overlay) =>
      zoneRules.some((rule) => rule.overlayId === overlay.id)
      || derivedSegments.some((segment) => segment.overlayId === overlay.id),
    );
    let expertAnalysis = null;
    try {
      expertAnalysis = await buildExpertZoneAnalysisWithAdjudication({
        commune: access.targetCommune,
        zone: {
          zoneCode: zone.zoneCode,
          zoneLabel: zone.zoneLabel,
          parentZoneCode: zone.parentZoneCode,
        },
        referenceDocument: referenceDocument
          ? {
              id: referenceDocument.id,
              title: referenceDocument.title,
              fileName: referenceDocument.fileName,
              documentType: referenceDocument.documentType,
            }
          : null,
        overlays: activeOverlays,
        segments: derivedSegments.map((segment) => ({
          ...segment,
          documentTitle: documentMap.get(segment.documentId)?.title || documentMap.get(segment.documentId)?.fileName || null,
        })),
        documents: availableDocuments,
        documentProfiles,
        zoneSections: zoneSections
          .map((section) => ({
            id: section.id,
            zoneCode: section.reviewedZoneCode || section.zoneCode,
            heading: section.heading,
            sourceText: section.sourceText || null,
            startPage: section.reviewedStartPage ?? section.startPage,
            endPage: section.reviewedEndPage ?? section.endPage,
            townHallDocumentId: section.townHallDocumentId || null,
            documentTitle: availableDocuments.find((doc) => doc.id === section.townHallDocumentId)?.title
              || availableDocuments.find((doc) => doc.id === section.townHallDocumentId)?.fileName
              || null,
          }))
          .filter((section) => !!section.zoneCode),
        rules: zoneRules.map((rule) => ({
          id: rule.id,
          zoneCode: zone.zoneCode,
          zoneLabel: zone.zoneLabel,
          overlayId: rule.overlayId,
          overlayCode: rule.overlayId ? (activeOverlays.find((overlay) => overlay.id === rule.overlayId)?.overlayCode || null) : null,
          overlayLabel: rule.overlayId ? (activeOverlays.find((overlay) => overlay.id === rule.overlayId)?.overlayLabel || null) : null,
          overlayType: rule.overlayType,
          normativeEffect: rule.normativeEffect,
          proceduralEffect: rule.proceduralEffect,
          applicabilityScope: rule.applicabilityScope,
          ruleAnchorType: rule.ruleAnchorType,
          ruleAnchorLabel: rule.ruleAnchorLabel,
          isRelationalRule: rule.isRelationalRule,
          requiresCrossDocumentResolution: rule.requiresCrossDocumentResolution,
          resolutionStatus: rule.resolutionStatus,
          linkedRuleCount: rule.linkedRuleCount,
          relationResolutionNote: null,
          relations: [],
          ruleFamily: rule.themeCode,
          ruleTopic: rule.themeCode,
          ruleLabel: rule.ruleLabel,
          ruleTextRaw: rule.sourceText,
          ruleSummary: rule.interpretationNote,
          ruleValueType: rule.operator ? "structured" : null,
          ruleValueMin: null,
          ruleValueMax: null,
          ruleValueExact: sanitizeZoneRuleValueNumeric(rule),
          ruleUnit: rule.unit,
          ruleCondition: rule.conditionText,
          ruleException: null,
          sourcePage: rule.sourcePage,
          sourceArticle: rule.articleCode,
          sourceExcerpt: rule.sourceText,
          confidenceScore: rule.confidenceScore,
          reviewStatus: rule.status,
          requiresManualValidation: rule.status !== "published",
          ruleConflictFlag: rule.conflictFlag,
          sourceDocumentId: rule.documentId,
          sourceDocumentKind: documentMap.get(rule.documentId)?.documentType || null,
          sourceDocumentName: documentMap.get(rule.documentId)?.title || documentMap.get(rule.documentId)?.fileName || null,
          visualCapture: null,
          visualSupportNote: null,
        })),
      });
    } catch (expertAnalysisError) {
      logger.error("[mairie/regulatory-calibration/zone-workspace expert-analysis]", expertAnalysisError);
      expertAnalysis = null;
    }

    return res.json({
      commune: access.targetCommune,
      communeId: communeKey,
      zone: {
        ...zone,
        referenceDocumentId,
        referenceStartPage: effectiveStartPage,
        referenceEndPage: effectiveEndPage,
      },
      referenceDocument: referenceDocument
        ? {
            id: referenceDocument.id,
            title: referenceDocument.title,
            fileName: referenceDocument.fileName,
            documentType: referenceDocument.documentType,
            availability: availabilityByDocumentId.get(referenceDocument.id) || getTownHallDocumentAvailability(referenceDocument),
          }
        : null,
      availableDocuments: availableDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        documentType: doc.documentType,
        availability: availabilityByDocumentId.get(doc.id) || getTownHallDocumentAvailability(doc),
      })),
      overlays,
      themes: themes.map((theme) => ({
        code: theme.code,
        label: theme.label,
        description: theme.description,
        articleHint: theme.articleHint,
      })),
      articleReference: REGULATORY_ARTICLE_REFERENCE,
      pages: workspacePages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        startOffset: page.startOffset,
        endOffset: page.endOffset,
      })),
      segments: derivedSegments.map((segment) => ({
        ...segment,
        themeLabel: themeMap.get(segment.themeCode)?.label || segment.themeCode,
        articleCode: inferArticleCodeFromCalibrationText(segment.anchorLabel || segment.sourceTextFull),
        previewText: segment.sourceTextFull.length > 280 ? `${segment.sourceTextFull.slice(0, 277)}...` : segment.sourceTextFull,
        document: documentMap.get(segment.documentId) || null,
      })),
      expertAnalysis,
      classifiedDocuments: expertAnalysis?.documentSet || [],
      articleAnchors,
      keywordMatches,
      detectedSections: zoneSections.map((section) => ({
        id: section.id,
        zoneCode: section.reviewedZoneCode || section.zoneCode,
        heading: section.heading,
        startPage: section.reviewedStartPage ?? section.startPage,
        endPage: section.reviewedEndPage ?? section.endPage,
        sourceText: section.sourceText?.slice(0, 1200) || "",
        reviewStatus: section.reviewStatus,
        townHallDocumentId: section.townHallDocumentId,
      })),
      detectedRules: suggestions.rules
        .filter((rule) => normalizeConfiguredZoneCode(rule.zoneCode) === normalizedZoneCode)
        .sort((left, right) => {
          const leftArticle = Number.parseInt(left.articleCode || "999", 10);
          const rightArticle = Number.parseInt(right.articleCode || "999", 10);
          if (leftArticle !== rightArticle) return leftArticle - rightArticle;
          return (left.sourcePage || Number.MAX_SAFE_INTEGER) - (right.sourcePage || Number.MAX_SAFE_INTEGER);
        }),
      excerpts: zoneExcerpts.map((excerpt) => ({
        ...excerpt,
        segmentId: excerpt.segmentId,
        document: documentMap.get(excerpt.documentId) || null,
        rules: zoneRules
          .filter((rule) => rule.excerptId === excerpt.id)
          .map((rule) => ({
            ...rule,
            valueNumeric: sanitizeZoneRuleValueNumeric(rule),
          })),
      })),
      rules: zoneRules.map((rule) => {
        const excerpt = excerptMap.get(rule.excerptId);
        const excerptMetadata = excerpt?.metadata && typeof excerpt.metadata === "object" ? excerpt.metadata as Record<string, unknown> : null;
        const rawSuggestion = rule.rawSuggestion && typeof rule.rawSuggestion === "object" ? rule.rawSuggestion as Record<string, unknown> : null;
        return {
          ...rule,
          segmentId: rule.segmentId,
          valueNumeric: sanitizeZoneRuleValueNumeric(rule),
          document: documentMap.get(rule.documentId) || null,
          excerptSelectionLabel: excerpt?.selectionLabel || null,
          visualCapture: (rawSuggestion?.visualCapture || excerptMetadata?.visualCapture || null) as Record<string, unknown> | null,
          visualSupportNote: typeof rawSuggestion?.visualSupportNote === "string" ? rawSuggestion.visualSupportNote : null,
        };
      }),
      relations: hydratedRelations,
      conflicts,
      permissions,
      workspaceReady: !!referenceDocumentId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[mairie/regulatory-calibration/zone-workspace GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: msg });
  }
});

router.post("/regulatory-calibration/zones/:id/infer-from-pages", async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ZONE_ID_REQUIRED" });

    const [zone] = await db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, id)).limit(1);
    if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || zone.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);

    const rawPages: Array<{ pageNumber?: unknown; text?: unknown }> = Array.isArray(req.body.pages) ? req.body.pages : [];
    const startPage = zone.referenceStartPage ?? null;
    const endPage = zone.referenceEndPage ?? null;
    const pages = rawPages
      .map((page) => ({
        pageNumber: normalizeOptionalPositivePage(page?.pageNumber) || null,
        text: typeof page?.text === "string" ? page.text : "",
      }))
      .filter((page): page is { pageNumber: number; text: string } => !!page.pageNumber && page.text.trim().length > 0)
      .filter((page) => {
        if (startPage && page.pageNumber < startPage) return false;
        if (endPage && page.pageNumber > endPage) return false;
        return true;
      });

    if (pages.length === 0) {
      return res.json({
        segments: [],
        articleAnchors: [],
        keywordMatches: [],
        expertAnalysis: null,
      });
    }

    const themes = await ensureRegulatoryThemeTaxonomySeed();
    const [referenceDocument] = zone.referenceDocumentId
      ? await db.select().from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, zone.referenceDocumentId)).limit(1)
      : [null];
    const documentAliases = Array.from(new Set([access.targetCommune, zone.communeId].map((value) => String(value || "").trim()).filter(Boolean)));
    const availableDocuments = documentAliases.length > 0
      ? await db.select()
        .from(townHallDocumentsTable)
        .where(or(
          ...documentAliases.map((alias) => eq(sql`lower(${townHallDocumentsTable.commune})`, alias.toLowerCase())),
        )!)
      : (referenceDocument ? [referenceDocument] : []);
    const documentProfiles = documentAliases.length > 0
      ? await db.select()
        .from(documentKnowledgeProfilesTable)
        .where(inArray(documentKnowledgeProfilesTable.municipalityId, documentAliases))
      : [];
    const zoneRules = await db.select()
      .from(indexedRegulatoryRulesTable)
      .where(eq(indexedRegulatoryRulesTable.zoneId, zone.id))
      .orderBy(indexedRegulatoryRulesTable.articleCode, indexedRegulatoryRulesTable.sourcePage, indexedRegulatoryRulesTable.updatedAt);

    const generatedSegments = buildZoneThematicSegmentsFromPages({
      communeId: zone.communeId,
      zoneId: zone.id,
      documentId: zone.referenceDocumentId || referenceDocument?.id || "viewer-pdf",
      pages,
    }).map((segment) => ({
      id: `generated-${segment.zoneId}-${segment.themeCode}-${segment.sourcePageStart}-${segment.anchorLabel || "segment"}`,
      communeId: segment.communeId,
      zoneId: segment.zoneId,
      overlayId: segment.overlayId,
      documentId: segment.documentId,
      sourcePageStart: segment.sourcePageStart,
      sourcePageEnd: segment.sourcePageEnd ?? null,
      anchorType: segment.anchorType,
      anchorLabel: segment.anchorLabel ?? null,
      themeCode: segment.themeCode,
      sourceTextFull: segment.sourceTextFull,
      sourceTextNormalized: segment.sourceTextNormalized ?? null,
      visualAttachmentMeta: segment.visualAttachmentMeta ?? {},
      derivedFromAi: true,
      status: "suggested",
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const themeMap = new Map(themes.map((theme) => [theme.code, theme]));
    const expertAnalysis = await buildExpertZoneAnalysisWithAdjudication({
      commune: access.targetCommune,
      zone: {
        zoneCode: zone.zoneCode,
        zoneLabel: zone.zoneLabel,
        parentZoneCode: zone.parentZoneCode,
      },
      referenceDocument: referenceDocument
        ? {
            id: referenceDocument.id,
            title: referenceDocument.title,
            fileName: referenceDocument.fileName,
            documentType: referenceDocument.documentType,
          }
        : null,
      overlays: [],
      segments: generatedSegments.map((segment) => ({
        ...segment,
        documentTitle: referenceDocument?.title || referenceDocument?.fileName || null,
      })),
      documents: availableDocuments,
      documentProfiles,
      zoneSections: referenceDocument ? [{
        id: `reference-${referenceDocument.id}`,
        zoneCode: zone.zoneCode,
        heading: referenceDocument.title || referenceDocument.fileName || null,
        sourceText: referenceDocument.rawText || null,
        startPage: zone.referenceStartPage || null,
        endPage: zone.referenceEndPage || null,
        townHallDocumentId: referenceDocument.id,
        documentTitle: referenceDocument.title || referenceDocument.fileName || null,
      }] : [],
      rules: zoneRules.map((rule) => ({
        id: rule.id,
        zoneCode: zone.zoneCode,
        zoneLabel: zone.zoneLabel,
        overlayId: rule.overlayId,
        overlayCode: null,
        overlayLabel: null,
        overlayType: rule.overlayType,
        normativeEffect: rule.normativeEffect,
        proceduralEffect: rule.proceduralEffect,
        applicabilityScope: rule.applicabilityScope,
        ruleAnchorType: rule.ruleAnchorType,
        ruleAnchorLabel: rule.ruleAnchorLabel,
        isRelationalRule: rule.isRelationalRule,
        requiresCrossDocumentResolution: rule.requiresCrossDocumentResolution,
        resolutionStatus: rule.resolutionStatus,
        linkedRuleCount: rule.linkedRuleCount,
        relationResolutionNote: null,
        relations: [],
        ruleFamily: rule.themeCode,
        ruleTopic: rule.themeCode,
        ruleLabel: rule.ruleLabel,
        ruleTextRaw: rule.sourceText,
        ruleSummary: rule.interpretationNote,
        ruleValueType: rule.operator ? "structured" : null,
        ruleValueMin: null,
        ruleValueMax: null,
        ruleValueExact: sanitizeZoneRuleValueNumeric(rule),
        ruleUnit: rule.unit,
        ruleCondition: rule.conditionText,
        ruleException: null,
        sourcePage: rule.sourcePage,
        sourceArticle: rule.articleCode,
        sourceExcerpt: rule.sourceText,
        confidenceScore: rule.confidenceScore,
        reviewStatus: rule.status,
        requiresManualValidation: rule.status !== "published",
        ruleConflictFlag: rule.conflictFlag,
        sourceDocumentId: rule.documentId,
        sourceDocumentKind: referenceDocument?.documentType || null,
        sourceDocumentName: referenceDocument?.title || referenceDocument?.fileName || null,
        visualCapture: null,
        visualSupportNote: null,
      })),
    });

    return res.json({
      segments: generatedSegments.map((segment) => ({
        ...segment,
        themeLabel: themeMap.get(segment.themeCode)?.label || segment.themeCode,
        articleCode: inferArticleCodeFromCalibrationText(segment.anchorLabel || segment.sourceTextFull),
        previewText: segment.sourceTextFull.length > 280 ? `${segment.sourceTextFull.slice(0, 277)}...` : segment.sourceTextFull,
        document: referenceDocument
          ? {
              id: referenceDocument.id,
              title: referenceDocument.title,
              fileName: referenceDocument.fileName,
            }
          : null,
      })),
      articleAnchors: buildZoneArticleAnchors(pages).sort((left, right) => {
        const leftArticle = Number.parseInt(left.articleCode || "999", 10);
        const rightArticle = Number.parseInt(right.articleCode || "999", 10);
        if (leftArticle !== rightArticle) return leftArticle - rightArticle;
        return left.pageNumber - right.pageNumber;
      }),
      keywordMatches: buildZoneKeywordMatches({
        pages,
        keywords: zone.searchKeywords || [],
      }).sort((left, right) => left.pageNumber - right.pageNumber),
      expertAnalysis,
      classifiedDocuments: expertAnalysis?.documentSet || [],
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/zones/:id/infer-from-pages POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/regulatory-calibration/zones/:id/segments", async (req: AuthRequest, res) => {
  try {
    const zoneId = req.params.id as string;
    const [zone] = await db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, zoneId)).limit(1);
    if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || zone.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour créer des segments thématiques.");
    }

    let documentId = zone.referenceDocumentId;
    try {
      if (req.body.documentId !== undefined) {
        const { communeAliases } = await resolveCommuneAliases(access.targetCommune);
        documentId = await resolveCalibrationReferenceDocumentId({
          communeAliases,
          requestedId: req.body.documentId,
        });
      }
    } catch {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Document source invalide pour cette commune." });
    }

    const sourceTextFull = typeof req.body.sourceTextFull === "string" ? req.body.sourceTextFull.trim() : "";
    const sourcePageStart = normalizeOptionalPositivePage(req.body.sourcePageStart);
    const sourcePageEnd = normalizeOptionalPositivePage(req.body.sourcePageEnd);
    const themeCode = typeof req.body.themeCode === "string" ? req.body.themeCode.trim() : "";
    const anchorType = typeof req.body.anchorType === "string" && req.body.anchorType.trim()
      ? req.body.anchorType.trim()
      : "manual";
    const anchorLabel = typeof req.body.anchorLabel === "string" ? req.body.anchorLabel.trim() || null : null;

    if (!documentId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Document de référence obligatoire pour créer un segment." });
    }
    if (!sourceTextFull || sourceTextFull.length < 20) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Le texte source du segment est obligatoire." });
    }
    if (!sourcePageStart) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Page de début obligatoire." });
    }
    if (!themeCode) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Thème métier obligatoire." });
    }

    const [segment] = await db.insert(zoneThematicSegmentsTable).values({
      communeId: zone.communeId,
      zoneId: zone.id,
      overlayId: typeof req.body.overlayId === "string" && req.body.overlayId.trim() ? req.body.overlayId.trim() : null,
      documentId,
      sourcePageStart,
      sourcePageEnd: sourcePageEnd && sourcePageEnd >= sourcePageStart ? sourcePageEnd : null,
      anchorType,
      anchorLabel,
      themeCode,
      sourceTextFull,
      sourceTextNormalized: normalizeExtractedText(sourceTextFull),
      visualAttachmentMeta: req.body.visualAttachmentMeta && typeof req.body.visualAttachmentMeta === "object" ? req.body.visualAttachmentMeta : {},
      derivedFromAi: req.body.derivedFromAi === true,
      status: typeof req.body.status === "string" && req.body.status.trim() ? req.body.status.trim() : "confirmed",
      createdBy: req.user!.userId,
      updatedBy: req.user!.userId,
    }).returning();

    await safeRecordRegulatoryValidationHistory({
      communeId: zone.communeId,
      entityType: "segment",
      entityId: segment.id,
      action: "segment_created",
      toStatus: segment.status,
      userId: req.user!.userId,
      snapshot: segment as Record<string, unknown>,
    });

    return res.json({ segment });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/segments POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de créer ce segment thématique." });
  }
});

router.patch("/regulatory-calibration/segments/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [segment] = await db.select().from(zoneThematicSegmentsTable).where(eq(zoneThematicSegmentsTable.id, id)).limit(1);
    if (!segment) return res.status(404).json({ error: "SEGMENT_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || segment.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour modifier ce segment thématique.");
    }

    const sourcePageStart = req.body.sourcePageStart === undefined
      ? segment.sourcePageStart
      : normalizeOptionalPositivePage(req.body.sourcePageStart);
    if (!sourcePageStart) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Page de début invalide." });
    }
    const sourcePageEnd = req.body.sourcePageEnd === undefined
      ? segment.sourcePageEnd
      : normalizeOptionalPositivePage(req.body.sourcePageEnd);
    const sourceTextFull = req.body.sourceTextFull === undefined
      ? segment.sourceTextFull
      : (typeof req.body.sourceTextFull === "string" ? req.body.sourceTextFull.trim() : "");
    if (!sourceTextFull || sourceTextFull.length < 20) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Le texte source du segment est obligatoire." });
    }

    const [updated] = await db.update(zoneThematicSegmentsTable)
      .set({
        overlayId: req.body.overlayId === undefined ? segment.overlayId : (typeof req.body.overlayId === "string" && req.body.overlayId.trim() ? req.body.overlayId.trim() : null),
        documentId: req.body.documentId === undefined ? segment.documentId : (typeof req.body.documentId === "string" && req.body.documentId.trim() ? req.body.documentId.trim() : segment.documentId),
        sourcePageStart,
        sourcePageEnd: sourcePageEnd && sourcePageEnd >= sourcePageStart ? sourcePageEnd : null,
        anchorType: req.body.anchorType === undefined ? segment.anchorType : (typeof req.body.anchorType === "string" && req.body.anchorType.trim() ? req.body.anchorType.trim() : segment.anchorType),
        anchorLabel: req.body.anchorLabel === undefined ? segment.anchorLabel : (typeof req.body.anchorLabel === "string" ? req.body.anchorLabel.trim() || null : null),
        themeCode: req.body.themeCode === undefined ? segment.themeCode : (typeof req.body.themeCode === "string" && req.body.themeCode.trim() ? req.body.themeCode.trim() : segment.themeCode),
        sourceTextFull,
        sourceTextNormalized: normalizeExtractedText(sourceTextFull),
        visualAttachmentMeta: req.body.visualAttachmentMeta === undefined
          ? segment.visualAttachmentMeta
          : (req.body.visualAttachmentMeta && typeof req.body.visualAttachmentMeta === "object" ? req.body.visualAttachmentMeta : {}),
        derivedFromAi: req.body.derivedFromAi === undefined ? segment.derivedFromAi : !!req.body.derivedFromAi,
        status: req.body.status === undefined ? segment.status : (typeof req.body.status === "string" && req.body.status.trim() ? req.body.status.trim() : segment.status),
        updatedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(zoneThematicSegmentsTable.id, id))
      .returning();

    await safeRecordRegulatoryValidationHistory({
      communeId: updated.communeId,
      entityType: "segment",
      entityId: updated.id,
      action: "segment_updated",
      fromStatus: segment.status,
      toStatus: updated.status,
      userId: req.user!.userId,
      snapshot: updated as Record<string, unknown>,
    });

    return res.json({ segment: updated });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/segments PATCH]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de modifier ce segment thématique." });
  }
});

router.delete("/regulatory-calibration/segments/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [segment] = await db.select().from(zoneThematicSegmentsTable).where(eq(zoneThematicSegmentsTable.id, id)).limit(1);
    if (!segment) return res.status(404).json({ error: "SEGMENT_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || segment.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour supprimer ce segment thématique.");
    }

    await db.delete(zoneThematicSegmentsTable).where(eq(zoneThematicSegmentsTable.id, id));
    await safeRecordRegulatoryValidationHistory({
      communeId: segment.communeId,
      entityType: "segment",
      entityId: segment.id,
      action: "segment_deleted",
      fromStatus: segment.status,
      toStatus: null,
      userId: req.user!.userId,
      snapshot: segment as Record<string, unknown>,
    });

    return res.json({ deleted: true, segmentId: id });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/segments DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Suppression du segment impossible." });
  }
});

router.delete("/regulatory-calibration/zones/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [zone] = await db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, id)).limit(1);
    if (!zone) return res.status(404).json({ error: "ZONE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || zone.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour modifier la calibration de cette commune.");
    }

    await db.delete(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, id));
    await recordRegulatoryValidationHistory({
      communeId: zone.communeId,
      entityType: "zone",
      entityId: zone.id,
      action: "zone_deleted",
      userId: req.user!.userId,
      snapshot: zone as Record<string, unknown>,
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/zones DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/regulatory-calibration/rebuild", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour reconstruire ce workspace de calibration.");
    }

    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);
    const docs = await db.select({
      id: townHallDocumentsTable.id,
      title: townHallDocumentsTable.title,
      fileName: townHallDocumentsTable.fileName,
      rawText: townHallDocumentsTable.rawText,
      documentType: townHallDocumentsTable.documentType,
      category: townHallDocumentsTable.category,
      subCategory: townHallDocumentsTable.subCategory,
    }).from(townHallDocumentsTable)
      .where(eq(sql`lower(${townHallDocumentsTable.commune})`, access.targetCommune.toLowerCase()))
      .orderBy(desc(townHallDocumentsTable.createdAt));

    let processedDocumentCount = 0;
    for (const doc of docs) {
      if (!hasUsableTownHallText(doc.rawText)) continue;

      const classification = resolveTownHallClassification({
        rawText: doc.rawText,
        fileName: doc.title || doc.fileName || "document",
        category: doc.category,
        subCategory: doc.subCategory,
        documentType: doc.documentType,
      });
      if (!["plu_reglement", "plu_annexe"].includes(classification.canonicalType)) continue;

      processedDocumentCount += 1;
      await ensureCalibrationZonesForCommune({
        communeKey,
        communeAliases,
        rawText: doc.rawText,
        sourceName: doc.title || doc.fileName || "document",
        sourceType: doc.documentType,
        referenceDocumentId: doc.id,
        userId: req.user!.userId,
      });
    }

    const rebuiltZones = await db.select()
      .from(regulatoryCalibrationZonesTable)
      .where(buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, communeAliases));

    let rebuiltSegmentCount = 0;
    for (const zone of rebuiltZones) {
      if (!zone.referenceDocumentId) continue;
      const [referenceDocument] = await db.select()
        .from(townHallDocumentsTable)
        .where(eq(townHallDocumentsTable.id, zone.referenceDocumentId))
        .limit(1);
      if (!referenceDocument) continue;
      const mappedPages = await buildCalibrationPagesForDocument(referenceDocument, {
        startPage: zone.referenceStartPage,
        endPage: zone.referenceEndPage,
      });
      const rebuilt = await rebuildThematicSegmentsForZone({
        zone,
        referenceDocument,
        pages: mappedPages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
        userId: req.user!.userId,
      });
      rebuiltSegmentCount += rebuilt.createdCount;
    }

    const zoneCount = await db.select({ id: regulatoryCalibrationZonesTable.id })
      .from(regulatoryCalibrationZonesTable)
      .where(buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, communeAliases));

    return res.json({
      success: true,
      processedDocumentCount,
      zoneCount: zoneCount.length,
      segmentCount: rebuiltSegmentCount,
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rebuild POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/regulatory-calibration/overlays", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);
    const overlays = await listCommuneRegulatoryOverlays(communeAliases);

    return res.json({
      commune: access.targetCommune,
      communeId: communeKey,
      overlays: overlays.sort((left, right) => {
        if ((left.priority || 0) !== (right.priority || 0)) return (left.priority || 0) - (right.priority || 0);
        return left.overlayCode.localeCompare(right.overlayCode, "fr");
      }),
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/overlays GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/regulatory-calibration/overlays", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const { communeKey, communeAliases } = await resolveCommuneAliases(access.targetCommune);
    const overlayCode = normalizeConfiguredZoneCode(req.body.overlayCode);
    const overlayType = typeof req.body.overlayType === "string" ? req.body.overlayType.trim() : "";
    if (!overlayCode) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Code de couche invalide." });
    }
    if (!REGULATORY_OVERLAY_TYPES.includes(overlayType as typeof REGULATORY_OVERLAY_TYPES[number])) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Type de couche invalide." });
    }

    const existing = await db.select({ id: regulatoryOverlaysTable.id })
      .from(regulatoryOverlaysTable)
      .where(and(
        buildMunicipalityAliasFilter(regulatoryOverlaysTable.communeId, communeAliases),
        eq(regulatoryOverlaysTable.overlayCode, overlayCode),
      ))
      .limit(1);

    const payload = {
      overlayCode,
      overlayLabel: typeof req.body.overlayLabel === "string" ? req.body.overlayLabel.trim() || null : null,
      overlayType,
      geometryRef: typeof req.body.geometryRef === "string" ? req.body.geometryRef.trim() || null : null,
      guidanceNotes: typeof req.body.guidanceNotes === "string" ? req.body.guidanceNotes.trim() || null : null,
      priority: Number.isFinite(Number(req.body.priority)) ? Number(req.body.priority) : 0,
      status: typeof req.body.status === "string" && req.body.status.trim() ? req.body.status.trim() : "draft",
      isActive: req.body.isActive === false ? false : true,
    };

    let overlay;
    if (existing[0]) {
      [overlay] = await db.update(regulatoryOverlaysTable)
        .set({
          ...payload,
          updatedBy: req.user!.userId,
          updatedAt: new Date(),
        })
        .where(eq(regulatoryOverlaysTable.id, existing[0].id))
        .returning();
      await safeRecordRegulatoryValidationHistory({
        communeId: communeKey,
        entityType: "overlay",
        entityId: overlay.id,
        action: "overlay_updated",
        userId: req.user!.userId,
        snapshot: overlay as Record<string, unknown>,
      });
    } else {
      [overlay] = await db.insert(regulatoryOverlaysTable).values({
        communeId: communeKey,
        ...payload,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      }).returning();
      await safeRecordRegulatoryValidationHistory({
        communeId: communeKey,
        entityType: "overlay",
        entityId: overlay.id,
        action: "overlay_created",
        userId: req.user!.userId,
        snapshot: overlay as Record<string, unknown>,
      });
    }

    return res.json({ overlay });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/overlays POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de créer cette couche réglementaire." });
  }
});

router.patch("/regulatory-calibration/overlays/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [overlay] = await db.select().from(regulatoryOverlaysTable).where(eq(regulatoryOverlaysTable.id, id)).limit(1);
    if (!overlay) return res.status(404).json({ error: "OVERLAY_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || overlay.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);

    const nextType = typeof req.body.overlayType === "string" && req.body.overlayType.trim()
      ? req.body.overlayType.trim()
      : overlay.overlayType;
    if (!REGULATORY_OVERLAY_TYPES.includes(nextType as typeof REGULATORY_OVERLAY_TYPES[number])) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Type de couche invalide." });
    }

    const [updated] = await db.update(regulatoryOverlaysTable)
      .set({
        overlayCode: normalizeConfiguredZoneCode(req.body.overlayCode) || overlay.overlayCode,
        overlayLabel: req.body.overlayLabel === undefined ? overlay.overlayLabel : (typeof req.body.overlayLabel === "string" ? req.body.overlayLabel.trim() || null : null),
        overlayType: nextType,
        geometryRef: req.body.geometryRef === undefined ? overlay.geometryRef : (typeof req.body.geometryRef === "string" ? req.body.geometryRef.trim() || null : null),
        guidanceNotes: req.body.guidanceNotes === undefined ? overlay.guidanceNotes : (typeof req.body.guidanceNotes === "string" ? req.body.guidanceNotes.trim() || null : null),
        priority: req.body.priority === undefined ? overlay.priority : (Number.isFinite(Number(req.body.priority)) ? Number(req.body.priority) : overlay.priority),
        status: req.body.status === undefined ? overlay.status : (typeof req.body.status === "string" && req.body.status.trim() ? req.body.status.trim() : overlay.status),
        isActive: req.body.isActive === undefined ? overlay.isActive : !!req.body.isActive,
        updatedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(regulatoryOverlaysTable.id, id))
      .returning();

    await safeRecordRegulatoryValidationHistory({
      communeId: updated.communeId,
      entityType: "overlay",
      entityId: updated.id,
      action: "overlay_updated",
      userId: req.user!.userId,
      snapshot: updated as Record<string, unknown>,
    });

    return res.json({ overlay: updated });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/overlays PATCH]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Impossible de mettre à jour cette couche réglementaire." });
  }
});

router.delete("/regulatory-calibration/overlays/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [overlay] = await db.select().from(regulatoryOverlaysTable).where(eq(regulatoryOverlaysTable.id, id)).limit(1);
    if (!overlay) return res.status(404).json({ error: "OVERLAY_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || overlay.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);

    await db.delete(regulatoryOverlaysTable).where(eq(regulatoryOverlaysTable.id, id));
    await safeRecordRegulatoryValidationHistory({
      communeId: overlay.communeId,
      entityType: "overlay",
      entityId: overlay.id,
      action: "overlay_deleted",
      userId: req.user!.userId,
      snapshot: overlay as Record<string, unknown>,
    });
    return res.json({ success: true });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/overlays DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Suppression de la couche réglementaire impossible." });
  }
});

router.post("/regulatory-calibration/documents/:id/overlay-bindings", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [doc] = await db.select().from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, id)).limit(1);
    if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || doc.commune || undefined);
    if (!access.ok) return res.status(access.status).json(access.error);
    const { communeKey } = await resolveCommuneAliases(access.targetCommune);

    const overlayId = typeof req.body.overlayId === "string" ? req.body.overlayId.trim() : "";
    if (!overlayId) return res.status(400).json({ error: "BAD_REQUEST", message: "Couche réglementaire obligatoire." });

    const [overlay] = await db.select().from(regulatoryOverlaysTable).where(eq(regulatoryOverlaysTable.id, overlayId)).limit(1);
    if (!overlay || overlay.communeId !== communeKey) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Couche réglementaire invalide pour cette commune." });
    }

    const existing = await db.select({ id: overlayDocumentBindingsTable.id })
      .from(overlayDocumentBindingsTable)
      .where(and(eq(overlayDocumentBindingsTable.overlayId, overlayId), eq(overlayDocumentBindingsTable.documentId, id)))
      .limit(1);

    let binding;
    if (existing[0]) {
      [binding] = await db.update(overlayDocumentBindingsTable)
        .set({
          role: typeof req.body.role === "string" && req.body.role.trim() ? req.body.role.trim() : "supporting",
          structureMode: typeof req.body.structureMode === "string" && req.body.structureMode.trim() ? req.body.structureMode.trim() : "mixed",
          sourcePriority: Number.isFinite(Number(req.body.sourcePriority)) ? Number(req.body.sourcePriority) : 0,
          isPrimary: !!req.body.isPrimary,
          updatedBy: req.user!.userId,
          updatedAt: new Date(),
        })
        .where(eq(overlayDocumentBindingsTable.id, existing[0].id))
        .returning();
      await safeRecordRegulatoryValidationHistory({
        communeId: communeKey,
        entityType: "binding",
        entityId: binding.id,
        action: "overlay_binding_updated",
        userId: req.user!.userId,
        snapshot: binding as Record<string, unknown>,
      });
    } else {
      [binding] = await db.insert(overlayDocumentBindingsTable).values({
        communeId: communeKey,
        overlayId,
        documentId: id,
        role: typeof req.body.role === "string" && req.body.role.trim() ? req.body.role.trim() : "supporting",
        structureMode: typeof req.body.structureMode === "string" && req.body.structureMode.trim() ? req.body.structureMode.trim() : "mixed",
        sourcePriority: Number.isFinite(Number(req.body.sourcePriority)) ? Number(req.body.sourcePriority) : 0,
        isPrimary: !!req.body.isPrimary,
        createdBy: req.user!.userId,
        updatedBy: req.user!.userId,
      }).returning();
      await safeRecordRegulatoryValidationHistory({
        communeId: communeKey,
        entityType: "binding",
        entityId: binding.id,
        action: "overlay_binding_created",
        userId: req.user!.userId,
        snapshot: binding as Record<string, unknown>,
      });
    }

    return res.json({ binding });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/document-overlay-bindings POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/regulatory-calibration/documents/:id/workspace", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [doc] = await db.select().from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, id)).limit(1);
    if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || doc.commune || undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);
    const themes = await ensureRegulatoryThemeTaxonomySeed();
    const pages = splitDocumentIntoCalibrationPages(doc.rawText || "").map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      startOffset: page.startOffset,
      endOffset: page.endOffset,
    }));
    const calibrationData = await listDocumentCalibrationData({ communeAliases, documentId: id });
    const suggestions = await buildCalibrationSuggestionsForDocument({ communeAliases, townHallDocumentId: id });
    const zoneMap = new Map(calibrationData.zones.map((zone) => [zone.id, zone]));
    const overlayMap = new Map(calibrationData.overlays.map((overlay) => [overlay.id, overlay]));
    const docAvailability = await resolveTownHallDocumentAvailability(doc);
    const relations = await hydrateRuleRelations(calibrationData.relations || []);

    return res.json({
      commune: access.targetCommune,
      communeId: communeKey,
      document: {
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        category: doc.category,
        subCategory: doc.subCategory,
        documentType: doc.documentType,
        hasStoredFile: docAvailability.hasStoredFile,
        availabilityStatus: docAvailability.availabilityStatus,
        availabilityMessage: docAvailability.availabilityMessage,
        rawTextLength: (doc.rawText || "").length,
      },
      zones: calibrationData.zones,
      overlays: calibrationData.overlays,
      bindings: calibrationData.bindings,
      themes: themes.map((theme) => ({
        code: theme.code,
        label: theme.label,
        description: theme.description,
        articleHint: theme.articleHint,
      })),
      articleReference: REGULATORY_ARTICLE_REFERENCE,
      pages,
      excerpts: calibrationData.excerpts.map((excerpt) => ({
        ...excerpt,
        zone: excerpt.zoneId ? zoneMap.get(excerpt.zoneId) || null : null,
        overlay: excerpt.overlayId ? overlayMap.get(excerpt.overlayId) || null : null,
        rules: calibrationData.rules.filter((rule) => rule.excerptId === excerpt.id),
        relationSignals: detectRuleRelationSignals(excerpt.sourceText),
      })),
      relations,
      conflicts: calibrationData.conflicts,
      aiSuggestions: suggestions,
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/workspace GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/regulatory-calibration/excerpts", async (req: AuthRequest, res) => {
  try {
    const {
      commune,
      zoneId,
      overlayId,
      documentId,
      articleCode,
      selectionLabel,
      segmentId,
      sourceText,
      sourcePage,
      sourcePageEnd,
      selectionStartOffset,
      selectionEndOffset,
      aiSuggested,
      metadata,
    } = req.body || {};

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, commune);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour créer des extraits calibrés.");
    }
    const { communeKey } = await resolveCommuneAliases(access.targetCommune);

    const [zone, overlay, doc] = await Promise.all([
      zoneId ? db.select().from(regulatoryCalibrationZonesTable).where(eq(regulatoryCalibrationZonesTable.id, zoneId)).limit(1) : Promise.resolve([]),
      overlayId ? db.select().from(regulatoryOverlaysTable).where(eq(regulatoryOverlaysTable.id, overlayId)).limit(1) : Promise.resolve([]),
      db.select().from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, documentId)).limit(1),
    ]);
    const [segment] = typeof segmentId === "string" && segmentId.trim()
      ? await db.select().from(zoneThematicSegmentsTable).where(eq(zoneThematicSegmentsTable.id, segmentId.trim())).limit(1)
      : [];

    if (!zone[0] && !overlay[0]) return res.status(400).json({ error: "BAD_REQUEST", message: "Zone ou couche réglementaire obligatoire." });
    if (zoneId && !zone[0]) return res.status(404).json({ error: "ZONE_NOT_FOUND" });
    if (overlayId && !overlay[0]) return res.status(404).json({ error: "OVERLAY_NOT_FOUND" });
    if (segmentId && !segment) return res.status(404).json({ error: "SEGMENT_NOT_FOUND" });
    if (!doc[0]) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    if (zone[0] && zone[0].communeId !== communeKey) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Zone invalide pour cette commune." });
    }
    if (overlay[0] && overlay[0].communeId !== communeKey) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Couche réglementaire invalide pour cette commune." });
    }
    if (segment && segment.communeId !== communeKey) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Segment invalide pour cette commune." });
    }
    if (!sourceText || String(sourceText).trim().length < 8) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Sélection de texte obligatoire." });
    }
    if (!Number.isFinite(Number(sourcePage)) || Number(sourcePage) <= 0) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Page source obligatoire." });
    }

    const [excerpt] = await db.insert(calibratedExcerptsTable).values({
      communeId: communeKey,
      zoneId: zone[0]?.id || null,
      overlayId: overlay[0]?.id || null,
      segmentId: segment?.id || null,
      documentId,
      articleCode: typeof articleCode === "string" ? articleCode.trim() || null : null,
      selectionLabel: typeof selectionLabel === "string" ? selectionLabel.trim() || null : null,
      sourceText: String(sourceText).trim(),
      normalizedSourceText: normalizeExtractedText(sourceText),
      sourcePage: Number(sourcePage),
      sourcePageEnd: Number.isFinite(Number(sourcePageEnd)) ? Number(sourcePageEnd) : null,
      selectionStartOffset: Number.isFinite(Number(selectionStartOffset)) ? Number(selectionStartOffset) : null,
      selectionEndOffset: Number.isFinite(Number(selectionEndOffset)) ? Number(selectionEndOffset) : null,
      aiSuggested: !!aiSuggested,
      status: "draft",
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      createdBy: req.user!.userId,
      updatedBy: req.user!.userId,
    }).returning();

    await recordRegulatoryValidationHistory({
      communeId: communeKey,
      entityType: "excerpt",
      entityId: excerpt.id,
      action: "excerpt_created",
      toStatus: excerpt.status,
      userId: req.user!.userId,
      snapshot: excerpt as Record<string, unknown>,
    });

    return res.json({ excerpt });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/excerpts POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/regulatory-calibration/excerpts/:id/rules", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [excerpt] = await db.select().from(calibratedExcerptsTable).where(eq(calibratedExcerptsTable.id, id)).limit(1);
    if (!excerpt) return res.status(404).json({ error: "EXCERPT_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || excerpt.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour créer des règles calibrées.");
    }

    const {
      articleCode,
      themeCode,
      ruleLabel,
      operator,
      valueNumeric,
      valueText,
      unit,
      conditionText,
      interpretationNote,
      scopeType,
      overlayType,
      normativeEffect,
      proceduralEffect,
      applicabilityScope,
      ruleAnchorType,
      ruleAnchorLabel,
      conflictResolutionStatus,
      confidenceScore,
      aiSuggested,
      validationNote,
      rawSuggestion,
    } = req.body || {};

    const [excerptOverlay] = excerpt.overlayId
      ? await db.select().from(regulatoryOverlaysTable).where(eq(regulatoryOverlaysTable.id, excerpt.overlayId)).limit(1)
      : [];

    if (!themeCode || typeof themeCode !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Thème métier obligatoire." });
    }
    if (!ruleLabel || typeof ruleLabel !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Libellé de règle obligatoire." });
    }

    const normalizedArticleCode =
      typeof articleCode === "string" && articleCode.trim()
        ? articleCode.trim()
        : (excerpt.articleCode || inferArticleCodeFromCalibrationText(
          typeof ruleAnchorLabel === "string" && ruleAnchorLabel.trim()
            ? ruleAnchorLabel
            : `${ruleLabel}\n${excerpt.sourceText || ""}`,
        ) || null);

    const normalizedRuleAnchorLabel =
      typeof ruleAnchorLabel === "string" && ruleAnchorLabel.trim()
        ? ruleAnchorLabel.trim()
        : (buildReviewedSourceArticle(normalizedArticleCode) || ruleLabel.trim());
    const normalizedRuleAnchorType =
      typeof ruleAnchorType === "string" && ruleAnchorType.trim()
        ? ruleAnchorType.trim()
        : (normalizedArticleCode ? "article" : "free_text_block");

    const excerptMetadata = excerpt.metadata && typeof excerpt.metadata === "object"
      ? excerpt.metadata as Record<string, unknown>
      : {};
    const incomingRawSuggestion = rawSuggestion && typeof rawSuggestion === "object"
      ? rawSuggestion as Record<string, unknown>
      : {};

    const [rule] = await db.insert(indexedRegulatoryRulesTable).values({
      communeId: excerpt.communeId,
      zoneId: excerpt.zoneId,
      overlayId: excerpt.overlayId,
      segmentId: excerpt.segmentId,
      documentId: excerpt.documentId,
      excerptId: excerpt.id,
      articleCode: normalizedArticleCode ?? undefined,
      themeCode: themeCode.trim(),
      ruleLabel: ruleLabel.trim(),
      operator: typeof operator === "string" ? operator.trim() || null : null,
      valueNumeric: parseNullableNumericInput(valueNumeric),
      valueText: typeof valueText === "string" ? valueText.trim() || null : null,
      unit: typeof unit === "string" ? unit.trim() || null : null,
      conditionText: typeof conditionText === "string" ? conditionText.trim() || null : null,
      interpretationNote: typeof interpretationNote === "string" ? interpretationNote.trim() || null : null,
      scopeType: typeof scopeType === "string" && scopeType.trim() ? scopeType.trim() : "zone",
      overlayType: typeof overlayType === "string" && overlayType.trim() ? overlayType.trim() : excerptOverlay?.overlayType || null,
      normativeEffect: typeof normativeEffect === "string" && normativeEffect.trim() ? normativeEffect.trim() : "primary",
      proceduralEffect: typeof proceduralEffect === "string" && proceduralEffect.trim() ? proceduralEffect.trim() : "none",
      applicabilityScope: typeof applicabilityScope === "string" && applicabilityScope.trim() ? applicabilityScope.trim() : "main_zone",
      ruleAnchorType: normalizedRuleAnchorType,
      ruleAnchorLabel: normalizedRuleAnchorLabel,
      conflictResolutionStatus: typeof conflictResolutionStatus === "string" && conflictResolutionStatus.trim() ? conflictResolutionStatus.trim() : "none",
      sourceText: excerpt.sourceText,
      sourcePage: excerpt.sourcePage,
      sourcePageEnd: excerpt.sourcePageEnd,
      confidenceScore: Number.isFinite(Number(confidenceScore)) ? Number(confidenceScore) : 0.5,
      conflictFlag: false,
      status: "draft",
      aiSuggested: !!aiSuggested,
      validationNote: typeof validationNote === "string" ? validationNote.trim() || null : null,
      rawSuggestion: {
        ...incomingRawSuggestion,
        visualCapture: incomingRawSuggestion.visualCapture || excerptMetadata.visualCapture || null,
        visualSupportNote:
          typeof incomingRawSuggestion.visualSupportNote === "string"
            ? incomingRawSuggestion.visualSupportNote
            : null,
      },
      createdBy: req.user!.userId,
      updatedBy: req.user!.userId,
    }).returning();

    await recordRegulatoryValidationHistory({
      communeId: excerpt.communeId,
      entityType: "rule",
      entityId: rule.id,
      action: "rule_created",
      toStatus: rule.status,
      userId: req.user!.userId,
      snapshot: rule as Record<string, unknown>,
    });

    await recomputeIndexedRuleConflicts({
      communeId: excerpt.communeId,
      zoneId: rule.zoneId,
      overlayId: rule.overlayId,
    });
    await recomputeIndexedRuleRelationResolution({ communeId: excerpt.communeId });

    return res.json({ rule });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rules POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.patch("/regulatory-calibration/rules/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [rule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, id)).limit(1);
    if (!rule) return res.status(404).json({ error: "RULE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || rule.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour modifier cette règle.");
    }

    let nextZoneId = rule.zoneId;
    let nextOverlayId = rule.overlayId;
    let nextOverlayType = rule.overlayType;
    if (typeof req.body.zoneId === "string" && req.body.zoneId.trim()) {
      const requestedZoneId = req.body.zoneId.trim();
      const [targetZone] = await db.select()
        .from(regulatoryCalibrationZonesTable)
        .where(eq(regulatoryCalibrationZonesTable.id, requestedZoneId))
        .limit(1);
      if (!targetZone || targetZone.communeId !== rule.communeId) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Zone cible invalide pour cette commune." });
      }
      nextZoneId = targetZone.id;
    } else if (req.body.zoneId === null || req.body.zoneId === "") {
      nextZoneId = null;
    }

    if (typeof req.body.overlayId === "string" && req.body.overlayId.trim()) {
      const requestedOverlayId = req.body.overlayId.trim();
      const [targetOverlay] = await db.select()
        .from(regulatoryOverlaysTable)
        .where(eq(regulatoryOverlaysTable.id, requestedOverlayId))
        .limit(1);
      if (!targetOverlay || targetOverlay.communeId !== rule.communeId) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Couche cible invalide pour cette commune." });
      }
      nextOverlayId = targetOverlay.id;
      nextOverlayType = targetOverlay.overlayType;
    } else if (req.body.overlayId === null || req.body.overlayId === "") {
      nextOverlayId = null;
      nextOverlayType = null;
    }

    if (!nextZoneId && !nextOverlayId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Zone ou couche réglementaire obligatoire." });
    }

    const [updated] = await db.update(indexedRegulatoryRulesTable)
      .set({
        zoneId: nextZoneId,
        overlayId: nextOverlayId,
        articleCode: typeof req.body.articleCode === "string" && req.body.articleCode.trim() ? req.body.articleCode.trim() : rule.articleCode,
        themeCode: typeof req.body.themeCode === "string" && req.body.themeCode.trim() ? req.body.themeCode.trim() : rule.themeCode,
        ruleLabel: typeof req.body.ruleLabel === "string" && req.body.ruleLabel.trim() ? req.body.ruleLabel.trim() : rule.ruleLabel,
        operator: req.body.operator === undefined ? rule.operator : (typeof req.body.operator === "string" ? req.body.operator.trim() || null : null),
        valueNumeric: req.body.valueNumeric === undefined ? rule.valueNumeric : parseNullableNumericInput(req.body.valueNumeric),
        valueText: req.body.valueText === undefined ? rule.valueText : (typeof req.body.valueText === "string" ? req.body.valueText.trim() || null : null),
        unit: req.body.unit === undefined ? rule.unit : (typeof req.body.unit === "string" ? req.body.unit.trim() || null : null),
        conditionText: req.body.conditionText === undefined ? rule.conditionText : (typeof req.body.conditionText === "string" ? req.body.conditionText.trim() || null : null),
        interpretationNote: req.body.interpretationNote === undefined ? rule.interpretationNote : (typeof req.body.interpretationNote === "string" ? req.body.interpretationNote.trim() || null : null),
        scopeType: req.body.scopeType === undefined ? rule.scopeType : (typeof req.body.scopeType === "string" && req.body.scopeType.trim() ? req.body.scopeType.trim() : rule.scopeType),
        overlayType: req.body.overlayType === undefined ? nextOverlayType : (typeof req.body.overlayType === "string" ? req.body.overlayType.trim() || null : null),
        normativeEffect: req.body.normativeEffect === undefined ? rule.normativeEffect : (typeof req.body.normativeEffect === "string" && req.body.normativeEffect.trim() ? req.body.normativeEffect.trim() : rule.normativeEffect),
        proceduralEffect: req.body.proceduralEffect === undefined ? rule.proceduralEffect : (typeof req.body.proceduralEffect === "string" && req.body.proceduralEffect.trim() ? req.body.proceduralEffect.trim() : rule.proceduralEffect),
        applicabilityScope: req.body.applicabilityScope === undefined ? rule.applicabilityScope : (typeof req.body.applicabilityScope === "string" && req.body.applicabilityScope.trim() ? req.body.applicabilityScope.trim() : rule.applicabilityScope),
        ruleAnchorType: req.body.ruleAnchorType === undefined ? rule.ruleAnchorType : (typeof req.body.ruleAnchorType === "string" && req.body.ruleAnchorType.trim() ? req.body.ruleAnchorType.trim() : rule.ruleAnchorType),
        ruleAnchorLabel: req.body.ruleAnchorLabel === undefined ? rule.ruleAnchorLabel : (typeof req.body.ruleAnchorLabel === "string" ? req.body.ruleAnchorLabel.trim() || null : null),
        conflictResolutionStatus: req.body.conflictResolutionStatus === undefined ? rule.conflictResolutionStatus : (typeof req.body.conflictResolutionStatus === "string" && req.body.conflictResolutionStatus.trim() ? req.body.conflictResolutionStatus.trim() : rule.conflictResolutionStatus),
        validationNote: req.body.validationNote === undefined ? rule.validationNote : (typeof req.body.validationNote === "string" ? req.body.validationNote.trim() || null : null),
        updatedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(indexedRegulatoryRulesTable.id, id))
      .returning();

    await recordRegulatoryValidationHistory({
      communeId: updated.communeId,
      entityType: "rule",
      entityId: updated.id,
      action: "rule_updated",
      fromStatus: rule.status,
      toStatus: updated.status,
      userId: req.user!.userId,
      snapshot: updated as Record<string, unknown>,
    });

    await recomputeIndexedRuleConflicts({
      communeId: updated.communeId,
      zoneId: updated.zoneId || rule.zoneId,
      overlayId: updated.overlayId || rule.overlayId,
    });
    await recomputeIndexedRuleRelationResolution({ communeId: updated.communeId });

    return res.json({ rule: updated });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rules PATCH]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/regulatory-calibration/rules/:id/status", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [rule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, id)).limit(1);
    if (!rule) return res.status(404).json({ error: "RULE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || rule.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });

    const allowedStatuses = new Set(["draft", "in_review", "validated", "published"]);
    const nextStatus = allowedStatuses.has(String(req.body.status || "")) ? String(req.body.status) : "draft";
    if (nextStatus === "validated" || nextStatus === "published") {
      if (!permissions.canPublishRules) {
        return denyCalibrationPermission(res, "Vous n’avez pas les droits pour valider ou publier cette règle.");
      }
    } else if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour modifier le statut de cette règle.");
    }

    const inferredArticleCode =
      (typeof rule.articleCode === "string" && rule.articleCode.trim() && rule.articleCode.trim().toLowerCase() !== "manual")
        ? rule.articleCode.trim()
        : (inferArticleCodeFromCalibrationText(rule.ruleAnchorLabel || rule.ruleLabel || rule.sourceText) || null);
    const inferredRuleAnchorLabel =
      (typeof rule.ruleAnchorLabel === "string" && rule.ruleAnchorLabel.trim())
        ? rule.ruleAnchorLabel.trim()
        : (buildReviewedSourceArticle(inferredArticleCode) || rule.ruleLabel || null);

    if (nextStatus === "published") {
      const publicationCheck = validateIndexedRuleForPublication({
        ...rule,
        articleCode: inferredArticleCode || rule.articleCode,
        ruleAnchorLabel: inferredRuleAnchorLabel,
      });
      if (!publicationCheck.ok) {
        return res.status(400).json({ error: "PUBLISH_VALIDATION_FAILED", message: publicationCheck.message });
      }
    }

    const [updated] = await db.update(indexedRegulatoryRulesTable)
      .set({
        articleCode: inferredArticleCode || rule.articleCode,
        ruleAnchorType: inferredRuleAnchorLabel
          ? (rule.ruleAnchorType || (inferredArticleCode ? "article" : "free_text_block"))
          : rule.ruleAnchorType,
        ruleAnchorLabel: inferredRuleAnchorLabel,
        status: nextStatus,
        publishedAt: nextStatus === "published" ? new Date() : null,
        publishedBy: nextStatus === "published" ? req.user!.userId : null,
        validationNote: typeof req.body.validationNote === "string" ? req.body.validationNote.trim() || null : rule.validationNote,
        updatedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(indexedRegulatoryRulesTable.id, id))
      .returning();

    await recordRegulatoryValidationHistory({
      communeId: updated.communeId,
      entityType: "rule",
      entityId: updated.id,
      action: "rule_status_changed",
      fromStatus: rule.status,
      toStatus: nextStatus,
      note: typeof req.body.validationNote === "string" ? req.body.validationNote.trim() || null : null,
      userId: req.user!.userId,
      snapshot: updated as Record<string, unknown>,
    });

    await recomputeIndexedRuleConflicts({
      communeId: updated.communeId,
      zoneId: updated.zoneId,
      overlayId: updated.overlayId,
    });
    await recomputeIndexedRuleRelationResolution({ communeId: updated.communeId });

    return res.json({ rule: updated });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rules/status POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.delete("/regulatory-calibration/rules/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [rule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, id)).limit(1);
    if (!rule) return res.status(404).json({ error: "RULE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || rule.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const permissions = await resolveCalibrationPermissions({
      userId: req.user!.userId,
      role: req.user!.role,
      commune: access.targetCommune,
    });
    if (!permissions.canEditCalibration) {
      return denyCalibrationPermission(res, "Vous n’avez pas les droits pour supprimer cette règle.");
    }

    await db.delete(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, id));

    await safeRecordRegulatoryValidationHistory({
      communeId: rule.communeId,
      entityType: "rule",
      entityId: rule.id,
      action: "rule_deleted",
      fromStatus: rule.status,
      toStatus: null,
      userId: req.user!.userId,
      snapshot: rule as Record<string, unknown>,
    });

    await recomputeIndexedRuleConflicts({
      communeId: rule.communeId,
      zoneId: rule.zoneId,
      overlayId: rule.overlayId,
    });
    await recomputeIndexedRuleRelationResolution({ communeId: rule.communeId });

    return res.json({ deleted: true, ruleId: id });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rules DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Suppression de la règle impossible." });
  }
});

router.post("/regulatory-calibration/rules/:id/relations", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [sourceRule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, id)).limit(1);
    if (!sourceRule) return res.status(404).json({ error: "RULE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || sourceRule.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const { communeAliases } = await resolveCommuneAliases(access.targetCommune);

    const relationType = typeof req.body.relationType === "string" ? req.body.relationType.trim() : "";
    const relationScope = typeof req.body.relationScope === "string" && req.body.relationScope.trim() ? req.body.relationScope.trim() : "rule";
    const targetRuleId = typeof req.body.targetRuleId === "string" && req.body.targetRuleId.trim() ? req.body.targetRuleId.trim() : null;
    let targetDocumentId = typeof req.body.targetDocumentId === "string" && req.body.targetDocumentId.trim() ? req.body.targetDocumentId.trim() : null;

    if (!REGULATORY_RELATION_TYPES.includes(relationType as typeof REGULATORY_RELATION_TYPES[number])) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Type de relation invalide." });
    }
    if (!targetRuleId && !targetDocumentId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Règle cible ou document cible obligatoire." });
    }

    let targetRule: typeof indexedRegulatoryRulesTable.$inferSelect | null = null;
    if (targetRuleId) {
      const [loadedTargetRule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, targetRuleId)).limit(1);
      if (!loadedTargetRule || loadedTargetRule.communeId !== sourceRule.communeId) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Règle cible invalide pour cette commune." });
      }
      if (loadedTargetRule.id === sourceRule.id) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Une règle ne peut pas se lier à elle-même." });
      }
      targetRule = loadedTargetRule;
      targetDocumentId = loadedTargetRule.documentId;
    }

    if (targetDocumentId) {
      const [targetDocument] = await db.select().from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, targetDocumentId)).limit(1);
      if (!targetDocument || !communeAliases.some((alias) => normalizeMunicipalityName(alias) === normalizeMunicipalityName(targetDocument.commune))) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Document cible invalide pour cette commune." });
      }
    }

    const [relation] = await db.insert(ruleRelationsTable).values({
      sourceRuleId: sourceRule.id,
      targetRuleId,
      sourceDocumentId: sourceRule.documentId,
      targetDocumentId,
      relationType,
      relationScope,
      conditionText: typeof req.body.conditionText === "string" ? req.body.conditionText.trim() || null : null,
      priorityNote: typeof req.body.priorityNote === "string" ? req.body.priorityNote.trim() || null : null,
      updatedAt: new Date(),
    }).returning();

    await safeRecordRegulatoryValidationHistory({
      communeId: sourceRule.communeId,
      entityType: "relation",
      entityId: relation.id,
      action: "relation_created",
      userId: req.user!.userId,
      snapshot: relation as Record<string, unknown>,
    });

    await recomputeIndexedRuleRelationResolution({ communeId: sourceRule.communeId });

    return res.json({ relation });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rule-relations POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Création de la relation impossible." });
  }
});

router.patch("/regulatory-calibration/rule-relations/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [relation] = await db.select().from(ruleRelationsTable).where(eq(ruleRelationsTable.id, id)).limit(1);
    if (!relation) return res.status(404).json({ error: "RULE_RELATION_NOT_FOUND" });

    const [sourceRule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, relation.sourceRuleId)).limit(1);
    if (!sourceRule) return res.status(404).json({ error: "RULE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined || sourceRule.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);
    const { communeAliases } = await resolveCommuneAliases(access.targetCommune);

    const nextRelationType = typeof req.body.relationType === "string" && req.body.relationType.trim()
      ? req.body.relationType.trim()
      : relation.relationType;
    if (!REGULATORY_RELATION_TYPES.includes(nextRelationType as typeof REGULATORY_RELATION_TYPES[number])) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Type de relation invalide." });
    }

    let nextTargetRuleId = relation.targetRuleId;
    let nextTargetDocumentId = relation.targetDocumentId;
    if (typeof req.body.targetRuleId === "string" && req.body.targetRuleId.trim()) {
      const requestedTargetRuleId = req.body.targetRuleId.trim();
      const [targetRule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, requestedTargetRuleId)).limit(1);
      if (!targetRule || targetRule.communeId !== sourceRule.communeId) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Règle cible invalide pour cette commune." });
      }
      if (targetRule.id === sourceRule.id) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Une règle ne peut pas se lier à elle-même." });
      }
      nextTargetRuleId = targetRule.id;
      nextTargetDocumentId = targetRule.documentId;
    } else if (req.body.targetRuleId === null || req.body.targetRuleId === "") {
      nextTargetRuleId = null;
    }

    if (typeof req.body.targetDocumentId === "string" && req.body.targetDocumentId.trim()) {
      const requestedTargetDocumentId = req.body.targetDocumentId.trim();
      const [targetDocument] = await db.select().from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, requestedTargetDocumentId)).limit(1);
      if (!targetDocument || !communeAliases.some((alias) => normalizeMunicipalityName(alias) === normalizeMunicipalityName(targetDocument.commune))) {
        return res.status(400).json({ error: "BAD_REQUEST", message: "Document cible invalide pour cette commune." });
      }
      nextTargetDocumentId = requestedTargetDocumentId;
    } else if ((req.body.targetDocumentId === null || req.body.targetDocumentId === "") && !nextTargetRuleId) {
      nextTargetDocumentId = null;
    }

    if (!nextTargetRuleId && !nextTargetDocumentId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Règle cible ou document cible obligatoire." });
    }

    const [updated] = await db.update(ruleRelationsTable)
      .set({
        targetRuleId: nextTargetRuleId,
        targetDocumentId: nextTargetDocumentId,
        relationType: nextRelationType,
        relationScope: typeof req.body.relationScope === "string" && req.body.relationScope.trim() ? req.body.relationScope.trim() : relation.relationScope,
        conditionText: req.body.conditionText === undefined ? relation.conditionText : (typeof req.body.conditionText === "string" ? req.body.conditionText.trim() || null : null),
        priorityNote: req.body.priorityNote === undefined ? relation.priorityNote : (typeof req.body.priorityNote === "string" ? req.body.priorityNote.trim() || null : null),
        updatedAt: new Date(),
      })
      .where(eq(ruleRelationsTable.id, id))
      .returning();

    await safeRecordRegulatoryValidationHistory({
      communeId: sourceRule.communeId,
      entityType: "relation",
      entityId: updated.id,
      action: "relation_updated",
      userId: req.user!.userId,
      snapshot: updated as Record<string, unknown>,
    });

    await recomputeIndexedRuleRelationResolution({ communeId: sourceRule.communeId });

    return res.json({ relation: updated });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rule-relations PATCH]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Modification de la relation impossible." });
  }
});

router.delete("/regulatory-calibration/rule-relations/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [relation] = await db.select().from(ruleRelationsTable).where(eq(ruleRelationsTable.id, id)).limit(1);
    if (!relation) return res.status(404).json({ error: "RULE_RELATION_NOT_FOUND" });

    const [sourceRule] = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.id, relation.sourceRuleId)).limit(1);
    if (!sourceRule) return res.status(404).json({ error: "RULE_NOT_FOUND" });

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || sourceRule.communeId);
    if (!access.ok) return res.status(access.status).json(access.error);

    await db.delete(ruleRelationsTable).where(eq(ruleRelationsTable.id, id));

    await safeRecordRegulatoryValidationHistory({
      communeId: sourceRule.communeId,
      entityType: "relation",
      entityId: relation.id,
      action: "relation_deleted",
      userId: req.user!.userId,
      snapshot: relation as Record<string, unknown>,
    });

    await recomputeIndexedRuleRelationResolution({ communeId: sourceRule.communeId });

    return res.json({ deleted: true, relationId: id });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/rule-relations DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Suppression de la relation impossible." });
  }
});

router.get("/regulatory-calibration/library", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) return res.status(access.status).json(access.error);

    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);
    const visibility = String(req.query.visibility || "internal");

    const themes = await ensureRegulatoryThemeTaxonomySeed();
    const themeMap = new Map(themes.map((theme) => [theme.code, theme]));

    const baseRuleQuery = db.select({
      id: indexedRegulatoryRulesTable.id,
      communeId: indexedRegulatoryRulesTable.communeId,
      zoneId: indexedRegulatoryRulesTable.zoneId,
      overlayId: indexedRegulatoryRulesTable.overlayId,
      articleCode: indexedRegulatoryRulesTable.articleCode,
      themeCode: indexedRegulatoryRulesTable.themeCode,
      ruleLabel: indexedRegulatoryRulesTable.ruleLabel,
      operator: indexedRegulatoryRulesTable.operator,
      valueNumeric: indexedRegulatoryRulesTable.valueNumeric,
      valueText: indexedRegulatoryRulesTable.valueText,
      unit: indexedRegulatoryRulesTable.unit,
      conditionText: indexedRegulatoryRulesTable.conditionText,
      interpretationNote: indexedRegulatoryRulesTable.interpretationNote,
      sourceText: indexedRegulatoryRulesTable.sourceText,
      sourcePage: indexedRegulatoryRulesTable.sourcePage,
      sourcePageEnd: indexedRegulatoryRulesTable.sourcePageEnd,
      confidenceScore: indexedRegulatoryRulesTable.confidenceScore,
      conflictFlag: indexedRegulatoryRulesTable.conflictFlag,
      status: indexedRegulatoryRulesTable.status,
      publishedAt: indexedRegulatoryRulesTable.publishedAt,
      zoneCode: regulatoryCalibrationZonesTable.zoneCode,
      zoneLabel: regulatoryCalibrationZonesTable.zoneLabel,
      overlayCode: regulatoryOverlaysTable.overlayCode,
      overlayLabel: regulatoryOverlaysTable.overlayLabel,
      overlayType: sql<string | null>`coalesce(${indexedRegulatoryRulesTable.overlayType}, ${regulatoryOverlaysTable.overlayType})`,
      normativeEffect: indexedRegulatoryRulesTable.normativeEffect,
      proceduralEffect: indexedRegulatoryRulesTable.proceduralEffect,
      applicabilityScope: indexedRegulatoryRulesTable.applicabilityScope,
      ruleAnchorType: indexedRegulatoryRulesTable.ruleAnchorType,
      ruleAnchorLabel: indexedRegulatoryRulesTable.ruleAnchorLabel,
      conflictResolutionStatus: indexedRegulatoryRulesTable.conflictResolutionStatus,
      isRelationalRule: indexedRegulatoryRulesTable.isRelationalRule,
      requiresCrossDocumentResolution: indexedRegulatoryRulesTable.requiresCrossDocumentResolution,
      resolutionStatus: indexedRegulatoryRulesTable.resolutionStatus,
      linkedRuleCount: indexedRegulatoryRulesTable.linkedRuleCount,
      rawSuggestion: indexedRegulatoryRulesTable.rawSuggestion,
      documentTitle: townHallDocumentsTable.title,
    })
      .from(indexedRegulatoryRulesTable)
      .leftJoin(regulatoryCalibrationZonesTable, eq(indexedRegulatoryRulesTable.zoneId, regulatoryCalibrationZonesTable.id))
      .leftJoin(regulatoryOverlaysTable, eq(indexedRegulatoryRulesTable.overlayId, regulatoryOverlaysTable.id))
      .leftJoin(townHallDocumentsTable, eq(indexedRegulatoryRulesTable.documentId, townHallDocumentsTable.id))
      .where(
        and(
          buildMunicipalityAliasFilter(indexedRegulatoryRulesTable.communeId, communeAliases),
          visibility === "published"
            ? eq(indexedRegulatoryRulesTable.status, "published")
            : sql`TRUE`,
        ),
      )
      .orderBy(desc(indexedRegulatoryRulesTable.updatedAt));

    const [rules, conflicts, history] = await Promise.all([
      baseRuleQuery,
      db.select().from(regulatoryRuleConflictsTable)
        .where(buildMunicipalityAliasFilter(regulatoryRuleConflictsTable.communeId, communeAliases))
        .orderBy(desc(regulatoryRuleConflictsTable.updatedAt)),
      db.select().from(regulatoryValidationHistoryTable)
        .where(buildMunicipalityAliasFilter(regulatoryValidationHistoryTable.communeId, communeAliases))
        .orderBy(desc(regulatoryValidationHistoryTable.createdAt))
        .limit(40),
    ]);
    const relations = await hydrateRuleRelations(
      rules.length > 0
        ? await db.select().from(ruleRelationsTable).where(
            or(
              inArray(ruleRelationsTable.sourceRuleId, rules.map((rule) => rule.id)),
              inArray(ruleRelationsTable.targetRuleId, rules.map((rule) => rule.id)),
            )!,
          )
        : [],
    );

    return res.json({
      commune: access.targetCommune,
      communeId: communeKey,
      visibility,
      summary: {
        ruleCount: rules.length,
        publishedCount: rules.filter((rule) => rule.status === "published").length,
        conflictCount: conflicts.filter((conflict) => conflict.status === "open").length,
        relationCount: relations.length,
        historyCount: history.length,
      },
      rules: rules.map((rule) => ({
        ...rule,
        themeLabel: themeMap.get(rule.themeCode)?.label || rule.themeCode,
        visualCapture:
          rule.rawSuggestion && typeof rule.rawSuggestion === "object" && (rule.rawSuggestion as Record<string, unknown>).visualCapture
            ? (rule.rawSuggestion as Record<string, unknown>).visualCapture
            : null,
        visualSupportNote:
          rule.rawSuggestion && typeof rule.rawSuggestion === "object" && typeof (rule.rawSuggestion as Record<string, unknown>).visualSupportNote === "string"
            ? String((rule.rawSuggestion as Record<string, unknown>).visualSupportNote)
            : null,
      })),
      relations,
      conflicts,
      history,
    });
  } catch (err) {
    logger.error("[mairie/regulatory-calibration/library GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/plu-zone-reviews", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const targetCommune = access.targetCommune;
    const inseeCode = await resolveInseeCode(targetCommune);
    const municipalityAliases = Array.from(new Set([targetCommune, inseeCode].filter((value): value is string => !!value)));

    const docs = await db.select({
      id: townHallDocumentsTable.id,
      title: townHallDocumentsTable.title,
      fileName: townHallDocumentsTable.fileName,
      hasStoredBlob: townHallDocumentsTable.hasStoredBlob,
      commune: townHallDocumentsTable.commune,
      documentType: townHallDocumentsTable.documentType,
      category: townHallDocumentsTable.category,
      subCategory: townHallDocumentsTable.subCategory,
      createdAt: townHallDocumentsTable.createdAt,
      rawText: townHallDocumentsTable.rawText,
      isOpposable: townHallDocumentsTable.isOpposable,
    }).from(townHallDocumentsTable)
      .where(eq(sql`lower(${townHallDocumentsTable.commune})`, targetCommune.toLowerCase()))
      .orderBy(desc(townHallDocumentsTable.createdAt));

    const docById = new Map(docs.map((doc) => [doc.id, doc]));
    const latestDocIdBySignature = new Map<string, string>();

    for (const doc of docs) {
      const classification = await maybeSyncTownHallDocumentClassification(doc);
      const signature = buildTownHallDocumentVersionSignature({
        title: doc.title,
        fileName: doc.fileName,
        canonicalType: classification.canonicalType,
      });

      if (!latestDocIdBySignature.has(signature)) {
        latestDocIdBySignature.set(signature, doc.id);
      }
    }
    const latestDocIds = new Set(latestDocIdBySignature.values());

    let allSections = await db.select().from(regulatoryZoneSectionsTable)
      .where(
        and(
          inArray(regulatoryZoneSectionsTable.municipalityId, municipalityAliases),
          eq(regulatoryZoneSectionsTable.isOpposable, true)
        )
      )
      .orderBy(
        desc(regulatoryZoneSectionsTable.reviewedAt),
        desc(regulatoryZoneSectionsTable.updatedAt)
      );

    if (allSections.length === 0) {
      const municipalityKey = inseeCode || targetCommune;
      for (const doc of docs) {
        const classification = await maybeSyncTownHallDocumentClassification(doc);
        const canonicalType = classification.canonicalType;
        if (!["plu_reglement", "plu_annexe"].includes(canonicalType)) continue;
        if (!hasUsableTownHallText(doc.rawText)) continue;
        await persistRegulatoryZoneSectionsForDocument({
          townHallDocumentId: doc.id,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          sourceAuthority: authorityForCanonicalType(canonicalType),
          isOpposable: !!doc.isOpposable,
          rawText: doc.rawText,
        });
        await persistStructuredKnowledgeForDocument({
          townHallDocumentId: doc.id,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          documentSubtype: classification.resolved.documentType || null,
          sourceName: doc.title,
          sourceAuthority: authorityForCanonicalType(canonicalType),
          opposable: classification.isOpposable,
          rawText: doc.rawText,
          rawClassification: {
            category: classification.resolved.category,
            subCategory: classification.resolved.subCategory,
            requestedDocumentType: doc.documentType,
            resolvedDocumentType: classification.resolved.documentType,
            autoCorrected: classification.autoCorrected,
            source: "rule_review_backfill",
          },
        });
      }

      allSections = await db.select().from(regulatoryZoneSectionsTable)
        .where(
          and(
            inArray(regulatoryZoneSectionsTable.municipalityId, municipalityAliases),
            eq(regulatoryZoneSectionsTable.isOpposable, true)
          )
        )
        .orderBy(
          desc(regulatoryZoneSectionsTable.reviewedAt),
          desc(regulatoryZoneSectionsTable.updatedAt)
        );
    }

    const visibleSections = allSections.filter((section) => section.reviewStatus !== "rejected");

    const sectionsWithDocs = visibleSections.map((section) => {
      const linkedDoc = section.townHallDocumentId ? docById.get(section.townHallDocumentId) : null;
      const quality = linkedDoc ? getTownHallDocumentAvailability(linkedDoc) : null;
      const classification = linkedDoc
        ? resolveTownHallClassification({
            rawText: linkedDoc.rawText || "",
            fileName: linkedDoc.title || linkedDoc.fileName || "document",
            category: linkedDoc.category,
            subCategory: linkedDoc.subCategory,
            documentType: linkedDoc.documentType,
          })
        : null;
      const effectiveZoneCode = section.reviewedZoneCode || section.zoneCode;
      return {
        id: section.id,
        zoneCode: effectiveZoneCode,
        parentZoneCode: section.reviewedParentZoneCode || section.parentZoneCode,
        heading: section.heading,
        startPage: section.reviewedStartPage ?? section.startPage,
        endPage: section.reviewedEndPage ?? section.endPage,
        sourceText: section.sourceText || null,
        isSubZone: section.reviewedIsSubZone ?? section.isSubZone,
        documentType: section.documentType,
        sourceAuthority: section.sourceAuthority,
        reviewStatus: section.reviewStatus,
        reviewNotes: section.reviewNotes,
        reviewedAt: section.reviewedAt,
        document: linkedDoc ? {
          id: linkedDoc.id,
          title: linkedDoc.title,
          documentType: classification?.resolved.documentType || linkedDoc.documentType,
          textQualityLabel: quality?.textQualityLabel ?? null,
          textQualityScore: quality?.textQualityScore ?? null,
          isOpposable: linkedDoc.isOpposable,
        } : null,
      };
    }).filter((section) => !!section.document && latestDocIds.has(section.document.id));

    const reviewableSections = sectionsWithDocs.filter((section) => !!section.document);
    const resolvedDocs = docs.map((doc) => resolveTownHallClassification({
      rawText: doc.rawText || "",
      fileName: doc.title || doc.fileName || "document",
      category: doc.category,
      subCategory: doc.subCategory,
      documentType: doc.documentType,
    }));
    const readyStatus = (() => {
      if (reviewableSections.length === 0) return "missing";
      const validatedCount = reviewableSections.filter((section) => section.reviewStatus === "validated").length;
      const criticalZonesCount = new Set(reviewableSections.map((section) => section.zoneCode)).size;
      if (validatedCount >= Math.max(1, criticalZonesCount)) return "ready";
      if (validatedCount > 0) return "partial";
      return "needs_review";
    })();

    return res.json({
      commune: targetCommune,
      municipalityId: inseeCode || targetCommune,
      summary: {
        writtenRegulationCount: resolvedDocs.filter((doc) => inferCanonicalDocumentType(doc.resolved.documentType, doc.resolved.category, doc.resolved.subCategory) === "plu_reglement").length,
        opposableDocumentCount: resolvedDocs.filter((doc) => isCanonicalTypeOpposable(inferCanonicalDocumentType(doc.resolved.documentType, doc.resolved.category, doc.resolved.subCategory))).length,
        zoneSectionCount: reviewableSections.length,
        validatedZoneCount: reviewableSections.filter((section) => section.reviewStatus === "validated").length,
        pendingZoneCount: reviewableSections.filter((section) => section.reviewStatus === "to_review" || section.reviewStatus === "auto").length,
        readyStatus,
      },
      sections: sectionsWithDocs,
    });
  } catch (err) {
    logger.error("[mairie/plu-zone-reviews GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/plu-zone-reviews/:id/review", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const {
      reviewStatus,
      reviewNotes,
      reviewedZoneCode,
      reviewedStartPage,
      reviewedEndPage,
      reviewedParentZoneCode,
      reviewedIsSubZone,
    } = req.body || {};

    const [section] = await db.select({
      id: regulatoryZoneSectionsTable.id,
      municipalityId: regulatoryZoneSectionsTable.municipalityId,
      zoneCode: regulatoryZoneSectionsTable.zoneCode,
      heading: regulatoryZoneSectionsTable.heading,
      reviewedZoneCode: regulatoryZoneSectionsTable.reviewedZoneCode,
      reviewedStartPage: regulatoryZoneSectionsTable.reviewedStartPage,
      reviewedEndPage: regulatoryZoneSectionsTable.reviewedEndPage,
      reviewedParentZoneCode: regulatoryZoneSectionsTable.reviewedParentZoneCode,
      reviewedIsSubZone: regulatoryZoneSectionsTable.reviewedIsSubZone,
      baseIADocumentId: regulatoryZoneSectionsTable.baseIADocumentId,
      townHallDocumentId: regulatoryZoneSectionsTable.townHallDocumentId,
    }).from(regulatoryZoneSectionsTable)
      .where(eq(regulatoryZoneSectionsTable.id, id))
      .limit(1);

    if (!section) {
      return res.status(404).json({ error: "ZONE_SECTION_NOT_FOUND" });
    }

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || section.municipalityId);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }
    const { communeAliases, communeKey } = await resolveCommuneAliases(access.targetCommune);

    const allowedStatuses = new Set(["auto", "validated", "to_review", "rejected"]);
    const nextStatus = allowedStatuses.has(String(reviewStatus || "")) ? String(reviewStatus) : "validated";
    const nextReviewedZoneCode =
      reviewedZoneCode === undefined
        ? section.reviewedZoneCode
        : normalizeConfiguredZoneCode(reviewedZoneCode);
    const nextReviewedParentZoneCode =
      reviewedParentZoneCode === undefined
        ? section.reviewedParentZoneCode
        : normalizeConfiguredZoneCode(reviewedParentZoneCode) ?? (nextReviewedZoneCode ? deriveParentZoneCode(nextReviewedZoneCode) : null);
    const nextReviewedIsSubZone =
      reviewedIsSubZone === undefined
        ? section.reviewedIsSubZone
        : typeof reviewedIsSubZone === "boolean"
        ? reviewedIsSubZone
        : nextReviewedZoneCode
          ? nextReviewedParentZoneCode !== null
          : null;
    const previousEffectiveZoneCode = section.reviewedZoneCode || section.zoneCode;
    const nextEffectiveZoneCode = nextReviewedZoneCode || section.zoneCode;

    const relatedUnitFilter = and(
      eq(regulatoryUnitsTable.municipalityId, section.municipalityId),
      eq(regulatoryUnitsTable.zoneCode, previousEffectiveZoneCode),
      section.baseIADocumentId
        ? eq(regulatoryUnitsTable.baseIADocumentId, section.baseIADocumentId)
        : section.townHallDocumentId
          ? eq(regulatoryUnitsTable.townHallDocumentId, section.townHallDocumentId)
          : sql`TRUE`
    );

    const relatedUrbanRuleFilter = and(
      eq(urbanRulesTable.municipalityId, section.municipalityId),
      eq(urbanRulesTable.zoneCode, previousEffectiveZoneCode),
      section.baseIADocumentId
        ? eq(urbanRulesTable.baseIADocumentId, section.baseIADocumentId)
        : section.townHallDocumentId
          ? eq(urbanRulesTable.townHallDocumentId, section.townHallDocumentId)
          : sql`TRUE`
    );

    await db.transaction(async (tx) => {
      await tx.update(regulatoryZoneSectionsTable)
        .set({
          reviewStatus: nextStatus,
          reviewNotes: typeof reviewNotes === "string" ? reviewNotes.trim() || null : null,
          reviewedZoneCode: nextReviewedZoneCode,
          reviewedStartPage:
            reviewedStartPage === undefined
              ? section.reviewedStartPage
              : Number.isFinite(Number(reviewedStartPage))
                ? Number(reviewedStartPage)
                : null,
          reviewedEndPage:
            reviewedEndPage === undefined
              ? section.reviewedEndPage
              : Number.isFinite(Number(reviewedEndPage))
                ? Number(reviewedEndPage)
                : null,
          reviewedParentZoneCode: nextReviewedParentZoneCode,
          reviewedIsSubZone: nextReviewedIsSubZone,
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(regulatoryZoneSectionsTable.id, id));

      const relatedUnits = await tx.select({
        id: regulatoryUnitsTable.id,
        parsedValues: regulatoryUnitsTable.parsedValues,
      }).from(regulatoryUnitsTable)
        .where(relatedUnitFilter);

      for (const unit of relatedUnits) {
        const parsedValues =
          unit.parsedValues && typeof unit.parsedValues === "object" && !Array.isArray(unit.parsedValues)
            ? { ...(unit.parsedValues as Record<string, unknown>) }
            : {};
        parsedValues.zone_code = nextEffectiveZoneCode;
        parsedValues.parent_zone_code = nextReviewedParentZoneCode;

        await tx.update(regulatoryUnitsTable)
          .set({
            zoneCode: nextEffectiveZoneCode,
            parsedValues,
            updatedAt: new Date(),
          })
          .where(eq(regulatoryUnitsTable.id, unit.id));
      }

      await tx.update(urbanRulesTable)
        .set({
          zoneCode: nextEffectiveZoneCode,
          subzoneCode: nextReviewedIsSubZone ? nextEffectiveZoneCode : null,
          updatedAt: new Date(),
        })
        .where(relatedUrbanRuleFilter);

      if (nextStatus === "validated" && nextEffectiveZoneCode) {
        const [existingZone] = await tx.select({
          id: regulatoryCalibrationZonesTable.id,
        }).from(regulatoryCalibrationZonesTable)
          .where(
            and(
              buildMunicipalityAliasFilter(regulatoryCalibrationZonesTable.communeId, communeAliases),
              eq(regulatoryCalibrationZonesTable.zoneCode, nextEffectiveZoneCode),
            ),
          )
          .limit(1);

        const nextReferenceStartPage =
          reviewedStartPage === undefined
            ? section.reviewedStartPage ?? null
            : Number.isFinite(Number(reviewedStartPage))
              ? Number(reviewedStartPage)
              : null;
        const nextReferenceEndPage =
          reviewedEndPage === undefined
            ? section.reviewedEndPage ?? null
            : Number.isFinite(Number(reviewedEndPage))
              ? Number(reviewedEndPage)
              : null;

        if (existingZone) {
          await tx.update(regulatoryCalibrationZonesTable)
            .set({
              parentZoneCode: nextReviewedParentZoneCode,
              guidanceNotes: sql`coalesce(${regulatoryCalibrationZonesTable.guidanceNotes}, ${section.heading})`,
              referenceDocumentId: section.townHallDocumentId || null,
              referenceStartPage: nextReferenceStartPage,
              referenceEndPage: nextReferenceEndPage,
              isActive: true,
              updatedBy: req.user!.userId,
              updatedAt: new Date(),
            })
            .where(eq(regulatoryCalibrationZonesTable.id, existingZone.id));
        } else {
          await tx.insert(regulatoryCalibrationZonesTable).values({
            communeId: communeKey,
            zoneCode: nextEffectiveZoneCode,
            zoneLabel: nextEffectiveZoneCode ? `Zone ${nextEffectiveZoneCode}` : section.heading,
            parentZoneCode: nextReviewedParentZoneCode,
            guidanceNotes: section.heading || null,
            referenceDocumentId: section.townHallDocumentId || null,
            referenceStartPage: nextReferenceStartPage,
            referenceEndPage: nextReferenceEndPage,
            displayOrder: 0,
            isActive: true,
            createdBy: req.user!.userId,
            updatedBy: req.user!.userId,
          });
        }
      }
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error("[mairie/plu-zone-reviews POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.delete("/plu-zone-reviews/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    const [section] = await db.select({
      id: regulatoryZoneSectionsTable.id,
      municipalityId: regulatoryZoneSectionsTable.municipalityId,
      zoneCode: regulatoryZoneSectionsTable.zoneCode,
      reviewedZoneCode: regulatoryZoneSectionsTable.reviewedZoneCode,
      baseIADocumentId: regulatoryZoneSectionsTable.baseIADocumentId,
      townHallDocumentId: regulatoryZoneSectionsTable.townHallDocumentId,
    }).from(regulatoryZoneSectionsTable)
      .where(eq(regulatoryZoneSectionsTable.id, id))
      .limit(1);

    if (!section) {
      return res.status(404).json({ error: "ZONE_SECTION_NOT_FOUND" });
    }

    const access = await resolveAuthorizedTownHallCommune(
      req.user!.userId,
      req.query.commune as string | undefined || section.municipalityId,
    );
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const effectiveZoneCodes = Array.from(new Set([section.zoneCode, section.reviewedZoneCode].filter((value): value is string => !!value)));

    const relatedUnitFilter = and(
      eq(regulatoryUnitsTable.municipalityId, section.municipalityId),
      effectiveZoneCodes.length > 0 ? inArray(regulatoryUnitsTable.zoneCode, effectiveZoneCodes) : sql`TRUE`,
      section.baseIADocumentId
        ? eq(regulatoryUnitsTable.baseIADocumentId, section.baseIADocumentId)
        : section.townHallDocumentId
          ? eq(regulatoryUnitsTable.townHallDocumentId, section.townHallDocumentId)
          : sql`TRUE`
    );

    const relatedUrbanRuleFilter = and(
      eq(urbanRulesTable.municipalityId, section.municipalityId),
      effectiveZoneCodes.length > 0 ? inArray(urbanRulesTable.zoneCode, effectiveZoneCodes) : sql`TRUE`,
      section.baseIADocumentId
        ? eq(urbanRulesTable.baseIADocumentId, section.baseIADocumentId)
        : section.townHallDocumentId
          ? eq(urbanRulesTable.townHallDocumentId, section.townHallDocumentId)
          : sql`TRUE`
    );

    await db.transaction(async (tx) => {
      await tx.update(regulatoryZoneSectionsTable)
        .set({
          isOpposable: false,
          reviewStatus: "rejected",
          reviewNotes: section.reviewedZoneCode
            ? `Section supprimée manuellement (${section.reviewedZoneCode}).`
            : "Section supprimée manuellement.",
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(regulatoryZoneSectionsTable.id, id));
      await tx.delete(regulatoryUnitsTable).where(relatedUnitFilter);
      await tx.delete(urbanRulesTable).where(relatedUrbanRuleFilter);
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error("[mairie/plu-zone-reviews DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/plu-rule-reviews", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const targetCommune = access.targetCommune;
    const inseeCode = await resolveInseeCode(targetCommune);
    const municipalityAliases = Array.from(new Set([targetCommune, inseeCode].filter((value): value is string => !!value)));

    const docs = await db.select({
      id: townHallDocumentsTable.id,
      title: townHallDocumentsTable.title,
      commune: townHallDocumentsTable.commune,
      documentType: townHallDocumentsTable.documentType,
      category: townHallDocumentsTable.category,
      subCategory: townHallDocumentsTable.subCategory,
      createdAt: townHallDocumentsTable.createdAt,
      rawText: townHallDocumentsTable.rawText,
      fileName: townHallDocumentsTable.fileName,
      hasStoredBlob: townHallDocumentsTable.hasStoredBlob,
      isOpposable: townHallDocumentsTable.isOpposable,
    }).from(townHallDocumentsTable)
      .where(eq(sql`lower(${townHallDocumentsTable.commune})`, targetCommune.toLowerCase()))
      .orderBy(desc(townHallDocumentsTable.createdAt));

    const docById = new Map(docs.map((doc) => [doc.id, doc]));

    let rules = await db.select().from(urbanRulesTable)
      .where(
        and(
          inArray(urbanRulesTable.municipalityId, municipalityAliases),
          eq(urbanRulesTable.isOpposable, true),
          ne(urbanRulesTable.reviewStatus, "rejected")
        )
      )
      .orderBy(
        desc(urbanRulesTable.rulePriority),
        desc(urbanRulesTable.sourceAuthority),
        desc(urbanRulesTable.confidenceScore),
        desc(urbanRulesTable.updatedAt)
      );

    if (rules.length === 0) {
      const municipalityKey = inseeCode || targetCommune;
      for (const doc of docs) {
        const classification = await maybeSyncTownHallDocumentClassification(doc);
        const canonicalType = classification.canonicalType;
        if (!["plu_reglement", "plu_annexe", "oap"].includes(canonicalType)) continue;
        if (!hasUsableTownHallText(doc.rawText)) continue;
        await persistRegulatoryUnitsForDocument({
          townHallDocumentId: doc.id,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          sourceAuthority: authorityForCanonicalType(canonicalType),
          isOpposable: !!doc.isOpposable,
          rawText: doc.rawText,
        });
        await persistStructuredKnowledgeForDocument({
          townHallDocumentId: doc.id,
          municipalityId: municipalityKey,
          documentType: canonicalType,
          documentSubtype: classification.resolved.documentType || null,
          sourceName: doc.title,
          sourceAuthority: authorityForCanonicalType(canonicalType),
          opposable: classification.isOpposable,
          rawText: doc.rawText,
          rawClassification: {
            category: classification.resolved.category,
            subCategory: classification.resolved.subCategory,
            requestedDocumentType: doc.documentType,
            resolvedDocumentType: classification.resolved.documentType,
            autoCorrected: classification.autoCorrected,
            source: "rule_review_backfill",
          },
        });
      }

      rules = await db.select().from(urbanRulesTable)
        .where(
          and(
            inArray(urbanRulesTable.municipalityId, municipalityAliases),
            eq(urbanRulesTable.isOpposable, true),
            ne(urbanRulesTable.reviewStatus, "rejected")
          )
        )
        .orderBy(
          desc(urbanRulesTable.rulePriority),
          desc(urbanRulesTable.sourceAuthority),
          desc(urbanRulesTable.confidenceScore),
          desc(urbanRulesTable.updatedAt)
        );
    }

    const grouped = new Map<string, typeof rules[number]>();
    for (const rule of rules) {
      const groupKey = `${rule.zoneCode || "GLOBAL"}|${rule.ruleFamily}|${rule.ruleTopic}`;
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, rule);
        continue;
      }
      const currentScore =
        (rule.reviewStatus === "validated" ? 100 : rule.reviewStatus === "to_review" ? 50 : 0) +
        rule.rulePriority +
        rule.sourceAuthority * 10 +
        Math.round((rule.confidenceScore ?? 0) * 10);
      const existingScore =
        (existing.reviewStatus === "validated" ? 100 : existing.reviewStatus === "to_review" ? 50 : existing.reviewStatus === "rejected" ? -10 : 0) +
        existing.rulePriority +
        existing.sourceAuthority * 10 +
        Math.round((existing.confidenceScore ?? 0) * 10);
      if (currentScore > existingScore) {
        grouped.set(groupKey, rule);
      }
    }

    const reviewedRules = Array.from(grouped.values())
      .map((rule) => {
        const linkedDoc = rule.townHallDocumentId ? docById.get(rule.townHallDocumentId) : null;
        const quality = linkedDoc ? getTownHallDocumentAvailability(linkedDoc) : null;
        return {
          id: rule.id,
          zoneCode: rule.zoneCode,
          themeKey: rule.ruleTopic,
          themeLabel: rule.ruleLabel,
          title: rule.ruleLabel,
          articleNumber: rule.sourceArticle ? Number.parseInt(rule.sourceArticle.replace(/\D+/g, ""), 10) || null : null,
          sourceText: rule.ruleTextRaw.slice(0, 900),
          confidence: (rule.confidenceScore ?? 0) >= 0.85 ? "high" : (rule.confidenceScore ?? 0) >= 0.6 ? "medium" : "low",
          reviewStatus: rule.reviewStatus,
          reviewNotes: rule.validationNote,
          reviewedAt: rule.updatedAt,
          startPage: rule.sourcePage,
          endPage: rule.sourcePage,
          valueHint: formatUrbanRuleValueHint(rule),
          requiresManualValidation: rule.requiresManualValidation,
          conflictFlag: rule.ruleConflictFlag,
          sourceExcerpt: rule.sourceExcerpt,
          document: linkedDoc ? {
            id: linkedDoc.id,
            title: linkedDoc.title,
            documentType: resolveTownHallClassification({
              rawText: linkedDoc.rawText || "",
              fileName: linkedDoc.title || linkedDoc.fileName || "document",
              category: linkedDoc.category,
              subCategory: linkedDoc.subCategory,
              documentType: linkedDoc.documentType,
            }).resolved.documentType,
            textQualityLabel: quality?.textQualityLabel ?? null,
            textQualityScore: quality?.textQualityScore ?? null,
            isOpposable: linkedDoc.isOpposable,
          } : null,
        };
      })
      .sort((a, b) => `${a.zoneCode || ""}${a.themeLabel}`.localeCompare(`${b.zoneCode || ""}${b.themeLabel}`, "fr"));

    const readyStatus = (() => {
      if (reviewedRules.length === 0) return "missing";
      const validatedCount = reviewedRules.filter((rule) => rule.reviewStatus === "validated").length;
      if (validatedCount >= Math.max(3, Math.ceil(reviewedRules.length / 2))) return "ready";
      if (validatedCount > 0) return "partial";
      return "needs_review";
    })();

    return res.json({
      commune: targetCommune,
      municipalityId: inseeCode || targetCommune,
      summary: {
        ruleCount: reviewedRules.length,
        validatedRuleCount: reviewedRules.filter((rule) => rule.reviewStatus === "validated").length,
        pendingRuleCount: reviewedRules.filter((rule) => rule.reviewStatus === "auto" || rule.reviewStatus === "to_review").length,
        readyStatus,
      },
      rules: reviewedRules,
    });
  } catch (err) {
    logger.error("[mairie/plu-rule-reviews GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/plu-rule-reviews/:id/review", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { reviewStatus, reviewNotes, reviewedZoneCode } = req.body || {};

    const [rule] = await db.select({
      id: urbanRulesTable.id,
      municipalityId: urbanRulesTable.municipalityId,
      zoneCode: urbanRulesTable.zoneCode,
    }).from(urbanRulesTable)
      .where(eq(urbanRulesTable.id, id))
      .limit(1);

    if (!rule) {
      return res.status(404).json({ error: "RULE_NOT_FOUND" });
    }

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined || rule.municipalityId);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const allowedStatuses = new Set(["auto", "validated", "to_review", "rejected"]);
    const nextStatus = allowedStatuses.has(String(reviewStatus || "")) ? String(reviewStatus) : "validated";
    const nextZoneCode = normalizeConfiguredZoneCode(reviewedZoneCode) || rule.zoneCode;

    await db.update(urbanRulesTable)
      .set({
        reviewStatus: nextStatus,
        zoneCode: nextZoneCode,
        subzoneCode: deriveParentZoneCode(nextZoneCode) ? nextZoneCode : null,
        validationNote: typeof reviewNotes === "string" ? reviewNotes.trim() || null : null,
        validatedByUser: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(urbanRulesTable.id, id));

    return res.json({ success: true });
  } catch (err) {
    logger.error("[mairie/plu-rule-reviews POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.patch("/plu-rule-reviews/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const {
      reviewedZoneCode,
      articleNumber,
      title,
      sourceText,
      reviewNotes,
    } = req.body || {};

    const [rule] = await db.select({
      id: urbanRulesTable.id,
      municipalityId: urbanRulesTable.municipalityId,
      zoneCode: urbanRulesTable.zoneCode,
      ruleLabel: urbanRulesTable.ruleLabel,
      ruleTextRaw: urbanRulesTable.ruleTextRaw,
      sourceArticle: urbanRulesTable.sourceArticle,
      validationNote: urbanRulesTable.validationNote,
    }).from(urbanRulesTable)
      .where(eq(urbanRulesTable.id, id))
      .limit(1);

    if (!rule) {
      return res.status(404).json({ error: "RULE_NOT_FOUND" });
    }

    const access = await resolveAuthorizedTownHallCommune(
      req.user!.userId,
      req.query.commune as string | undefined || rule.municipalityId,
    );
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const nextZoneCode = normalizeConfiguredZoneCode(reviewedZoneCode) || rule.zoneCode;
    const normalizedArticleNumber = normalizeReviewedArticleNumber(articleNumber);
    const nextSourceText =
      typeof sourceText === "string" && sourceText.trim().length > 0
        ? sourceText.trim()
        : rule.ruleTextRaw;
    const nextTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : rule.ruleLabel;
    const nextSourceArticle =
      articleNumber === undefined
        ? rule.sourceArticle
        : buildReviewedSourceArticle(normalizedArticleNumber);
    const nextReviewNotes =
      reviewNotes === undefined
        ? rule.validationNote
        : (typeof reviewNotes === "string" ? reviewNotes.trim() || null : null);

    await db.update(urbanRulesTable)
      .set({
        zoneCode: nextZoneCode,
        subzoneCode: deriveParentZoneCode(nextZoneCode) ? nextZoneCode : null,
        sourceArticle: nextSourceArticle,
        ruleLabel: nextTitle,
        ruleTextRaw: nextSourceText,
        sourceExcerpt: nextSourceText.slice(0, 800),
        validationNote: nextReviewNotes,
        validatedByUser: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(eq(urbanRulesTable.id, id));

    return res.json({ success: true });
  } catch (err) {
    logger.error("[mairie/plu-rule-reviews PATCH]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/plu-rule-conflicts", async (req: AuthRequest, res) => {
  try {
    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.query.commune as string | undefined);
    if (!access.ok) {
      return res.status(access.status).json(access.error);
    }

    const targetCommune = access.targetCommune;
    const inseeCode = await resolveInseeCode(targetCommune);
    const municipalityAliases = Array.from(new Set([targetCommune, inseeCode].filter((value): value is string => !!value)));

    const conflicts = await db.select().from(urbanRuleConflictsTable)
      .where(
        and(
          inArray(urbanRuleConflictsTable.municipalityId, municipalityAliases),
          ne(urbanRuleConflictsTable.status, "resolved"),
        )
      )
      .orderBy(desc(urbanRuleConflictsTable.updatedAt));

    return res.json({
      commune: targetCommune,
      municipalityId: inseeCode || targetCommune,
      summary: {
        conflictCount: conflicts.length,
        openCount: conflicts.filter((conflict) => conflict.status === "open").length,
        manualReviewCount: conflicts.filter((conflict) => conflict.requiresManualValidation).length,
      },
      conflicts: conflicts.map((conflict) => ({
        id: conflict.id,
        zoneCode: conflict.zoneCode,
        ruleFamily: conflict.ruleFamily,
        ruleTopic: conflict.ruleTopic,
        conflictType: conflict.conflictType,
        conflictSummary: conflict.conflictSummary,
        requiresManualValidation: conflict.requiresManualValidation,
        status: conflict.status,
        resolutionNote: conflict.resolutionNote,
      })),
    });
  } catch (err) {
    logger.error("[mairie/plu-rule-conflicts GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/documents/batch", upload.array("files", 10), async (req: AuthRequest, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "Fichiers requis." });
    }

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const assignedCommunes = parseCommunes(currentUser[0]?.communes);
    
    let targetCommune = req.body.commune as string | undefined;
    if (!targetCommune && assignedCommunes.length > 0) {
      targetCommune = assignedCommunes[0];
    }

    // 1. Create Batch
    const [batch] = await db.insert(baseIABatchesTable).values({
      createdBy: req.user!.userId,
      status: "processing"
    }).returning();

    const results = [];

    res.json({ batchId: batch.id, status: "processing", message: "Traitement par lot démarré." });

    // 2. Process Files Background
    setImmediate(async () => {
      try {
        const results = [];
        for (const file of files) {
          const content = fs.readFileSync(file.path);
          const hash = createHash("sha256").update(content).digest("hex");

          // Check for dupe
          const [existing] = await db.select().from(baseIADocumentsTable)
            .where(eq(baseIADocumentsTable.fileHash, hash)).limit(1);

          if (existing) {
            results.push({ fileName: file.originalname, status: "skipped_duplicate", id: existing.id });
            try { fs.unlinkSync(file.path); } catch {}
            continue;
          }

          const ext = path.extname(file.originalname || "") || ".pdf";
          const storedFileName = `${crypto.randomUUID()}${ext}`;
          ensureTownHallUploadsDir();
          const persistentPath = path.join(PRIMARY_UPLOADS_DIR, storedFileName);

          try {
            fs.copyFileSync(file.path, persistentPath);
          } catch (copyErr) {
            logger.error("[mairie/batch] Failed to persist batch upload", copyErr, { fileName: file.originalname });
            try { fs.unlinkSync(file.path); } catch {}
            results.push({ fileName: file.originalname, status: "failed_persist" });
            continue;
          }

          if (isMarkdownUpload(file.originalname, file.mimetype)) {
            const requestedTags = req.body.tags ? JSON.parse(req.body.tags) : [];
            const [townHallDoc] = await db.insert(townHallDocumentsTable).values({
              userId: req.user!.userId,
              commune: targetCommune || null,
              title: req.body.title || file.originalname,
              fileName: storedFileName,
              mimeType: file.mimetype || "text/markdown",
              fileSize: content.length,
              hasStoredBlob: true,
              rawText: "",
              category: req.body.category || null,
              subCategory: req.body.subCategory || null,
              documentType: req.body.documentType || null,
              isRegulatory: true,
              isOpposable: false,
              tags: requestedTags,
              zone: req.body.zone || null,
            }).returning({ id: townHallDocumentsTable.id });

            await db.insert(townHallDocumentFilesTable).values({
              documentId: townHallDoc.id,
              mimeType: file.mimetype || "text/markdown",
              fileSize: content.length,
              fileBase64: content.toString("base64"),
            });

            await queueTownHallDocumentIndexing({
              docId: townHallDoc.id,
              persistentPath,
              mimeType: file.mimetype || "text/markdown",
              originalName: file.originalname,
              targetCommune: targetCommune || "",
              userId: req.user!.userId,
              category: req.body.category || null,
              subCategory: req.body.subCategory || null,
              documentType: req.body.documentType || null,
              requestedTags,
              zone: req.body.zone || null,
            });

            results.push({ fileName: file.originalname, status: "processing", id: townHallDoc.id });
            try { fs.unlinkSync(file.path); } catch {}
            continue;
          }

          const rawText = await extractTextFromFile(persistentPath, file.mimetype, {
            originalName: file.originalname,
            documentType: req.body.documentType || null,
            category: req.body.category || null,
            subCategory: req.body.subCategory || null,
          });
          const requestedTags = req.body.tags ? JSON.parse(req.body.tags) : [];
          const classification = resolveTownHallClassification({
            rawText,
            fileName: file.originalname,
            category: req.body.category || null,
            subCategory: req.body.subCategory || null,
            documentType: req.body.documentType || null,
            requestedTags,
          });
          const category = classification.resolved.category;
          const subCategory = classification.resolved.subCategory;
          const tags = classification.resolved.tags;
          const canonicalType = inferCanonicalDocumentType(classification.resolved.documentType, category, subCategory);
          const isOpposable = isCanonicalTypeOpposable(canonicalType);
          const isRegulatory = isRegulatoryLikeDocument(classification.resolved.documentType, category, subCategory);
          const inseeCode = targetCommune ? await resolveInseeCode(targetCommune) : null;
          const municipalityKey = inseeCode || targetCommune || null;

          const [doc] = await db.insert(baseIADocumentsTable).values({
            batchId: batch.id,
            municipalityId: municipalityKey,
            fileName: storedFileName,
            fileHash: hash,
            status: "indexed",
            type: mapCanonicalTypeToBaseIAType(canonicalType),
            category,
            subCategory,
            tags,
            rawText,
          }).returning();

          // Also support legacy table for back-compat
          const [townHallDoc] = await db.insert(townHallDocumentsTable).values({
            userId: req.user!.userId,
            commune: targetCommune || null,
            title: file.originalname,
            fileName: storedFileName,
            mimeType: file.mimetype || "application/pdf",
            fileSize: content.length,
            hasStoredBlob: true,
            rawText: rawText,
            category,
            subCategory,
            documentType: classification.resolved.documentType,
            isRegulatory,
            isOpposable,
            tags,
            zone: req.body.zone || null
          }).returning({ id: townHallDocumentsTable.id });

          await db.insert(townHallDocumentFilesTable).values({
            documentId: townHallDoc.id,
            mimeType: file.mimetype || "application/pdf",
            fileSize: content.length,
            fileBase64: content.toString("base64"),
          });

          // Process the document for RAG (Chunking + Embeddings)
          if (municipalityKey) {
             try {
               await processDocumentForRAG(doc.id, municipalityKey, rawText, {
                 document_id: doc.id,
                 document_type: canonicalType,
                 pool_id: `${municipalityKey}-PLU-ACTIVE`,
                 status: "active",
                 commune: municipalityKey,
                 zone: req.body.zone || undefined,
                 source_authority: authorityForCanonicalType(canonicalType),
               });
               await persistRegulatoryUnitsForDocument({
                 baseIADocumentId: doc.id,
                 townHallDocumentId: townHallDoc.id,
                 municipalityId: municipalityKey,
                 zoneCode: req.body.zone || null,
                 documentType: canonicalType,
                 sourceAuthority: authorityForCanonicalType(canonicalType),
                 isOpposable,
                 rawText,
               });
               await persistRegulatoryZoneSectionsForDocument({
                 baseIADocumentId: doc.id,
                 townHallDocumentId: townHallDoc.id,
                 municipalityId: municipalityKey,
                 documentType: canonicalType,
                 sourceAuthority: authorityForCanonicalType(canonicalType),
                 isOpposable,
                 rawText,
               });
               await ensureCalibrationZonesForCommune({
                 communeKey: municipalityKey,
                 communeAliases: Array.from(new Set([targetCommune, inseeCode].filter((value): value is string => !!value))),
                 rawText,
                 sourceName: file.originalname,
                 sourceType: classification.resolved.documentType,
                 referenceDocumentId: doc.id,
                 userId: req.user!.userId,
               });
               await persistStructuredKnowledgeForDocument({
                 baseIADocumentId: doc.id,
                 townHallDocumentId: townHallDoc.id,
                 municipalityId: municipalityKey,
                 documentType: canonicalType,
                 documentSubtype: classification.resolved.documentType || null,
                 sourceName: file.originalname,
                 sourceAuthority: authorityForCanonicalType(canonicalType),
                 opposable: isOpposable,
                 rawText,
                 rawClassification: {
                   category,
                   subCategory,
                   requestedDocumentType: req.body.documentType || null,
                   resolvedDocumentType: classification.resolved.documentType,
                   autoCorrected: classification.autoCorrected,
                   suggestionConfidence: classification.suggestionConfidence,
                   suggestionReason: classification.suggestionReason,
                   source: "mairie_batch_upload",
                 },
               });
               console.log(`[mairie/batch] Successfully processed RAG for doc ${doc.id}`);
             } catch (ragErr) {
               console.error(`[mairie/batch] RAG Processing failed for doc ${doc.id}:`, ragErr);
               // We don't block the rest of the batch if RAG fails, but we should log it
               await db.update(baseIADocumentsTable).set({ status: "vectorization_failed" }).where(eq(baseIADocumentsTable.id, doc.id));
             }
          }

          results.push({ fileName: file.originalname, status: "indexed", id: doc.id });
          try { fs.unlinkSync(file.path); } catch {}
        }

        await db.update(baseIABatchesTable).set({ status: "completed" }).where(eq(baseIABatchesTable.id, batch.id));
        console.log(`[mairie/batch] Completed batch ${batch.id}`);
      } catch (err) {
        console.error(`[mairie/batch] Error in background process:`, err);
        await db.update(baseIABatchesTable).set({ status: "failed" }).where(eq(baseIABatchesTable.id, batch.id));
      }
    });

    return;
  } catch (err) {
    console.error("[mairie/documents/batch POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/documents", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "Fichier requis." }); return; }

    const access = await resolveAuthorizedTownHallCommune(req.user!.userId, req.body.commune as string | undefined);
    if (!access.ok) {
      try { fs.unlinkSync(file.path); } catch {}
      return res.status(access.status).json(access.error);
    }
    const targetCommune = access.targetCommune;

    const ext = path.extname(file.originalname || "") || ".pdf";
    const storedFileName = `${crypto.randomUUID()}${ext}`;
    const fileBuffer = fs.readFileSync(file.path);
    ensureTownHallUploadsDir();
    const persistentPath = path.join(PRIMARY_UPLOADS_DIR, storedFileName);

    try {
      fs.copyFileSync(file.path, persistentPath);
    } catch (copyErr) {
      try { fs.unlinkSync(file.path); } catch {}
      logger.error("[VisionStorage] Failed to store file", copyErr);
      return res.status(500).json({ error: "FILE_STORAGE_FAILED", message: "Le fichier n'a pas pu etre enregistre." });
    }

    const requestedTags = parseDocumentTags(req.body.tags);
    const [doc] = await db.transaction(async (tx) => {
      const [createdDoc] = await tx.insert(townHallDocumentsTable).values({
        userId: req.user!.userId,
        commune: targetCommune,
        title: req.body.title || file.originalname,
        fileName: storedFileName,
        mimeType: file.mimetype || "application/pdf",
        fileSize: file.size,
        hasStoredBlob: true,
        rawText: "",
        category: req.body.category || null,
        subCategory: req.body.subCategory || null,
        documentType: req.body.documentType || null,
        tags: requestedTags,
        zone: req.body.zone || null
      }).returning();

      await tx.insert(townHallDocumentFilesTable).values({
        documentId: createdDoc.id,
        mimeType: file.mimetype || "application/pdf",
        fileSize: file.size,
        fileBase64: fileBuffer.toString("base64"),
      });

      return [createdDoc];
    });

    try { fs.unlinkSync(file.path); } catch {}

    res.json({ status: "processing", message: "Document recu, indexation en cours.", documentId: doc.id });

    await queueTownHallDocumentIndexing({
      docId: doc.id,
      persistentPath,
      mimeType: file.mimetype,
      originalName: file.originalname,
      targetCommune,
      userId: req.user!.userId,
      category: req.body.category || null,
      subCategory: req.body.subCategory || null,
      documentType: req.body.documentType || null,
      requestedTags,
      zone: req.body.zone || null,
    });
    return;
  } catch(err) {
    console.error("[mairie/documents POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", details: err instanceof Error ? err.stack : String(err) });
  }
});

router.delete("/documents", async (req: AuthRequest, res) => {
  try {
    const requestedCommune = String(req.query.commune || "").trim();
    if (!requestedCommune) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Paramètre commune requis." });
    }

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);
    const requestedLower = normalizeMunicipalityName(requestedCommune);

    if (role !== "admin" && role !== "super_admin" && !assignedCommunes.includes(requestedLower)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    const inseeCode = await resolveInseeCode(requestedCommune);
    const municipalityAliases = Array.from(new Set([requestedCommune, inseeCode].filter((value): value is string => !!value)));
    const docsToDelete = await db.select({ id: townHallDocumentsTable.id, fileName: townHallDocumentsTable.fileName })
      .from(townHallDocumentsTable)
      .where(buildMunicipalityAliasFilter(townHallDocumentsTable.commune, municipalityAliases));

    const docIds = docsToDelete.map(d => d.id);

    const cleanupSummary = await purgeMunicipalityStructuredKnowledge({
      requestedCommune,
      municipalityAliases,
      townHallDocumentIds: docIds,
    });

    if (docIds.length > 0) {
      await db.delete(townHallDocumentsTable).where(inArray(townHallDocumentsTable.id, docIds));
    }

    // Cleanup persisted files if present
    for (const file of docsToDelete) {
      const p = resolveTownHallDocumentPath(file.id, file.fileName);
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }

    return res.json({
      success: true,
      deletedDocuments: docIds.length,
      commune: requestedCommune,
      cleanupSummary,
    });
  } catch (err) {
    logger.error("[mairie/documents DELETE bulk]", err);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Impossible de vider completement la Base IA de cette commune.",
    });
  }
});

router.delete("/documents/:id", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);

    const [doc] = await db.select({
      id: townHallDocumentsTable.id,
      commune: townHallDocumentsTable.commune,
      fileName: townHallDocumentsTable.fileName
    }).from(townHallDocumentsTable).where(eq(townHallDocumentsTable.id, id)).limit(1);

    if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    if (!canAccessCommune(role, assignedCommunes, doc.commune)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    const childDocs = await db.select({
      id: townHallDocumentsTable.id,
      fileName: townHallDocumentsTable.fileName,
    })
      .from(townHallDocumentsTable)
      .where(sql`${townHallDocumentsTable.structuredContent}->>'parentDocumentId' = ${doc.id}`);
    const docsToDelete = [
      ...childDocs,
      doc,
    ];
    const docIdsToDelete = Array.from(new Set(docsToDelete.map((item) => item.id)));

    const cleanupSummaries = [];
    for (const docId of docIdsToDelete) {
      cleanupSummaries.push(await purgeTownHallDocumentStructuredKnowledge(docId));
    }

    await db.delete(townHallDocumentsTable).where(inArray(townHallDocumentsTable.id, docIdsToDelete));

    for (const fileDoc of docsToDelete) {
      const filePath = resolveTownHallDocumentPath(fileDoc.id, fileDoc.fileName);
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }

    return res.json({ success: true, deletedDocuments: docIdsToDelete.length, cleanupSummary: cleanupSummaries });
  } catch(err) {
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/gpu/sync", async (req: AuthRequest, res) => {
  return res.status(410).json({
    error: "FEATURE_REMOVED",
    message: "La synchronisation GPU a ete retiree. Importez les documents souhaites manuellement pendant l'onboarding de la Base IA."
  });
});


router.get("/documents/:id/view", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);

    // 1. Fetch document record to get the actual fileName
    const [doc] = await db.select({
      fileName: townHallDocumentsTable.fileName,
      commune: townHallDocumentsTable.commune,
      mimeType: townHallDocumentsTable.mimeType,
      hasStoredBlob: townHallDocumentsTable.hasStoredBlob,
    })
      .from(townHallDocumentsTable)
      .where(eq(townHallDocumentsTable.id, id))
      .limit(1);

    if (!doc) {
      console.warn(`[mairie/view] Document record not found for ID: ${id}`);
      return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    }
    if (!canAccessCommune(role, assignedCommunes, doc.commune)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    const diskPath = doc.fileName ? resolveTownHallDocumentPath(id, doc.fileName) : null;
    if (diskPath && fs.existsSync(diskPath)) {
      if (!doc.hasStoredBlob) {
        await backfillTownHallDocumentBlobFromDisk({
          documentId: id,
          filePath: diskPath,
          mimeType: doc.mimeType || "application/pdf",
        });
      }

      res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      return fs.createReadStream(diskPath).pipe(res);
    }

    const storedBlob = await loadTownHallDocumentBlob(id);
    if (storedBlob?.buffer) {
      res.setHeader('Content-Type', doc.mimeType || storedBlob.mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Length', String(storedBlob.fileSize || storedBlob.buffer.length));
      return res.end(storedBlob.buffer);
    }

    console.error(`[mairie/view] Physical file missing and persistent blob unavailable for: ${doc.fileName || id}`);
    return res.status(404).json({ error: "FILE_NOT_FOUND", message: "Le PDF source n'est disponible ni sur le disque ni dans le stockage persistant." });
  } catch (err) {
    console.error(`[mairie/view] Critical error for ID ${req.params.id}:`, err);
    return res.status(500).json({ error: "VIEW_FAILED" });
  }
});

router.patch("/documents/:id/metadata", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { explanatoryNote } = req.body;

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);

    const [doc] = await db.select({ commune: townHallDocumentsTable.commune })
      .from(townHallDocumentsTable)
      .where(eq(townHallDocumentsTable.id, id))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    if (!canAccessCommune(role, assignedCommunes, doc.commune)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    await db.update(townHallDocumentsTable)
      .set({ explanatoryNote, updatedAt: new Date() })
      .where(eq(townHallDocumentsTable.id, id));
      
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "UPDATE_FAILED" });
  }
});

router.post("/documents/:id/resegment", async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    const role = currentUser[0]?.role;
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);

    const [doc] = await db.select({
      id: townHallDocumentsTable.id,
      commune: townHallDocumentsTable.commune,
      title: townHallDocumentsTable.title,
      fileName: townHallDocumentsTable.fileName,
      rawText: townHallDocumentsTable.rawText,
      category: townHallDocumentsTable.category,
      subCategory: townHallDocumentsTable.subCategory,
      documentType: townHallDocumentsTable.documentType,
      isOpposable: townHallDocumentsTable.isOpposable,
    }).from(townHallDocumentsTable)
      .where(eq(townHallDocumentsTable.id, id))
      .limit(1);

    if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });
    if (!canAccessCommune(role, assignedCommunes, doc.commune)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé pour cette commune." });
    }

    const rawText = doc.rawText || "";
    const sourceName = doc.title || "Document réglementaire";
    const communeName = doc.commune || "";

    if (!communeName) {
      return res.status(400).json({
        error: "DOCUMENT_COMMUNE_MISSING",
        message: "La commune du document est manquante. Réassocie le document à une commune avant re-segmentation.",
      });
    }

    if (!hasUsableTownHallText(rawText)) {
      return res.status(400).json({
        error: "TEXT_NOT_USABLE",
        message: "Le document ne contient pas assez de texte exploitable pour une re-segmentation automatique.",
      });
    }

    const classification = await maybeSyncTownHallDocumentClassification(doc);
    const canonicalType = classification.canonicalType;
    if (!classification.isRegulatory || canonicalType === "other") {
      return res.status(400).json({
        error: "DOCUMENT_NOT_REGULATORY",
        message: "Ce document n'est pas de type réglementaire exploitable pour une re-segmentation PLU.",
      });
    }

    const municipalityId = (await resolveInseeCode(communeName)) || communeName;
    const sourceAuthority = authorityForCanonicalType(canonicalType);

    await persistRegulatoryZoneSectionsForDocument({
      townHallDocumentId: doc.id,
      municipalityId,
      documentType: canonicalType,
      sourceAuthority,
      isOpposable: !!doc.isOpposable,
      rawText,
    });

    await persistRegulatoryUnitsForDocument({
      townHallDocumentId: doc.id,
      municipalityId,
      documentType: canonicalType,
      sourceAuthority,
      isOpposable: !!doc.isOpposable,
      rawText,
    });

    await persistStructuredKnowledgeForDocument({
      townHallDocumentId: doc.id,
      municipalityId,
      documentType: canonicalType,
      documentSubtype: classification.resolved.documentType || null,
      sourceName,
      sourceAuthority,
      opposable: classification.isOpposable,
      rawText,
      rawClassification: {
        category: classification.resolved.category,
        subCategory: classification.resolved.subCategory,
        requestedDocumentType: doc.documentType,
        resolvedDocumentType: classification.resolved.documentType,
        autoCorrected: classification.autoCorrected,
        source: "manual_resegment",
      },
    });

    await ensureCalibrationZonesForCommune({
      communeKey: municipalityId,
      communeAliases: Array.from(new Set([communeName, await resolveInseeCode(communeName)].filter((value): value is string => !!value))),
      rawText,
      sourceName,
      sourceType: doc.documentType,
      referenceDocumentId: doc.id,
      userId: req.user!.userId,
    });

    const [sectionCount, ruleCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(regulatoryZoneSectionsTable)
        .where(eq(regulatoryZoneSectionsTable.townHallDocumentId, doc.id)),
      db.select({ count: sql<number>`count(*)::int` }).from(urbanRulesTable)
        .where(eq(urbanRulesTable.townHallDocumentId, doc.id)),
    ]);

    return res.json({
      success: true,
      sectionCount: Number(sectionCount[0]?.count || 0),
      ruleCount: Number(ruleCount[0]?.count || 0),
    });
  } catch (err) {
    logger.error("[mairie/documents resegment]", err);
    return res.status(500).json({ error: "RESEGMENT_FAILED" });
  }
});

// ─── PROMPTS PERSONNALISES ────────────────────────────────────────────────────

router.get("/prompts/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.includes(normalizeMunicipalityName(commune))) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    const rows = await db.select().from(townHallPromptsTable).where(buildMunicipalityAliasFilter(townHallPromptsTable.commune, [commune])).limit(1) as any;
    
    res.json({ prompt: rows.length > 0 ? rows[0] : null });
  } catch(err) {
    console.error("[mairie/prompts GET]", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/prompts/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    const content = req.body.content as string;
    
    if (!content) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Le contenu est requis" });
      return;
    }
    
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.includes(normalizeMunicipalityName(commune))) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    // Upsert equivalent since we want one prompt per commune
    const existing = await db.select({ id: townHallPromptsTable.id }).from(townHallPromptsTable).where(buildMunicipalityAliasFilter(townHallPromptsTable.commune, [commune])).limit(1);
    
    let prompt;
    if (existing.length > 0) {
      [prompt] = await db.update(townHallPromptsTable)
        .set({ content, updatedAt: new Date() })
        .where(eq(townHallPromptsTable.id, existing[0].id))
        .returning();
    } else {
      [prompt] = await db.insert(townHallPromptsTable)
        .values({ commune, content })
        .returning();
    }
    
    res.json({ prompt });
  } catch(err) {
    console.error("[mairie/prompts POST]", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
    
// ─── PARAMETRES FINANCIERS ────────────────────────────────────────────────────

router.get("/settings/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.includes(normalizeMunicipalityName(commune))) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    const [settings] = await db.select().from(municipalitySettingsTable)
      .where(buildMunicipalityAliasFilter(municipalitySettingsTable.commune, [commune])).limit(1);
    
    res.json({ settings: settings || null });
  } catch(err) {
    console.error("[mairie/settings GET]", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/settings/:commune", async (req: AuthRequest, res) => {
  try {
    const commune = req.params.commune as string;
    const { 
      taRateCommunal, taRateDept, taxeFonciereRate, teomRate, rapRate, 
      valeurForfaitaireTA, valeurForfaitairePiscine, valeurForfaitaireStationnement,
      prixM2Maison, prixM2Collectif, yieldMaison, yieldCollectif,
      abattementRP, surfaceAbattement, formulas,
      citizenPortalTownHallName, citizenPortalAddressLine1, citizenPortalAddressLine2,
      citizenPortalPostalCode, citizenPortalCity, citizenPortalPhone, citizenPortalEmail, citizenPortalHours
    } = req.body;
    
    const currentUser = await db.select({ role: usersTable.role, communes: usersTable.communes })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      
    const assignedCommunes = parseCommunes(currentUser[0]?.communes).map(normalizeMunicipalityName);
    if (currentUser[0]?.role !== "admin" && !assignedCommunes.includes(normalizeMunicipalityName(commune))) {
      res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
      return;
    }
    
    const [existing] = await db.select().from(municipalitySettingsTable)
      .where(buildMunicipalityAliasFilter(municipalitySettingsTable.commune, [commune])).limit(1);
    
    let result;
    const values = {
      taRateCommunal, taRateDept, taxeFonciereRate, teomRate, rapRate,
      valeurForfaitaireTA, valeurForfaitairePiscine, valeurForfaitaireStationnement,
      prixM2Maison, prixM2Collectif, yieldMaison, yieldCollectif,
      abattementRP, surfaceAbattement,
      citizenPortalTownHallName,
      citizenPortalAddressLine1,
      citizenPortalAddressLine2,
      citizenPortalPostalCode,
      citizenPortalCity,
      citizenPortalPhone,
      citizenPortalEmail,
      citizenPortalHours,
      formulas: formulas || {},
      updatedAt: new Date()
    };

    if (existing) {
      const updated = await db.update(municipalitySettingsTable)
        .set(values)
        .where(eq(municipalitySettingsTable.id, existing.id))
        .returning();
      result = updated[0];
    } else {
      const inserted = await db.insert(municipalitySettingsTable)
        .values({ ...values, commune })
        .returning();
      result = inserted[0];
    }
    
    return res.json({ settings: result });
  } catch(err) {
    console.error("[mairie/settings POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// DELETE /api/mairie/dossiers/:id — delete entire dossier (all associated documents)
router.delete("/dossiers/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Check if the dossier exists and if the user has access
    const [dossierMaster] = (await db.select().from(documentReviewsTable)
      .where(or(eq(documentReviewsTable.id, id as any), eq(documentReviewsTable.dossierId, id as any)))
      .limit(1)) as any[];

    if (!dossierMaster) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Dossier introuvable" });
    }

    let hasAccess = false;
    if (role === "admin") {
      hasAccess = true;
    } else if (role === "mairie" && dossierMaster.commune) {
      const userRows = (await db.select({ communes: usersTable.communes }).from(usersTable).where(eq(usersTable.id, userId))) as any[];
      const user = userRows[0];
      const assignedCommunes = parseCommunes(user?.communes);
      if (assignedCommunes.includes(dossierMaster.commune)) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Accès refusé" });
    }

    // Delete all documents in the dossier
    await db.delete(documentReviewsTable)
      .where(or(
        eq(documentReviewsTable.id, id as any),
        eq(documentReviewsTable.dossierId, id as any)
      ));

    return res.json({ success: true, message: "Dossier supprimé avec succès" });
  } catch (err) {
    console.error("[mairie/dossiers DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── VISION ANALYSIS (Phase 4) ───────────────────────────────────────────────

router.post("/documents/:id/vision", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch document review
    const [doc] = (await db.select().from(documentReviewsTable).where(eq(documentReviewsTable.id, id as any)).limit(1)) as any[];
    if (!doc) return res.status(404).json({ error: "NOT_FOUND", message: "Document introuvable." });

    // 2. Find file in uploads/
    const uploadsDir = path.join(process.cwd(), "uploads");
    const files = fs.readdirSync(uploadsDir);
    const fileName = files.find(f => f.startsWith(doc.id));
    
    if (!fileName) {
      return res.status(404).json({ error: "FILE_MISSING", message: "Fichier source introuvable pour l'analyse vision. Réuploadez le document." });
    }

    const filePath = path.join(uploadsDir, fileName);

    // 3. Trigger processing status
    await db.update(documentReviewsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(documentReviewsTable.id, id as any));

    const responseSent = res.json({ status: "processing", message: "L'analyse graphique par GPT-4o Vision a démarré." });

    // 4. Background processing
    setImmediate(async () => {
      try {
        const visualDescription = await VisionService.analyzePlan(filePath);
        
        // Update document with vision results
        await db.update(documentReviewsTable)
          .set({ 
            status: "completed",
            hasVisionAnalysis: true,
            visionResultText: visualDescription,
            updatedAt: new Date()
          })
          .where(eq(documentReviewsTable.id, id as any));
        
        console.log(`[Vision] Analysis completed for doc ${id}`);
        return;
      } catch (visionErr: any) {
        console.error(`[Vision] Analysis failed for doc ${id}:`, visionErr);
        await db.update(documentReviewsTable)
          .set({ 
            status: "failed", 
            failureReason: `Échec de l'analyse vision: ${visionErr.message}`,
            updatedAt: new Date()
          })
          .where(eq(documentReviewsTable.id, id as any));
      }
    });

    return responseSent;
  } catch (err) {
    console.error("[mairie/vision POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
