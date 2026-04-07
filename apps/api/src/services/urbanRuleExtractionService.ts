import {
  db,
  regulatoryUnitsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { indexedRegulatoryRulesTable } from "../../../../packages/db/src/schema/indexedRegulatoryRules.js";
import { regulatoryCalibrationZonesTable } from "../../../../packages/db/src/schema/regulatoryCalibrationZones.js";
import { regulatoryOverlaysTable } from "../../../../packages/db/src/schema/regulatoryOverlays.js";
import { ruleRelationsTable } from "../../../../packages/db/src/schema/ruleRelations.js";
import { townHallDocumentsTable } from "../../../../packages/db/src/schema/townHallDocuments.js";
import { urbanRuleConflictsTable } from "../../../../packages/db/src/schema/urbanRuleConflicts.js";
import { urbanRulesTable } from "../../../../packages/db/src/schema/urbanRules.js";
import {
  buildRuleSummary,
  confidenceToScore,
  extractRuleValues,
  inferUrbanRuleDescriptor,
} from "./urbanRuleCatalog.js";
import { buildZoneCodeAliases } from "./pluAnalysis.js";

type PersistUrbanRulesForDocumentArgs = {
  baseIADocumentId?: string | null;
  townHallDocumentId?: string | null;
  municipalityId: string;
  documentType?: string | null;
  sourceAuthority?: number;
  isOpposable?: boolean;
  extractionMode?: string | null;
};

type LoadUrbanRulesArgs = {
  municipalityId: string;
  communeName?: string | null;
  zoneCode?: string | null;
  minAuthority?: number;
  includeNonOpposable?: boolean;
  ruleFamilies?: string[];
};

export type CanonicalUrbanRule = typeof urbanRulesTable.$inferSelect;
export type PublishedIndexedRule = {
  id: string;
  zoneCode: string | null;
  zoneLabel: string | null;
  overlayId: string | null;
  overlayCode: string | null;
  overlayLabel: string | null;
  overlayType: string | null;
  normativeEffect: string | null;
  proceduralEffect: string | null;
  applicabilityScope: string | null;
  ruleAnchorType: string | null;
  ruleAnchorLabel: string | null;
  isRelationalRule: boolean;
  requiresCrossDocumentResolution: boolean;
  resolutionStatus: string | null;
  linkedRuleCount: number;
  relations: Array<{
    id: string;
    relationType: string;
    relationScope: string;
    conditionText: string | null;
    priorityNote: string | null;
    targetRuleId: string | null;
    targetRuleLabel: string | null;
    targetRuleStatus: string | null;
    targetDocumentId: string | null;
    targetDocumentName: string | null;
    targetZoneCode: string | null;
    targetOverlayCode: string | null;
  }>;
  ruleFamily: string;
  ruleTopic: string;
  ruleLabel: string;
  ruleTextRaw: string;
  ruleSummary: string | null;
  ruleValueType: string | null;
  ruleValueMin: number | null;
  ruleValueMax: number | null;
  ruleValueExact: number | null;
  ruleUnit: string | null;
  ruleCondition: string | null;
  ruleException: string | null;
  sourcePage: number | null;
  sourceArticle: string | null;
  sourceExcerpt: string | null;
  confidenceScore: number | null;
  reviewStatus: string | null;
  requiresManualValidation: boolean;
  ruleConflictFlag: boolean;
  sourceDocumentId: string | null;
  sourceDocumentKind: string | null;
  sourceDocumentName: string | null;
};
export type StructuredUrbanRuleSource = CanonicalUrbanRule | PublishedIndexedRule;

type StructuredRuleAnalysisSource = "published_calibration" | "structured_urban_rules" | "none";

const CALIBRATED_THEME_TO_FAMILY: Record<string, string> = {
  recul_voie: "setback_public",
  recul_limite: "setback_side",
  distance_entre_batiments: "setback_between_buildings",
  emprise_sol: "footprint",
  hauteur: "height",
  stationnement: "parking",
  espaces_verts: "green_space",
  pleine_terre: "green_space",
  coefficient_biotope: "green_space",
  plantations: "green_space",
  access_voirie: "access_roads",
  acces_voirie: "access_roads",
  reseaux: "networks",
  risques: "risk_restrictions",
  servitudes: "risk_restrictions",
  interdictions: "land_use_restrictions",
  conditions_particulieres: "specific_zone_rules",
  destination: "land_use_restrictions",
  aspect_exterieur: "facade_roof_aspect",
  materiaux: "materials",
  clotures: "facade_roof_aspect",
  toiture: "facade_roof_aspect",
  facades: "facade_roof_aspect",
  acces_pompiers: "access_roads",
  eaux_pluviales: "networks",
  assainissement: "networks",
};

function mapPublishedRuleFamily(themeCode: string | null | undefined, articleCode: string | null | undefined) {
  const normalizedTheme = String(themeCode || "").trim().toLowerCase();
  if (normalizedTheme && CALIBRATED_THEME_TO_FAMILY[normalizedTheme]) {
    return CALIBRATED_THEME_TO_FAMILY[normalizedTheme];
  }

  const article = String(articleCode || "").replace(/\D+/g, "");
  switch (article) {
    case "6":
      return "setback_public";
    case "7":
      return "setback_side";
    case "8":
      return "setback_between_buildings";
    case "9":
      return "footprint";
    case "10":
      return "height";
    case "12":
      return "parking";
    case "13":
      return "green_space";
    default:
      return "specific_zone_rules";
  }
}

function mapPublishedRuleValueType(operator: string | null | undefined, valueNumeric: number | null | undefined, valueText: string | null | undefined) {
  if (valueNumeric == null) {
    return valueText && valueText.trim().length > 0 ? "text" : null;
  }

  const normalizedOperator = String(operator || "").trim();
  if (normalizedOperator === "<" || normalizedOperator === "<=" || /max/i.test(normalizedOperator)) return "max";
  if (normalizedOperator === ">" || normalizedOperator === ">=" || /min/i.test(normalizedOperator)) return "min";
  return "exact";
}

function truncateSourceExcerpt(text: string | null | undefined) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  return normalized.length > 520 ? `${normalized.slice(0, 517)}...` : normalized;
}

