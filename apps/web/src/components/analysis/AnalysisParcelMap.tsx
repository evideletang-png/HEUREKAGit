import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, ChevronUp, Info, Layers3, MapPinned, Satellite, SlidersHorizontal, Trees } from "lucide-react";
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { SHARED_MAP_CONTAINER_OPTIONS, SHARED_MAP_TILE_LAYERS, SharedMapLayerKey } from "@/lib/mapTiles";
import { MapZoomButtons } from "@/components/map/MapZoomButtons";

type BaseLayerKey = Extract<SharedMapLayerKey, "plan" | "satellite" | "cadastre">;

type AnalysisParcelMapProps = {
  mapCenter: [number, number];
  parcelPositions: [number, number][];
  parcelSurfaceM2?: number | null;
  buildings?: Array<any>;
  frontRoadName?: string | null;
  roadLengthM?: number | null;
  sideLengthM?: number | null;
  isCornerPlot?: boolean;
};

const BASE_LAYERS: Record<
  BaseLayerKey,
  { label: string; icon: typeof MapPinned; url: string; attribution: string; tileOptions: Record<string, unknown> }
> = {
  plan: {
    label: "Plan",
    icon: MapPinned,
    url: SHARED_MAP_TILE_LAYERS.plan.url,
    attribution: SHARED_MAP_TILE_LAYERS.plan.attribution,
    tileOptions: SHARED_MAP_TILE_LAYERS.plan.tileOptions,
  },
  satellite: {
    label: "Satellite HD",
    icon: Satellite,
    url: SHARED_MAP_TILE_LAYERS.satellite.url,
    attribution: SHARED_MAP_TILE_LAYERS.satellite.attribution,
    tileOptions: SHARED_MAP_TILE_LAYERS.satellite.tileOptions,
  },
  cadastre: {
    label: "Cadastre",
    icon: Layers3,
    url: SHARED_MAP_TILE_LAYERS.cadastre.url,
    attribution: SHARED_MAP_TILE_LAYERS.cadastre.attribution,
    tileOptions: SHARED_MAP_TILE_LAYERS.cadastre.tileOptions,
  },
};

function extractGeoRings(geometry: any): [number, number][][] {
  if (!geometry || typeof geometry !== "object") return [];
  const source = geometry.geometry ?? geometry;
  if (!source?.coordinates) return [];

  if (source.type === "Polygon") {
    const ring = source.coordinates?.[0];
    if (!Array.isArray(ring)) return [];
    return [ring.map((coord: number[]) => [coord[1], coord[0]] as [number, number])];
  }

  if (source.type === "MultiPolygon") {
    return (source.coordinates || [])
      .map((polygon: number[][][]) => polygon?.[0])
      .filter((ring: number[][] | undefined) => Array.isArray(ring))
      .map((ring: number[][]) => ring.map((coord: number[]) => [coord[1], coord[0]] as [number, number]));
  }

  return [];
}

function FitMapBounds({
  mapCenter,
  parcelPositions,
  buildingRings,
}: {
  mapCenter: [number, number];
  parcelPositions: [number, number][];
  buildingRings: [number, number][][];
}) {
  const map = useMap();

  useEffect(() => {
    const allPoints = [...parcelPositions, ...buildingRings.flat()];
    if (allPoints.length >= 3) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [28, 28], maxZoom: 20 });
      return;
    }
    map.setView(mapCenter, 19);
  }, [map, mapCenter, parcelPositions, buildingRings]);

  return null;
}

function MapInstanceBridge({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);

  return null;
}

