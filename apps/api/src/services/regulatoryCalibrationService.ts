import { db } from "@workspace/db";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { calibratedExcerptsTable } from "../../../../packages/db/src/schema/calibratedExcerpts.js";
import { indexedRegulatoryRulesTable } from "../../../../packages/db/src/schema/indexedRegulatoryRules.js";
import { regulatoryCalibrationZonesTable } from "../../../../packages/db/src/schema/regulatoryCalibrationZones.js";
import { regulatoryOverlaysTable } from "../../../../packages/db/src/schema/regulatoryOverlays.js";
import { overlayDocumentBindingsTable } from "../../../../packages/db/src/schema/overlayDocumentBindings.js";
import { ruleRelationsTable } from "../../../../packages/db/src/schema/ruleRelations.js";
import { regulatoryRuleConflictsTable } from "../../../../packages/db/src/schema/regulatoryRuleConflicts.js";
import { regulatoryThemeTaxonomyTable } from "../../../../packages/db/src/schema/regulatoryThemeTaxonomy.js";
import { regulatoryValidationHistoryTable } from "../../../../packages/db/src/schema/regulatoryValidationHistory.js";
import { regulatoryZoneSectionsTable } from "../../../../packages/db/src/schema/regulatoryZoneSections.js";
import { townHallDocumentsTable } from "../../../../packages/db/src/schema/townHallDocuments.js";
import { urbanRulesTable } from "../../../../packages/db/src/schema/urbanRules.js";
import { normalizeExtractedText } from "./textQualityService.js";

export const REGULATORY_ARTICLE_REFERENCE = [
  { code: "1", label: "Article 1 : interdictions" },
  { code: "2", label: "Article 2 : occupations soumises à conditions" },
  { code: "3", label: "Article 3 : accès / voirie" },
  { code: "4", label: "Article 4 : réseaux" },
  { code: "5", label: "Article 5 : sans objet" },
  { code: "6", label: "Article 6 : implantation par rapport aux voies" },
  { code: "7", label: "Article 7 : implantation par rapport aux limites séparatives" },
  { code: "8", label: "Article 8 : implantation sur une même propriété" },
  { code: "9", label: "Article 9 : emprise au sol" },
  { code: "10", label: "Article 10 : hauteur maximale" },
  { code: "11", label: "Article 11 : aspect extérieur / matériaux / abords" },
  { code: "12", label: "Article 12 : stationnement" },
  { code: "13", label: "Article 13 : espaces libres / plantations" },
  { code: "14", label: "Article 14 : sans objet" },
] as const;

export const REGULATORY_THEME_SEED = [
  ["interdictions", "Interdictions", "Usages et occupations interdits", "1"],
  ["conditions_particulieres", "Conditions particulières", "Occupations autorisées sous conditions", "2"],
  ["acces_voirie", "Accès & voirie", "Accès, desserte et voirie", "3"],
  ["reseaux", "Réseaux", "Raccordements et réseaux", "4"],
  ["recul_voie", "Recul sur voie", "Implantation par rapport aux voies", "6"],
  ["recul_limite", "Recul sur limites", "Implantation par rapport aux limites séparatives", "7"],
  ["distance_entre_batiments", "Distance entre bâtiments", "Implantation sur une même propriété", "8"],
  ["emprise_sol", "Emprise au sol", "Emprise, CES et densité", "9"],
  ["hauteur", "Hauteur", "Hauteur maximale et gabarits", "10"],
  ["aspect_exterieur", "Aspect extérieur", "Aspect extérieur et insertion", "11"],
  ["stationnement", "Stationnement", "Stationnement automobile et vélo", "12"],
  ["espaces_verts", "Espaces verts", "Espaces libres, plantations et paysages", "13"],
  ["materiaux", "Matériaux", "Matériaux, teintes, menuiseries et finitions", "11"],
  ["risques", "Risques", "Risques et prescriptions complémentaires", null],
  ["servitudes", "Servitudes", "Servitudes d'utilité publique et contraintes", null],
  ["destination", "Destinations", "Destinations et usages autorisés", "1"],
  ["pleine_terre", "Pleine terre", "Pleine terre et perméabilité", "13"],
  ["coefficient_biotope", "Coefficient de biotope", "Biotope et surfaces écologiques", "13"],
  ["clotures", "Clôtures", "Clôtures et limites visibles", "11"],
  ["toiture", "Toiture", "Toitures et pentes", "11"],
  ["facades", "Façades", "Façades et traitement architectural", "11"],
  ["plantations", "Plantations", "Plantations, arbres et obligations paysagères", "13"],
  ["acces_pompiers", "Accès pompiers", "Accès secours et sécurité incendie", "3"],
  ["eaux_pluviales", "Eaux pluviales", "Gestion des eaux pluviales", "4"],
  ["assainissement", "Assainissement", "Assainissement et eaux usées", "4"],
] as const;

