/**
 * Cadastral Extract PDF Generator
 * Produces a document styled after the official "Extrait du Plan Cadastral" (DGFiP/IGN).
 * The cadastral map image is generated client-side (WMTS tiles via browser proxy)
 * and passed as a PNG buffer to this service.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Analysis, Parcel } from "@workspace/db";

const BLACK  = rgb(0, 0, 0);
const GRAY   = rgb(0.45, 0.45, 0.45);
const LIGHT  = rgb(0.95, 0.95, 0.95);
const WHITE  = rgb(1, 1, 1);

// ── Layout constants ─────────────────────────────────────────────────────────
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 18;
const INNER_W = PAGE_W - MARGIN * 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function drawRect(
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  opts: { fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb>; thickness?: number } = {},
) {
  page.drawRectangle({
    x, y, width: w, height: h,
    ...(opts.fill ? { color: opts.fill } : {}),
    ...(opts.stroke ? { borderColor: opts.stroke, borderWidth: opts.thickness ?? 0.5 } : {}),
  });
}

function text(
  page: PDFPage,
  str: string, x: number, y: number,
  size: number, font: PDFFont,
  color = BLACK,
  maxWidth?: number,
) {
  let s = str;
  if (maxWidth) {
    while (s.length > 4 && font.widthOfTextAtSize(s, size) > maxWidth) {
      s = s.slice(0, -1);
    }
    if (s !== str) s = s.slice(0, -1) + "…";
  }
  page.drawText(s, { x, y, size, font, color });
}

function drawHLine(page: PDFPage, x1: number, x2: number, y: number, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: BLACK });
}

function drawVLine(page: PDFPage, x: number, y1: number, y2: number, thickness = 0.5) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color: BLACK });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateCadastralExtractPDF(
  parcel: Parcel,
  analysis: Analysis,
  mapImageBytes: Uint8Array | null,
): Promise<Uint8Array> {

  const metadata: Record<string, string> = (() => {
    try {
      const raw = parcel.metadataJson;
      return (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {};
    } catch { return {}; }
  })();

  const gc: Record<string, any> = (() => {
    try {
      const raw = analysis.geoContextJson;
      return (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {};
    } catch { return {}; }
  })();

  const commune   = analysis.city || metadata.commune || "N/D";
  const dept      = gc?.administrative?.department_name || "";
  const section   = parcel.cadastralSection || metadata.section || "N/D";
  const numero    = parcel.parcelNumber || metadata.numero || "N/D";
  const idu       = metadata.idu || "";
  const feuille   = idu.length >= 14 ? `${idu.slice(5, 8)} ${idu.slice(8, 10)} 01` : `000 ${section} 01`;
  const surface   = parcel.parcelSurfaceM2 != null ? `${parcel.parcelSurfaceM2} m²` : "N/D";
  const today     = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // ── Build PDF ───────────────────────────────────────────────────────────────
  const pdfDoc   = await PDFDocument.create();
  const font      = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold      = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page      = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // ── HEADER BLOCK ────────────────────────────────────────────────────────────
  // Outer border of the header table
  const HDR_TOP  = PAGE_H - MARGIN;
  const HDR_H    = 190;
  const HDR_BOT  = HDR_TOP - HDR_H;

  drawRect(page, MARGIN, HDR_BOT, INNER_W, HDR_H, { stroke: BLACK, thickness: 0.7 });

  // Column dividers  x
  const COL1_W = 175;
  const COL3_W = 165;
  const COL2_X = MARGIN + COL1_W;
  const COL3_X = PAGE_W - MARGIN - COL3_W;
  const COL2_W = COL3_X - COL2_X;

  drawVLine(page, COL2_X, HDR_BOT, HDR_TOP);
  drawVLine(page, COL3_X, HDR_BOT, HDR_TOP);

  // ── Column 1: left metadata ─────────────────────────────────────────────────
  const L = MARGIN + 6;
  let ly = HDR_TOP - 14;
  text(page, "Département :", L, ly, 7, font, GRAY);         ly -= 11;
  text(page, dept || "N/D", L, ly, 8, bold, BLACK, COL1_W - 10); ly -= 14;
  text(page, "Commune :", L, ly, 7, font, GRAY);              ly -= 11;
  text(page, commune.toUpperCase(), L, ly, 8, bold, BLACK, COL1_W - 10); ly -= 16;
  drawHLine(page, MARGIN, COL2_X, ly + 4, 0.4);
  text(page, `Section : ${section}`, L, ly, 7.5, font);      ly -= 11;
  text(page, `Feuille : ${feuille}`, L, ly, 7.5, font);       ly -= 16;
  drawHLine(page, MARGIN, COL2_X, ly + 4, 0.4);
  text(page, "Échelle d'origine : 1/500", L, ly, 7, font, GRAY);  ly -= 10;
  text(page, "Échelle d'édition : 1/200", L, ly, 7, font, GRAY);  ly -= 14;
  drawHLine(page, MARGIN, COL2_X, ly + 4, 0.4);
  text(page, `Date d'édition : ${today}`, L, ly, 7, font);   ly -= 10;
  text(page, "(fuseau horaire de Paris)", L, ly, 6.5, font, GRAY);  ly -= 14;
  drawHLine(page, MARGIN, COL2_X, ly + 4, 0.4);
  text(page, "Coordonnées en projection : WGS84", L, ly, 6.5, font, GRAY);  ly -= 9;
  text(page, "Source : IGN — data.geopf.fr", L, ly, 6.5, font, GRAY);

  // ── Column 2: title (center) ─────────────────────────────────────────────────
  const C_MID = COL2_X + COL2_W / 2;
  const titleLines = [
    { t: "DIRECTION GÉNÉRALE", size: 7.5, f: bold },
    { t: "DES FINANCES PUBLIQUES", size: 7.5, f: bold },
    { t: "————————", size: 7, f: font },
    { t: "EXTRAIT DU", size: 12, f: bold },
    { t: "PLAN CADASTRAL", size: 12, f: bold },
    { t: "————————", size: 7, f: font },
  ];
  let ty = HDR_TOP - 18;
  for (const l of titleLines) {
    const w = l.f.widthOfTextAtSize(l.t, l.size);
    text(page, l.t, C_MID - w / 2, ty, l.size, l.f);
    ty -= l.size + 5;
  }
  // Surface chip
  const chipLabel = `Surface : ${surface}`;
  const chipW = bold.widthOfTextAtSize(chipLabel, 8) + 10;
  drawRect(page, C_MID - chipW / 2, ty - 5, chipW, 14, { fill: LIGHT, stroke: BLACK, thickness: 0.4 });
  text(page, chipLabel, C_MID - chipW / 2 + 5, ty, 8, bold);
  ty -= 20;

  if (idu) {
    const iduLabel = `IDU : ${idu}`;
    const iduW = font.widthOfTextAtSize(iduLabel, 7);
    text(page, iduLabel, C_MID - iduW / 2, ty, 7, font, GRAY);
    ty -= 12;
  }

  // ── Column 3: right info ─────────────────────────────────────────────────────
  const R = COL3_X + 6;
  const RW = COL3_W - 10;
  let ry = HDR_TOP - 14;
  const rightLines = [
    "Le plan visualisé sur cet extrait est géré",
    "par le service des impôts fonciers :",
    "",
    "Pour toute question, consultez :",
    "cadastre.gouv.fr",
  ];
  for (const l of rightLines) {
    if (l === "cadastre.gouv.fr") {
      text(page, l, R, ry, 7.5, bold, BLACK, RW);
    } else {
      text(page, l, R, ry, 7, font, GRAY, RW);
    }
    ry -= l === "" ? 8 : 10;
  }
  drawHLine(page, COL3_X, PAGE_W - MARGIN, ry + 4, 0.4);
  ry -= 4;
  text(page, "Cet extrait vous est délivré par :", R, ry, 7, font, GRAY, RW);
  ry -= 12;
  text(page, "HEUREKA", R, ry, 10, bold, BLACK);
  ry -= 11;
  text(page, "analyse-urbaine.fr", R, ry, 7.5, font, GRAY, RW);
  ry -= 14;
  text(page, "Document non opposable à des tiers.", R, ry, 6.5, font, GRAY, RW);

  // ── MAP AREA ────────────────────────────────────────────────────────────────
  const MAP_TOP  = HDR_BOT - 2;          // 2pt gap below header
  const MAP_BOT  = MARGIN + 20;           // leave space for footer
  const MAP_H    = MAP_TOP - MAP_BOT;
  const MAP_X    = MARGIN;
  const MAP_W    = INNER_W;

  drawRect(page, MAP_X, MAP_BOT, MAP_W, MAP_H, { stroke: BLACK, thickness: 0.7 });

  if (mapImageBytes) {
    try {
      const img = await pdfDoc.embedPng(mapImageBytes);
      const { width: nW, height: nH } = img;
      const scale  = Math.min((MAP_W - 2) / nW, (MAP_H - 2) / nH, 1);
      const drawW  = nW * scale;
      const drawH  = nH * scale;
      const imgX   = MAP_X + (MAP_W - drawW) / 2;
      const imgY   = MAP_BOT + (MAP_H - drawH) / 2;
      page.drawImage(img, { x: imgX, y: imgY, width: drawW, height: drawH });
    } catch {
      drawRect(page, MAP_X + 1, MAP_BOT + 1, MAP_W - 2, MAP_H - 2, { fill: LIGHT });
      const msg = "Carte cadastrale non disponible";
      const msgW = font.widthOfTextAtSize(msg, 10);
      text(page, msg, MAP_X + (MAP_W - msgW) / 2, MAP_BOT + MAP_H / 2, 10, font, GRAY);
    }
  } else {
    drawRect(page, MAP_X + 1, MAP_BOT + 1, MAP_W - 2, MAP_H - 2, { fill: LIGHT });
    const msg = "Carte cadastrale non disponible";
    const msgW = font.widthOfTextAtSize(msg, 10);
    text(page, msg, MAP_X + (MAP_W - msgW) / 2, MAP_BOT + MAP_H / 2, 10, font, GRAY);
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  const footerY = MARGIN + 4;
  const footerText =
    `©${new Date().getFullYear()} Direction Générale des Finances Publiques — Données IGN — Document généré par HEUREKA le ${today}`;
  const ftW = font.widthOfTextAtSize(footerText, 6);
  text(page, footerText, PAGE_W / 2 - ftW / 2, footerY, 6, font, GRAY);

  return pdfDoc.save();
}
