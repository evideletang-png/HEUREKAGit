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
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    attribution: "&copy; IGN",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      detectRetina: true,
      maxNativeZoom: 19,
      crossOrigin: true,
    },
  },
  satellite_plus: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      detectRetina: true,
      maxNativeZoom: 20,
    },
  },
  cadastre: {
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    attribution: "&copy; IGN",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      detectRetina: true,
      maxNativeZoom: 20,
      crossOrigin: true,
    },
  },
};