function toPublishedIndexedRule(row: {
  id: string;
  zoneCode: string | null;
  zoneLabel: string | null;
  overlayId: string | null;
  overlayCode: string | null;
  overlayLabel: string | null;
  overlayType: string | null;
  normativeEffect: string | null;
  proceduralEffect: string | null;
  applicabilityScope: string | null;
  ruleAnchorType: string | null;
  ruleAnchorLabel: string | null;
  isRelationalRule: boolean;
  requiresCrossDocumentResolution: boolean;
  resolutionStatus: string | null;
  linkedRuleCount: number;
  relations: PublishedIndexedRule["relations"];
  articleCode: string;
  themeCode: string;
  ruleLabel: string;
  operator: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  conditionText: string | null;
  interpretationNote: string | null;
  sourceText: string;
  sourcePage: number;
  confidenceScore: number | null;
  conflictFlag: boolean;
  status: string;
  documentId: string | null;
  documentName: string | null;
}): PublishedIndexedRule {
  const ruleFamily = mapPublishedRuleFamily(row.themeCode, row.articleCode);
  const ruleValueType = mapPublishedRuleValueType(row.operator, row.valueNumeric, row.valueText);
  const sourceArticle = row.articleCode && row.articleCode.toLowerCase() !== "manual" ? `Article ${row.articleCode}` : null;

  return {
    id: row.id,
    zoneCode: row.zoneCode,
    zoneLabel: row.zoneLabel,
    overlayId: row.overlayId,
    overlayCode: row.overlayCode,
    overlayLabel: row.overlayLabel,
    overlayType: row.overlayType,
    normativeEffect: row.normativeEffect,
    proceduralEffect: row.proceduralEffect,
    applicabilityScope: row.applicabilityScope,
    ruleAnchorType: row.ruleAnchorType,
    ruleAnchorLabel: row.ruleAnchorLabel,
    isRelationalRule: row.isRelationalRule,
    requiresCrossDocumentResolution: row.requiresCrossDocumentResolution,
    resolutionStatus: row.resolutionStatus,
    linkedRuleCount: row.linkedRuleCount,
    relations: row.relations,
    ruleFamily,
    ruleTopic: row.themeCode,
    ruleLabel: row.ruleLabel,
    ruleTextRaw: row.sourceText,
    ruleSummary: row.interpretationNote || row.valueText || truncateSourceExcerpt(row.sourceText),
    ruleValueType,
    ruleValueMin: ruleValueType === "min" ? row.valueNumeric : null,
    ruleValueMax: ruleValueType === "max" ? row.valueNumeric : null,
    ruleValueExact: ruleValueType === "exact" ? row.valueNumeric : null,
    ruleUnit: row.unit,
    ruleCondition: row.conditionText,
    ruleException: null,
    sourcePage: row.sourcePage ?? null,
    sourceArticle,
    sourceExcerpt: truncateSourceExcerpt(row.sourceText),
    confidenceScore: row.confidenceScore ?? null,
    reviewStatus: row.status,
    requiresManualValidation: false,
    ruleConflictFlag: row.conflictFlag,
    sourceDocumentId: row.documentId,
    sourceDocumentKind: row.documentId ? "town_hall_document" : null,
    sourceDocumentName: row.documentName,
  };
}

