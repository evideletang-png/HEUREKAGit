import type { LocationProviderResult, ParcelContextInput } from "../analyzeParcelContext";
import { failed, firstDefined, numberFrom, ok, partial } from "./providerUtils";

function normalizeParcel(input: ParcelContextInput, preview?: any) {
  const source = preview || input.existingParcelAnalysis || {};
  const primary = source.primaryParcel || source.parcels?.[0] || source.parcel || {};
  const section = firstDefined(primary.section, source.section);
  const number = firstDefined(primary.numero, primary.number, source.number, source.numero);
  const fullReference = firstDefined(primary.parcelRef, primary.idu, primary.id, source.parcelRef, source.parcelId, input.parcelId);
  return {
    id: firstDefined(primary.idu, primary.id, source.parcelId, input.parcelId),
    section,
    number,
    fullReference,
    surfaceM2: numberFrom(primary.contenanceM2, primary.contenance, source.contenanceM2, source.parcelSurfaceM2, source.surfaceM2),
    builtSurfaceApproxM2: numberFrom(source.builtSurfaceApproxM2, source.buildingsSurfaceM2),
    footprintApproxM2: numberFrom(source.footprintApproxM2, source.empriseM2),
  };
}

export async function resolveCadastreContext(input: ParcelContextInput): Promise<LocationProviderResult> {
  if (input.demo) {
    return ok("cadastre", {
      parcel: {
        id: "demo-cadastre-ab-123",
        section: "AB",
        number: "123",
        fullReference: "AB 123",
        surfaceM2: 650,
        builtSurfaceApproxM2: 110,
        footprintApproxM2: 138,
      },
      commune: input.commune || "Commune Démo",
      codeInsee: input.codeInsee || "37261",
    }, 0.96);
  }

  const existingParcel = normalizeParcel(input);
  if (input.existingParcelAnalysis) {
    return ok("cadastre", {
      parcel: existingParcel,
      commune: firstDefined(input.existingParcelAnalysis.commune, input.commune),
      codeInsee: firstDefined(input.existingParcelAnalysis.codeInsee, input.codeInsee),
    }, existingParcel.fullReference ? 0.82 : 0.55);
  }

  const lat = input.coordinates?.lat;
  const lon = input.coordinates?.lon ?? input.coordinates?.lng;
  if (lat == null || lon == null) {
    return partial("cadastre", { parcel: existingParcel, commune: input.commune || null, codeInsee: input.codeInsee || null }, ["cadastre.coordinates"], 0.38);
  }

  try {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
    const response = await fetch("/api/analyses/parcel-preview", {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat,
        lng: lon,
        banId: input.banId,
        label: input.address,
        banParcelles: input.banParcelles || [],
      }),
    }).finally(() => globalThis.clearTimeout(timeout));
    if (!response.ok) throw new Error("Cadastre indisponible");
    const preview = await response.json();
    return ok("cadastre", {
      parcel: normalizeParcel(input, preview),
      commune: firstDefined(preview.commune, input.commune),
      codeInsee: firstDefined(preview.codeInsee, input.codeInsee),
      preview,
    }, 0.84);
  } catch (error) {
    return failed("cadastre", error, ["cadastre"]);
  }
}
