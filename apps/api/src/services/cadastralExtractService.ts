/**
 * Cadastral Extract PDF Generator
 * Produces a document close to the official "extrait du plan cadastral"
 * by combining IGN WMS imagery with parcel metadata.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Analysis, Parcel } from "@workspace/db";

const IGN_WMS = "https://data.geopf.fr/wms-r/wms";
const TIMEOUT_MS = 10_000;

const NAVY  = rgb(0.102, 0.153, 0.267); // #1a2744
const GOLD  = rgb(0.788, 0.663, 0.431); // #c9a96e
const WHITE = rgb(1, 1, 1);
const GRAY  = rgb(0.45, 0.45, 0.45);
const LIGHT = rgb(0.965, 0.957, 0.937); // #f6f4ef
const BLACK = rgb(0, 0, 0);
const BORDER = rgb(0.8, 0.8, 0.8);

interface BBox { minLng: number; minLat: number; maxLng: number; maxLat: number }

function computeBBox(geometryJson: any): BBox | null {
  try {
    const geo = typeof geometryJson === "string" ? JSON.parse(geometryJson) : geometryJson;
    const rings: number[][][] =
      geo.type === "Feature" ? geo.geometry?.coordinates : geo.coordinates;
    if (!rings || !rings[0]) return null;
    const coords = rings[0];
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const bufLng = (maxLng - minLng) * 0.4 + 0.0002;
    const bufLat = (maxLat - minLat) * 0.4 + 0.0002;
    return {
      minLng: minLng - bufLng,
      maxLng: maxLng + bufLng,
      minLat: minLat - bufLat,
      maxLat: maxLat + bufLat,
    };
  } catch {
    return null;
  }
}

async function fetchWmsImage(bbox: BBox, widthPx = 800, heightPx = 600): Promise<Uint8Array | null> {
  try {
    const params = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetMap",
      FORMAT: "image/png",
      TRANSPARENT: "false",
      LAYERS: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
      STYLES: "",
      CRS: "CRS:84",
      BBOX: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      WIDTH: String(widthPx),
      HEIGHT: String(heightPx),
    });
    const url = `${IGN_WMS}?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "HEUREKA/1.0 cadastral-extract" },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function drawSectionTitle(page: PDFPage, text: string, y: number, boldFont: PDFFont): number {
  page.drawText(text, { x: 30, y: y - 13, size: 9, font: boldFont, color: NAVY });
  page.drawLine({ start: { x: 30, y: y - 17 }, end: { x: 565, y: y - 17 }, thickness: 1.5, color: GOLD });
  return y - 28;
}

function drawRow(
  page: PDFPage,
  label: string,
  value: string,
  y: number,
  font: PDFFont,
  boldFont: PDFFont,
  shade: boolean,
): number {
  const rowH = 16;
  if (shade) {
    page.drawRectangle({ x: 30, y: y - rowH, width: 535, height: rowH, color: LIGHT });
  }
  page.drawText(label, { x: 35, y: y - 11, size: 8.5, font, color: GRAY });
  page.drawText(value, { x: 210, y: y - 11, size: 8.5, font: boldFont, color: BLACK });
  return y - rowH;
}

export async function generateCadastralExtractPDF(
  parcel: Parcel,
  analysis: Analysis,
): Promise<Uint8Array> {
  const metadata: Record<string, string> = (() => {
    try {
      const raw = parcel.metadataJson;
      return (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {};
    } catch { return {}; }
  })();

  const commune   = metadata.commune || analysis.city || "";
  const codeInsee = metadata.commune || "";
  const section   = parcel.cadastralSection || metadata.section || "N/D";
  const numero    = parcel.parcelNumber || metadata.numero || "N/D";
  const idu       = metadata.idu || "";
  const surface   = parcel.parcelSurfaceM2 != null ? `${parcel.parcelSurfaceM2} m²` : "N/D";
  const address   = analysis.address || "";
  const date      = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // Fetch map image
  const bbox = parcel.geometryJson ? computeBBox(parcel.geometryJson) : null;
  const mapImageBytes = bbox ? await fetchWmsImage(bbox, 800, 600) : null;

  // Build PDF
  const pdfDoc  = await PDFDocument.create();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595, 842]);
  let curY = 842;

  // ── Header bar ────────────────────────────────────────────────────────────
  const HEADER_H = 72;
  page.drawRectangle({ x: 0, y: curY - HEADER_H, width: 595, height: HEADER_H, color: NAVY });
  page.drawText("HEUREKA", { x: 30, y: curY - 25, size: 16, font: boldFont, color: GOLD });
  page.drawText("ANALYSE URBAINE", { x: 30, y: curY - 37, size: 7, font, color: rgb(0.7, 0.7, 0.7) });
  page.drawText("EXTRAIT DU PLAN CADASTRAL", { x: 30, y: curY - 56, size: 13, font: boldFont, color: WHITE });
  page.drawText(`Généré le ${date}`, { x: 390, y: curY - 22, size: 8, font, color: rgb(0.65, 0.65, 0.65) });
  if (address) {
    const addr = address.length > 60 ? address.slice(0, 57) + "…" : address;
    page.drawText(addr, { x: 390, y: curY - 35, size: 7.5, font, color: rgb(0.65, 0.65, 0.65) });
  }
  curY -= HEADER_H + 8;

  // Disclaimer
  page.drawText(
    "Données issues de l'API Cadastre IGN — Document informatif, non opposable à des tiers",
    { x: 30, y: curY - 10, size: 7, font, color: GRAY },
  );
  curY -= 22;

  // ── Parcel identification table ───────────────────────────────────────────
  curY = drawSectionTitle(page, "IDENTIFICATION DE LA PARCELLE", curY, boldFont);

  const rows: [string, string][] = [
    ["Commune", commune || "N/D"],
    ["Code INSEE", codeInsee || "N/D"],
    ["Section cadastrale", section],
    ["Numéro de parcelle", numero],
    ...(idu ? [["IDU (Référence parcellaire)", idu] as [string, string]] : []),
    ["Surface contenance", surface],
    ...(parcel.roadFrontageLengthM != null
      ? [["Linéaire de voie (est.)", `${parcel.roadFrontageLengthM} m`] as [string, string]]
      : []),
  ];

  for (let i = 0; i < rows.length; i++) {
    curY = drawRow(page, rows[i][0], rows[i][1], curY, font, boldFont, i % 2 === 0);
  }
  curY -= 14;

  // ── Cadastral map ─────────────────────────────────────────────────────────
  curY = drawSectionTitle(page, "PLAN CADASTRAL (Source : IGN — CADASTRALPARCELS.PARCELLAIRE_EXPRESS)", curY, boldFont);

  const MAP_MAX_H = 290;
  const MAP_MAX_W = 535;
  const mapAreaY  = curY - MAP_MAX_H;

  if (mapImageBytes) {
    try {
      const img = await pdfDoc.embedPng(mapImageBytes);
      const { width: nW, height: nH } = img;
      const scale = Math.min(MAP_MAX_W / nW, MAP_MAX_H / nH, 1);
      const drawW = nW * scale;
      const drawH = nH * scale;
      const imgX  = 30 + (MAP_MAX_W - drawW) / 2;
      const imgY  = mapAreaY + (MAP_MAX_H - drawH) / 2;
      page.drawImage(img, { x: imgX, y: imgY, width: drawW, height: drawH });
      page.drawRectangle({
        x: 30, y: mapAreaY, width: MAP_MAX_W, height: MAP_MAX_H,
        borderColor: BORDER, borderWidth: 0.5,
      });
    } catch {
      page.drawRectangle({ x: 30, y: mapAreaY, width: MAP_MAX_W, height: MAP_MAX_H, color: LIGHT, borderColor: BORDER, borderWidth: 0.5 });
      page.drawText("Carte cadastrale non disponible", { x: 220, y: mapAreaY + MAP_MAX_H / 2, size: 9, font, color: GRAY });
    }
  } else {
    page.drawRectangle({ x: 30, y: mapAreaY, width: MAP_MAX_W, height: MAP_MAX_H, color: LIGHT, borderColor: BORDER, borderWidth: 0.5 });
    page.drawText("Carte cadastrale non disponible", { x: 220, y: mapAreaY + MAP_MAX_H / 2, size: 9, font, color: GRAY });
  }

  curY = mapAreaY - 12;

  // ── Centroid coordinates ──────────────────────────────────────────────────
  if (parcel.centroidLat != null && parcel.centroidLng != null) {
    const coordText = `Centroïde : ${parcel.centroidLat.toFixed(6)}° N, ${parcel.centroidLng.toFixed(6)}° E  —  Système : WGS84 (EPSG:4326)`;
    page.drawText(coordText, { x: 30, y: curY - 9, size: 7.5, font, color: GRAY });
    curY -= 20;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const FOOTER_Y = 30;
  page.drawLine({ start: { x: 30, y: FOOTER_Y + 18 }, end: { x: 565, y: FOOTER_Y + 18 }, thickness: 0.5, color: BORDER });
  page.drawText(
    `Source : Institut Géographique National (IGN) — data.geopf.fr  |  © IGN 2024  |  Document généré par HEUREKA le ${date}`,
    { x: 30, y: FOOTER_Y + 6, size: 6.5, font, color: GRAY },
  );

  return pdfDoc.save();
}