function toArticleConfidence(confidenceScore: number | null | undefined): "high" | "medium" | "low" {
  if ((confidenceScore ?? 0) >= 0.85) return "high";
  if ((confidenceScore ?? 0) >= 0.6) return "medium";
  return "low";
}

function extractSourceDocumentIdentity(args: PersistUrbanRulesForDocumentArgs) {
  if (args.baseIADocumentId) {
    return { sourceDocumentId: args.baseIADocumentId, sourceDocumentKind: "base_ia_document" };
  }
  if (args.townHallDocumentId) {
    return { sourceDocumentId: args.townHallDocumentId, sourceDocumentKind: "town_hall_document" };
  }
  return { sourceDocumentId: null, sourceDocumentKind: null };
}

function normalizeSourceArticle(articleNumber: number | null) {
  return articleNumber != null ? `Article ${articleNumber}` : null;
}

function getSourcePageFromParsedValues(parsedValues: unknown): number | null {
  if (!parsedValues || typeof parsedValues !== "object") return null;
  const value = (parsedValues as Record<string, unknown>).start_page;
  if (value == null || value === "") return null;
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? page : null;
}

function getParentZoneFromParsedValues(parsedValues: unknown): string | null {
  if (!parsedValues || typeof parsedValues !== "object") return null;
  const value = (parsedValues as Record<string, unknown>).parent_zone_code;
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toUpperCase() : null;
}

function getSourceExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 520) return normalized;
  return `${normalized.slice(0, 517)}...`;
}

function valuesConflict(left: typeof urbanRulesTable.$inferSelect, right: typeof urbanRulesTable.$inferSelect) {
  const exactLeft = left.ruleValueExact;
  const exactRight = right.ruleValueExact;
  if (exactLeft != null && exactRight != null && Math.abs(exactLeft - exactRight) > 0.001) {
    return true;
  }

  if (left.ruleValueMax != null && right.ruleValueMax != null && Math.abs(left.ruleValueMax - right.ruleValueMax) > 0.001) {
    return true;
  }

  if (left.ruleValueMin != null && right.ruleValueMin != null && Math.abs(left.ruleValueMin - right.ruleValueMin) > 0.001) {
    return true;
  }

  return false;
}