export const REGULATORY_OVERLAY_TYPES = [
  "SPR",
  "PSMV",
  "PVAP",
  "PPRI",
  "PPRT",
  "ABF",
  "servitude",
] as const;

export const REGULATORY_NORMATIVE_EFFECTS = [
  "primary",
  "additive",
  "substitutive",
  "restrictive",
  "informative",
] as const;

export const REGULATORY_PROCEDURAL_EFFECTS = [
  "none",
  "abf_required",
  "manual_review_required",
  "special_authorization_possible",
  "delay_extension_watch",
] as const;

export const REGULATORY_STRUCTURE_MODES = [
  "articles_1_14",
  "chapters_sections",
  "prescriptions",
  "mixed",
] as const;

export const REGULATORY_RULE_ANCHOR_TYPES = [
  "article",
  "chapter",
  "section",
  "prescription",
  "legend",
  "manual",
] as const;

export const REGULATORY_RELATION_TYPES = [
  "references",
  "depends_on",
  "complements",
  "restricts",
  "substitutes",
  "procedural_dependency",
  "cross_checks_with",
  "exception_to",
  "derived_from",
] as const;

export const REGULATORY_RELATION_RESOLUTION_STATUSES = [
  "standalone",
  "complete",
  "partial",
  "unresolved",
] as const;

const RELATION_SIGNAL_PATTERNS: Array<{
  relationType: typeof REGULATORY_RELATION_TYPES[number];
  label: string;
  pattern: RegExp;
}> = [
  { relationType: "depends_on", label: "Sous réserve de", pattern: /\bsous réserve de\b/i },
  { relationType: "depends_on", label: "À condition de respecter", pattern: /\bà condition de respecter\b/i },
  { relationType: "references", label: "Conformément à", pattern: /\bconformément à\b/i },
  { relationType: "restricts", label: "Sauf dispositions de", pattern: /\bsauf dispositions de\b/i },
  { relationType: "procedural_dependency", label: "En application de", pattern: /\ben application de\b/i },
  { relationType: "procedural_dependency", label: "Avis requis", pattern: /\bavis\b.{0,20}\brequis\b/i },
];

const CRITICAL_RELATION_TYPES = new Set<string>([
  "depends_on",
  "restricts",
  "substitutes",
  "procedural_dependency",
  "exception_to",
  "cross_checks_with",
]);

export type CalibrationPage = {
  pageNumber: number;
  text: string;
  startOffset: number;
  endOffset: number;
};

export function splitDocumentIntoCalibrationPages(rawText: string): CalibrationPage[] {
  const normalized = normalizeExtractedText(rawText || "");
  if (!normalized) return [];

  const pages = normalized.split("\f");
  if (pages.length <= 1) {
    return [{
      pageNumber: 1,
      text: normalized,
      startOffset: 0,
      endOffset: normalized.length,
    }];
  }

  const result: CalibrationPage[] = [];
  let cursor = 0;
  for (let index = 0; index < pages.length; index++) {
    const pageText = pages[index] || "";
    result.push({
      pageNumber: index + 1,
      text: pageText.trim(),
      startOffset: cursor,
      endOffset: cursor + pageText.length,
    });
    cursor += pageText.length + 1;
  }
  return result.filter((page) => page.text.length > 0);
}

