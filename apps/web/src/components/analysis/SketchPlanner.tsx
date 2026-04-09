import { useState, useCallback } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip as LeafletTooltip, Rectangle, Marker } from "react-leaflet";
import L from "leaflet";
import { SHARED_MAP_CONTAINER_OPTIONS, SHARED_MAP_TILE_LAYERS } from "@/lib/mapTiles";
import * as turf from "@turf/turf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Ruler, Info, Pencil, RotateCcw } from "lucide-react";

type GeoContextPlu = {
  zone?: string;
  rules?: {
    setback_road_m?: number;
    setback_side_min_m?: number;
    CES_max?: number;
    height_max_m?: number;
  };
};

type SketchPlannerProps = {
  parcelGeometryJson: string | null;
  parcelSurfaceM2: number | null;
  centroidLat: number | null;
  centroidLng: number | null;
  plu: GeoContextPlu | null;
};

type PlacedResult = {
  buildableZonePositions: [number, number][];
  elementBounds: [[number, number], [number, number]] | null;
  elementFits: boolean;
  buildableAreaM2: number;
  elementAreaM2: number;
  setbackUsed: number;
  warnings: string[];
  elementCenterLat: number;
  elementCenterLng: number;
};

const ELEMENT_TYPES = [
  { value: "piscine", label: "Piscine" },
  { value: "abri_jardin", label: "Abri de jardin" },
  { value: "extension", label: "Extension de bâtiment" },
  { value: "terrasse_couverte", label: "Terrasse couverte" },
  { value: "garage", label: "Garage" },
  { value: "carport", label: "Carport" },
  { value: "serre", label: "Serre" },
  { value: "pergola", label: "Pergola" },
];

const ELEMENT_DESCRIPTIONS: Record<string, string> = {
  piscine: "Les piscines sont généralement soumises aux mêmes règles de recul que les constructions.",
  abri_jardin: "Les abris ≤ 20m² peuvent bénéficier d'une procédure simplifiée (déclaration préalable).",
  extension: "L'extension est soumise au CES et aux reculs. Un permis peut être requis si ≥ 20m² en zone urbaine.",
  terrasse_couverte: "Une terrasse couverte est considérée comme une construction et obéit aux règles PLU.",
  garage: "Le garage est soumis aux reculs latéraux et au CES global de la parcelle.",
  carport: "Le carport ouvert peut bénéficier de règles allégées selon le PLU.",
  serre: "Les serres ≤ 20m² et ≤ 1,80m bénéficient généralement d'une exemption de permis.",
  pergola: "La pergola non close est souvent traitée comme une terrasse dans le PLU.",
};

function turfPolygonToLeafletPositions(poly: any): [number, number][] {
  if (!poly?.geometry?.coordinates?.[0]) return [];
  return poly.geometry.coordinates[0].map((c: any) => [c[1], c[0]] as [number, number]);
}

function metersToDegreesLat(meters: number): number {
  return meters / 111139;
}

function metersToDegreesLng(meters: number, lat: number): number {
  return meters / (111319 * Math.cos((lat * Math.PI) / 180));
}