export async function persistUrbanRulesForDocument(args: PersistUrbanRulesForDocumentArgs) {
  if (args.baseIADocumentId) {
    await db.delete(urbanRulesTable).where(eq(urbanRulesTable.baseIADocumentId, args.baseIADocumentId));
  } else if (args.townHallDocumentId) {
    await db.delete(urbanRulesTable).where(eq(urbanRulesTable.townHallDocumentId, args.townHallDocumentId));
  } else {
    return { created: 0, conflicts: 0 };
  }

  const unitFilter = args.baseIADocumentId
    ? eq(regulatoryUnitsTable.baseIADocumentId, args.baseIADocumentId)
    : eq(regulatoryUnitsTable.townHallDocumentId, args.townHallDocumentId || "");

  const units = await db.select().from(regulatoryUnitsTable).where(unitFilter);
  if (units.length === 0) {
    return { created: 0, conflicts: 0 };
  }

  const sourceIdentity = extractSourceDocumentIdentity(args);

  const records = units.map((unit) => {
    const descriptor = inferUrbanRuleDescriptor(unit);
    const values = extractRuleValues(unit.sourceText, descriptor);
    const parentZoneCode = getParentZoneFromParsedValues(unit.parsedValues);
    const exactZoneCode = unit.zoneCode?.trim() || null;
    const isSubZone = !!parentZoneCode && exactZoneCode && parentZoneCode !== exactZoneCode;
    const confidenceScore = confidenceToScore(unit.confidence);
    const requiresManualValidation =
      confidenceScore < 0.7
      || values.valueType == null
      || !exactZoneCode
      || descriptor.family === "specific_zone_rules";

    return {
      baseIADocumentId: args.baseIADocumentId || null,
      townHallDocumentId: args.townHallDocumentId || null,
      sourceDocumentId: sourceIdentity.sourceDocumentId,
      sourceDocumentKind: sourceIdentity.sourceDocumentKind,
      municipalityId: args.municipalityId,
      zoneCode: exactZoneCode,
      subzoneCode: isSubZone ? exactZoneCode : null,
      sectorCode: null,
      ruleFamily: descriptor.family,
      ruleTopic: descriptor.topic,
      ruleLabel: descriptor.label,
      ruleTextRaw: unit.sourceText,
      ruleSummary: buildRuleSummary(unit.sourceText, descriptor),
      ruleValueType: values.valueType,
      ruleValueMin: values.valueMin,
      ruleValueMax: values.valueMax,
      ruleValueExact: values.valueExact,
      ruleUnit: values.unit,
      ruleCondition: values.condition,
      ruleException: values.exception,
      rulePriority: descriptor.priority,
      sourcePage: getSourcePageFromParsedValues(unit.parsedValues),
      sourceArticle: normalizeSourceArticle(unit.articleNumber),
      sourceExcerpt: getSourceExcerpt(unit.sourceText),
      sourceAuthority: args.sourceAuthority ?? unit.sourceAuthority,
      isOpposable: args.isOpposable ?? unit.isOpposable,
      confidenceScore,
      extractionMode: args.extractionMode || null,
      requiresManualValidation,
      reviewStatus: unit.reviewStatus,
      validatedByUser: unit.reviewedBy || null,
      validationNote: unit.reviewNotes || null,
      rawMetadata: {
        regulatory_unit_id: unit.id,
        unit_theme: unit.theme,
        article_number: unit.articleNumber,
        parent_zone_code: parentZoneCode,
        document_type: args.documentType || unit.documentType,
        parsed_values: unit.parsedValues || {},
      },
      updatedAt: new Date(),
    };
  });

  const inserted = await db.insert(urbanRulesTable).values(records).returning();
  if (inserted.length === 0) {
    return { created: 0, conflicts: 0 };
  }

  const zones = Array.from(
    new Set(
      inserted
        .map((rule: typeof inserted[number]) => rule.zoneCode)
        .filter((value: string | null): value is string => !!value),
    ),
  );
  const relatedRules = zones.length > 0
    ? await db.select().from(urbanRulesTable).where(
        and(
          eq(urbanRulesTable.municipalityId, args.municipalityId),
          inArray(urbanRulesTable.zoneCode, zones),
          eq(urbanRulesTable.isOpposable, true),
        ),
      )
    : inserted;

  const conflictsToInsert: Array<typeof urbanRuleConflictsTable.$inferInsert> = [];
  const conflictingRuleIds = new Set<string>();
  const seenConflictKeys = new Set<string>();

  for (const left of inserted) {
    for (const right of relatedRules) {
      if (left.id === right.id) continue;
      if (!left.zoneCode || !right.zoneCode || left.zoneCode !== right.zoneCode) continue;
      if (left.ruleFamily !== right.ruleFamily || left.ruleTopic !== right.ruleTopic) continue;
      if (!valuesConflict(left, right)) continue;

      const ordered = [left.id, right.id].sort();
      const conflictKey = `${ordered[0]}:${ordered[1]}`;
      if (seenConflictKeys.has(conflictKey)) continue;
      seenConflictKeys.add(conflictKey);

      conflictingRuleIds.add(left.id);
      conflictingRuleIds.add(right.id);
      conflictsToInsert.push({
        municipalityId: args.municipalityId,
        zoneCode: left.zoneCode,
        ruleFamily: left.ruleFamily,
        ruleTopic: left.ruleTopic,
        leftRuleId: ordered[0],
        rightRuleId: ordered[1],
        conflictType: "value_mismatch",
        conflictSummary: `Conflit de valeur détecté pour ${left.ruleLabel} en zone ${left.zoneCode}.`,
        requiresManualValidation: true,
        status: "open",
        updatedAt: new Date(),
      });
    }
  }

  if (conflictsToInsert.length > 0) {
    await db.insert(urbanRuleConflictsTable).values(conflictsToInsert);
    await db.update(urbanRulesTable)
      .set({ ruleConflictFlag: true, updatedAt: new Date() })
      .where(inArray(urbanRulesTable.id, Array.from(conflictingRuleIds)));
  }

  return {
    created: inserted.length,
    conflicts: conflictsToInsert.length,
  };
}

