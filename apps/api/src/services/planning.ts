/**
 * Planning Document Service
 * Retrieves PLU/PLUi zone data from the Géoportail de l'Urbanisme (GPU)
 * via the IGN apicarto API, then fetches the associated document details.
 * If the regulation text cannot be fetched, the zone metadata is returned
 * without inventing regulatory text.
 */

const IGN_APICARTO = "https://apicarto.ign.fr/api";
const GPU_BASE     = "https://www.geoportail-urbanisme.gouv.fr/api";
const TIMEOUT_MS   = 12000;

function signal() { return AbortSignal.timeout(TIMEOUT_MS); }

// Document structure keywords that are never valid zone/sub-sector identifiers
const DOCUMENT_KEYWORDS = ["ARTICLE", "SECTION", "CHAPITRE", "ANNEXE", "TITRE", "PARAGRAPHE", "ALINEA", "DISPOSITIONS"];

/**
 * Validates that a zone label is not a document structural keyword.
 * Fixes the "ARTICLE" bug where zone extraction mistakenly captured document terms.
 */
function sanitizeZoneLabel(libelle: string, libelong: string): { libelle: string; libelong: string; valid: boolean } {
  if (!libelle || libelle.trim().length === 0) {
    return { libelle: "", libelong: "", valid: false };
  }

  const upper = libelle.trim().toUpperCase();
  // Check if label exactly matches a keyword or starts with one followed by space/number/underscore
  const isInvalid = DOCUMENT_KEYWORDS.some(kw =>
    upper === kw || upper.startsWith(kw + " ") || upper.startsWith(kw + "_") || upper.startsWith(kw + "-")
  );

  if (isInvalid) {
    console.warn(`[planning] Invalid zone label "${libelle}" — looks like a document keyword. Discarding.`);
    return { libelle: "", libelong: "", valid: false };
  }

  return { libelle, libelong, valid: true };
}

export interface ZoningInfo {
  zoneCode: string;
  zoningLabel: string;
  documentTitle: string;
  sourceUrl: string;
  rawText: string;
  gpuConfirmed: boolean;  // True if zone came from GPU API (high confidence)
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

    // Sanitize zone label — reject document keywords like "ARTICLE"
    const sanitized = sanitizeZoneLabel(zone.libelle || "", zone.libelong || "");
    if (!sanitized.valid || !sanitized.libelle) {
      console.warn("[planning] Zone label failed validation — no valid zone extracted from GPU.");
      return null;
    }

    // Try to fetch document details (non-critical)
    const docDetails = zone.gpu_doc_id ? await fetchGpuDocDetails(zone.gpu_doc_id) : null;

    const zoneCode    = sanitized.libelle || "U";
    const zoningLabel = sanitized.libelong || `Zone ${zoneCode}`;
    let docTitle    = docDetails?.title ?? "PLU – Règlement de zone";
    let sourceUrl   = docDetails?.regulationUrl
      || `https://www.geoportail-urbanisme.gouv.fr/document/${zone.gpu_doc_id}`;

    let rawText = "";

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
        console.warn("[planning] Failed to parse actual PLU PDF.", (pdfErr as Error).message);
      }
    }

    return {
      zoneCode,
      zoningLabel,
      documentTitle: docTitle,
      sourceUrl,
      rawText,
      gpuConfirmed: true,  // Zone came directly from GPU API — high confidence
    };
  } catch (err) {
    console.warn("[planning] GPU API error:", (err as Error).message);
    return null;
  }
}
