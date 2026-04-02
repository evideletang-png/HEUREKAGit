/**
 * Report Generator Service
 * Produces comprehensive HTML reports from analysis data + full GeoContext.
 */

import type { Analysis, Parcel, Building, ZoneAnalysis, RuleArticle, BuildabilityResult, Constraint } from "@workspace/db";

interface ReportData {
  analysis: Analysis;
  parcel: Parcel | null;
  buildings: Building[];
  zoneAnalysis: (ZoneAnalysis & { articles?: RuleArticle[] }) | null;
  buildability: BuildabilityResult | null;
  constraints: Constraint[];
}

function fmt(v: number | null | undefined, suffix = "", decimals = 0): string {
  if (v == null) return "N/D";
  return (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString()) + (suffix ? " " + suffix : "");
}

function badge(text: string, color: "green" | "yellow" | "red" | "blue" | "navy"): string {
  const styles: Record<string, string> = {
    green: "background:#d1fae5;color:#065f46",
    yellow: "background:#fef3c7;color:#92400e",
    red: "background:#fee2e2;color:#991b1b",
    blue: "background:#dbeafe;color:#1e40af",
    navy: "background:#1a2744;color:#fff",
  };
  return `<span style="${styles[color]};display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;">${text}</span>`;
}

export function generateHTMLReport(data: ReportData): string {
  const { analysis, parcel, buildings, zoneAnalysis, buildability, constraints } = data;

  const gc = (() => {
    try { return analysis.geoContextJson ? JSON.parse(analysis.geoContextJson as string) : null; }
    catch { return null; }
  })();

  const now = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  const totalFootprint = buildings.reduce((s, b) => s + (b.footprintM2 || 0), 0);
  const confidencePct = buildability ? Math.round(buildability.confidenceScore * 100) : null;
  const confColor = confidencePct != null ? (confidencePct >= 70 ? "green" : confidencePct >= 40 ? "yellow" : "red") : "yellow";

  const pm  = gc?.parcel_metrics   ?? {};
  const pb  = gc?.parcel_boundaries ?? {};
  const bop = gc?.buildings_on_parcel ?? {};
  const nc  = gc?.neighbour_context  ?? {};
  const rd  = gc?.roads              ?? {};
  const plu = gc?.plu                ?? {};
  const cs  = gc?.constraints        ?? {};
  const tp  = gc?.topography         ?? {};
  const bld = gc?.buildable          ?? {};

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Georgia',serif;color:#1a2744;background:#fff;font-size:13px;line-height:1.6}
  .cover{background:#1a2744;color:#fff;padding:80px 60px;min-height:100vh;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
  .cover-logo{font-size:32px;font-weight:700;letter-spacing:4px;color:#c9a96e}
  .cover-sub{font-size:11px;color:rgba(255,255,255,.5);letter-spacing:3px;margin-top:4px;text-transform:uppercase}
  .cover-title{font-size:26px;font-weight:300;margin-top:40px}
  .cover-address{font-size:16px;margin-top:8px;opacity:.8}
  .cover-meta{display:flex;gap:24px;margin-top:32px;flex-wrap:wrap}
  .cover-chip{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:10px 16px}
  .cover-chip-label{font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:1px}
  .cover-chip-val{font-size:16px;font-weight:700;color:#c9a96e;margin-top:2px}
  .content{padding:48px 60px;max-width:860px;margin:0 auto}
  .section-title{font-size:18px;font-weight:700;color:#1a2744;border-bottom:2px solid #c9a96e;padding-bottom:6px;margin:40px 0 20px}
  .sub-title{font-size:13px;font-weight:700;color:#1a2744;text-transform:uppercase;letter-spacing:1px;margin:20px 0 10px}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th{background:#f0ede6;color:#1a2744;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:9px 12px;border-bottom:1px solid #e8e4dc;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0}
  .stat-card{background:#f8f7f5;border:1px solid #e8e4dc;border-radius:8px;padding:16px}
  .stat-card-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:700}
  .stat-card-val{font-size:22px;font-weight:700;color:#1a2744;margin-top:4px}
  .stat-card-sub{font-size:11px;color:#6b7280;margin-top:2px}
  .article-card{background:#f8f7f5;border-left:3px solid #1a2744;padding:14px 16px;margin:10px 0;border-radius:0 6px 6px 0}
  .article-num{font-size:10px;font-weight:700;letter-spacing:1px;color:#6b7280;text-transform:uppercase}
  .article-title{font-size:13px;font-weight:700;margin:4px 0}
  .conf-bar-wrap{display:flex;align-items:center;gap:10px;margin:4px 0}
  .conf-bar{height:8px;border-radius:4px;background:#e5e7eb;width:120px;overflow:hidden}
  .conf-fill{height:100%;border-radius:4px}
  .score-high{background:#10b981}.score-med{background:#f59e0b}.score-low{background:#ef4444}
  .disclaimer{background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:16px;margin-top:40px;font-size:11px;line-height:1.5}
  .footer{background:#1a2744;color:rgba(255,255,255,.5);padding:20px 60px;font-size:11px;display:flex;justify-content:space-between}
  .highlight-box{background:#1a2744;color:#fff;border-radius:8px;padding:20px 24px;margin:16px 0}
  .highlight-box .label{font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:1px}
  .highlight-box .val{font-size:28px;font-weight:700;color:#c9a96e;margin-top:4px}
  .tag{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;margin:2px}
  .tag-ok{background:#d1fae5;color:#065f46}
  .tag-warn{background:#fef3c7;color:#92400e}
  .tag-ko{background:#fee2e2;color:#991b1b}
  .tag-info{background:#dbeafe;color:#1e40af}
  @media print{.cover{page-break-after:always}.section-title{page-break-before:auto}}
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="cover">
  <div>
    <div class="cover-logo">HEUREKA</div>
    <div class="cover-sub">Analyse de faisabilité foncière</div>
  </div>
  <div>
    <div class="cover-title">${analysis.title || "Rapport d'analyse foncière"}</div>
    <div class="cover-address">${analysis.address}</div>
    ${analysis.city ? `<div class="cover-address" style="opacity:.7">${analysis.postalCode ?? ""} ${analysis.city}</div>` : ""}
    <div style="font-size:12px;opacity:.5;margin-top:8px">Généré le ${now}</div>
    <div class="cover-meta">
      ${zoneAnalysis?.zoneCode ? `<div class="cover-chip"><div class="cover-chip-label">Zone PLU</div><div class="cover-chip-val">${zoneAnalysis.zoneCode}</div></div>` : ""}
      ${parcel?.parcelSurfaceM2 ? `<div class="cover-chip"><div class="cover-chip-label">Surface parcelle</div><div class="cover-chip-val">${Math.round(parcel.parcelSurfaceM2)} m²</div></div>` : ""}
      ${buildability?.maxFootprintM2 ? `<div class="cover-chip"><div class="cover-chip-label">Emprise max</div><div class="cover-chip-val">${Math.round(buildability.maxFootprintM2)} m²</div></div>` : ""}
      ${confidencePct != null ? `<div class="cover-chip"><div class="cover-chip-label">Confiance IA</div><div class="cover-chip-val">${confidencePct}%</div></div>` : ""}
    </div>
  </div>
  <div style="font-size:11px;opacity:.4">Document produit par HEUREKA · Usage professionnel uniquement</div>
</div>

<div class="content">

<!-- 1. RÉSUMÉ EXÉCUTIF -->
<div class="section-title">1. Résumé exécutif</div>
<p style="margin-bottom:16px">${analysis.summary || `L'analyse de la parcelle située ${analysis.address} a été réalisée sur la base des données cadastrales et du document d'urbanisme applicable. La parcelle est classée en zone <strong>${zoneAnalysis?.zoneCode ?? "N/A"}</strong>.`}</p>

<div class="grid3">
  <div class="stat-card">
    <div class="stat-card-label">Surface parcelle</div>
    <div class="stat-card-val">${fmt(parcel?.parcelSurfaceM2)} m²</div>
    <div class="stat-card-sub">${fmt(pm.perimeter_m)} m de périmètre</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-label">Emprise constructible max</div>
    <div class="stat-card-val">${fmt(buildability?.maxFootprintM2)} m²</div>
    <div class="stat-card-sub">Restant disponible : ${fmt(buildability?.remainingFootprintM2)} m²</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-label">Hauteur maximale</div>
    <div class="stat-card-val">${fmt(buildability?.maxHeightM)} m</div>
    <div class="stat-card-sub">${bld.floors_possible != null ? "Soit R+" + (bld.floors_possible - 1) : ""}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-label">Volume constructible estimé</div>
    <div class="stat-card-val">${fmt(bld.volume_potential_m3)} m³</div>
    <div class="stat-card-sub">Potentiel théorique brut</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-label">Façade sur voie</div>
    <div class="stat-card-val">${fmt(parcel?.roadFrontageLengthM)} m</div>
    <div class="stat-card-sub">${pm.is_corner_plot ? "Parcelle d'angle" : "Parcelle simple"}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-label">Score de confiance IA</div>
    <div class="stat-card-val">${confidencePct != null ? confidencePct + "%" : "N/D"}</div>
    <div class="stat-card-sub conf-bar-wrap"><div class="conf-bar"><div class="conf-fill score-${confColor === "green" ? "high" : confColor === "yellow" ? "med" : "low"}" style="width:${confidencePct ?? 0}%"></div></div></div>
  </div>
</div>

<!-- 2. DONNÉES CADASTRALES -->
<div class="section-title">2. Données cadastrales</div>
<table>
  <tr><th>Paramètre</th><th>Valeur</th><th>Source</th></tr>
  <tr><td>Adresse</td><td>${analysis.address}</td><td>${badge("Récupérée","green")}</td></tr>
  <tr><td>Référence cadastrale (IDU)</td><td>${parcel ? `${parcel.cadastralSection}${parcel.parcelNumber}` : "N/D"} ${gc?.parcel?.id ? `<span style="opacity:.6;font-size:11px">(${gc.parcel.id})</span>` : ""}</td><td>${badge(parcel ? "Récupérée" : "Non trouvée", parcel ? "green" : "red")}</td></tr>
  <tr><td>Code INSEE commune</td><td>${gc?.parcel?.insee_code ?? "N/D"}</td><td>${badge("Récupéré","green")}</td></tr>
  <tr><td>Surface parcelle</td><td><strong>${fmt(parcel?.parcelSurfaceM2)} m²</strong></td><td>${badge("Cadastre IGN","green")}</td></tr>
  <tr><td>Périmètre</td><td>${fmt(pm.perimeter_m)} m</td><td>${badge("Calculé","blue")}</td></tr>
  <tr><td>Profondeur estimée</td><td>${fmt(pm.depth_m)} m</td><td>${badge("Calculé","blue")}</td></tr>
  <tr><td>Ratio de forme (compacité)</td><td>${pm.shape_ratio ?? "N/D"}</td><td>${badge("Calculé","blue")}</td></tr>
  <tr><td>Parcelle d'angle</td><td>${pm.is_corner_plot ? badge("Oui — angle voirie","yellow") : badge("Non","green")}</td><td>${badge("Classify-boundaries","green")}</td></tr>
</table>

<!-- 3. LIMITES PARCELLE -->
<div class="section-title">3. Limites et façades</div>
<div class="grid2">
  <div>
    <div class="sub-title">Façade voirie</div>
    <table>
      <tr><th>Indicateur</th><th>Valeur</th></tr>
      <tr><td>Longueur façade voie</td><td><strong>${fmt(pb.road_length_m)} m</strong></td></tr>
      <tr><td>Voie principale</td><td>${pb.front_road_name ?? "N/D"}</td></tr>
    </table>
  </div>
  <div>
    <div class="sub-title">Limites séparatives</div>
    <table>
      <tr><th>Indicateur</th><th>Valeur</th></tr>
      <tr><td>Longueur totale séparatifs</td><td><strong>${fmt(pb.side_length_m)} m</strong></td></tr>
      <tr><td>Nombre de segments</td><td>${pb.segments?.length ?? "N/D"}</td></tr>
    </table>
  </div>
</div>

<!-- 4. VOIRIE ET ACCÈS -->
<div class="section-title">4. Voirie et accès</div>
<table>
  <tr><th>Paramètre</th><th>Valeur</th><th>Source</th></tr>
  <tr><td>Voie principale d'accès</td><td>${rd.nearest_road_name ?? pb.front_road_name ?? "N/D"}</td><td>${badge("BD TOPO","green")}</td></tr>
  <tr><td>Distance estimée à la voie</td><td>${fmt(rd.distance_to_road_m)} m</td><td>${badge("Classify-boundaries","green")}</td></tr>
  <tr><td>Largeur chaussée</td><td>${rd.road_width_m != null ? fmt(rd.road_width_m) + " m" : "N/D"}</td><td>${badge("BD TOPO","green")}</td></tr>
  <tr><td>Accès véhicule possible</td><td>${rd.access_possible ? badge("Oui","green") : badge("À vérifier","yellow")}</td><td>${badge("Analyse auto","blue")}</td></tr>
  <tr><td>Longueur façade sur voie</td><td>${fmt(parcel?.roadFrontageLengthM)} m</td><td>${badge("Classify-boundaries","green")}</td></tr>
</table>

<!-- 5. BÂTIMENTS EXISTANTS -->
<div class="section-title">5. Bâtiments existants sur la parcelle</div>
${bop.count === 0 || buildings.length === 0 ? "<p>Aucun bâtiment identifié sur la parcelle (BD TOPO).</p>" : `
<div class="grid3">
  <div class="stat-card">
    <div class="stat-card-label">Emprise bâtie existante</div>
    <div class="stat-card-val">${fmt(bop.footprint_m2 ?? totalFootprint)} m²</div>
    <div class="stat-card-sub">Taux de couverture : ${bop.coverage_ratio != null ? Math.round(bop.coverage_ratio * 100) + "%" : "N/D"}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-label">Hauteur moyenne</div>
    <div class="stat-card-val">${fmt(bop.avg_height_m, "m", 1)}</div>
    <div class="stat-card-sub">${bop.avg_floors != null ? "Soit R+" + (Math.round(bop.avg_floors) - 1) : ""}</div>
  </div>
  <div class="stat-card">
    <div class="stat-card-label">Surface plancher estimée</div>
    <div class="stat-card-val">${fmt(bop.estimated_floor_area_m2)} m²</div>
    <div class="stat-card-sub">Estimation automatique</div>
  </div>
</div>
<table>
  <tr><th>#</th><th>Emprise (m²)</th><th>Surface plancher (m²)</th><th>Hauteur moy. (m)</th><th>Niveaux</th></tr>
  ${buildings.map((b, i) => `<tr>
    <td>Bâtiment ${i + 1}</td>
    <td>${fmt(b.footprintM2)}</td>
    <td>${fmt(b.estimatedFloorAreaM2)} ${badge("Estimée","yellow")}</td>
    <td>${fmt(b.avgHeightM, "", 1)}</td>
    <td>${b.avgFloors ? "R+" + (Math.round(b.avgFloors) - 1) : "N/D"}</td>
  </tr>`).join("")}
  <tr style="font-weight:700"><td>Total</td><td>${fmt(totalFootprint)} m²</td><td colspan="3"></td></tr>
</table>
`}

<!-- 6. CONTEXTE VOISINAGE -->
<div class="section-title">6. Contexte urbain et voisinage</div>
<table>
  <tr><th>Indicateur</th><th>Valeur</th><th>Source</th></tr>
  <tr><td>Hauteur moyenne voisinage</td><td>${nc.avg_neighbour_height_m != null ? fmt(nc.avg_neighbour_height_m, "m", 1) : "N/D"}</td><td>${badge("BD TOPO BBOX élargie","green")}</td></tr>
  <tr><td>Nombre de bâtiments voisins analysés</td><td>${nc.buildings?.length ?? "N/D"}</td><td>${badge("BD TOPO","green")}</td></tr>
  <tr><td>Typologie urbaine estimée</td><td>${nc.urban_typology ? badge(nc.urban_typology.replace(/_/g, " "),"navy") : "N/D"}</td><td>${badge("IA","blue")}</td></tr>
  <tr><td>Alignement dominant</td><td>${nc.dominant_alignment ? nc.dominant_alignment.replace(/_/g, " ") : "N/D"}</td><td>${badge("Analyse auto","blue")}</td></tr>
</table>

<!-- 7. TOPOGRAPHIE -->
<div class="section-title">7. Topographie</div>
<table>
  <tr><th>Indicateur</th><th>Valeur</th><th>Source</th></tr>
  <tr><td>Altitude minimale (sol)</td><td>${tp.elevation_min != null ? fmt(tp.elevation_min, "m NGF", 1) : "N/D"}</td><td>${badge("BD TOPO 3D","green")}</td></tr>
  <tr><td>Altitude maximale (toit)</td><td>${tp.elevation_max != null ? fmt(tp.elevation_max, "m NGF", 1) : "N/D"}</td><td>${badge("BD TOPO 3D","green")}</td></tr>
  <tr><td>Pente estimée</td><td>${tp.slope_percent != null ? fmt(tp.slope_percent, "%", 1) : "N/D"}</td><td>${badge("Calculé","blue")}</td></tr>
  <tr><td>Terrain plat ?</td><td>${tp.is_flat != null ? (tp.is_flat ? badge("Oui","green") : badge("Pente à étudier","yellow")) : "N/D"}</td><td>${badge("Calculé","blue")}</td></tr>
</table>

<!-- 8. ZONAGE PLU -->
<div class="section-title">8. Zonage et règlement PLU</div>
<table>
  <tr><th>Paramètre</th><th>Valeur</th><th>Source</th></tr>
  <tr><td>Code de zone</td><td><strong>${zoneAnalysis?.zoneCode ?? analysis.zoneCode ?? "N/D"}</strong></td><td>${badge("GPU IGN","green")}</td></tr>
  <tr><td>Libellé de zone</td><td>${zoneAnalysis?.zoneLabel ?? analysis.zoningLabel ?? "N/D"}</td><td>${badge("GPU IGN","green")}</td></tr>
  <tr><td>Document d'urbanisme</td><td>${plu.document_title ?? "PLU"}</td><td>${badge("Géoportail Urbanisme","green")}</td></tr>
  ${plu.document_url ? `<tr><td>Lien document</td><td><a href="${plu.document_url}" style="color:#1a2744;font-size:11px">${plu.document_url.substring(0,60)}…</a></td><td></td></tr>` : ""}
</table>

${plu.rules ? `
<div class="sub-title">Règles extraites du PLU</div>
<table>
  <tr><th>Règle</th><th>Valeur PLU</th><th>Article</th></tr>
  <tr><td>Coefficient d'emprise au sol (CES)</td><td>${plu.rules.CES_max != null ? Math.round(plu.rules.CES_max * 100) + "%" : "N/D"}</td><td>Art. 9</td></tr>
  <tr><td>Hauteur maximale</td><td>${plu.rules.height_max_m != null ? plu.rules.height_max_m + " m" : "N/D"}</td><td>Art. 10</td></tr>
  <tr><td>Recul par rapport à la voie</td><td>${plu.rules.setback_road_m != null ? plu.rules.setback_road_m + " m" : "N/D"}</td><td>Art. 6</td></tr>
  <tr><td>Recul limites séparatives</td><td>${plu.rules.setback_side_min_m != null ? plu.rules.setback_side_min_m + " m minimum" : "N/D"}</td><td>Art. 7</td></tr>
  <tr><td>Surface minimale terrain</td><td>${plu.rules.min_plot_size_m2 != null ? plu.rules.min_plot_size_m2 + " m²" : "Sans objet"}</td><td>Art. 5</td></tr>
  <tr><td>Division parcellaire</td><td>${plu.rules.division_allowed ? badge("Autorisée","green") : badge("Encadrée","yellow")}</td><td>Analyse</td></tr>
  <tr><td>Stationnement requis</td><td>${plu.rules.parking_requirements ?? "N/D"}</td><td>Art. 12</td></tr>
</table>` : ""}

<!-- 9. ARTICLES PLU (1-14) -->
<div class="section-title">9. Synthèse des articles PLU (Art. 1–14)</div>
${(zoneAnalysis?.articles && Array.isArray(zoneAnalysis.articles)) ? zoneAnalysis.articles.map((a: any) => `
<div class="article-card">
  <div class="article-num">Article ${a.articleNumber}</div>
  <div class="article-title">${a.title}</div>
  ${a.summary ? `<p style="margin-top:6px;font-size:13px">${a.summary}</p>` : ""}
  ${a.impactText ? `<p style="margin-top:6px;font-size:12px;color:#374151"><strong>Impact projet :</strong> ${a.impactText}</p>` : ""}
  ${a.vigilanceText ? `<p style="margin-top:4px;font-size:12px;color:#dc2626"><strong>⚠ Vigilance :</strong> ${a.vigilanceText}</p>` : ""}
</div>`).join("") : "<p>Analyse des articles non disponible.</p>"}

<!-- 10. CONTRAINTES -->
<div class="section-title">10. Contraintes et servitudes</div>
</table>
${cs.flood_risk || cs.abf_zone ? `<p style="font-size:11px;color:#6b7280;margin-top:4px">Certaines contraintes nécessitent un examen manuel des documents annexes ou un rendez-vous avec le service instructeur.</p>` : ""}

<!-- 11. ANALYSE DE CONFORMITÉ -->
<div class="section-title">11. Analyse de conformité du projet</div>
${(() => {
  const issuesRaw = zoneAnalysis?.issuesJson;
  let issues: any[] = [];
  try { if (issuesRaw) issues = JSON.parse(issuesRaw); } catch { }
  if (issues.length === 0) return `<div class="highlight-box" style="background:#f0fdf4;border-color:#bbf7d0">Aucune non-conformité majeure n'a été détectée par l'analyse automatique.</div>`;
  return `
  <table style="width:100%; border-collapse: collapse;">
    <tr style="background:#f9fafb">
      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Article</th>
      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Sévérité</th>
      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Observation / Point de vigilance</th>
    </tr>
    ${issues.map(i => `
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;font-weight:600">${i.article}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${i.severity === "bloquante" ? badge("Bloquante", "red") : i.severity === "majeure" ? badge("Majeure", "yellow") : badge("Mineure", "blue")}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;font-size:12px">${i.msg}</td>
    </tr>`).join("")}
  </table>`;
})()}

<!-- 12. ENVELOPPE CONSTRUCTIBLE -->
<div class="section-title">11. Enveloppe constructible théorique</div>
<div class="highlight-box">
  <div class="label">Emprise restante constructible</div>
  <div class="val">${fmt(bld.remaining_footprint_m2 ?? buildability?.remainingFootprintM2)} m²</div>
</div>
<table>
  <tr><th>Indicateur</th><th>Valeur calculée</th><th>Base réglementaire</th></tr>
  <tr><td>Emprise au sol maximale autorisée</td><td><strong>${fmt(bld.max_footprint_allowed_m2 ?? buildability?.maxFootprintM2)} m²</strong></td><td>CES × Surface parcelle</td></tr>
  <tr><td>Bâti existant (à déduire)</td><td>${fmt(totalFootprint)} m²</td><td>BD TOPO</td></tr>
  <tr><td>Emprise restante constructible</td><td><strong>${fmt(bld.remaining_footprint_m2 ?? buildability?.remainingFootprintM2)} m²</strong></td><td>Calcul net</td></tr>
  <tr><td>Hauteur maximale autorisée</td><td>${fmt(bld.max_height_m ?? buildability?.maxHeightM)} m</td><td>Article 10 PLU</td></tr>
  <tr><td>Nombre de niveaux possibles</td><td>${bld.floors_possible != null ? "R+" + (bld.floors_possible - 1) : "N/D"}</td><td>Hauteur / 3 m</td></tr>
  <tr><td>Volume constructible potentiel</td><td><strong>${fmt(bld.volume_potential_m3)} m³</strong></td><td>Emprise × Hauteur max</td></tr>
  <tr><td>Recul obligatoire voie</td><td>${fmt(buildability?.setbackRoadM)} m</td><td>Article 6 PLU</td></tr>
  <tr><td>Recul limites séparatives</td><td>${fmt(buildability?.setbackBoundaryM)} m minimum</td><td>Article 7 PLU</td></tr>
  <tr><td>Espaces verts requis</td><td>${buildability?.greenSpaceRequirement ?? "N/D"}</td><td>Article 13 PLU</td></tr>
  <tr><td>Stationnement requis</td><td>${buildability?.parkingRequirement ?? "N/D"}</td><td>Article 12 PLU</td></tr>
</table>

${buildability?.assumptionsJson ? `
<div class="sub-title">Hypothèses retenues par l'IA</div>
<ul style="padding-left:20px">
  ${(JSON.parse(buildability.assumptionsJson as string) as string[]).map((a: string) => `<li style="margin:4px 0;font-size:12px">${a}</li>`).join("")}
</ul>` : ""}

<!-- 12. POINTS DE VIGILANCE -->
<div class="section-title">12. Points de vigilance</div>
<ul style="padding-left:20px">
  ${buildability?.setbackRoadM ? `<li style="margin:6px 0">Recul obligatoire de <strong>${buildability.setbackRoadM} m</strong> depuis la voie publique.</li>` : ""}
  ${buildability?.setbackBoundaryM ? `<li style="margin:6px 0">Retrait minimum de <strong>${buildability.setbackBoundaryM} m</strong> par rapport aux limites séparatives.</li>` : ""}
  ${pm.is_corner_plot ? `<li style="margin:6px 0">Parcelle d'angle : double façade sur voie — vérifier les reculs spécifiques.</li>` : ""}
  ${cs.flood_risk ? `<li style="margin:6px 0;color:#dc2626">Risque inondation détecté — consulter le PPRI en vigueur.</li>` : ""}
  ${cs.abf_zone ? `<li style="margin:6px 0;color:#92400e">Zone ABF : permis de construire soumis à avis de l'Architecte des Bâtiments de France.</li>` : ""}
  ${zoneAnalysis ? `<li style="margin:6px 0">Zone <strong>${zoneAnalysis.zoneCode}</strong> : vérifier les usages autorisés et les conditions particulières (articles 1 et 2).</li>` : ""}
  <li style="margin:6px 0">Ce rapport est basé sur une analyse automatisée — le vérifier auprès des services d'urbanisme compétents.</li>
</ul>

<div class="disclaimer">
  <strong>⚠ Avertissement juridique</strong><br/>
  Ce rapport est produit à titre d'aide à la décision préliminaire et ne constitue pas un acte de droit. Les données cadastrales, réglementaires et urbanistiques présentées sont extraites de sources publiques (IGN, GPU, BD TOPO) et peuvent être incomplètes ou non à jour. HEUREKA ne peut être tenu responsable des décisions d'investissement ou de construction prises sur la base de ce document. L'analyse doit impérativement être complétée par une consultation des services d'urbanisme compétents et, le cas échéant, par une étude de faisabilité réalisée par un professionnel habilité (architecte, bureau d'étude, notaire).
</div>

</div>

<div class="footer">
  <span>HEUREKA · Analyse foncière et urbanistique · Rapport généré le ${now}</span>
  <span>Usage professionnel · Données soumises à vérification</span>
</div>

</body>
</html>`;
}