export async function loadUrbanRules(args: LoadUrbanRulesArgs): Promise<CanonicalUrbanRule[]> {
  const aliases = Array.from(new Set([args.municipalityId, args.communeName].filter((value): value is string => !!value && value.trim().length > 0)));
  if (aliases.length === 0) return [];

  const zoneAliases = buildZoneCodeAliases(args.zoneCode);
  const zoneFilter = args.zoneCode
    ? inArray(urbanRulesTable.zoneCode, zoneAliases)
    : sql`TRUE`;

  const zonePriorityOrder = args.zoneCode
    ? zoneAliases.length > 1
      ? sql`CASE
          WHEN ${urbanRulesTable.zoneCode} = ${zoneAliases[0]} THEN 0
          WHEN ${urbanRulesTable.zoneCode} = ${zoneAliases[1]} THEN 1
          ELSE 2
        END`
      : sql`CASE
          WHEN ${urbanRulesTable.zoneCode} = ${zoneAliases[0]} THEN 0
          ELSE 1
        END`
    : sql`0`;

  const reviewPriorityOrder = sql`CASE
    WHEN ${urbanRulesTable.reviewStatus} = 'validated' THEN 0
    WHEN ${urbanRulesTable.reviewStatus} = 'auto' THEN 1
    WHEN ${urbanRulesTable.reviewStatus} = 'to_review' THEN 2
    ELSE 3
  END`;

  const rows = await db.select().from(urbanRulesTable)
    .where(and(
      or(
        inArray(urbanRulesTable.municipalityId, aliases),
        ...aliases.map((alias) => sql`lower(${urbanRulesTable.municipalityId}) = lower(${alias})`)
      ),
      zoneFilter,
      typeof args.minAuthority === "number"
        ? sql`${urbanRulesTable.sourceAuthority} >= ${args.minAuthority}`
        : sql`TRUE`,
      args.ruleFamilies && args.ruleFamilies.length > 0
        ? inArray(urbanRulesTable.ruleFamily, args.ruleFamilies)
        : sql`TRUE`,
      args.includeNonOpposable ? sql`TRUE` : eq(urbanRulesTable.isOpposable, true),
      eq(urbanRulesTable.ruleConflictFlag, false),
      neOrTrue(urbanRulesTable.reviewStatus, "rejected")
    ))
    .orderBy(
      zonePriorityOrder,
      reviewPriorityOrder,
      desc(urbanRulesTable.rulePriority),
      desc(urbanRulesTable.sourceAuthority),
      desc(urbanRulesTable.confidenceScore),
      desc(urbanRulesTable.updatedAt),
    );

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.zoneCode || "GLOBAL"}|${row.ruleFamily}|${row.ruleTopic}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadPublishedIndexedRules(args: LoadUrbanRulesArgs): Promise<PublishedIndexedRule[]> {
  const aliases = Array.from(new Set([args.municipalityId, args.communeName].filter((value): value is string => !!value && value.trim().length > 0)));
  if (aliases.length === 0) return [];

  const zoneAliases = buildZoneCodeAliases(args.zoneCode);
  const zoneFilter = args.zoneCode
    ? inArray(regulatoryCalibrationZonesTable.zoneCode, zoneAliases)
    : sql`TRUE`;

  const zonePriorityOrder = args.zoneCode
    ? zoneAliases.length > 1
      ? sql`CASE
          WHEN ${regulatoryCalibrationZonesTable.zoneCode} = ${zoneAliases[0]} THEN 0
          WHEN ${regulatoryCalibrationZonesTable.zoneCode} = ${zoneAliases[1]} THEN 1
          ELSE 2
        END`
      : sql`CASE
          WHEN ${regulatoryCalibrationZonesTable.zoneCode} = ${zoneAliases[0]} THEN 0
          ELSE 1
        END`
    : sql`0`;

  const rows = await db.select({
    id: indexedRegulatoryRulesTable.id,
    zoneCode: regulatoryCalibrationZonesTable.zoneCode,
    zoneLabel: regulatoryCalibrationZonesTable.zoneLabel,
    overlayId: indexedRegulatoryRulesTable.overlayId,
    overlayCode: regulatoryOverlaysTable.overlayCode,
    overlayLabel: regulatoryOverlaysTable.overlayLabel,
    overlayType: sql<string | null>`coalesce(${indexedRegulatoryRulesTable.overlayType}, ${regulatoryOverlaysTable.overlayType})`,
    normativeEffect: indexedRegulatoryRulesTable.normativeEffect,
    proceduralEffect: indexedRegulatoryRulesTable.proceduralEffect,
    applicabilityScope: indexedRegulatoryRulesTable.applicabilityScope,
    ruleAnchorType: indexedRegulatoryRulesTable.ruleAnchorType,
    ruleAnchorLabel: indexedRegulatoryRulesTable.ruleAnchorLabel,
    isRelationalRule: indexedRegulatoryRulesTable.isRelationalRule,
    requiresCrossDocumentResolution: indexedRegulatoryRulesTable.requiresCrossDocumentResolution,
    resolutionStatus: indexedRegulatoryRulesTable.resolutionStatus,
    linkedRuleCount: indexedRegulatoryRulesTable.linkedRuleCount,
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
    confidenceScore: indexedRegulatoryRulesTable.confidenceScore,
    conflictFlag: indexedRegulatoryRulesTable.conflictFlag,
    status: indexedRegulatoryRulesTable.status,
    documentId: indexedRegulatoryRulesTable.documentId,
    documentName: townHallDocumentsTable.title,
    documentFileName: townHallDocumentsTable.fileName,
  })
    .from(indexedRegulatoryRulesTable)
    .leftJoin(regulatoryCalibrationZonesTable, eq(indexedRegulatoryRulesTable.zoneId, regulatoryCalibrationZonesTable.id))
    .leftJoin(regulatoryOverlaysTable, eq(indexedRegulatoryRulesTable.overlayId, regulatoryOverlaysTable.id))
    .leftJoin(townHallDocumentsTable, eq(indexedRegulatoryRulesTable.documentId, townHallDocumentsTable.id))
    .where(and(
      or(
        inArray(indexedRegulatoryRulesTable.communeId, aliases),
        ...aliases.map((alias) => sql`lower(${indexedRegulatoryRulesTable.communeId}) = lower(${alias})`)
      ),
      zoneFilter,
      eq(indexedRegulatoryRulesTable.status, "published"),
      eq(indexedRegulatoryRulesTable.conflictFlag, false),
      eq(regulatoryCalibrationZonesTable.isActive, true),
    ))
    .orderBy(
      zonePriorityOrder,
      desc(indexedRegulatoryRulesTable.confidenceScore),
      desc(indexedRegulatoryRulesTable.publishedAt),
      desc(indexedRegulatoryRulesTable.updatedAt),
    );
  const ruleIds = rows.map((row) => row.id);
  const relationRows = ruleIds.length > 0
    ? await db.select().from(ruleRelationsTable).where(inArray(ruleRelationsTable.sourceRuleId, ruleIds))
    : [];
  const targetRuleIds = Array.from(new Set(relationRows.map((relation) => relation.targetRuleId).filter((value): value is string => !!value)));
  const targetDocIds = Array.from(new Set(relationRows.map((relation) => relation.targetDocumentId).filter((value): value is string => !!value)));

  const [targetRules, targetDocs] = await Promise.all([
    targetRuleIds.length > 0
      ? db.select({
          id: indexedRegulatoryRulesTable.id,
          ruleLabel: indexedRegulatoryRulesTable.ruleLabel,
          status: indexedRegulatoryRulesTable.status,
          zoneCode: regulatoryCalibrationZonesTable.zoneCode,
          overlayCode: regulatoryOverlaysTable.overlayCode,
          documentId: indexedRegulatoryRulesTable.documentId,
        })
          .from(indexedRegulatoryRulesTable)
          .leftJoin(regulatoryCalibrationZonesTable, eq(indexedRegulatoryRulesTable.zoneId, regulatoryCalibrationZonesTable.id))
          .leftJoin(regulatoryOverlaysTable, eq(indexedRegulatoryRulesTable.overlayId, regulatoryOverlaysTable.id))
          .where(inArray(indexedRegulatoryRulesTable.id, targetRuleIds))
      : Promise.resolve([]),
    targetDocIds.length > 0
      ? db.select({
          id: townHallDocumentsTable.id,
          title: townHallDocumentsTable.title,
          fileName: townHallDocumentsTable.fileName,
        }).from(townHallDocumentsTable).where(inArray(townHallDocumentsTable.id, targetDocIds))
      : Promise.resolve([]),
  ]);

  const targetRuleMap = new Map(targetRules.map((rule) => [rule.id, rule]));
  const targetDocMap = new Map(targetDocs.map((doc) => [doc.id, doc.title || doc.fileName || null]));
  const relationMap = new Map<string, PublishedIndexedRule["relations"]>();
  for (const relation of relationRows) {
    const targetRule = relation.targetRuleId ? targetRuleMap.get(relation.targetRuleId) || null : null;
    const existing = relationMap.get(relation.sourceRuleId) || [];
    existing.push({
      id: relation.id,
      relationType: relation.relationType,
      relationScope: relation.relationScope,
      conditionText: relation.conditionText,
      priorityNote: relation.priorityNote,
      targetRuleId: relation.targetRuleId || null,
      targetRuleLabel: targetRule?.ruleLabel || null,
      targetRuleStatus: targetRule?.status || null,
      targetDocumentId: relation.targetDocumentId || null,
      targetDocumentName: relation.targetDocumentId ? targetDocMap.get(relation.targetDocumentId) || null : null,
      targetZoneCode: targetRule?.zoneCode || null,
      targetOverlayCode: targetRule?.overlayCode || null,
    });
    relationMap.set(relation.sourceRuleId, existing);
  }

  return rows.map((row) => toPublishedIndexedRule({
    ...row,
    documentName: row.documentName || row.documentFileName || null,
    relations: relationMap.get(row.id) || [],
  }));
}