export function AnalysisParcelMap({
  mapCenter,
  parcelPositions,
  parcelSurfaceM2,
  buildings = [],
  frontRoadName,
  roadLengthM,
  sideLengthM,
  isCornerPlot = false,
}: AnalysisParcelMapProps) {
  const [baseLayer, setBaseLayer] = useState<BaseLayerKey>("plan");
  const [showBuildings, setShowBuildings] = useState(true);
  const [showCentroid, setShowCentroid] = useState(true);
  const [showParcelLabel, setShowParcelLabel] = useState(true);
  const [showOptionsPanel, setShowOptionsPanel] = useState(true);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  const buildingShapes = useMemo(
    () =>
      buildings.flatMap((building: any, index: number) =>
        extractGeoRings(building?.geometryJson).map((ring, ringIndex) => ({
          id: `${building?.id || index}-${ringIndex}`,
          positions: ring,
          footprintM2: building?.footprintM2,
          avgFloors: building?.avgFloors,
          avgHeightM: building?.avgHeightM,
        }))
      ),
    [buildings]
  );

  const activeBaseLayer = BASE_LAYERS[baseLayer];

  if (parcelPositions.length === 0) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">Carte indisponible - Géométrie en attente</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-slate-100">
      <div className="absolute left-3 right-3 top-3 z-[1000] flex flex-col gap-2 sm:left-4 sm:right-4 sm:top-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-10 rounded-full border border-slate-200 bg-white/92 px-3 shadow-lg backdrop-blur"
            onClick={() => setShowOptionsPanel((value) => !value)}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Options
            {showOptionsPanel ? <ChevronUp className="ml-1.5 h-3.5 w-3.5" /> : <ChevronDown className="ml-1.5 h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-10 rounded-full border border-slate-200 bg-white/92 px-3 shadow-lg backdrop-blur"
            onClick={() => setShowInfoPanel((value) => !value)}
          >
            <Info className="mr-1.5 h-3.5 w-3.5" />
            Infos parcelle
            {showInfoPanel ? <ChevronUp className="ml-1.5 h-3.5 w-3.5" /> : <ChevronDown className="ml-1.5 h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Badge className="border-red-200 bg-red-50 text-red-700">Parcelle</Badge>
          {showBuildings && <Badge className="border-slate-300 bg-slate-100 text-slate-700">Bâti existant</Badge>}
          {isCornerPlot && (
            <Badge className="border-amber-200 bg-amber-50 text-amber-800">
              <Trees className="mr-1 h-3 w-3" />
              Parcelle d’angle
            </Badge>
          )}
        </div>
      </div>

      <div className="absolute left-3 right-3 top-[7rem] z-[1000] flex flex-col gap-3 sm:left-4 sm:right-auto sm:top-16 sm:max-w-[360px]">
        {showOptionsPanel && (
          <div className="rounded-2xl border border-slate-200/80 bg-white/92 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              <Layers3 className="h-3.5 w-3.5 text-slate-700" />
              Affichage carte
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(BASE_LAYERS) as Array<[BaseLayerKey, (typeof BASE_LAYERS)[BaseLayerKey]]>).map(([key, layer]) => {
                const Icon = layer.icon;
                const isActive = baseLayer === key;
                return (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className="h-9 gap-1.5 rounded-full px-3 text-xs"
                    onClick={() => setBaseLayer(key)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {layer.label}
                  </Button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={showBuildings ? "secondary" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setShowBuildings((value) => !value)}
              >
                <Building2 className="mr-1.5 h-3.5 w-3.5" />
                Bâti existant
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showCentroid ? "secondary" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setShowCentroid((value) => !value)}
              >
                <MapPinned className="mr-1.5 h-3.5 w-3.5" />
                Centre parcelle
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showParcelLabel ? "secondary" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setShowParcelLabel((value) => !value)}
              >
                <Info className="mr-1.5 h-3.5 w-3.5" />
                Surface sur carte
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              `Satellite HD` utilise l'orthophoto IGN et `Cadastre` superpose le parcellaire officiel.
            </p>
          </div>
        )}

        {showInfoPanel && (
          <div className="rounded-2xl border border-slate-200/80 bg-white/92 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              <Info className="h-3.5 w-3.5 text-slate-700" />
              Repères rapides
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Surface</p>
                <p className="mt-1 font-semibold text-slate-900">{parcelSurfaceM2 ? `${parcelSurfaceM2} m²` : "N/D"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Bâti détecté</p>
                <p className="mt-1 font-semibold text-slate-900">{buildingShapes.length}</p>
              </div>
              <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Voie principale</p>
                <p className="mt-1 line-clamp-2 font-semibold text-slate-900">{frontRoadName || "N/D"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Linéaire voie</p>
                <p className="mt-1 font-semibold text-slate-900">{roadLengthM ? `${Math.round(roadLengthM)} m` : "N/D"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Linéaire latéral</p>
                <p className="mt-1 font-semibold text-slate-900">{sideLengthM ? `${Math.round(sideLengthM)} m` : "N/D"}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <MapZoomButtons map={mapInstance} />

      <MapContainer
        className="map-custom-zoom"
        center={mapCenter}
        zoom={19}
        maxZoom={SHARED_MAP_CONTAINER_OPTIONS.maxZoom}
        zoomSnap={SHARED_MAP_CONTAINER_OPTIONS.zoomSnap}
        zoomDelta={SHARED_MAP_CONTAINER_OPTIONS.zoomDelta}
        wheelPxPerZoomLevel={SHARED_MAP_CONTAINER_OPTIONS.wheelPxPerZoomLevel}
        zoomAnimation={false}
        fadeAnimation={false}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <FitMapBounds
          mapCenter={mapCenter}
          parcelPositions={parcelPositions}
          buildingRings={buildingShapes.map((shape) => shape.positions)}
        />
        <MapInstanceBridge onMapReady={setMapInstance} />
        <TileLayer
          url={activeBaseLayer.url}
          attribution={activeBaseLayer.attribution}
          {...activeBaseLayer.tileOptions}
        />

        <Polygon positions={parcelPositions} pathOptions={{ color: "#dc2626", fillColor: "#ef4444", fillOpacity: 0.14, weight: 3.2 }}>
          {showParcelLabel && (
            <LeafletTooltip
              permanent
              direction="center"
              offset={[0, 0]}
              className="border-0 bg-transparent p-0 shadow-none"
            >
              <div className="rounded-md border border-white/80 bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 shadow-sm backdrop-blur-sm sm:px-2 sm:py-1 sm:text-xs">
                {parcelSurfaceM2 ? `${parcelSurfaceM2} m²` : "Parcelle"}
              </div>
            </LeafletTooltip>
          )}
        </Polygon>

        {showBuildings &&
          buildingShapes.map((shape) => (
            <Polygon
              key={shape.id}
              positions={shape.positions}
              pathOptions={{ color: "#0f172a", fillColor: "#475569", fillOpacity: 0.26, weight: 1.8 }}
            >
              <LeafletTooltip direction="top" className="text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold">Bâti existant</div>
                  <div>Emprise : {shape.footprintM2 ? `${Math.round(shape.footprintM2)} m²` : "N/D"}</div>
                  <div>Niveaux : {shape.avgFloors != null ? `R+${shape.avgFloors}` : "N/D"}</div>
                  <div>Hauteur : {shape.avgHeightM ? `${shape.avgHeightM} m` : "N/D"}</div>
                </div>
              </LeafletTooltip>
            </Polygon>
          ))}

        {showCentroid && (
          <CircleMarker
            center={mapCenter}
            radius={7}
            pathOptions={{ color: "#1d4ed8", fillColor: "#2563eb", fillOpacity: 0.95, weight: 2 }}
          >
            <LeafletTooltip direction="top">Centre estimé de la parcelle</LeafletTooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