export async function ensureRegulatoryThemeTaxonomySeed() {
  const existing = await db.select({ code: regulatoryThemeTaxonomyTable.code }).from(regulatoryThemeTaxonomyTable);
  const existingCodes = new Set(existing.map((item) => item.code));
  const missing = REGULATORY_THEME_SEED
    .map(([code, label, description, articleHint], index) => ({
      code,
      label,
      description,
      articleHint,
      sortOrder: index,
      isActive: true,
      updatedAt: new Date(),
    }))
    .filter((item) => !existingCodes.has(item.code));

  if (missing.length > 0) {
    await db.insert(regulatoryThemeTaxonomyTable).values(missing);
  }

  return db.select().from(regulatoryThemeTaxonomyTable).where(eq(regulatoryThemeTaxonomyTable.isActive, true));
}

export function detectRuleRelationSignals(text: string | null | undefined) {
  const normalized = normalizeExtractedText(text || "");
  if (!normalized) return [];

  return RELATION_SIGNAL_PATTERNS.flatMap((entry) => {
    const match = normalized.match(entry.pattern);
    if (!match) return [];
    return [{
      relationType: entry.relationType,
      label: entry.label,
      matchedText: match[0],
      conditionText: normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized,
    }];
  });
}

export async function recordRegulatoryValidationHistory(args: {
  communeId: string;
  entityType: "zone" | "overlay" | "binding" | "excerpt" | "rule" | "conflict" | "relation";
  entityId: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  action: string;
  note?: string | null;
  userId?: string | null;
  snapshot?: Record<string, unknown>;
}) {
  await db.insert(regulatoryValidationHistoryTable).values({
    communeId: args.communeId,
    entityType: args.entityType,
    entityId: args.entityId,
    fromStatus: args.fromStatus || null,
    toStatus: args.toStatus || null,
    action: args.action,
    note: args.note || null,
    userId: args.userId || null,
    snapshot: args.snapshot || {},
  });
}

export async function recomputeIndexedRuleRelationResolution(args: {
  communeId: string;
  ruleIds?: string[];
}) {
  const rules = await db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.communeId, args.communeId));
  if (rules.length === 0) return;

  const scopeRuleIds = args.ruleIds?.length
    ? new Set(args.ruleIds)
    : null;

  const relations = await db.select().from(ruleRelationsTable).where(
    or(
      inArray(ruleRelationsTable.sourceRuleId, rules.map((rule) => rule.id)),
      inArray(ruleRelationsTable.targetRuleId, rules.map((rule) => rule.id)),
    )!,
  );

  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const relationsBySource = new Map<string, typeof relations>();
  for (const relation of relations) {
    const existing = relationsBySource.get(relation.sourceRuleId) || [];
    existing.push(relation);
    relationsBySource.set(relation.sourceRuleId, existing);
  }

  const updates = rules
    .filter((rule) => !scopeRuleIds || scopeRuleIds.has(rule.id))
    .map((rule) => {
      const outgoing = relationsBySource.get(rule.id) || [];
      if (outgoing.length === 0) {
        return {
          id: rule.id,
          isRelationalRule: false,
          requiresCrossDocumentResolution: false,
          resolutionStatus: "standalone",
          linkedRuleCount: 0,
        };
      }

      let resolvedCount = 0;
      let unresolvedCritical = 0;
      let requiresCrossDocumentResolution = false;

      for (const relation of outgoing) {
        const targetRule = relation.targetRuleId ? rulesById.get(relation.targetRuleId) : null;
        const hasTargetDocument = !!relation.targetDocumentId;
        const relationResolved = !!targetRule || (hasTargetDocument && !CRITICAL_RELATION_TYPES.has(relation.relationType));
        const isCritical = CRITICAL_RELATION_TYPES.has(relation.relationType);

        if (relation.sourceDocumentId !== relation.targetDocumentId || isCritical) {
          requiresCrossDocumentResolution = true;
        }

        if (relationResolved) {
          resolvedCount += 1;
        } else if (isCritical) {
          unresolvedCritical += 1;
        }
      }

      const resolutionStatus = unresolvedCritical > 0
        ? "unresolved"
        : (resolvedCount === outgoing.length ? "complete" : "partial");

      return {
        id: rule.id,
        isRelationalRule: true,
        requiresCrossDocumentResolution,
        resolutionStatus,
        linkedRuleCount: outgoing.length,
      };
    });

  for (const update of updates) {
    await db.update(indexedRegulatoryRulesTable)
      .set({
        isRelationalRule: update.isRelationalRule,
        requiresCrossDocumentResolution: update.requiresCrossDocumentResolution,
        resolutionStatus: update.resolutionStatus,
        linkedRuleCount: update.linkedRuleCount,
        updatedAt: new Date(),
      })
      .where(eq(indexedRegulatoryRulesTable.id, update.id));
  }
}

