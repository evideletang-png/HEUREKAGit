export type SharedMapLayerKey = "plan" | "satellite" | "satellite_plus" | "cadastre";

export const SHARED_MAP_CONTAINER_OPTIONS = {
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 120,
  maxZoom: 22,
} as const;

export const SHARED_TILE_LAYER_OPTIONS = {
  keepBuffer: 8,
  updateWhenIdle: true,
  updateWhenZooming: false,
  maxZoom: 22,
  noWrap: true,
} as const;

export const SHARED_MAP_TILE_LAYERS: Record<
  SharedMapLayerKey,
  {
    url: string;
    attribution: string;
    tileOptions: Record<string, unknown>;
  }
> = {
  plan: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; Carto",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      detectRetina: true,
      maxNativeZoom: 20,
      subdomains: "abcd",
    },
  },
  satellite: {
    url: "/api/tiles/satellite/{z}/{x}/{y}",
    attribution: "&copy; IGN",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      detectRetina: false,
      maxNativeZoom: 19,
    },
  },
  satellite_plus: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      detectRetina: false,
      maxNativeZoom: 19,
      maxZoom: 20,
    },
  },
  cadastre: {
    url: "/api/tiles/cadastre/{z}/{x}/{y}",
    attribution: "&copy; IGN",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      detectRetina: false,
      maxNativeZoom: 20,
    },
  },
};
