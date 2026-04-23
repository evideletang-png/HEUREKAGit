/**
 * Cadastral Extract PDF Generator — HEUREKA edition
 * Professional parcel extract with HEUREKA branding and IGN cadastral map.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Analysis, Parcel } from "@workspace/db";

// ── Brand colours ─────────────────────────────────────────────────────────────
const NAVY   = rgb(0.102, 0.153, 0.267); // #1a2744
const GOLD   = rgb(0.788, 0.663, 0.431); // #c9a96e
const WHITE  = rgb(1, 1, 1);
const BLACK  = rgb(0, 0, 0);
const GRAY   = rgb(0.45, 0.45, 0.45);
const LGRAY  = rgb(0.88, 0.88, 0.88);
const BGROW  = rgb(0.967, 0.961, 0.945); // alternating row bg

// ── Layout ────────────────────────────────────────────────────────────────────
const PAGE_W  = 595;
const PAGE_H  = 842;
const MARGIN  = 18;
const INNER_W = PAGE_W - MARGIN * 2;

// ── French department lookup (code → name) ────────────────────────────────────
const DEPTS: Record<string, string> = {
  "01":"Ain","02":"Aisne","03":"Allier","04":"Alpes-de-Haute-Provence","05":"Hautes-Alpes",
  "06":"Alpes-Maritimes","07":"Ardèche","08":"Ardennes","09":"Ariège","10":"Aube",
  "11":"Aude","12":"Aveyron","13":"Bouches-du-Rhône","14":"Calvados","15":"Cantal",
  "16":"Charente","17":"Charente-Maritime","18":"Cher","19":"Corrèze","2A":"Corse-du-Sud",
  "2B":"Haute-Corse","21":"Côte-d'Or","22":"Côtes-d'Armor","23":"Creuse","24":"Dordogne",
  "25":"Doubs","26":"Drôme","27":"Eure","28":"Eure-et-Loir","29":"Finistère",
  "30":"Gard","31":"Haute-Garonne","32":"Gers","33":"Gironde","34":"Hérault",
  "35":"Ille-et-Vilaine","36":"Indre","37":"Indre-et-Loire","38":"Isère","39":"Jura",
  "40":"Landes","41":"Loir-et-Cher","42":"Loire","43":"Haute-Loire","44":"Loire-Atlantique",
  "45":"Loiret","46":"Lot","47":"Lot-et-Garonne","48":"Lozère","49":"Maine-et-Loire",
  "50":"Manche","51":"Marne","52":"Haute-Marne","53":"Mayenne","54":"Meurthe-et-Moselle",
  "55":"Meuse","56":"Morbihan","57":"Moselle","58":"Nièvre","59":"Nord",
  "60":"Oise","61":"Orne","62":"Pas-de-Calais","63":"Puy-de-Dôme","64":"Pyrénées-Atlantiques",
  "65":"Hautes-Pyrénées","66":"Pyrénées-Orientales","67":"Bas-Rhin","68":"Haut-Rhin","69":"Rhône",
  "70":"Haute-Saône","71":"Saône-et-Loire","72":"Sarthe","73":"Savoie","74":"Haute-Savoie",
  "75":"Paris","76":"Seine-Maritime","77":"Seine-et-Marne","78":"Yvelines","79":"Deux-Sèvres",
  "80":"Somme","81":"Tarn","82":"Tarn-et-Garonne","83":"Var","84":"Vaucluse",
  "85":"Vendée","86":"Vienne","87":"Haute-Vienne","88":"Vosges","89":"Yonne",
  "90":"Territoire de Belfort","91":"Essonne","92":"Hauts-de-Seine","93":"Seine-Saint-Denis",
  "94":"Val-de-Marne","95":"Val-d'Oise","971":"Guadeloupe","972":"Martinique",
  "973":"Guyane","974":"La Réunion","976":"Mayotte",
};

function deptFromIdu(idu: string): { code: string; name: string } | null {
  if (idu.length < 5) return null;
  const insee = idu.slice(0, 5);
  // Corsica: starts with 2A or 2B (INSEE uses 20xxx but sometimes 2A/2B)
  const code2 = insee.slice(0, 2).toUpperCase();
  const code3 = insee.slice(0, 3);
  if (DEPTS[code3]) return { code: code3, name: DEPTS[code3] };
  if (DEPTS[code2]) return { code: code2, name: DEPTS[code2] };
  return null;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawRect(
  page: PDFPage, x: number, y: number, w: number, h: number,
  opts: { fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb>; thickness?: number } = {},
) {
  page.drawRectangle({
    x, y, width: w, height: h,
    ...(opts.fill   ? { color: opts.fill } : {}),
    ...(opts.stroke ? { borderColor: opts.stroke, borderWidth: opts.thickness ?? 0.5 } : {}),
  });
}

function txt(
  page: PDFPage, s: string, x: number, y: number,
  size: number, font: PDFFont, color = BLACK, maxW?: number,
) {
  let str = s;
  if (maxW) {
    while (str.length > 4 && font.widthOfTextAtSize(str, size) > maxW) str = str.slice(0, -1);
    if (str !== s) str = str.slice(0, -1) + "…";
  }
  page.drawText(str, { x, y, size, font, color });
}

function hline(page: PDFPage, x1: number, x2: number, y: number, c = LGRAY, t = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color: c });
}

function dataRow(
  page: PDFPage, label: string, value: string,
  x: number, y: number, w: number, rowH: number,
  font: PDFFont, bold: PDFFont, shade: boolean,
) {
  if (shade) drawRect(page, x, y - rowH, w, rowH, { fill: BGROW });
  txt(page, label, x + 6, y - rowH + 4, 8, font, GRAY);
  txt(page, value, x + w * 0.48, y - rowH + 4, 8.5, bold, BLACK, w * 0.5);
  return y - rowH;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateCadastralExtractPDF(
  parcel: Parcel,
  analysis: Analysis,
  mapImageBytes: Uint8Array | null,
): Promise<Uint8Array> {

  const metadata: Record<string, any> = (() => {
    try { const r = parcel.metadataJson; return (typeof r === "string" ? JSON.parse(r) : r) ?? {}; }
    catch { return {}; }
  })();

  const gc: Record<string, any> = (() => {
    try { const r = analysis.geoContextJson; return (typeof r === "string" ? JSON.parse(r) : r) ?? {}; }
    catch { return {}; }
  })();

  const idu       = (metadata.idu || "") as string;
  const deptInfo  = deptFromIdu(idu);
  const commune   = (analysis.city || metadata.commune || "").toUpperCase() || "N/D";
  const deptName  = gc?.administrative?.department_name || deptInfo?.name || "N/D";
  const deptCode  = deptInfo?.code || (idu.length >= 2 ? idu.slice(0, 2) : "");
  const inseeCode = idu.length >= 5 ? idu.slice(0, 5) : "";
  const section   = (parcel.cadastralSection || metadata.section || "N/D") as string;
  const numero    = (parcel.parcelNumber    || metadata.numero  || "N/D") as string;
  const feuille   = idu.length >= 14
    ? `${idu.slice(5, 8)} ${idu.slice(8, 10).trim()} 01`
    : `000 ${section} 01`;
  const surface   = parcel.parcelSurfaceM2  != null ? `${parcel.parcelSurfaceM2.toLocaleString("fr-FR")} m²` : "N/D";
  const frontage  = parcel.roadFrontageLengthM != null ? `${Math.round(parcel.roadFrontageLengthM)} m` : null;
  const pb        = gc?.parcel_boundaries ?? {};
  const pm        = gc?.parcel_metrics   ?? {};
  const rd        = gc?.roads            ?? {};
  const roadName  = pb.front_road_name ?? rd.nearest_road_name ?? null;
  const perimeter = pm.perimeter_m != null ? `${Math.round(pm.perimeter_m)} m` : null;
  const lat       = parcel.centroidLat;
  const lng       = parcel.centroidLng;
  const coords    = (lat != null && lng != null)
    ? `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`
    : null;
  const today     = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  // ── Build PDF ────────────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page   = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let   curY   = PAGE_H;

  // ── Navy header bar ──────────────────────────────────────────────────────────
  const HDR_H = 64;
  drawRect(page, 0, curY - HDR_H, PAGE_W, HDR_H, { fill: NAVY });

  // Gold accent left strip
  drawRect(page, 0, curY - HDR_H, 5, HDR_H, { fill: GOLD });

  txt(page, "HEUREKA", MARGIN + 8, curY - 22, 15, bold, GOLD);
  txt(page, "ANALYSE URBAINE", MARGIN + 8, curY - 34, 6.5, font, rgb(0.6, 0.6, 0.6));

  const title = "EXTRAIT DU PLAN CADASTRAL";
  const titleW = bold.widthOfTextAtSize(title, 13);
  txt(page, title, PAGE_W / 2 - titleW / 2, curY - 28, 13, bold, WHITE);

  txt(page, `Édité le ${today}`, PAGE_W - MARGIN - 90, curY - 22, 7, font, rgb(0.55, 0.55, 0.55));
  txt(page, "Source : IGN — data.geopf.fr", PAGE_W - MARGIN - 90, curY - 32, 6.5, font, rgb(0.5, 0.5, 0.5));
  txt(page, "Document non opposable à des tiers", PAGE_W - MARGIN - 90, curY - 42, 6, font, rgb(0.45, 0.45, 0.45));

  curY -= HDR_H + 10;

  // ── Two-column info block ────────────────────────────────────────────────────
  const COL_W  = INNER_W / 2 - 4;
  const ROW_H  = 17;
  const LX     = MARGIN;
  const RX     = MARGIN + COL_W + 8;

  // Column titles
  const colTitleY = curY;
  drawRect(page, LX, colTitleY - 16, COL_W, 16, { fill: NAVY });
  drawRect(page, RX, colTitleY - 16, COL_W, 16, { fill: NAVY });
  txt(page, "IDENTIFICATION CADASTRALE", LX + 6, colTitleY - 11, 7.5, bold, GOLD);
  txt(page, "LOCALISATION & GÉOMÉTRIE",  RX + 6, colTitleY - 11, 7.5, bold, GOLD);
  curY = colTitleY - 16;

  // Left column rows
  const leftRows: [string, string][] = [
    ["Section",    section],
    ["Numéro",     numero],
    ["Feuille",    feuille],
    ["Surface",    surface],
    ...(frontage ? [["Linéaire voie", frontage] as [string, string]] : []),
    ...(idu       ? [["IDU",          idu]       as [string, string]] : []),
    ...(inseeCode ? [["Code INSEE",   inseeCode] as [string, string]] : []),
  ];

  // Right column rows
  const rightRows: [string, string][] = [
    ["Commune",     commune],
    ["Département", deptCode ? `${deptCode} — ${deptName}` : deptName],
    ...(roadName   ? [["Voie",       roadName]                          as [string, string]] : []),
    ...(perimeter  ? [["Périmètre",  perimeter]                        as [string, string]] : []),
    ...(coords     ? [["Coordonnées (WGS84)", coords]                  as [string, string]] : []),
  ];

  const maxRows = Math.max(leftRows.length, rightRows.length);
  let ly = curY;
  let ry = curY;

  for (let i = 0; i < leftRows.length; i++) {
    ly = dataRow(page, leftRows[i][0], leftRows[i][1], LX, ly, COL_W, ROW_H, font, bold, i % 2 === 0);
  }
  // Left column border
  drawRect(page, LX, ly, COL_W, curY - ly, { stroke: LGRAY, thickness: 0.5 });

  for (let i = 0; i < rightRows.length; i++) {
    ry = dataRow(page, rightRows[i][0], rightRows[i][1], RX, ry, COL_W, ROW_H, font, bold, i % 2 === 0);
  }
  // Right column border
  drawRect(page, RX, ry, COL_W, curY - ry, { stroke: LGRAY, thickness: 0.5 });

  curY = Math.min(ly, ry) - 12;

  // ── Map section title bar ────────────────────────────────────────────────────
  drawRect(page, MARGIN, curY - 16, INNER_W, 16, { fill: NAVY });
  txt(page, "PLAN CADASTRAL  —  Source : IGN CADASTRALPARCELS.PARCELLAIRE_EXPRESS", MARGIN + 6, curY - 11, 7.5, bold, GOLD);
  curY -= 16;

  // ── Map image ────────────────────────────────────────────────────────────────
  const FOOTER_H = 24;
  const MAP_H    = curY - MARGIN - FOOTER_H;
  const MAP_W    = INNER_W;

  drawRect(page, MARGIN, MARGIN + FOOTER_H, MAP_W, MAP_H, { stroke: LGRAY, thickness: 0.5 });

  if (mapImageBytes) {
    try {
      const img   = await pdfDoc.embedPng(mapImageBytes);
      const scale = Math.min((MAP_W - 2) / img.width, (MAP_H - 2) / img.height, 1);
      const dW    = img.width  * scale;
      const dH    = img.height * scale;
      page.drawImage(img, {
        x: MARGIN + (MAP_W - dW) / 2,
        y: MARGIN + FOOTER_H + (MAP_H - dH) / 2,
        width: dW, height: dH,
      });
    } catch { /* placeholder below */ }
  }

  if (!mapImageBytes) {
    const msg  = "Carte cadastrale en cours de génération…";
    const msgW = font.widthOfTextAtSize(msg, 9);
    txt(page, msg, MARGIN + (MAP_W - msgW) / 2, MARGIN + FOOTER_H + MAP_H / 2, 9, font, GRAY);
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  hline(page, MARGIN, PAGE_W - MARGIN, MARGIN + FOOTER_H - 2, LGRAY);
  const foot = `©${new Date().getFullYear()} Direction Générale des Finances Publiques · Données IGN open data · Document généré par HEUREKA — ${today}`;
  txt(page, foot, MARGIN, MARGIN + 7, 6, font, GRAY, INNER_W);

  return pdfDoc.save();
}
