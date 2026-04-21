import { db, communesTable, municipalitySettingsTable, townHallDocumentsTable } from "@workspace/db";
import { inArray, or, sql } from "drizzle-orm";

export function normalizeMunicipalityName(raw: unknown) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(
    values
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0),
  ));
}

function normalizedSql(column: any) {
  return sql<string>`
    regexp_replace(
      translate(
        lower(coalesce(${column}, '')),
        'àáâãäåçèéêëìíîïñòóôõöùúûüÿý',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ),
      '[^a-z0-9]',
      '',
      'g'
    )
  `;
}

export function buildMunicipalityTextFilter(column: any, aliases: string[]) {
  const cleanAliases = uniqueNonEmpty(aliases);
  if (cleanAliases.length === 0) return sql`FALSE`;

  const normalizedAliases = Array.from(new Set(
    cleanAliases
      .map(normalizeMunicipalityName)
      .filter(Boolean),
  ));

  return or(
    inArray(column, cleanAliases),
    ...cleanAliases.map((alias) => sql`lower(${column}) = lower(${alias})`),
    normalizedAliases.length > 0
      ? inArray(normalizedSql(column), normalizedAliases)
      : sql`FALSE`,
  )!;
}

export async function resolveMunicipalityAliases(primary?: string | null, hint?: string | null) {
  const inputs = uniqueNonEmpty([primary, hint]);
  const normalizedInputs = inputs.map(normalizeMunicipalityName).filter(Boolean);
  const inseeInputs = inputs.filter((value) => /^\d{5}$/.test(value));

  let inseeCode = inseeInputs[0] || null;
  let communeName: string | null = inputs.find((value) => !/^\d{5}$/.test(value)) || null;

  if (inputs.length > 0) {
    const [setting] = await db.select({
      commune: municipalitySettingsTable.commune,
      inseeCode: municipalitySettingsTable.inseeCode,
    })
      .from(municipalitySettingsTable)
      .where(buildMunicipalityTextFilter(municipalitySettingsTable.commune, inputs.concat(inseeInputs)))
      .limit(1);

    if (setting?.commune) communeName = setting.commune;
    if (setting?.inseeCode) inseeCode = setting.inseeCode;
  }

  if (inseeInputs.length > 0 && (!communeName || !inseeCode)) {
    const [settingByInsee] = await db.select({
      commune: municipalitySettingsTable.commune,
      inseeCode: municipalitySettingsTable.inseeCode,
    })
      .from(municipalitySettingsTable)
      .where(inArray(municipalitySettingsTable.inseeCode, inseeInputs))
      .limit(1);

    if (settingByInsee?.commune) communeName = settingByInsee.commune;
    if (settingByInsee?.inseeCode) inseeCode = settingByInsee.inseeCode;
  }

  if (!communeName || !inseeCode) {
    const communeFilterAliases = inputs.filter((value) => !/^\d{5}$/.test(value));
    const whereClause = inseeInputs.length > 0
      ? or(
          inArray(communesTable.inseeCode, inseeInputs),
          communeFilterAliases.length > 0 ? buildMunicipalityTextFilter(communesTable.name, communeFilterAliases) : sql`FALSE`,
        )
      : buildMunicipalityTextFilter(communesTable.name, inputs);
    const [commune] = await db.select({
      name: communesTable.name,
      inseeCode: communesTable.inseeCode,
    })
      .from(communesTable)
      .where(whereClause)
      .limit(1);

    if (commune?.name) communeName = commune.name;
    if (commune?.inseeCode) inseeCode = commune.inseeCode;
  }

  if (!communeName || !inseeCode) {
    const [markdownMetadata] = await db.select({
      commune: sql<string | null>`${townHallDocumentsTable.structuredContent}->'consolidatedMarkdownMetadata'->>'commune'`,
      inseeCode: sql<string | null>`${townHallDocumentsTable.structuredContent}->'consolidatedMarkdownMetadata'->>'inseeCode'`,
    })
      .from(townHallDocumentsTable)
      .where(buildMunicipalityTextFilter(
        sql`${townHallDocumentsTable.structuredContent}->'consolidatedMarkdownMetadata'->>'commune'`,
        inputs,
      ))
      .limit(1);

    if (markdownMetadata?.commune) communeName = markdownMetadata.commune;
    if (markdownMetadata?.inseeCode) inseeCode = markdownMetadata.inseeCode;
  }

  return {
    municipalityId: inseeCode || primary || communeName || "",
    inseeCode,
    communeName,
    aliases: uniqueNonEmpty([
      primary,
      hint,
      inseeCode,
      communeName,
    ]),
    normalizedAliases: Array.from(new Set([
      ...normalizedInputs,
      normalizeMunicipalityName(communeName),
    ].filter(Boolean))),
  };
}