export function SketchPlanner({ parcelGeometryJson, parcelSurfaceM2, centroidLat, centroidLng, plu }: SketchPlannerProps) {
  const [elementType, setElementType] = useState("piscine");
  const [lengthM, setLengthM] = useState("8");
  const [widthM, setWidthM] = useState("4");
  const [result, setResult] = useState<PlacedResult | null>(null);
  const [computed, setComputed] = useState(false);

  const parsedGeometry = parcelGeometryJson ? (() => { try { return JSON.parse(parcelGeometryJson); } catch { return null; } })() : null;

  function ensureClosedRing(ring: number[][]): number[][] {
    if (!ring || ring.length < 3) return ring;
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return [...ring, first];
    }
    return ring;
  }

  function buildTurfPolygon(ring: number[][]): any {
    try {
      const closed = ensureClosedRing(ring);
      if (closed.length < 4) return null;
      return turf.polygon([closed]);
    } catch {
      return null;
    }
  }

  let parcelPositions: [number, number][] = [];
  let parcelGeoJson: any = null;

  function extractRing(geom: { type: string; coordinates: number[][][][] | number[][][] }): number[][] | null {
    if (!geom?.coordinates) return null;
    // MultiPolygon: coordinates[polygon][ring][point] → use first polygon, first ring
    if (geom.type === "MultiPolygon") return (geom.coordinates as number[][][][])[0]?.[0] ?? null;
    // Polygon: coordinates[ring][point] → use first ring
    if (geom.type === "Polygon") return (geom.coordinates as number[][][])[0] ?? null;
    return null;
  }

  if (parsedGeometry?.geometry?.coordinates) {
    const ring = extractRing(parsedGeometry.geometry);
    if (ring) {
      parcelPositions = ring.map((c: number[]) => [c[1], c[0]] as [number, number]);
      parcelGeoJson = buildTurfPolygon(ring);
    }
  } else if (parsedGeometry?.coordinates) {
    const ring = extractRing(parsedGeometry);
    if (ring) {
      parcelPositions = ring.map((c: number[]) => [c[1], c[0]] as [number, number]);
      parcelGeoJson = buildTurfPolygon(ring);
    }
  }

  // Compute NW corner of parcel bbox to anchor the surface label away from the center
  let parcelLabelPosition: [number, number] | null = null;
  if (parcelPositions.length > 0) {
    let maxLat = -Infinity;
    let minLng = Infinity;
    for (const [lat, lng] of parcelPositions) {
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
    }
    parcelLabelPosition = [maxLat, minLng];
  }
  const parcelLabelIcon = parcelSurfaceM2 && parcelLabelPosition
    ? L.divIcon({
        html: `<div style="background:rgba(255,255,255,0.88);border:1.5px solid #dc2626;color:#dc2626;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.18);pointer-events:none">${parcelSurfaceM2} m²</div>`,
        className: "",
        iconAnchor: [0, 20],
        iconSize: [90, 20],
      })
    : null;

  const mapCenter: [number, number] = centroidLat && centroidLng ? [centroidLat, centroidLng] : [48.8566, 2.3522];
  const setbackRoad = plu?.rules?.setback_road_m ?? 0;
  const setbackSide = plu?.rules?.setback_side_min_m ?? 3;
  const cesMax = plu?.rules?.CES_max;

  const compute = useCallback(() => {
    const L = parseFloat(lengthM);
    const W = parseFloat(widthM);
    if (!parcelGeoJson || isNaN(L) || isNaN(W) || L <= 0 || W <= 0) return;

    const warnings: string[] = [];
    const setbackUsed = Math.max(setbackRoad, setbackSide, 0.5);

    let buildableZoneFeature: any = null;
    try {
      const buffered = turf.buffer(parcelGeoJson, -setbackUsed, { units: "meters" });
      buildableZoneFeature = buffered as any;
    } catch {
      warnings.push("Impossible de calculer la zone de recul exacte. La parcelle est peut-être trop petite.");
    }

    let buildableZonePositions: [number, number][] = [];
    let buildableAreaM2 = 0;

    if (buildableZoneFeature) {
      const mainPoly = buildableZoneFeature.geometry.type === "MultiPolygon"
        ? (turf as any).polygon((buildableZoneFeature.geometry as any).coordinates[0])
        : buildableZoneFeature as any;
      buildableZonePositions = turfPolygonToLeafletPositions(mainPoly);
      buildableAreaM2 = Math.round(turf.area(buildableZoneFeature));
    }

    // Get centroid of buildable zone (or parcel centroid as fallback)
    let placementLat = centroidLat!;
    let placementLng = centroidLng!;
    if (buildableZoneFeature) {
      try {
        const centroid = turf.centroid(buildableZoneFeature);
        [placementLng, placementLat] = centroid.geometry.coordinates as [number, number];
      } catch { /* use parcel centroid */ }
    }

    const elementAreaM2 = Math.round(L * W);
    const halfLatDeg = metersToDegreesLat(L / 2);
    const halfLngDeg = metersToDegreesLng(W / 2, placementLat);

    const sw: [number, number] = [placementLat - halfLatDeg, placementLng - halfLngDeg];
    const ne: [number, number] = [placementLat + halfLatDeg, placementLng + halfLngDeg];
    const elementBounds: [[number, number], [number, number]] = [sw, ne];

    // Check if element fits in buildable zone
    const elementRect = turf.bboxPolygon([
      placementLng - halfLngDeg,
      placementLat - halfLatDeg,
      placementLng + halfLngDeg,
      placementLat + halfLatDeg,
    ]);

    let elementFits = false;
    if (buildableZoneFeature) {
      try {
        elementFits = turf.booleanContains(buildableZoneFeature, elementRect);
      } catch {
        // booleanContains can fail on MultiPolygon, try intersect check
        elementFits = buildableAreaM2 >= elementAreaM2;
      }
    }

    // PLU warnings
    if (cesMax && parcelSurfaceM2) {
      const maxFootprintM2 = cesMax * parcelSurfaceM2;
      if (elementAreaM2 > maxFootprintM2) {
        warnings.push(`La surface demandée (${elementAreaM2} m²) dépasse l'emprise maximale autorisée par le CES (${Math.round(maxFootprintM2)} m²).`);
      }
    }
    if (!elementFits) {
      if (buildableAreaM2 < elementAreaM2) {
        warnings.push(`La zone constructible après reculs (${buildableAreaM2} m²) est insuffisante pour accueillir votre ${elementType.replace("_", " ")} (${elementAreaM2} m²).`);
      } else {
        warnings.push("L'élément demandé ne tient pas au centre exact. Essayez de l'orienter différemment ou réduire les dimensions.");
        // still show it with partial fit
        elementFits = buildableAreaM2 >= elementAreaM2;
      }
    }
    if (elementType === "abri_jardin" && elementAreaM2 <= 20) {
      warnings.push("⚡ Bonne nouvelle : un abri ≤ 20m² nécessite seulement une déclaration préalable (si h < 12m).");
    }
    if (elementType === "piscine" && W >= 2 && L >= 2) {
      warnings.push("Une piscine avec bassin ≥ 10m² requiert une déclaration préalable. Au-delà de 100m² : permis de construire.");
    }

    setResult({
      buildableZonePositions,
      elementBounds: elementFits || buildableAreaM2 >= elementAreaM2 ? elementBounds : null,
      elementFits,
      buildableAreaM2,
      elementAreaM2,
      setbackUsed,
      warnings,
      elementCenterLat: placementLat,
      elementCenterLng: placementLng,
    });
    setComputed(true);
  }, [parcelGeoJson, lengthM, widthM, elementType, setbackRoad, setbackSide, cesMax, parcelSurfaceM2, centroidLat, centroidLng]);

  const reset = () => {
    setResult(null);
    setComputed(false);
  };

  const canCompute = !!parcelGeoJson && parseFloat(lengthM) > 0 && parseFloat(widthM) > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Pencil className="w-4 h-4 text-primary" />
            Simulateur d'implantation PLU
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Saisissez le type d'aménagement et ses dimensions. L'IA PLU calculera la zone constructible selon les reculs réglementaires et proposera un positionnement optimal sur votre parcelle.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Type d'aménagement</Label>
              <Select value={elementType} onValueChange={setElementType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ELEMENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Longueur (m)</Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={lengthM}
                onChange={e => setLengthM(e.target.value)}
                placeholder="ex : 8"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Largeur (m)</Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={widthM}
                onChange={e => setWidthM(e.target.value)}
                placeholder="ex : 4"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-border/50">
            <Info className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">{ELEMENT_DESCRIPTIONS[elementType]}</p>
          </div>

          <div className="flex gap-2">
            <Button onClick={compute} disabled={!canCompute} className="gap-2">
              <Pencil className="w-4 h-4" />
              Calculer l'implantation
            </Button>
            {computed && (
              <Button variant="outline" onClick={reset} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Réinitialiser
              </Button>
            )}
          </div>

          {!canCompute && (
            <p className="text-xs text-amber-600">⚠ La géométrie de la parcelle est nécessaire pour calculer l'implantation. Lancez l'analyse pour obtenir les données cadastrales.</p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Results summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Zone constructible</p>
                <p className="text-2xl font-bold text-amber-600">{result.buildableAreaM2} m²</p>
                <p className="text-xs text-muted-foreground mt-1">Après recul de {result.setbackUsed.toFixed(1)} m</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Surface demandée</p>
                <p className="text-2xl font-bold text-blue-600">{result.elementAreaM2} m²</p>
                <p className="text-xs text-muted-foreground mt-1">{parseFloat(lengthM)} × {parseFloat(widthM)} m</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Faisabilité</p>
                <div className="flex items-center gap-2 mt-1">
                  {result.elementFits ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="font-bold text-green-700">Possible</span>
                    </>
                  ) : result.buildableAreaM2 >= result.elementAreaM2 ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <span className="font-bold text-amber-700">À vérifier</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <span className="font-bold text-red-700">Difficile</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Zone PLU : {plu?.zone ?? "N/D"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              {result.warnings.map((w, i) => (
                <div key={i} className={`flex gap-2 p-3 rounded-lg border text-sm ${w.startsWith("⚡") ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                  <span className="shrink-0">{w.startsWith("⚡") ? "⚡" : "⚠"}</span>
                  <span>{w.replace("⚡ ", "")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Map overlay */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ruler className="w-4 h-4 text-primary" />
                Vue cadastrale — Esquisse d'implantation
              </CardTitle>
              <div className="flex flex-wrap gap-3 mt-2">
                <span className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-sm bg-red-500 opacity-60 inline-block" /> Parcelle</span>
                <span className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-sm bg-amber-400 opacity-70 inline-block" /> Zone constructible (après reculs)</span>
                <span className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-sm bg-blue-500 opacity-70 inline-block" /> {ELEMENT_TYPES.find(e => e.value === elementType)?.label ?? "Aménagement"}</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[480px] rounded-b-xl overflow-hidden relative z-0">
                {parcelPositions.length > 0 ? (
                  <MapContainer
                    center={mapCenter}
                    zoom={20}
                    maxZoom={SHARED_MAP_CONTAINER_OPTIONS.maxZoom}
                    zoomSnap={SHARED_MAP_CONTAINER_OPTIONS.zoomSnap}
                    zoomDelta={SHARED_MAP_CONTAINER_OPTIONS.zoomDelta}
                    wheelPxPerZoomLevel={SHARED_MAP_CONTAINER_OPTIONS.wheelPxPerZoomLevel}
                    zoomAnimation={false}
                    fadeAnimation={false}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      url={SHARED_MAP_TILE_LAYERS.plan.url}
                      attribution={SHARED_MAP_TILE_LAYERS.plan.attribution}
                      {...SHARED_MAP_TILE_LAYERS.plan.tileOptions}
                    />
                    {/* Parcel boundary — red */}
                    <Polygon
                      positions={parcelPositions}
                      pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.12, weight: 3, dashArray: "6 3" }}
                    />
                    {/* Surface label anchored to NW corner so it never overlaps buildings */}
                    {parcelLabelPosition && parcelLabelIcon && (
                      <Marker position={parcelLabelPosition} icon={parcelLabelIcon} interactive={false} zIndexOffset={1000} />
                    )}

                    {/* Buildable zone — amber */}
                    {result.buildableZonePositions.length > 0 && (
                      <Polygon
                        positions={result.buildableZonePositions}
                        pathOptions={{ color: "#d97706", fillColor: "#fbbf24", fillOpacity: 0.25, weight: 2 }}
                      >
                        <LeafletTooltip direction="top" className="text-xs">
                          Zone constructible : {result.buildableAreaM2} m²<br />Recul : {result.setbackUsed.toFixed(1)} m
                        </LeafletTooltip>
                      </Polygon>
                    )}

                    {/* Requested element — blue rectangle */}
                    {result.elementBounds && (
                      <Rectangle
                        bounds={result.elementBounds}
                        pathOptions={{
                          color: result.elementFits ? "#2563eb" : "#f59e0b",
                          fillColor: result.elementFits ? "#3b82f6" : "#fbbf24",
                          fillOpacity: 0.55,
                          weight: 2.5,
                        }}
                      >
                        <LeafletTooltip permanent direction="center" className="bg-transparent border-0 shadow-none font-bold text-xs" opacity={1}>
                          <div style={{ color: result.elementFits ? "#1d4ed8" : "#b45309" }}>
                            {ELEMENT_TYPES.find(e => e.value === elementType)?.label}<br />{parseFloat(lengthM)}×{parseFloat(widthM)} m
                          </div>
                        </LeafletTooltip>
                      </Rectangle>
                    )}
                  </MapContainer>
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <p className="text-muted-foreground">Géométrie cadastrale indisponible</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* PLU rules reminder */}
          <Card className="border-dashed">
            <CardContent className="py-4 px-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Règles PLU appliquées — Zone {plu?.zone ?? "N/D"}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Recul voirie</p>
                  <p className="font-semibold">{setbackRoad > 0 ? `${setbackRoad} m` : "Non requis"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recul latéral</p>
                  <p className="font-semibold">{setbackSide > 0 ? `${setbackSide} m` : "Non requis"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CES max</p>
                  <p className="font-semibold">{cesMax != null ? `${(cesMax * 100).toFixed(0)} %` : "N/D"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hauteur max</p>
                  <p className="font-semibold">{plu?.rules?.height_max_m != null ? `${plu.rules.height_max_m} m` : "N/D"}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                ⚠ Cette esquisse est indicative et basée sur les règles PLU extraites automatiquement. Consultez un professionnel avant tout dépôt de dossier.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