export function validateIndexedRuleForPublication(rule: {
  zoneId?: string | null;
  overlayId?: string | null;
  documentId?: string | null;
  excerptId?: string | null;
  articleCode?: string | null;
  ruleAnchorType?: string | null;
  ruleAnchorLabel?: string | null;
  themeCode?: string | null;
  sourceText?: string | null;
  sourcePage?: number | null;
}) {
  const normalizedArticle = typeof rule.articleCode === "string" ? rule.articleCode.trim().toLowerCase() : "";
  const hasArticle = normalizedArticle.length > 0 && normalizedArticle !== "manual";
  if (!rule.zoneId && !rule.overlayId) return { ok: false, message: "Zone ou couche réglementaire obligatoire avant publication." };
  if (!rule.documentId) return { ok: false, message: "Document source obligatoire avant publication." };
  if (!rule.excerptId) return { ok: false, message: "Extrait calibré obligatoire avant publication." };
  if (!hasArticle && !rule.ruleAnchorLabel) return { ok: false, message: "Article ou ancre réglementaire obligatoire avant publication." };
  if (!rule.themeCode) return { ok: false, message: "Thème métier obligatoire avant publication." };
  if (!rule.sourceText || rule.sourceText.trim().length < 8) return { ok: false, message: "Texte source obligatoire avant publication." };
  if (!Number.isFinite(Number(rule.sourcePage)) || Number(rule.sourcePage) <= 0) {
    return { ok: false, message: "Page source obligatoire avant publication." };
  }
  return { ok: true as const };
}

function rulesConflict(
  left: typeof indexedRegulatoryRulesTable.$inferSelect,
  right: typeof indexedRegulatoryRulesTable.$inferSelect,
) {
  if (left.themeCode !== right.themeCode) return false;
  if ((left.zoneId || null) !== (right.zoneId || null)) return false;
  if ((left.overlayId || null) !== (right.overlayId || null)) return false;
  if (left.id === right.id) return false;

  const leftNumeric = left.valueNumeric;
  const rightNumeric = right.valueNumeric;
  if (leftNumeric != null && rightNumeric != null && Math.abs(leftNumeric - rightNumeric) > 0.001) return true;

  const leftText = (left.valueText || "").trim().toLowerCase();
  const rightText = (right.valueText || "").trim().toLowerCase();
  if (leftText && rightText && leftText !== rightText) return true;

  const leftOperator = (left.operator || "").trim();
  const rightOperator = (right.operator || "").trim();
  if (leftOperator && rightOperator && leftOperator !== rightOperator && (leftNumeric != null || leftText)) return true;

  return false;
}