export async function loadStructuredRulesForAnalysis(args: LoadUrbanRulesArgs): Promise<{
  source: StructuredRuleAnalysisSource;
  rules: StructuredUrbanRuleSource[];
}> {
  const publishedRules = await loadPublishedIndexedRules(args);
  if (publishedRules.length > 0) {
    return {
      source: "published_calibration",
      rules: publishedRules,
    };
  }

  const urbanRules = await loadUrbanRules(args);
  if (urbanRules.length > 0) {
    return {
      source: "structured_urban_rules",
      rules: urbanRules,
    };
  }

  return {
    source: "none",
    rules: [],
  };
}

function neOrTrue(column: typeof urbanRulesTable.reviewStatus, value: string) {
  return sql`${column} <> ${value}`;
}

export function buildParsedRulesFromUrbanRules(rules: StructuredUrbanRuleSource[]) {
  return rules.map((rule) => ({
    confidence: toArticleConfidence(rule.confidenceScore),
    article: rule.sourceArticle,
    articleNumber: rule.sourceArticle,
    title: rule.ruleLabel,
    section: rule.ruleTopic,
    rule: rule.ruleTextRaw,
    sourceText: rule.ruleTextRaw,
    summary: rule.ruleSummary || rule.ruleTextRaw,
    structuredData: {
      family: rule.ruleFamily,
      topic: rule.ruleTopic,
      value_type: rule.ruleValueType,
      value_min: rule.ruleValueMin,
      value_max: rule.ruleValueMax,
      value_exact: rule.ruleValueExact,
      unit: rule.ruleUnit,
      condition: rule.ruleCondition,
      exception: rule.ruleException,
      source_page: rule.sourcePage,
      source_excerpt: rule.sourceExcerpt,
      review_status: rule.reviewStatus,
      overlay_code: "overlayCode" in rule ? rule.overlayCode : null,
      overlay_type: "overlayType" in rule ? rule.overlayType : null,
      normative_effect: "normativeEffect" in rule ? rule.normativeEffect : null,
      procedural_effect: "proceduralEffect" in rule ? rule.proceduralEffect : null,
      rule_anchor_type: "ruleAnchorType" in rule ? rule.ruleAnchorType : null,
      rule_anchor_label: "ruleAnchorLabel" in rule ? rule.ruleAnchorLabel : null,
      is_relational_rule: "isRelationalRule" in rule ? rule.isRelationalRule : false,
      requires_cross_document_resolution: "requiresCrossDocumentResolution" in rule ? rule.requiresCrossDocumentResolution : false,
      resolution_status: "resolutionStatus" in rule ? rule.resolutionStatus : null,
      linked_rule_count: "linkedRuleCount" in rule ? rule.linkedRuleCount : 0,
      relations: "relations" in rule ? rule.relations : [],
    },
  }));
}

