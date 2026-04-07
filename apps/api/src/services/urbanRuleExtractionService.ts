import {
  db,
  regulatoryUnitsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { urbanRuleConflictsTable } from "../../../../packages/db/src/schema/urbanRuleConflicts.js";
import { urbanRulesTable } from "../../../../packages/db/src/schema/urbanRules.js";
import {
  buildRuleSummary,
  confidenceToScore,
  extractRuleValues,
  inferUrbanRuleDescriptor,
} from "./urbanRuleCatalog.js";

type PersistUrbanRulesForDocumentArgs = {
  baseIADocumentId?: string | null;
  townHallDocumentId?: string | null;
  municipalityId: string;
  documentType?: string | null;
  sourceAuthority?: number;
  isOpposable?: boolean;
  extractionMode?: string | null;
};

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
  const page = Number(value);
  return Number.isFinite(page) ? page : null;
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