export async function recomputeIndexedRuleConflicts(args: {
  communeId: string;
  zoneId?: string | null;
  overlayId?: string | null;
}) {
  const shouldRecomputeWholeCommune = !!args.overlayId;
  const scopeFilters = [
    !shouldRecomputeWholeCommune && args.zoneId ? eq(indexedRegulatoryRulesTable.zoneId, args.zoneId) : null,
  ].filter((value): value is Exclude<typeof value, null> => !!value);

  const ruleFilter = and(
    eq(indexedRegulatoryRulesTable.communeId, args.communeId),
    ne(indexedRegulatoryRulesTable.status, "draft"),
    scopeFilters.length > 0 ? or(...scopeFilters) : undefined,
  );

  const rules = await db.select().from(indexedRegulatoryRulesTable).where(ruleFilter);
  const conflictPairs = new Map<string, typeof rules[number]>();
  const conflictedRuleIds = new Set<string>();

  for (const left of rules) {
    for (const right of rules) {
      if (!rulesConflict(left, right)) continue;
      const ordered = [left.id, right.id].sort();
      const key = `${ordered[0]}:${ordered[1]}`;
      if (!conflictPairs.has(key)) {
        conflictedRuleIds.add(left.id);
        conflictedRuleIds.add(right.id);
        conflictPairs.set(key, left);
      }
    }
  }

  await db.delete(regulatoryRuleConflictsTable).where(
    shouldRecomputeWholeCommune
      ? eq(regulatoryRuleConflictsTable.communeId, args.communeId)
      : args.zoneId
        ? and(eq(regulatoryRuleConflictsTable.communeId, args.communeId), eq(regulatoryRuleConflictsTable.zoneId, args.zoneId))
        : eq(regulatoryRuleConflictsTable.communeId, args.communeId),
  );

  if (rules.length > 0) {
    for (const rule of rules) {
      await db.update(indexedRegulatoryRulesTable)
        .set({ conflictFlag: conflictedRuleIds.has(rule.id), updatedAt: new Date() })
        .where(eq(indexedRegulatoryRulesTable.id, rule.id));
    }
  }

  if (conflictPairs.size > 0) {
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    await db.insert(regulatoryRuleConflictsTable).values(
      Array.from(conflictPairs.keys()).map((key) => {
        const [leftId, rightId] = key.split(":");
        const leftRule = rulesById.get(leftId)!;
        const rightRule = rulesById.get(rightId)!;
        return {
          communeId: args.communeId,
          zoneId: leftRule.zoneId,
          leftRuleId: leftId,
          rightRuleId: rightId,
          themeCode: leftRule.themeCode,
          conflictType: "value_mismatch",
          conflictSummary: `Conflit détecté sur ${leftRule.ruleLabel} pour ${leftRule.overlayId ? "cette couche réglementaire" : "cette zone"}.`,
          status: "open",
          updatedAt: new Date(),
        };
      }),
    );
  }
}

export async function buildCalibrationSuggestionsForDocument(args: {
  communeAliases: string[];
  townHallDocumentId: string;
}) {
  const [rules, sections] = await Promise.all([
    db.select().from(urbanRulesTable).where(
      and(
        inArray(urbanRulesTable.municipalityId, args.communeAliases),
        eq(urbanRulesTable.townHallDocumentId, args.townHallDocumentId),
      ),
    ),
    db.select().from(regulatoryZoneSectionsTable).where(
      and(
        inArray(regulatoryZoneSectionsTable.municipalityId, args.communeAliases),
        eq(regulatoryZoneSectionsTable.townHallDocumentId, args.townHallDocumentId),
      ),
    ),
  ]);

  return {
    sections: sections.map((section) => ({
      id: section.id,
      zoneCode: section.reviewedZoneCode || section.zoneCode,
      heading: section.heading,
      startPage: section.reviewedStartPage ?? section.startPage,
      endPage: section.reviewedEndPage ?? section.endPage,
      sourceText: section.sourceText.slice(0, 800),
    })),
    rules: rules.map((rule) => ({
      id: rule.id,
      zoneCode: rule.zoneCode,
      articleCode: rule.sourceArticle?.replace(/[^0-9]/g, "") || null,
      themeCode: rule.ruleTopic,
      label: rule.ruleLabel,
      sourceText: rule.sourceExcerpt || rule.ruleTextRaw.slice(0, 800),
      sourcePage: rule.sourcePage,
      confidenceScore: rule.confidenceScore,
    })),
  };
}

