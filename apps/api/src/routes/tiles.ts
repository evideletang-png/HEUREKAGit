import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TILE_SOURCES = {
  satellite: {
    contentType: "image/jpeg",
    buildUrl: (z: string, x: string, y: string) =>
      `https://data.geopf.fr/wmts?apikey=essentiels&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${encodeURIComponent(z)}&TILEROW=${encodeURIComponent(y)}&TILECOL=${encodeURIComponent(x)}`,
  },
  cadastre: {
    contentType: "image/png",
    buildUrl: (z: string, x: string, y: string) =>
      `https://data.geopf.fr/wmts?apikey=essentiels&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${encodeURIComponent(z)}&TILEROW=${encodeURIComponent(y)}&TILECOL=${encodeURIComponent(x)}`,
  },
} as const;

router.get("/tiles/:layer/:z/:x/:y", async (req, res) => {
  try {
    const { layer, z, x, y } = req.params as {
      layer: keyof typeof TILE_SOURCES | string;
      z: string;
      x: string;
      y: string;
    };

    if (!(layer in TILE_SOURCES)) {
      res.status(404).json({ error: "UNKNOWN_TILE_LAYER", message: "Couche cartographique inconnue." });
      return;
    }

    if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
      res.status(400).json({ error: "INVALID_TILE_COORDS", message: "Coordonnées de tuiles invalides." });
      return;
    }

    const source = TILE_SOURCES[layer as keyof typeof TILE_SOURCES];
    const upstream = await fetch(source.buildUrl(z, x, y), {
      headers: {
        Accept: source.contentType,
        "User-Agent": "HEUREKA/1.0 map-tile-proxy",
      },
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.error("[tiles]", layer, z, x, y, upstream.status, body.slice(0, 200));
      res.status(502).json({ error: "UPSTREAM_TILE_ERROR", message: "Le fond cartographique n'a pas pu être chargé." });
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || source.contentType;
    const cacheControl = upstream.headers.get("cache-control") || "public, max-age=86400, stale-while-revalidate=604800";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("[tiles/proxy]", error);
    res.status(500).json({ error: "TILE_PROXY_FAILED", message: "Impossible de charger cette tuile cartographique." });
  }
});

export default router;