export function buildArticlesFromUrbanRules(rules: StructuredUrbanRuleSource[]) {
  return rules.map((rule) => ({
    confidence: toArticleConfidence(rule.confidenceScore),
    articleNumber: Number.parseInt(String(rule.sourceArticle || "").replace(/\D+/g, ""), 10) || 0,
    title: rule.ruleLabel,
    sourceText: rule.ruleTextRaw,
    interpretation: rule.ruleSummary || rule.ruleTextRaw,
    summary: rule.ruleSummary || rule.ruleTextRaw,
    impactText: `Règle ${
      rule.reviewStatus === "published"
        ? "publiée"
        : rule.reviewStatus === "validated"
          ? "validée"
          : "structurée"
    } pour la zone ${rule.zoneCode || "globale"}.`,
    vigilanceText: rule.reviewStatus === "published"
      ? "Règle publiée dans le référentiel mairie."
      : rule.requiresManualValidation
        ? "Validation manuelle recommandée avant usage opposable."
        : "Règle structurée avec source documentaire tracée.",
    structuredData: {
      family: rule.ruleFamily,
      topic: rule.ruleTopic,
      source_page: rule.sourcePage,
      source_article: rule.sourceArticle,
      source_excerpt: rule.sourceExcerpt,
      review_status: rule.reviewStatus,
      value_type: rule.ruleValueType,
      value_min: rule.ruleValueMin,
      value_max: rule.ruleValueMax,
      value_exact: rule.ruleValueExact,
      unit: rule.ruleUnit,
      condition: rule.ruleCondition,
      exception: rule.ruleException,
      overlay_code: "overlayCode" in rule ? rule.overlayCode : null,
      overlay_type: "overlayType" in rule ? rule.overlayType : null,
      normative_effect: "normativeEffect" in rule ? rule.normativeEffect : null,
      procedural_effect: "proceduralEffect" in rule ? rule.proceduralEffect : null,
      rule_anchor_type: "ruleAnchorType" in rule ? rule.ruleAnchorType : null,
      rule_anchor_label: "ruleAnchorLabel" in rule ? rule.ruleAnchorLabel : null,
      is_relational_rule: "isRelationalRule" in rule ? rule.isRelationalRule : false,
      requires_cross_document_resolution: "requiresCrossDocumentResolution" in rule ? rule.requiresCrossDocumentResolution : false,
      resolution_status: "resolutionStatus" in rule ? rule.resolutionStatus : null,
      linked_rule_count: "linkedRuleCount" in rule ? rule.linkedRuleCount : 0,
      relations: "relations" in rule ? rule.relations : [],
    },
  }));
}
