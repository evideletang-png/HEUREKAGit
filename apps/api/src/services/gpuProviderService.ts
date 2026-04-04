/**
 * Service d'interfaçage avec le Géoportail de l'Urbanisme (GPU)
 *
 * FLOW (exact replication of the Make.com chain):
 *
 *  Step 16: GET apicarto.ign.fr/api/gpu/zone-urba?code_insee={insee}
 *           → features[].properties.gpu_doc_id   (document ID)
 *           → features[].properties.nomfic        (reference filename for the règlement)
 *
 *  Step 20: GET geoportail-urbanisme.gouv.fr/api/document/{gpu_doc_id}/details
 *           → response.writingMaterials[]          (array of document URLs — all PLU docs)
 *
 *  Step 47: (we skip the nomfic filter — we want ALL writingMaterials, not just the règlement)
 *           → download & index every URL
 */

export interface GPUDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  legalStatus: string;
  publicationDate?: string;
  originalName: string;
  files?: GPUFile[];
}

export interface GPUFile {
  name: string;
  title: string;
  path?: string;
  url: string;
}

const GPU_API   = "https://www.geoportail-urbanisme.gouv.fr/api";
const ZONE_URBA = "https://apicarto.ign.fr/api/gpu/zone-urba";

const FETCH_HEADERS = {
  "Accept": "application/json, */*",
  "Accept-Language": "fr-FR,fr;q=0.9",
  "Referer": "https://www.geoportail-urbanisme.gouv.fr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// Cache files keyed by synthetic document id
const filesCache = new Map<string, GPUFile[]>();

// ─── HTTP helper ───────────────────────────────────────────────────────────────

async function httpGet(url: string): Promise<any | null> {
  try {
    console.log(`[GPU] GET ${url}`);
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[GPU] HTTP ${res.status} — ${url}`);
      return null;
    }
    const text = await res.text();
    if (!text || text.trimStart().startsWith("<!") || text.trimStart().startsWith("<html")) {
      console.warn(`[GPU] HTML/empty response — ${url}`);
      return null;
    }
    return JSON.parse(text);
  } catch (e: any) {
    console.error(`[GPU] fetch failed ${url}: ${e.message}`);
    return null;
  }
}

// ─── Step 16: zone-urba → gpu_doc_id + nomfic ─────────────────────────────────

interface ZoneUrbaFeature {
  gpu_doc_id: string;
  nomfic: string;
}

async function getZoneUrbaFeatures(params: string): Promise<ZoneUrbaFeature[]> {
  const url = `${ZONE_URBA}?${params}`;
  const geoJson = await httpGet(url);
  if (!geoJson) return [];

  const features: any[] = geoJson?.features || [];
  console.log(`[GPU] zone-urba → ${features.length} features`);

  // Deduplicate by gpu_doc_id
  const seen = new Set<string>();
  const results: ZoneUrbaFeature[] = [];

  for (const f of features) {
    const props = f?.properties || {};
    const gpu_doc_id: string = (props.gpu_doc_id || "").trim();
    const nomfic: string = (props.nomfic || "").trim();
    if (!gpu_doc_id || seen.has(gpu_doc_id)) continue;
    seen.add(gpu_doc_id);
    results.push({ gpu_doc_id, nomfic });
  }

  console.log(`[GPU] unique gpu_doc_ids: ${results.map(r => r.gpu_doc_id).join(", ") || "none"}`);
  return results;
}

// ─── Step 20: /api/document/{gpu_doc_id}/details → writingMaterials ───────────

async function getWritingMaterials(gpu_doc_id: string, nomfic: string): Promise<GPUFile[]> {
  const url = `${GPU_API}/document/${gpu_doc_id}/details`;
  const data = await httpGet(url);
  if (!data) return [];

  // writingMaterials is an array of URL strings (or objects)
  const raw: any[] = Array.isArray(data?.writingMaterials) ? data.writingMaterials : [];

  if (raw.length === 0) {
    console.warn(`[GPU] No writingMaterials for ${gpu_doc_id}. Keys: ${Object.keys(data).join(", ")}`);
    return [];
  }

  console.log(`[GPU] writingMaterials(${gpu_doc_id}) → ${raw.length} items`);

  return raw.map((item: any) => {
    // item may be a string URL or an object with a url/href field
    const fileUrl: string = typeof item === "string" ? item : (item?.url || item?.href || item?.link || "");
    if (!fileUrl) return null;

    const pathPart = fileUrl.split("?")[0];
    const fileName = decodeURIComponent(pathPart.split("/").pop() || fileUrl);

    // Derive a human-readable title from the filename
    let title = fileName;
    const lower = fileName.toLowerCase();
    if (lower.includes("reglement") && lower.includes("ecrit")) title = "Règlement écrit";
    else if (lower.includes("reglement_graphique") || lower.includes("plan_graphique")) title = "Plan graphique";
    else if (lower.includes("padd")) title = "PADD";
    else if (lower.includes("oap")) title = "OAP";
    else if (lower.includes("rapport")) title = "Rapport de présentation";
    else if (nomfic && fileName.includes(nomfic)) title = `Règlement — ${nomfic}`;

    return { name: fileName, title, url: fileUrl } as GPUFile;
  }).filter(Boolean) as GPUFile[];
}

// ─── Build GPUDocument from gpu_doc_id + files ────────────────────────────────

function makeDocument(gpu_doc_id: string, files: GPUFile[]): GPUDocument {
  const id = `gpu-${gpu_doc_id}`;
  filesCache.set(id, files);
  return {
    id,
    name: `PLU — ${gpu_doc_id}`,
    type: "PLU",
    status: "production",
    legalStatus: "opposable",
    originalName: `Documents d'urbanisme — ${gpu_doc_id}`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class GPUProviderService {
  static async getDocumentsByInsee(inseeCode: string): Promise<GPUDocument[]> {
    const features = await getZoneUrbaFeatures(`code_insee=${inseeCode}`);
    return GPUProviderService._buildDocs(features);
  }

  static async getDocumentsByCoords(lon: number, lat: number): Promise<GPUDocument[]> {
    const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
    const features = await getZoneUrbaFeatures(`geom=${encodeURIComponent(geom)}`);
    return GPUProviderService._buildDocs(features);
  }

  private static async _buildDocs(features: ZoneUrbaFeature[]): Promise<GPUDocument[]> {
    if (features.length === 0) return [];
    const docs: GPUDocument[] = [];
    for (const { gpu_doc_id, nomfic } of features) {
      const files = await getWritingMaterials(gpu_doc_id, nomfic);
      if (files.length > 0) docs.push(makeDocument(gpu_doc_id, files));
    }
    return docs;
  }

  static async getFilesByDocumentId(documentId: string): Promise<GPUFile[]> {
    const cached = filesCache.get(documentId);
    if (cached) {
      console.log(`[GPU] ${cached.length} cached files for ${documentId}`);
      return cached;
    }
    // documentId format is "gpu-{gpu_doc_id}" — strip prefix and re-fetch
    const rawId = documentId.replace(/^gpu-/, "");
    const files = await getWritingMaterials(rawId, "");
    if (files.length > 0) filesCache.set(documentId, files);
    return files;
  }

  static filterCriticalFiles(files: GPUFile[]): GPUFile[] {
    return files;
  }

  static async diagnose(inseeCode: string): Promise<Record<string, any>> {
    const features = await getZoneUrbaFeatures(`code_insee=${inseeCode}`);
    const result: Record<string, any> = {
      zone_urba_features: features.length,
      gpu_doc_ids: features.map(f => f.gpu_doc_id),
      nomfic_values: features.map(f => f.nomfic),
    };
    for (const { gpu_doc_id } of features.slice(0, 3)) {
      const url = `${GPU_API}/document/${gpu_doc_id}/details`;
      const data = await httpGet(url);
      result[`details_${gpu_doc_id}`] = data
        ? { keys: Object.keys(data), writingMaterials_count: data?.writingMaterials?.length ?? 0, sample: data?.writingMaterials?.slice(0, 2) }
        : "no response";
    }
    return result;
  }

  static async generateExplanatoryNote(fileName: string, title?: string): Promise<string> {
    const name = fileName.toLowerCase();
    const t = (title || "").toLowerCase();
    if (name.includes("reglement") && (name.includes("ecrit") || t.includes("écrit")))
      return "Texte officiel détaillant les règles de construction, de gabarit et d'implantation par zone.";
    if (name.includes("reglement_graphique") || t.includes("graphique"))
      return "Plan graphique cartographiant les limites des zones (U, AU, N, A) de la commune.";
    if (name.includes("padd"))
      return "Projet d'Aménagement et de Développement Durables : orientations stratégiques communales.";
    if (name.includes("oap") || name.includes("orientation"))
      return "Orientation d'Aménagement et de Programmation définissant les principes sur des secteurs spécifiques.";
    if (name.includes("rapport"))
      return "Rapport de présentation justifiant les choix retenus pour le PLU.";
    if (name.includes("ppri") || name.includes("risques"))
      return "Servitude d'utilité publique relative aux risques naturels.";
    return "Document réglementaire d'urbanisme complétant la base de connaissances communale.";
  }
}
