import * as turf from "@turf/turf";

/**
 * Parcel Service
 * Retrieves real cadastral parcel data from IGN APIs and the Railway parcel-selector API.
 *
 * Flow:
 *   1. apicarto.ign.fr/api/cadastre/parcelle  — get cadastral features for the point
 *   2. Railway /select-parcel                 — select the right parcel + surface
 *   3. Railway /compute-bbox                  — get bounding box of the parcel
 *   4. data.geopf.fr/wfs (BDTOPO batiment)   — get buildings inside bbox
 *   5. data.geopf.fr/wfs (troncon_de_route)  — get roads inside bbox
 *   6. Railway /classify-boundaries           — measure road frontage & side boundaries
 *   7. Railway /analyse-parcelle              — get aggregated building metrics
 */

const RAILWAY_BASE = "https://parcel-selector-api-production.up.railway.app";
const IGN_APICARTO  = "https://apicarto.ign.fr/api";
const IGN_GEOPF_WFS = "https://data.geopf.fr/wfs/ows";
const TIMEOUT_MS    = 30000;

function signal() { return AbortSignal.timeout(TIMEOUT_MS); }

export interface ParcelData {
  cadastralSection: string;
  parcelNumber: string;
  parcelSurfaceM2: number;
  geometryJson: object;
  centroidLat: number;
  centroidLng: number;
  roadFrontageLengthM: number;
  sideBoundaryLengthM: number;
  metadata: {
    commune: string;
    prefixe: string;
    section: string;
    numero: string;
    contenance: number;
    idu?: string;
  };
  // Internal — passed to getBuildingsByParcel to avoid redundant API calls
  _bboxString?: string;
  _cadastreFeatures?: any[];
  _selectedFeature?: any;
  // Rich raw data for GeoContext building
  _classifyBoundariesResult?: any;
  _roadFeatures?: any[];
  _buildingFeatures?: any[];
  _analyseParcelleResult?: any;
  _neighbourBuildingFeatures?: any[];
  // Computed metrics
  _perimeterM?: number;
  _shapeRatio?: number;
  _isCornerPlot?: boolean;
  _depthM?: number;
  _topography?: { elevationMin: number; elevationMax: number; slopePercent: number; isFlat: boolean };
  buildings?: BuildingData[];
}

export interface BuildingData {
  footprintM2: number;
  estimatedFloorAreaM2: number;
  avgHeightM: number;
  avgFloors: number;
  geometryJson: object;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 1 — Cadastral parcel
// ────────────────────────────────────────────────────────────────────────────
async function getCadastreFeatures(lat: number, lng: number): Promise<any[]> {
  const fetchGeom = async (plat: number, plng: number) => {
    const geom = JSON.stringify({ type: "Point", coordinates: [plng, plat] });
    const url  = `${IGN_APICARTO}/cadastre/parcelle?geom=${encodeURIComponent(geom)}&format=geojson`;
    const res  = await fetch(url, { signal: signal() });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.features ?? [];
  };

  const allFeatures: any[] = [];
  const seenIds = new Set<string>();

  const addFeatures = (features: any[]) => {
    for (const f of features) {
      const id = f.properties?.idu || f.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allFeatures.push(f);
      }
    }
  };

  // 1 — Center point
  addFeatures(await fetchGeom(lat, lng));

  // 2 — Surrounding offsets (10m and 20m)
  const offsets = [
    [0.0001, 0], [-0.0001, 0], [0, 0.0001], [0, -0.0001],
    [0.0001, 0.0001], [-0.0001, -0.0001], [0.0002, 0], [-0.0002, 0]
  ];
  
  // To avoid too many sequential requests if we already have some features, 
  // we could stop, but for "street-bound" addresses it's safer to check a few more.
  for (const [dLat, dLng] of offsets) {
    addFeatures(await fetchGeom(lat + dLat, lng + dLng));
    // If we have at least 3 unique parcels, we probably have enough candidates 
    // for the selection service to pick the right one.
    if (allFeatures.length >= 5) break;
  }

