import { db, dossiersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export type StableParcelAnalysis = {
  parcelRef: string | null;
  parcelId: string | null;
  section: string | null;
  number: string | null;
  commune: string | null;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
  zoneCode: string | null;
  zoneLabel: string | null;
  zoningLabel: string | null;
  constraints: unknown[];
  overlays: unknown[];
  source: "parcel-analysis";
};

function pickFirst<T>(...values: T[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

export function normalizeParcelAnalysis(raw: any): StableParcelAnalysis {
  const primaryParcel = raw?.primaryParcel || raw?.parcel || raw?.metadata?.parcelAnalysis?.primaryParcel || {};
  const zoningPreview = raw?.zoningPreview || raw?.zoning || {};
  const coordinates = raw?.coordinates || raw?.geometry || {};
  const lon = Number(pickFirst(raw?.lon, raw?.lng, raw?.longitude, coordinates?.lon, coordinates?.lng));
  const lat = Number(pickFirst(raw?.lat, raw?.latitude, coordinates?.lat));
  return {
    parcelRef: pickFirst(raw?.parcelRef, raw?.parcel_ref, primaryParcel?.parcelRef, primaryParcel?.id, raw?.banParcelles?.[0]) as string | null,
    parcelId: pickFirst(raw?.parcelId, primaryParcel?.id, primaryParcel?.parcelId) as string | null,
    section: pickFirst(raw?.section, primaryParcel?.section) as string | null,
    number: pickFirst(raw?.number, raw?.numero, primaryParcel?.number, primaryParcel?.numero) as string | null,
    commune: pickFirst(raw?.commune, raw?.city, primaryParcel?.commune) as string | null,
    postcode: pickFirst(raw?.postcode, raw?.zipCode, raw?.postalCode) as string | null,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    zoneCode: pickFirst(raw?.zoneCode, raw?.zone_code, zoningPreview?.zoneCode, raw?.pluAnalysis?.zone?.code) as string | null,
    zoneLabel: pickFirst(raw?.zoneLabel, zoningPreview?.zoneLabel, raw?.pluAnalysis?.zone?.label) as string | null,
    zoningLabel: pickFirst(raw?.zoningLabel, zoningPreview?.zoningLabel) as string | null,
    constraints: Array.isArray(raw?.constraints) ? raw.constraints : [],
    overlays: Array.isArray(raw?.overlays) ? raw.overlays : [],
    source: "parcel-analysis",
  };
}

export async function linkParcelAnalysisToDossier(dossierId: string, parcelAnalysis: unknown) {
  const stable = normalizeParcelAnalysis(parcelAnalysis);
  const updates: Partial<typeof dossiersTable.$inferInsert> = {
    metadata: sql`jsonb_set(COALESCE(${dossiersTable.metadata}, '{}'::jsonb), '{parcelAnalysis}', ${JSON.stringify(stable)}::jsonb, true)` as any,
    updatedAt: new Date(),
  };
  if (stable.commune) updates.commune = sql`COALESCE(${dossiersTable.commune}, ${stable.commune})` as any;
  const [dossier] = await db.update(dossiersTable)
    .set(updates)
    .where(eq(dossiersTable.id, dossierId as any))
    .returning();
  return { dossier, parcelAnalysis: stable };
}
