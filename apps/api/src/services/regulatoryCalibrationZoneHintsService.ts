import { db, regulatoryCalibrationZonesTable } from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";

function buildZoneCodeAliases(zoneCode?: string | null): string[] {
  if (!zoneCode || zoneCode.trim().length === 0) return [];
  const normalized = zoneCode.trim().toUpperCase();
  const baseZoneMatch = normalized.match(/^([A-Z]+)/);
  const baseZone = baseZoneMatch && baseZoneMatch[1] ? baseZoneMatch[1].toUpperCase() : normalized;
  const suffix = normalized.startsWith(baseZone) ? normalized.slice(baseZone.length) : "";
  const hasSubZone = suffix.length > 0 && normalized !== baseZone;
  return hasSubZone ? [normalized, baseZone] : [normalized];
}

function uniqueNormalizedKeywords(rawKeywords: unknown): string[] {
  if (!Array.isArray(rawKeywords)) return [];
  return Array.from(new Set(
    rawKeywords
      .map((keyword) => String(keyword).trim())
      .filter((keyword) => keyword.length > 0),
  ));
}

export async function loadZoneSearchKeywords(args: {
  municipalityAliases: string[];
  zoneCode?: string | null;
}) {
  const municipalityAliases = Array.from(new Set(
    args.municipalityAliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0),
  ));
  const zoneAliases = buildZoneCodeAliases(args.zoneCode);

  if (municipalityAliases.length === 0 || zoneAliases.length === 0) {
    return [] as string[];
  }

  const rows = await db.select({
    zoneCode: regulatoryCalibrationZonesTable.zoneCode,
    searchKeywords: regulatoryCalibrationZonesTable.searchKeywords,
  }).from(regulatoryCalibrationZonesTable)
    .where(
      and(
        eq(regulatoryCalibrationZonesTable.isActive, true),
        inArray(regulatoryCalibrationZonesTable.zoneCode, zoneAliases),
        or(
          inArray(regulatoryCalibrationZonesTable.communeId, municipalityAliases),
          ...municipalityAliases.map((alias) => sql`lower(${regulatoryCalibrationZonesTable.communeId}) = lower(${alias})`),
        )!,
      ),
    );

  const byPriority = rows
    .slice()
    .sort((left, right) => {
      const leftPriority = left.zoneCode === zoneAliases[0] ? 0 : 1;
      const rightPriority = right.zoneCode === zoneAliases[0] ? 0 : 1;
      return leftPriority - rightPriority;
    });

  return Array.from(new Set(byPriority.flatMap((row) => uniqueNormalizedKeywords(row.searchKeywords))));
}