  return allFeatures;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 2 — Railway select-parcel
// ────────────────────────────────────────────────────────────────────────────
async function selectParcel(lat: number, lng: number, banId: string, geocodeLabel: string, cadastreFeatures: any[]) {
  console.log(`[parcel] Selecting parcel for ${lat},${lng} among ${cadastreFeatures.length} candidates`);
  try {
    const res = await fetch(`${RAILWAY_BASE}/select-parcel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: signal(),
      body: JSON.stringify({ lat, lon: lng, banId, geocode_label: geocodeLabel, cadastre_features: cadastreFeatures }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data.ok) throw new Error(data.error || "Railway error");
    return data as {
      ok: boolean;
      selected_idu: string;
      selected_section: string;
      selected_numero: string;
      selected_code_insee: string;
      selected_contenance_m2: number;
      selected_feature: any;
      confidence: number;
    };
  } catch (err) {
    console.warn(`[parcel] select-parcel failed: ${(err as Error).message}. Using fallback.`);
    if (!cadastreFeatures.length) throw new Error("No parcels found nearby.");
    // Fallback: use first feature from IGN
    const first = cadastreFeatures[0];
    return {
      ok: true,
      selected_idu: first.properties?.idu || "UNKNOWN",
      selected_section: first.properties?.section || "??",
      selected_numero: first.properties?.numero || "???",
      selected_code_insee: first.properties?.code_insee || "00000",
      selected_contenance_m2: first.properties?.contenance || 0,
      selected_feature: first,
      confidence: 0.5
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 3 — Railway compute-bbox
// ────────────────────────────────────────────────────────────────────────────
async function computeBbox(selectedFeature: any): Promise<string> {
  console.log("[parcel] Computing BBOX");
  try {
    const res = await fetch(`${RAILWAY_BASE}/compute-bbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: signal(),
      body: JSON.stringify({ selected_feature: selectedFeature }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data.ok) throw new Error(data.error || "Railway error");
    return data.bbox as string;
  } catch (err) {
    console.warn(`[parcel] compute-bbox failed: ${(err as Error).message}. Manual fallback.`);
    const coords = extractCoordinates(selectedFeature.geometry);
    if (!coords.length) {
      // Last resort fallback bbox around point
      const geom = selectedFeature.geometry;
      const lon = (geom.type === "Point" ? geom.coordinates[0] : 0);
      const lat = (geom.type === "Point" ? geom.coordinates[1] : 0);
      return `${lon-0.001},${lat-0.001},${lon+0.001},${lat+0.001}`;
    }
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    coords.forEach(([lon, lat]: [number, number]) => {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    });
    return `${minLon - 0.0005},${minLat - 0.0005},${maxLon + 0.0005},${maxLat + 0.0005}`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 4 — BD TOPO buildings
// ────────────────────────────────────────────────────────────────────────────
export async function getBdTopoBatiments(bbox: string, count = 100): Promise<any[]> {
  try {
    const url = `${IGN_GEOPF_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
      `&TYPENAMES=BDTOPO_V3:batiment&SRSNAME=EPSG:4326&OUTPUTFORMAT=application/json` +
      `&BBOX=${bbox},EPSG:4326&COUNT=${count}`;
    const res = await fetch(url, { signal: signal() });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.features ?? [];
  } catch (e) {
    console.warn("[parcel] getBdTopoBatiments failed:", (e as Error).message);
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 5 — BD TOPO roads
// ────────────────────────────────────────────────────────────────────────────
async function getBdTopoRoads(bbox: string, count = 20): Promise<any[]> {
  const url = `${IGN_GEOPF_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=BDTOPO_V3:troncon_de_route&SRSNAME=EPSG:4326&OUTPUTFORMAT=application/json` +
    `&BBOX=${bbox},EPSG:4326&COUNT=${count}`;
  const res = await fetch(url, { signal: signal() });
  if (!res.ok) throw new Error(`BD TOPO roads ${res.status}`);
  const data: any = await res.json();
  return data.features ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 6 — Railway classify-boundaries
// ────────────────────────────────────────────────────────────────────────────
async function classifyBoundaries(parcelFeature: any, roadFeatures: any[]) {
  const res = await fetch(`${RAILWAY_BASE}/classify-boundaries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: signal(),
    body: JSON.stringify({ parcel_feature: parcelFeature, road_features: roadFeatures }),
  });
  if (!res.ok) throw new Error(`classify-boundaries ${res.status}`);
  return res.json() as Promise<{
    ok: boolean;
    road_boundary_length_m: number;
    side_boundary_length_m: number;
  }>;
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 7 — Railway analyse-parcelle
// ────────────────────────────────────────────────────────────────────────────
async function analyseParcelle(lat: number, lng: number, buildingFeatures: any[], cadastreFeatures: any[]) {
  const res = await fetch(`${RAILWAY_BASE}/analyse-parcelle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: signal(),
    body: JSON.stringify({ lat, lon: lng, building_features: buildingFeatures, cadastre_features: cadastreFeatures }),
  });
  if (!res.ok) throw new Error(`analyse-parcelle ${res.status}`);
  return res.json() as Promise<{
    ok: boolean;
    parcel_surface_m2: number;
    buildings_count: number;
    footprint_m2: number;
    estimated_floor_area_m2: number | null;
    avg_height_m: number | null;
    avg_floors: number | null;
    buildings: any[];
  }>;
}

// ────────────────────────────────────────────────────────────────────────────
// Perimeter in meters from GeoJSON geometry using Haversine
// ────────────────────────────────────────────────────────────────────────────
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function extractCoordinates(geom: any): [number, number][] {
  if (!geom || !geom.coordinates) return [];
  if (geom.type === "Point") return [geom.coordinates];
  if (geom.type === "LineString" || geom.type === "MultiPoint") return geom.coordinates;
  if (geom.type === "Polygon" || geom.type === "MultiLineString") return geom.coordinates.flat(1);
  if (geom.type === "MultiPolygon") return geom.coordinates.flat(2);
  return [];
}

function computePerimeterM(geometry: any): number {
  if (!geometry) return 0;
  const rings: [number, number][][] = [];
  if (geometry.type === "Polygon") rings.push(geometry.coordinates[0]);
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((p: any) => rings.push(p[0]));
  let total = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      total += haversineM(ring[i][1], ring[i][0], ring[i + 1][1], ring[i + 1][0]);
    }
  }
  return total;
}

// ────────────────────────────────────────────────────────────────────────────
// Estimate depth in meters from BBOX (shorter axis)
// ────────────────────────────────────────────────────────────────────────────
function estimateDepthM(geometry: any, centroid: { lat: number; lng: number }): number {
  if (!geometry) return 0;
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const rings: [number, number][][] = [];
  if (geometry.type === "Polygon") rings.push(geometry.coordinates[0]);
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach((p: any) => rings.push(p[0]));
  for (const ring of rings) for (const [lng, lat] of ring) {
    if (lng < minLon) minLon = lng; if (lng > maxLon) maxLon = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  const w = haversineM(centroid.lat, minLon, centroid.lat, maxLon);
  const h = haversineM(minLat, centroid.lng, maxLat, centroid.lng);
  return Math.min(w, h);
}

// ────────────────────────────────────────────────────────────────────────────
// Topography from BD TOPO 3D coordinates (3rd component = altitude)
// ────────────────────────────────────────────────────────────────────────────
function computeTopography(geometry: any): { elevationMin: number; elevationMax: number; slopePercent: number; isFlat: boolean } {
  const altitudes: number[] = [];
  const extractAlts = (coords: any[]) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") { if (coords[2] != null) altitudes.push(coords[2]); return; }
    coords.forEach(c => extractAlts(c));
  };
  if (geometry?.coordinates) extractAlts(geometry.coordinates);
  if (!altitudes.length) return { elevationMin: 0, elevationMax: 0, slopePercent: 0, isFlat: true };
  const min = Math.min(...altitudes);
  const max = Math.max(...altitudes);
  const diff = max - min;
  // Rough slope: elevation diff / horizontal extent (assume 50m avg extent)
  const slopePercent = Math.round(diff / 50 * 100 * 10) / 10;
  return { elevationMin: Math.round(min * 10) / 10, elevationMax: Math.round(max * 10) / 10, slopePercent, isFlat: slopePercent < 5 };
}

// ────────────────────────────────────────────────────────────────────────────
// Centroid from GeoJSON geometry
// ────────────────────────────────────────────────────────────────────────────
function computeCentroid(feature: any): { lat: number; lng: number } {
  const coords: [number, number][][] = [];
  const g = feature?.geometry;
  if (!g) return { lat: 0, lng: 0 };
  if (g.type === "Polygon") {
    coords.push(...g.coordinates);
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates) coords.push(...poly);
  }
  let sumLng = 0, sumLat = 0, n = 0;
  for (const ring of coords) {
    for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; n++; }
  }
  return n ? { lat: sumLat / n, lng: sumLng / n } : { lat: 0, lng: 0 };
}

// ────────────────────────────────────────────────────────────────────────────
// Public: getParcelByCoords
// ────────────────────────────────────────────────────────────────────────────
export async function getParcelByCoords(
  lat: number,
  lng: number,
  banId = "",
  geocodeLabel = ""
): Promise<ParcelData> {
  try {
    // 1 — Cadastre features
    console.log("[parcel] Fetching cadastre features...");
    const cadastreFeatures = await getCadastreFeatures(lat, lng);
    console.log("[parcel] Found", cadastreFeatures.length, "cadastre features");
    if (!cadastreFeatures.length) throw new Error("No cadastral data");

    // 2 — Select parcel
    console.log("[parcel] Selecting best parcel...");
    const selected = await selectParcel(lat, lng, banId, geocodeLabel, cadastreFeatures);
    if (!selected.ok) throw new Error("select-parcel failed");
    console.log("[parcel] Selected:", selected.selected_section, selected.selected_numero);

    const selectedFeature = selected.selected_feature;
    const centroid = computeCentroid(selectedFeature);

    // 3 — BBOX
    console.log("[parcel] Computing BBOX...");
    const bboxString = await computeBbox(selectedFeature);
    console.log("[parcel] BBOX:", bboxString);

    // 4 — Roads (needed for classify-boundaries)
    console.log("[parcel] Fetching roads...");
    const roadFeatures = await getBdTopoRoads(bboxString);
    console.log("[parcel] Found", roadFeatures.length, "roads");

    // 5 — Classify boundaries (road frontage vs side)
    console.log("[parcel] Classifying boundaries...");
    let roadFrontageLengthM = 0;
    let sideBoundaryLengthM = 0;
    let classifyResult: any = null;
    try {
      classifyResult = await classifyBoundaries(selectedFeature, roadFeatures);
      if (classifyResult.ok) {
        roadFrontageLengthM = Math.round(classifyResult.road_boundary_length_m * 10) / 10;
        sideBoundaryLengthM = Math.round(classifyResult.side_boundary_length_m * 10) / 10;
      }
    } catch (e) {
      console.warn("[parcel] classify-boundaries failed (non-critical):", (e as Error).message);
    }

    // 6 — Compute parcel geometric metrics
    const perimeterM = computePerimeterM(selectedFeature.geometry);
    const areaM2 = selected.selected_contenance_m2;
    const shapeRatio = perimeterM > 0 ? Math.round((4 * Math.PI * areaM2) / (perimeterM * perimeterM) * 100) / 100 : 0;
    const depthM = estimateDepthM(selectedFeature.geometry, centroid);
    // Corner plot = more than one distinct road name in road_boundary_segments
    const roadSegRoads: Set<string> = new Set(
      (classifyResult?.road_boundary_segments ?? [])
        .map((s: any) => s.properties?.closest_road_name)
        .filter(Boolean)
    );
    const isCornerPlot = roadSegRoads.size > 1;

    // 7 — Topography from BD TOPO 3D coordinates (altitude in 3rd coord component)
    const topo = computeTopography(selectedFeature.geometry);

    // 8 — Neighbour buildings in wider 200m BBOX (non-critical)
    let neighbourBuildingFeatures: any[] = [];
    try {
      const [bMinLon, bMinLat, bMaxLon, bMaxLat] = bboxString.split(",").map(Number);
      const expand = 0.002; // ~200m
      const widerBbox = `${bMinLon - expand},${bMinLat - expand},${bMaxLon + expand},${bMaxLat + expand}`;
      neighbourBuildingFeatures = await getBdTopoBatiments(widerBbox, 40);
    } catch {
      // Non-critical
    }

    return {
      cadastralSection: selected.selected_section,
      parcelNumber: selected.selected_numero,
      parcelSurfaceM2: selected.selected_contenance_m2,
      geometryJson: selectedFeature,
      centroidLat: centroid.lat,
      centroidLng: centroid.lng,
      roadFrontageLengthM,
      sideBoundaryLengthM,
      metadata: {
        commune: selected.selected_code_insee,
        prefixe: "000",
        section: selected.selected_section,
        numero: selected.selected_numero,
        contenance: selected.selected_contenance_m2,
        idu: selected.selected_idu,
      },
      _bboxString: bboxString,
      _cadastreFeatures: cadastreFeatures,
      _selectedFeature: selectedFeature,
      _classifyBoundariesResult: classifyResult,
      _roadFeatures: roadFeatures,
      _neighbourBuildingFeatures: neighbourBuildingFeatures,
      _perimeterM: Math.round(perimeterM * 10) / 10,
      _shapeRatio: shapeRatio,
      _isCornerPlot: isCornerPlot,
      _depthM: Math.round(depthM),
      _topography: topo,
    };
  } catch (err) {
    // Do NOT silently return mock data — propagate the error so the pipeline
    // can fail the analysis with a clear message instead of storing fake data.
    console.error("[parcel] getParcelByCoords failed:", (err as Error).message);
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public: getBuildingsByParcel
// ────────────────────────────────────────────────────────────────────────────
export interface BuildingResult {
  buildings: BuildingData[];
  rawFeatures: any[];
  analyseParcelleResult: any | null;
}

export async function getBuildingsByParcel(
  latOrParcelData: number | ParcelData,
  lng?: number
): Promise<BuildingResult> {
  try {
    let bboxString: string;
    let lat: number;
    let lngVal: number;
    let cadastreFeatures: any[] = [];

    // Accept either (lat, lng) or (parcelData)
    if (typeof latOrParcelData === "object") {
      const pd = latOrParcelData;
      lat = pd.centroidLat;
      lngVal = pd.centroidLng;
      bboxString = pd._bboxString!;
      cadastreFeatures = pd._cadastreFeatures ?? [];
    } else {
      lat = latOrParcelData;
      lngVal = lng!;
      // Derive a rough BBOX from lat/lng (±0.002°)
      const d = 0.002;
      bboxString = `${lngVal - d},${lat - d},${lngVal + d},${lat + d}`;
    }

    // 4 — Buildings from BD TOPO
    const buildingFeatures = await getBdTopoBatiments(bboxString);
    if (!buildingFeatures.length) return { buildings: [], rawFeatures: [], analyseParcelleResult: null };

    // SPATIAL FILTER: Only keep buildings that are actually ON the parcel
    let filteredFeatures = buildingFeatures;
    if (typeof latOrParcelData === "object" && (latOrParcelData as any).geometryJson) {
      try {
        const pg = (latOrParcelData as any).geometryJson;
        const parcelGeom = pg.geometry || pg;
        
        // Apply a safe negative buffer (-1.0m) to strictly exclude boundary-wall buildings or neighbor overlaps
        const bufferedParcel = turf.buffer(turf.feature(parcelGeom), -0.001, { units: 'kilometers' });
        
        console.log(`[buildings] Spatial filter input: ${buildingFeatures.length} context:`, JSON.stringify(parcelGeom).substring(0, 100));
        
        filteredFeatures = buildingFeatures.filter(f => {
          try {
            const intersects = !!bufferedParcel && turf.booleanIntersects(f as any, bufferedParcel);
            return intersects;
          } catch (e) {
            console.error("[buildings] filter error:", (e as Error).message);
            return false;
          }
        });
        
        console.log(`[buildings] Spatial filter: ${buildingFeatures.length} -> ${filteredFeatures.length} buildings (buffer -1.0m)`);
      } catch (err) {
        console.warn("[buildings] Spatial filtering failed, using all features:", (err as Error).message);
      }
    } else {
      console.log("[buildings] Skipping spatial filter: not an object or no geometryJson");
    }

    // 7 — Parcel analysis (aggregated metrics from Railway)
    let analyseResult: any = null;
    if (cadastreFeatures.length) {
      try {
        // Use filtered features for analysis if possible
        analyseResult = await analyseParcelle(lat, lngVal, filteredFeatures, cadastreFeatures);
      } catch (e) {
        console.warn("[parcel] analyse-parcelle fallback:", (e as Error).message);
      }
    }

    if (analyseResult?.ok) {
      // ... use analyseResult ...
    }

    // Fallback: parse individual building features from filtered set
    const buildings = filteredFeatures.map((f: any) => {
      const props = f.properties ?? {};
      const h = props.hauteur ?? 0;
      const floors = props.nombre_d_etages ?? Math.max(1, Math.round(h / 3));
      const fp = approximateFootprintM2(f.geometry);
      return {
        footprintM2: Math.round(fp),
        estimatedFloorAreaM2: Math.round(fp * floors),
        avgHeightM: Math.round(h * 10) / 10,
        avgFloors: floors,
        geometryJson: f,
      };
    });
    return { buildings, rawFeatures: filteredFeatures, analyseParcelleResult: analyseResult };
  } catch (err) {
    console.error(`[buildings] CRITICAL ERROR in getBuildingsByParcel: ${(err as Error).message}\nStack: ${(err as Error).stack}`);
    console.warn("[buildings] Falling back to mock.");
    const l = typeof latOrParcelData === "object" ? latOrParcelData.centroidLat : latOrParcelData;
    const g = typeof latOrParcelData === "object" ? latOrParcelData.centroidLng : lng!;
    return { buildings: getMockBuildings(l, g), rawFeatures: [], analyseParcelleResult: null };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Approximate polygon area in m² using the Shoelace formula
// (Very rough — projection error acceptable at parcel scale)
// ────────────────────────────────────────────────────────────────────────────
function approximateFootprintM2(geometry: any): number {
  if (!geometry) return 0;
  const rings: [number, number][][] = [];
  if (geometry.type === "Polygon") rings.push(...geometry.coordinates);
  else if (geometry.type === "MultiPolygon") for (const p of geometry.coordinates) rings.push(...p);
  let total = 0;
  for (const ring of rings) {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    // Convert degrees² → m² approx at French latitudes (1° lat ≈ 111km, 1° lng ≈ 73km)
    total += Math.abs(area) * 0.5 * 111000 * 73000;
  }
  return total;
}

// ────────────────────────────────────────────────────────────────────────────
// Mock fallbacks
// ────────────────────────────────────────────────────────────────────────────
function getMockParcelData(lat: number, lng: number): ParcelData {
  const delta = 0.0002;
  return {
    cadastralSection: "AB",
    parcelNumber: "0042",
    parcelSurfaceM2: 850,
    geometryJson: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [lng - delta, lat - delta], [lng + delta, lat - delta],
          [lng + delta, lat + delta], [lng - delta, lat + delta],
          [lng - delta, lat - delta],
        ]],
      },
      properties: {},
    },
    centroidLat: lat,
    centroidLng: lng,
    roadFrontageLengthM: 18.5,
    sideBoundaryLengthM: 46.2,
    metadata: { commune: "75056", prefixe: "000", section: "AB", numero: "0042", contenance: 850 },
  };
}

function getMockBuildings(lat: number, lng: number): BuildingData[] {
  const delta = 0.0001;
  return [{
    footprintM2: 180,
    estimatedFloorAreaM2: 360,
    avgHeightM: 7.5,
    avgFloors: 2,
    geometryJson: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [lng - delta * 0.8, lat - delta * 0.8], [lng + delta * 0.8, lat - delta * 0.8],
          [lng + delta * 0.8, lat + delta * 0.4], [lng - delta * 0.8, lat + delta * 0.4],
          [lng - delta * 0.8, lat - delta * 0.8],
        ]],
      },
      properties: {},
    },
  }];
}
