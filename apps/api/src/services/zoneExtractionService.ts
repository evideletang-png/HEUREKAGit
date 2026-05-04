import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  regulatoryCalibrationZonesTable,
  regulatoryControlsTable,
  reglementAnalysisTable,
  zoneRegulatoryRulesTable,
} from "@workspace/db";
import type { ParsedReglementAnalysis } from "./reglementParser.js";
import { reglementConfidenceToScore } from "./reglementParser.js";

function normalizeZoneCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function articleControlType(articleNumber: number | null, topic: string) {
  const normalizedTopic = topic.toLowerCase();
  if (normalizedTopic.includes("destination")) return "destination";
  if (normalizedTopic.includes("voie") || normalizedTopic.includes("implantation_voie")) return "implantation_voie";
  if (normalizedTopic.includes("limite")) return "limites_separatives";
  if (normalizedTopic.includes("hauteur")) return "hauteur";
  if (normalizedTopic.includes("emprise")) return "emprise";
  if (normalizedTopic.includes("stationnement")) return "stationnement";
  if (normalizedTopic.includes("aspect") || normalizedTopic.includes("materiaux") || normalizedTopic.includes("matériaux")) return "aspect_exterieur";
  if (normalizedTopic.includes("espace") || normalizedTopic.includes("plantation")) return "espaces_libres";
  if (normalizedTopic.includes("risque")) return "risques";
  if (normalizedTopic.includes("patrimoine") || normalizedTopic.includes("spr") || normalizedTopic.includes("abf")) return "patrimoine";
  if (normalizedTopic.includes("servitude")) return "servitudes";

  switch (articleNumber) {
    case 1:
    case 2:
      return "destination";
    case 6:
      return "implantation_voie";
    case 7:
      return "limites_separatives";
    case 9:
      return "emprise";
    case 10:
      return "hauteur";
    case 11:
      return "aspect_exterieur";
    case 12:
      return "stationnement";
    case 13:
      return "espaces_libres";
    default:
      return "general";
  }
}

