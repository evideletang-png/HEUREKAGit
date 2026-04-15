/**
 * Geo Constraints Service
 * Fetches geographic constraints for a parcel from two public IGN APIs:
 *   - apicarto.ign.fr/api/nature  — protected natural zones (ZNIEFF, Natura 2000, PN, PNR, RNN)
 *   - apicarto.ign.fr/api/gpu     — urban planning servitudes (SUP) and prescriptions
 *
 * All calls are fire-and-forget with per-call error isolation: if one endpoint
 * fails (network, 4xx, 5xx) the others still run and the result is still useful.
 * Returns an array of GeoConstraint objects ready to be inserted in constraintsTable.
 */

const IGN_APICARTO = "https://apicarto.ign.fr/api";
const TIMEOUT_MS   = 15000;

function sig() { return AbortSignal.timeout(TIMEOUT_MS); }

export type ConstraintCategory = "protection" | "servitude" | "nuisance" | "risque" | "autre";
export type ConstraintSeverity = "high" | "medium" | "low" | "info";

export interface GeoConstraint {
  category:    ConstraintCategory;
  title:       string;
  description: string;
  severity:    ConstraintSeverity;
  source:      string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchNature(endpoint: string, geomStr: string): Promise<any[]> {
  try {
    const url = `${IGN_APICARTO}/nature/${endpoint}?geom=${encodeURIComponent(geomStr)}&_limit=5`;
    const res = await fetch(url, { signal: sig() });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}

async function fetchGpuLayer(path: string, geomStr: string): Promise<any[]> {
  try {
    const url = `${IGN_APICARTO}/gpu/${path}?geom=${encodeURIComponent(geomStr)}&_limit=20`;
    const res = await fetch(url, { signal: sig() });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}

// Known SUP category codes → human-readable label + severity
const SUP_LABELS: Record<string, { label: string; severity: ConstraintSeverity }> = {
  "PM1": { label: "Zone inondable — Plan de Prévention du Risque Inondation (PPRI)",    severity: "high"   },
  "PM2": { label: "Risques naturels — Plan de Prévention (PPRN)",                       severity: "high"   },
  "PM3": { label: "Risques technologiques — Plan de Prévention (PPRT)",                 severity: "high"   },
  "PT1": { label: "Servitude ferroviaire",                                              severity: "medium" },
  "PT2": { label: "Servitude voirie routière",                                          severity: "medium" },
  "PT3": { label: "Servitude voies navigables",                                         severity: "low"    },
  "I4":  { label: "Réseau électrique haute tension",                                    severity: "medium" },
  "I3":  { label: "Canalisation de gaz",                                                severity: "medium" },
  "AC1": { label: "Abords de monument historique (périmètre 500 m)",                    severity: "high"   },
  "AC2": { label: "Zone de protection du patrimoine architectural (ZPPAUP/AVAP)",       severity: "high"   },
  "AC4": { label: "Site inscrit",                                                        severity: "medium" },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches all geographic constraints for a point (or parcel polygon).
 *
 * @param lat           Latitude of the parcel centroid
 * @param lng           Longitude of the parcel centroid
 * @param parcelGeometry  Optional full GeoJSON Feature/Geometry for more precise intersection
 */
export async function fetchGeoConstraints(
  lat: number,
  lng: number,
  parcelGeometry?: object
): Promise<GeoConstraint[]> {
  // Build the geometry string used in all API queries
  const pointGeom = { type: "Point", coordinates: [lng, lat] };
  let queryGeom: object = pointGeom;
  if (parcelGeometry) {
    // Accept Feature or bare Geometry
    const raw = parcelGeometry as any;
    queryGeom = raw.geometry ?? raw;
  }
  const geomStr = JSON.stringify(queryGeom);

  // Fire all requests in parallel — individual failures are silenced
  const [
    znieff1Feats, znieff2Feats,
    natHabitatFeats, natOiseauxFeats,
    pnFeats, pnrFeats, rnnFeats,
    supSurfFeats, supLinFeats,
    prescSurfFeats,
  ] = await Promise.all([
    fetchNature("znieff1",         geomStr),
    fetchNature("znieff2",         geomStr),
    fetchNature("natura-habitat",  geomStr),
    fetchNature("natura-oiseaux",  geomStr),
    fetchNature("pn",              geomStr),
    fetchNature("pnr",             geomStr),
    fetchNature("rnn",             geomStr),
    fetchGpuLayer("assiette-sup-s", geomStr),
    fetchGpuLayer("assiette-sup-l", geomStr),
    fetchGpuLayer("prescription-surf", geomStr),
  ]);

  const constraints: GeoConstraint[] = [];

  // ── Natural protection zones ─────────────────────────────────────────────

  if (znieff1Feats.length > 0) {
    const names = znieff1Feats
      .map((f: any) => f.properties?.nom_site || f.properties?.id_mnhn || "")
      .filter(Boolean).join(", ");
    constraints.push({
      category:    "protection",
      title:       "ZNIEFF Type 1 — Zone naturelle d'intérêt écologique remarquable",
      description: names
        ? `Site(s) : ${names}`
        : "Le terrain est inclus dans une ZNIEFF de type 1 (espèces ou habitats remarquables).",
      severity: "high",
      source:   "MNHN / IGN apicarto",
    });
  }

  if (znieff2Feats.length > 0) {
    const names = znieff2Feats
      .map((f: any) => f.properties?.nom_site || f.properties?.id_mnhn || "")
      .filter(Boolean).join(", ");
    constraints.push({
      category:    "protection",
      title:       "ZNIEFF Type 2 — Zone écologique étendue",
      description: names
        ? `Site(s) : ${names}`
        : "Le terrain est situé dans une ZNIEFF de type 2 (grand ensemble écologique).",
      severity: "medium",
      source:   "MNHN / IGN apicarto",
    });
  }

  const naturaFeats = [...natHabitatFeats, ...natOiseauxFeats];
  if (naturaFeats.length > 0) {
    const names = naturaFeats
      .map((f: any) => f.properties?.sitename || f.properties?.sitecode || "")
      .filter(Boolean).join(", ");
    constraints.push({
      category:    "protection",
      title:       "Natura 2000 — Directive Habitats / Oiseaux",
      description: names
        ? `Site(s) européen(s) : ${names}`
        : "Le terrain est inclus dans un site Natura 2000 (protection européenne).",
      severity: "high",
      source:   "MNHN / IGN apicarto",
    });
  }

  if (pnFeats.length > 0) {
    const names = pnFeats
      .map((f: any) => f.properties?.nom_site || "")
      .filter(Boolean).join(", ");
    constraints.push({
      category:    "protection",
      title:       "Parc National",
      description: names
        ? `Parc : ${names}`
        : "Le terrain est situé dans le périmètre d'un Parc National.",
      severity: "high",
      source:   "MNHN / IGN apicarto",
    });
  }

  if (pnrFeats.length > 0) {
    const names = pnrFeats
      .map((f: any) => f.properties?.nom_site || "")
      .filter(Boolean).join(", ");
    constraints.push({
      category:    "protection",
      title:       "Parc Naturel Régional",
      description: names
        ? `Parc : ${names}`
        : "Le terrain est situé dans le périmètre d'un Parc Naturel Régional.",
      severity: "medium",
      source:   "MNHN / IGN apicarto",
    });
  }

  if (rnnFeats.length > 0) {
    const names = rnnFeats
      .map((f: any) => f.properties?.nom_site || "")
      .filter(Boolean).join(", ");
    constraints.push({
      category:    "protection",
      title:       "Réserve Naturelle Nationale",
      description: names
        ? `Réserve : ${names}`
        : "Le terrain est inclus dans une Réserve Naturelle Nationale.",
      severity: "high",
      source:   "MNHN / IGN apicarto",
    });
  }

  // ── SUP (Servitudes d'Utilité Publique) from GPU ─────────────────────────

  const allSupFeats = [...supSurfFeats, ...supLinFeats];
  const seenSupCats = new Set<string>();

  for (const f of allSupFeats) {
    const raw  = (f.properties?.categorie || f.properties?.typesup || "").trim().toUpperCase();
    const catKey = raw || "SUP";
    if (seenSupCats.has(catKey)) continue; // deduplicate by category
    seenSupCats.add(catKey);

    const known = SUP_LABELS[catKey];
    const label = known?.label ?? `Servitude d'utilité publique — catégorie ${raw || "inconnue"}`;
    const sev   = known?.severity ?? "medium";

    constraints.push({
      category:    "servitude",
      title:       label,
      description: f.properties?.nomsup || f.properties?.observation
        || `Servitude identifiée par le Géoportail de l'Urbanisme (partition ${f.properties?.partition ?? "?"}).`,
      severity:    sev,
      source:      "GPU / IGN Géoportail Urbanisme",
    });
  }

  // ── PLU Prescriptions surfaciques (EBC, emplacements réservés…) ──────────

  const seenPrescTypes = new Set<string>();
  for (const f of prescSurfFeats) {
    const typekey = (f.properties?.typepsc || "").trim().toUpperCase();
    if (seenPrescTypes.has(typekey) && typekey !== "") continue;
    seenPrescTypes.add(typekey);

    const label  = f.properties?.libelle || f.properties?.txtpsc || typekey || "Prescription PLU";
    const detail = f.properties?.observation || "";
    if (!label || label.length < 2) continue;

    constraints.push({
      category:    "autre",
      title:       `Prescription PLU : ${label.substring(0, 100)}`,
      description: detail || "Prescription surfacique inscrite au Géoportail de l'Urbanisme — vérification recommandée.",
      severity:    "medium",
      source:      "GPU / IGN Géoportail Urbanisme",
    });
  }

  return constraints;
}
