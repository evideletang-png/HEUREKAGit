export type SharedMapLayerKey = "plan" | "satellite" | "cadastre";

export const SHARED_MAP_CONTAINER_OPTIONS = {
  zoomSnap: 1,
  zoomDelta: 1,
  wheelPxPerZoomLevel: 80,
  maxZoom: 19,
} as const;

export const SHARED_TILE_LAYER_OPTIONS = {
  maxZoom: 19,
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
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    attribution: "&copy; IGN",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      maxNativeZoom: 19,
    },
  },
  satellite: {
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    attribution: "&copy; IGN",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      maxNativeZoom: 19,
    },
  },
  cadastre: {
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    attribution: "&copy; IGN",
    tileOptions: {
      ...SHARED_TILE_LAYER_OPTIONS,
      maxNativeZoom: 19,
    },
  },
};