export async function extractZonesFromAnalysis(args: {
  communeId: string;
  analysisId: string;
  parsed: ParsedReglementAnalysis;
  documentId?: string | null;
  userId?: string | null;
}) {
  const differences: Array<{ zoneCode: string; status: string; message: string }> = [];
  const touchedZones: Array<typeof regulatoryCalibrationZonesTable.$inferSelect> = [];
  let insertedRuleCount = 0;
  let insertedControlCount = 0;

  for (const parsedZone of args.parsed.zones) {
    const zoneCode = normalizeZoneCode(parsedZone.zoneCode);
    if (!zoneCode) continue;

    const [existingZone] = await db.select().from(regulatoryCalibrationZonesTable)
      .where(and(
        eq(regulatoryCalibrationZonesTable.communeId, args.communeId),
        eq(regulatoryCalibrationZonesTable.zoneCode, zoneCode),
      ))
      .limit(1);

    if (existingZone?.status === "validated") {
      differences.push({
        zoneCode,
        status: "preserved_validated_zone",
        message: "Zone déjà validée : l'import est versionné mais la zone et ses règles ne sont pas écrasées automatiquement.",
      });
      continue;
    }

    const zoneValues = {
      zoneLabel: parsedZone.zoneLabel,
      zoneType: parsedZone.zoneType,
      summary: parsedZone.summary,
      guidanceNotes: [
        parsedZone.summary,
        parsedZone.warnings.length > 0 ? `Alertes : ${parsedZone.warnings.join(" · ")}` : "",
        parsedZone.linkedDocuments.length > 0 ? `Documents liés : ${parsedZone.linkedDocuments.map((doc) => `${doc.documentType}: ${doc.effect}`).join(" · ")}` : "",
      ].filter(Boolean).join("\n"),
      updatedBy: args.userId || null,
      updatedAt: new Date(),
    };

    const [zone] = existingZone
      ? await db.update(regulatoryCalibrationZonesTable)
          .set(zoneValues)
          .where(eq(regulatoryCalibrationZonesTable.id, existingZone.id))
          .returning()
      : await db.insert(regulatoryCalibrationZonesTable)
          .values({
            communeId: args.communeId,
            zoneCode,
            status: "draft",
            searchKeywords: [zoneCode, parsedZone.zoneLabel].filter(Boolean) as string[],
            createdBy: args.userId || null,
            ...zoneValues,
          })
          .returning();

    touchedZones.push(zone);

    await db.delete(zoneRegulatoryRulesTable).where(and(
      eq(zoneRegulatoryRulesTable.zoneId, zone.id),
      eq(zoneRegulatoryRulesTable.validationStatus, "draft"),
    ));
    await db.delete(regulatoryControlsTable).where(and(
      eq(regulatoryControlsTable.zoneId, zone.id),
      eq(regulatoryControlsTable.validationStatus, "draft"),
    ));

    const ruleValues = parsedZone.articles.flatMap((article) => {
      const articleRules = article.rules.length > 0
        ? article.rules
        : article.summary
          ? [{ topic: `article_${article.articleNumber || "general"}`, ruleText: article.summary, condition: null, exceptions: null, confidence: "medium" as const }]
          : [];
      return articleRules.map((rule) => ({
        zoneId: zone.id,
        articleNumber: article.articleNumber,
        articleTitle: article.articleTitle,
        topic: rule.topic || "general",
        ruleText: rule.ruleText,
        conditions: rule.condition,
        exceptions: rule.exceptions,
        sourceDocumentId: args.documentId || null,
        sourceExcerpt: rule.ruleText.slice(0, 1200),
        confidenceScore: reglementConfidenceToScore(rule.confidence),
        validationStatus: "draft",
        analysisId: args.analysisId,
      }));
    });

    if (ruleValues.length > 0) {
      await db.insert(zoneRegulatoryRulesTable).values(ruleValues);
      insertedRuleCount += ruleValues.length;
    }

    const generatedControls = [
      ...ruleValues.map((rule) => ({
        zoneId: zone.id,
        controlType: articleControlType(rule.articleNumber, rule.topic),
        rule: rule.ruleText,
        sourceArticle: rule.articleNumber ? `Article ${rule.articleNumber}` : null,
        sourceDocumentId: args.documentId || null,
        confidenceScore: rule.confidenceScore,
        validationStatus: "draft",
        sourceExcerpt: rule.sourceExcerpt,
        analysisId: args.analysisId,
      })),
      ...parsedZone.controls.map((control) => ({
        zoneId: zone.id,
        controlType: control.controlType,
        rule: control.rule,
        sourceArticle: control.sourceArticle,
        sourceDocumentId: args.documentId || null,
        confidenceScore: reglementConfidenceToScore(control.confidence),
        validationStatus: "draft",
        sourceExcerpt: control.rule.slice(0, 1200),
        analysisId: args.analysisId,
      })),
    ].filter((control) => control.rule);

    if (generatedControls.length > 0) {
      await db.insert(regulatoryControlsTable).values(generatedControls);
      insertedControlCount += generatedControls.length;
    }
  }

  await db.update(reglementAnalysisTable)
    .set({
      status: args.parsed.zones.length > 0 ? "draft" : "fallback_legacy",
      updatedAt: new Date(),
    })
    .where(eq(reglementAnalysisTable.id, args.analysisId));

  return {
    zoneCount: touchedZones.length,
    ruleCount: insertedRuleCount,
    controlCount: insertedControlCount,
    differences,
  };
}

export async function getZoneByParcel(args: {
  communeId: string;
  zoneCode?: string | null;
  parcelId?: string | null;
}) {
  const zoneCode = normalizeZoneCode(args.zoneCode);
  if (!zoneCode) return null;
  const aliases = [zoneCode, zoneCode.replace(/[^A-Z0-9]/g, "")].filter(Boolean);
  const [zone] = await db.select().from(regulatoryCalibrationZonesTable)
    .where(and(
      eq(regulatoryCalibrationZonesTable.communeId, args.communeId),
      inArray(regulatoryCalibrationZonesTable.zoneCode, Array.from(new Set(aliases))),
    ))
    .limit(1);
  return zone || null;
}

export async function getRulesByZone(zoneId: string) {
  return db.select().from(zoneRegulatoryRulesTable)
    .where(and(
      eq(zoneRegulatoryRulesTable.zoneId, zoneId),
      inArray(zoneRegulatoryRulesTable.validationStatus, ["validated", "draft"]),
    ));
}

export async function getControlsByZone(zoneId: string) {
  return db.select().from(regulatoryControlsTable)
    .where(and(
      eq(regulatoryControlsTable.zoneId, zoneId),
      inArray(regulatoryControlsTable.validationStatus, ["validated", "draft"]),
    ));
}
