/**
 * Composes a cadastral map image on an HTML Canvas from WMTS tiles.
 * Tiles are fetched via the app's own proxy (/api/tiles/cadastre/:z/:x/:y)
 * which handles IGN auth — no origin restrictions from the browser.
 */

const TILE_SIZE = 256;

function lngLatToTileXY(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    ),
  };
}

function lngLatToWorldPixel(lng: number, lat: number, z: number): { wx: number; wy: number } {
  const n = Math.pow(2, z);
  const latRad = (lat * Math.PI) / 180;
  return {
    wx: ((lng + 180) / 360) * n * TILE_SIZE,
    wy:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n *
      TILE_SIZE,
  };
}

function chooseZoom(spanLng: number, spanLat: number): number {
  const maxSpan = Math.max(spanLng, spanLat);
  // Target ~4-5 tiles to cover the buffered bbox
  const z = Math.log2((4 * 360) / (2.5 * maxSpan));
  return Math.max(14, Math.min(19, Math.round(z)));
}

function loadTileImage(z: number, x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`tile ${z}/${x}/${y}`));
    img.src = `/api/tiles/cadastre/${z}/${x}/${y}`;
  });
}

export async function composeCadastralMap(
  parcelPositions: [number, number][], // [lat, lng]
  targetWidth = 800,
  targetHeight = 600,
): Promise<string | null> {
  if (!parcelPositions || parcelPositions.length < 3) return null;

  try {
    const lngs = parcelPositions.map((p) => p[1]);
    const lats = parcelPositions.map((p) => p[0]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const bufLng = (maxLng - minLng) * 0.45 + 0.0003;
    const bufLat = (maxLat - minLat) * 0.45 + 0.0003;
    const bboxMinLng = minLng - bufLng;
    const bboxMaxLng = maxLng + bufLng;
    const bboxMinLat = minLat - bufLat;
    const bboxMaxLat = maxLat + bufLat;

    const zoom = chooseZoom(bboxMaxLng - bboxMinLng, bboxMaxLat - bboxMinLat);

    const tl = lngLatToTileXY(bboxMinLng, bboxMaxLat, zoom);
    const br = lngLatToTileXY(bboxMaxLng, bboxMinLat, zoom);

    const tilesX = br.x - tl.x + 1;
    const tilesY = br.y - tl.y + 1;
    if (tilesX > 7 || tilesY > 7) return null;

    // Draw on a tile-sized canvas first
    const rawW = tilesX * TILE_SIZE;
    const rawH = tilesY * TILE_SIZE;
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = rawW;
    rawCanvas.height = rawH;
    const ctx = rawCanvas.getContext("2d")!;

    // Background fallback
    ctx.fillStyle = "#f0ede6";
    ctx.fillRect(0, 0, rawW, rawH);

    // Fetch tiles in parallel
    await Promise.all(
      Array.from({ length: tilesX }, (_, i) => tl.x + i).flatMap((tx) =>
        Array.from({ length: tilesY }, (_, j) => tl.y + j).map(async (ty) => {
          const canvasX = (tx - tl.x) * TILE_SIZE;
          const canvasY = (ty - tl.y) * TILE_SIZE;
          try {
            const img = await loadTileImage(zoom, tx, ty);
            ctx.drawImage(img, canvasX, canvasY, TILE_SIZE, TILE_SIZE);
          } catch {
            // Leave the filled placeholder
          }
        }),
      ),
    );

    // Draw parcel polygon overlay
    const originWx = tl.x * TILE_SIZE;
    const originWy = tl.y * TILE_SIZE;

    ctx.beginPath();
    let first = true;
    for (const [lat, lng] of parcelPositions) {
      const { wx, wy } = lngLatToWorldPixel(lng, lat, zoom);
      const px = wx - originWx;
      const py = wy - originWy;
      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(201, 169, 110, 0.25)";
    ctx.fill();
    ctx.strokeStyle = "#c9711e";
    ctx.lineWidth = Math.max(2, rawW / 200);
    ctx.stroke();

    // Scale to target dimensions preserving aspect ratio
    const scale = Math.min(targetWidth / rawW, targetHeight / rawH);
    const outW = Math.round(rawW * scale);
    const outH = Math.round(rawH * scale);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext("2d")!;
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";
    outCtx.drawImage(rawCanvas, 0, 0, rawW, rawH, 0, 0, outW, outH);

    return outCanvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