export async function listPublishedRulesForCommune(communeId: string) {
  return db.select({
    id: indexedRegulatoryRulesTable.id,
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
    publishedAt: indexedRegulatoryRulesTable.publishedAt,
    zoneCode: regulatoryCalibrationZonesTable.zoneCode,
    zoneLabel: regulatoryCalibrationZonesTable.zoneLabel,
    overlayCode: regulatoryOverlaysTable.overlayCode,
    overlayLabel: regulatoryOverlaysTable.overlayLabel,
    overlayType: indexedRegulatoryRulesTable.overlayType,
    normativeEffect: indexedRegulatoryRulesTable.normativeEffect,
    proceduralEffect: indexedRegulatoryRulesTable.proceduralEffect,
    applicabilityScope: indexedRegulatoryRulesTable.applicabilityScope,
    ruleAnchorType: indexedRegulatoryRulesTable.ruleAnchorType,
    ruleAnchorLabel: indexedRegulatoryRulesTable.ruleAnchorLabel,
    isRelationalRule: indexedRegulatoryRulesTable.isRelationalRule,
    requiresCrossDocumentResolution: indexedRegulatoryRulesTable.requiresCrossDocumentResolution,
    resolutionStatus: indexedRegulatoryRulesTable.resolutionStatus,
    linkedRuleCount: indexedRegulatoryRulesTable.linkedRuleCount,
  })
    .from(indexedRegulatoryRulesTable)
    .leftJoin(regulatoryCalibrationZonesTable, eq(indexedRegulatoryRulesTable.zoneId, regulatoryCalibrationZonesTable.id))
    .leftJoin(regulatoryOverlaysTable, eq(indexedRegulatoryRulesTable.overlayId, regulatoryOverlaysTable.id))
    .where(and(eq(indexedRegulatoryRulesTable.communeId, communeId), eq(indexedRegulatoryRulesTable.status, "published")));
}

export async function listCommuneCalibrationZones(communeAliases: string[]) {
  return db.select()
    .from(regulatoryCalibrationZonesTable)
    .where(
      or(
        inArray(regulatoryCalibrationZonesTable.communeId, communeAliases),
        ...communeAliases.map((alias) => eq(regulatoryCalibrationZonesTable.communeId, alias)),
      )!,
    );
}

export async function listCommuneRegulatoryOverlays(communeAliases: string[]) {
  return db.select()
    .from(regulatoryOverlaysTable)
    .where(
      or(
        inArray(regulatoryOverlaysTable.communeId, communeAliases),
        ...communeAliases.map((alias) => eq(regulatoryOverlaysTable.communeId, alias)),
      )!,
    );
}

export async function listDocumentCalibrationData(args: { communeAliases: string[]; documentId: string }) {
  const [zones, overlays, bindings, excerpts, rules, conflicts] = await Promise.all([
    listCommuneCalibrationZones(args.communeAliases),
    listCommuneRegulatoryOverlays(args.communeAliases),
    db.select().from(overlayDocumentBindingsTable).where(eq(overlayDocumentBindingsTable.documentId, args.documentId)),
    db.select().from(calibratedExcerptsTable).where(eq(calibratedExcerptsTable.documentId, args.documentId)),
    db.select().from(indexedRegulatoryRulesTable).where(eq(indexedRegulatoryRulesTable.documentId, args.documentId)),
    db.select().from(regulatoryRuleConflictsTable).where(eq(regulatoryRuleConflictsTable.communeId, args.communeAliases[0] || "")),
  ]);

  const ruleIds = rules.map((rule) => rule.id);
  const relations = ruleIds.length > 0
    ? await db.select().from(ruleRelationsTable).where(
        or(
          inArray(ruleRelationsTable.sourceRuleId, ruleIds),
          inArray(ruleRelationsTable.targetRuleId, ruleIds),
        )!,
      )
    : [];

  return { zones, overlays, bindings, excerpts, rules, conflicts, relations };
}
