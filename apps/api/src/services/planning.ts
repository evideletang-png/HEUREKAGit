/**
 * Planning Document Service
 * Retrieves PLU/PLUi zone data from the Géoportail de l'Urbanisme (GPU)
 * via the IGN apicarto API, then fetches the associated document details.
 * Falls back to realistic mock data if any API call fails.
 */

const IGN_APICARTO = "https://apicarto.ign.fr/api";
const GPU_BASE     = "https://www.geoportail-urbanisme.gouv.fr/api";
const TIMEOUT_MS   = 12000;

function signal() { return AbortSignal.timeout(TIMEOUT_MS); }

export interface ZoningInfo {
  zoneCode: string;
  zoningLabel: string;
  documentTitle: string;
  sourceUrl: string;
  rawText: string;
}

// ────────────────────────────────────────────────────────────────────────────
// GPU zone-urba — get the zone code and document ID for a point
// ────────────────────────────────────────────────────────────────────────────
async function fetchGpuZone(lat: number, lng: number): Promise<{
  libelle: string;
  libelong: string;
  gpu_doc_id: string;
} | null> {
  const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
  const url  = `${IGN_APICARTO}/gpu/zone-urba?geom=${encodeURIComponent(geom)}&format=geojson`;
  const res  = await fetch(url, { signal: signal() });
  if (!res.ok) throw new Error(`GPU zone-urba ${res.status}`);
  const data: any = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;
  return {
    libelle:    feature.properties.libelle    ?? "",
    libelong:   feature.properties.libelong   ?? "",
    gpu_doc_id: feature.properties.gpu_doc_id ?? "",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// GPU document details — fetch title, URL and try to get regulation text
// ────────────────────────────────────────────────────────────────────────────
async function fetchGpuDocDetails(docId: string): Promise<{
  title: string;
  regulationUrl: string;
} | null> {
  if (!docId) return null;
  try {
    const url = `${GPU_BASE}/document/${docId}/details`;
    const res = await fetch(url, { signal: signal() });
    if (!res.ok) return null;
    const data: any = await res.json();

    const title = data.name ?? data.title ?? data.docName ?? "Document PLU";
    let regulationUrl = data.url ?? "";

    const files: any[] = data.files ?? data.documents ?? [];
    if (files.length > 0) {
      if (typeof files[0] === "string") {
        // GPU returned an array of strings (filenames) and a writingMaterials map
        const reglementFile = files.find((f: string) => f.toLowerCase().includes("reglement") && f.toLowerCase().endsWith(".pdf"));
        if (reglementFile && data.writingMaterials && data.writingMaterials[reglementFile]) {
          regulationUrl = data.writingMaterials[reglementFile];
        }
      } else {
        // GPU returned an array of objects
        const reglement = files.find((f: any) =>
          (f.type ?? "").toLowerCase().includes("reglement") ||
          (f.name ?? "").toLowerCase().includes("reglement")
        );
        if (reglement?.url) regulationUrl = reglement.url;
      }
    }

    return { title, regulationUrl };
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public
// ────────────────────────────────────────────────────────────────────────────
export async function getZoningByCoords(lat: number, lng: number, commune?: string): Promise<ZoningInfo | null> {
  try {
    const zone = await fetchGpuZone(lat, lng);
    if (!zone) {
      console.warn("[planning] No GPU zone found for coordinates.");
      return null;
    }

    // Try to fetch document details (non-critical)
    const docDetails = zone.gpu_doc_id ? await fetchGpuDocDetails(zone.gpu_doc_id) : null;

    const zoneCode    = zone.libelle  || "U";
    const zoningLabel = zone.libelong || `Zone ${zoneCode}`;
    let docTitle    = docDetails?.title ?? "PLU – Règlement de zone";
    let sourceUrl   = docDetails?.regulationUrl
      || `https://www.geoportail-urbanisme.gouv.fr/document/${zone.gpu_doc_id}`;

    let rawText = getMockPLURulesText(zoneCode);

    // Attempt to download and parse the actual PLU document if it's a PDF
    if (!sourceUrl || !sourceUrl.toLowerCase().endsWith(".pdf")) {
      console.log(`[planning] GPU Regulation URL missing or not PDF. Searching Data.gouv.fr for ${zoneCode} in ${commune || "Nogent-sur-Marne"}...`);
      try {
        const { searchDatasets, findBestPluResource } = await import("./dataGouv.js");
        const searchQuery = `PLU ${commune || "Nogent-sur-Marne"} reglement`;
        const datasets = await searchDatasets(searchQuery, 2);
        if (datasets.length > 0) {
          const best = findBestPluResource(datasets[0]);
          if (best?.url) {
            console.log(`[planning] Found better PLU source on Data.gouv.fr: ${best.title}`);
            sourceUrl = best.url;
            docTitle = best.title;
          }
        }
      } catch (dgErr) {
        console.warn("[planning] Data.gouv.fr fallback failed:", (dgErr as Error).message);
      }
    }

    if (sourceUrl && sourceUrl.toLowerCase().endsWith(".pdf")) {
      try {
        console.log(`[planning] Fetching real PLU PDF from ${sourceUrl}`);
        const pdfRes = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const arrayBuffer = await pdfRes.arrayBuffer();
          const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
          const buffer = Buffer.from(arrayBuffer);
          const pdfData = await pdfParse(buffer);
          
          if (pdfData && pdfData.text && pdfData.text.length > 50) {
            console.log(`[planning] Successfully extracted ${pdfData.text.length} chars from real PLU PDF`);
            // Increase limit to 1M chars to capture full documents (approx 250k tokens)
            rawText = pdfData.text.slice(0, 1000000);
          }
        } else {
          console.warn(`[planning] PDF Fetch failed with status: ${pdfRes.status}`);
        }
      } catch (pdfErr) {
        console.warn("[planning] Failed to parse actual PLU PDF, using fallback mock.", (pdfErr as Error).message);
      }
    }

    return {
      zoneCode,
      zoningLabel,
      documentTitle: docTitle,
      sourceUrl,
      rawText,
    };
  } catch (err) {
    console.warn("[planning] GPU API error:", (err as Error).message);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Mock fallback
// ────────────────────────────────────────────────────────────────────────────
function getMockZoningData(): ZoningInfo {
  return {
    zoneCode: "UB",
    zoningLabel: "Zone urbaine mixte UB – Tissu résidentiel collectif et activités compatibles",
    documentTitle: "PLU – Règlement de zone UB (version approuvée 2023)",
    sourceUrl: "https://www.geoportail-urbanisme.gouv.fr",
    rawText: getMockPLURulesText("UB"),
  };
}

function getMockPLURulesText(zoneCode: string): string {
  return `
SECTION II - ZONE ${zoneCode}

Article ${zoneCode} 1 – Occupations et utilisations du sol interdites

Sont interdits :
- Les constructions à usage industriel
- Les entrepôts
- Les installations classées pour la protection de l'environnement soumises à autorisation
- Les habitations légères de loisirs et les résidences mobiles
- L'ouverture et l'exploitation de carrières et de mines
- Les dépôts de véhicules hors d'usage

Article ${zoneCode} 2 – Occupations et utilisations du sol soumises à des conditions particulières

Sont admis sous conditions :
- Les constructions à usage d'habitation collective à condition de respecter les règles du présent règlement
- Les commerces de proximité d'une surface de plancher inférieure à 300 m²
- Les équipements d'intérêt collectif
- Les installations classées soumises à déclaration compatibles avec l'habitat

Article ${zoneCode} 3 – Conditions de desserte des terrains par les voies

Tout terrain à construire doit être desservi par une voie publique ou privée ouverte à la circulation présentant des caractéristiques suffisantes. Les voies nouvelles doivent avoir une largeur minimale de 8 mètres. L'accès sur voie doit présenter une largeur minimale de 3,50 mètres.

Article ${zoneCode} 4 – Conditions de desserte par les réseaux

Toute construction doit être raccordée au réseau public d'eau potable, au réseau d'assainissement collectif, au réseau d'électricité. Les eaux pluviales doivent être gérées à la parcelle dans la mesure du possible.

Article ${zoneCode} 5 – Superficie minimale des terrains constructibles

Sans objet.

Article ${zoneCode} 6 – Implantation des constructions par rapport aux voies et emprises publiques

Les constructions doivent être implantées avec un recul minimum de 5 mètres par rapport à l'alignement des voies publiques. Cette règle peut être portée à 10 mètres pour les voies départementales.

Article ${zoneCode} 7 – Implantation des constructions par rapport aux limites séparatives

Les constructions doivent respecter un recul minimum de 3 mètres par rapport aux limites séparatives latérales et de fond de parcelle. En cas de construction en limite séparative, la hauteur de la façade jouxtant la limite ne peut excéder 3,50 mètres.

Article ${zoneCode} 8 – Implantation des constructions les unes par rapport aux autres sur une même propriété

La distance entre deux bâtiments non contigus sur une même unité foncière doit être au moins égale à la hauteur du bâtiment le plus élevé, sans pouvoir être inférieure à 4 mètres.

Article ${zoneCode} 9 – Emprise au sol

L'emprise au sol des constructions ne doit pas excéder 40% de la superficie du terrain.

Article ${zoneCode} 10 – Hauteur maximale des constructions

La hauteur maximale des constructions est fixée à 15 mètres à l'égout du toit, soit R+4+combles. Pour les constructions annexes, la hauteur est limitée à 3,50 mètres.

Article ${zoneCode} 11 – Aspect extérieur

Les constructions doivent s'intégrer harmonieusement dans l'environnement bâti existant. Les matériaux apparents en façade doivent être de bonne qualité. Les toitures-terrasses sont autorisées. Les couleurs vives et les revêtements brillants sont interdits en façade.

Article ${zoneCode} 12 – Stationnement

Il est exigé : 
- Pour les constructions à usage d'habitation : 1 place par logement de moins de 50 m², 2 places au-delà
- Pour les commerces : 1 place pour 40 m² de surface de vente
- Pour les bureaux : 1 place pour 40 m² de surface de plancher

Article ${zoneCode} 13 – Espaces libres et plantations

Les surfaces libres de toute construction doivent représenter au minimum 20% de la superficie du terrain. Ces espaces libres doivent être plantés à raison d'un arbre de haute tige pour 100 m² d'espace libre.

Article ${zoneCode} 14 – Possibilités maximales d'occupation du sol

Sans objet (le COS a été supprimé par la loi ALUR du 24 mars 2014).
`;
}
