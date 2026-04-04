/**
 * Service d'interfaçage avec le Géoportail de l'Urbanisme (GPU)
 *
 * API base: https://www.geoportail-urbanisme.gouv.fr/api
 *
 * FLOW:
 *  1. GET apicarto.ign.fr/api/gpu/zone-urba?code_insee={insee}
 *     → features[].properties.gpu_doc_id  (32-char hex document ID)
 *     → features[].properties.nomfic       (reference filename)
 *
 *  2. GET /document/{gpu_doc_id}/details
 *     → writingMaterials: Record<filename, url>   ← OBJECT not array
 *     → archiveUrl: string                         (ZIP of all files)
 *
 *  3. Iterate Object.entries(writingMaterials) to get all PDF URLs.
 *
 * FALLBACK (if zone-urba returns no features):
 *  GET /document?documentFamily=DU&status=document.production&legalStatus=APPROVED&limit=1000
 *  → filter by doc.grid.name === inseeCode
 *  → then step 2 as above
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

const filesCache = new Map<string, GPUFile[]>();

// ─── HTTP ──────────────────────────────────────────────────────────────────────

async function httpGet(url: string): Promise<any | null> {
  try {
    console.log(`[GPU] GET ${url}`);
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) { console.warn(`[GPU] HTTP ${res.status} — ${url}`); return null; }
    const text = await res.text();
    if (!text || text.trimStart().startsWith("<!") || text.trimStart().startsWith("<html")) {
      console.warn(`[GPU] HTML response — ${url}`); return null;
    }
    return JSON.parse(text);
  } catch (e: any) {
    console.error(`[GPU] fetch failed ${url}: ${e.message}`); return null;
  }
}

// ─── Step 1: zone-urba → gpu_doc_id + nomfic ──────────────────────────────────

interface ZoneUrbaFeature { gpu_doc_id: string; nomfic: string; }

async function getZoneUrbaFeatures(params: string): Promise<ZoneUrbaFeature[]> {
  const geoJson = await httpGet(`${ZONE_URBA}?${params}`);
  if (!geoJson) return [];
  const features: any[] = geoJson?.features || [];
  console.log(`[GPU] zone-urba → ${features.length} features`);

  const seen = new Set<string>();
  const results: ZoneUrbaFeature[] = [];
  for (const f of features) {
    const props = f?.properties || {};
    const gpu_doc_id = (props.gpu_doc_id || "").trim();
    const nomfic     = (props.nomfic     || "").trim();
    if (!gpu_doc_id || seen.has(gpu_doc_id)) continue;
    seen.add(gpu_doc_id);
    results.push({ gpu_doc_id, nomfic });
  }
  console.log(`[GPU] unique gpu_doc_ids: ${results.map(r => r.gpu_doc_id).join(", ") || "none"}`);
  return results;
}

// ─── Step 2: /document/{id}/details → writingMaterials (object) ───────────────

async function getFilesFromDetails(gpu_doc_id: string, nomfic: string): Promise<GPUFile[]> {
  const data = await httpGet(`${GPU_API}/document/${gpu_doc_id}/details`);
  if (!data) return [];

  // writingMaterials is Record<filename, url> — NOT an array
  const wm = data?.writingMaterials;
  if (!wm || typeof wm !== "object" || Array.isArray(wm)) {
    console.warn(`[GPU] writingMaterials missing or wrong type for ${gpu_doc_id}. Keys: ${Object.keys(data).join(", ")}`);
    // Try archiveUrl as last resort
    if (data?.archiveUrl) {
      const name = data.originalName || gpu_doc_id;
      return [{ name: `${name}.zip`, title: "Archive ZIP", url: data.archiveUrl }];
    }
    return [];
  }

  const entries = Object.entries(wm) as [string, string][];
  console.log(`[GPU] writingMaterials: ${entries.length} files for ${gpu_doc_id}`);

  return entries
    .filter(([filename]) => {
      const lower = filename.toLowerCase();
      return !lower.includes("metadata") && !lower.endsWith(".xml");
    })
    .map(([filename, fileUrl]) => {
      let title = filename;
      const lower = filename.toLowerCase();
      if (lower.includes("reglement") && lower.includes("ecrit")) title = "Règlement écrit";
      else if (lower.includes("reglement_graphique") || lower.includes("plan_graphique")) title = "Plan graphique";
      else if (lower.includes("padd"))    title = "PADD";
      else if (lower.includes("oap"))     title = "OAP";
      else if (lower.includes("rapport")) title = "Rapport de présentation";
      else if (lower.includes("annexe"))  title = "Annexes";
      else if (nomfic && filename.includes(nomfic)) title = `Règlement — ${nomfic}`;
      return { name: filename, title, url: fileUrl };
    });
}

// ─── Fallback: REST list search by INSEE ──────────────────────────────────────

async function getDocsFromRestSearch(inseeCode: string): Promise<GPUDocument[]> {
  // Search for approved PLU documents, filter client-side by grid.name === inseeCode
  const url = `${GPU_API}/document?documentFamily=DU&status=document.production&legalStatus=APPROVED&limit=1000`;
  const data = await httpGet(url);
  if (!data) return [];

  const list: any[] = Array.isArray(data) ? data
    : Array.isArray(data?.content) ? data.content
    : [];

  const matches = list.filter((d: any) => d?.grid?.name === inseeCode);
  console.log(`[GPU] REST search: ${list.length} total docs, ${matches.length} match INSEE ${inseeCode}`);

  const docs: GPUDocument[] = [];
  for (const item of matches) {
    const docId: string = item?.id || "";
    if (!docId) continue;
    const files = await getFilesFromDetails(docId, "");
    if (files.length > 0) {
      const id = `gpu-${docId}`;
      filesCache.set(id, files);
      docs.push({
        id,
        name: item.originalName || item.name || docId,
        type: item.type || "PLU",
        status: item.status || "production",
        legalStatus: item.legalStatus || "APPROVED",
        publicationDate: item.publicationDate,
        originalName: item.originalName || docId,
      });
    }
  }
  return docs;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class GPUProviderService {
  static async getDocumentsByInsee(inseeCode: string): Promise<GPUDocument[]> {
    // Primary: zone-urba → gpu_doc_id → /details → writingMaterials
    const features = await getZoneUrbaFeatures(`code_insee=${inseeCode}`);
    if (features.length > 0) {
      const docs: GPUDocument[] = [];
      for (const { gpu_doc_id, nomfic } of features) {
        const files = await getFilesFromDetails(gpu_doc_id, nomfic);
        if (files.length > 0) {
          const id = `gpu-${gpu_doc_id}`;
          filesCache.set(id, files);
          docs.push({ id, name: `PLU — ${gpu_doc_id}`, type: "PLU", status: "production", legalStatus: "APPROVED", originalName: gpu_doc_id });
        }
      }
      if (docs.length > 0) return docs;
    }

    // Fallback: GPU REST list search
    console.log(`[GPU] zone-urba gave no usable docs — falling back to REST search`);
    return getDocsFromRestSearch(inseeCode);
  }

  static async getDocumentsByCoords(lon: number, lat: number): Promise<GPUDocument[]> {
    const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
    const features = await getZoneUrbaFeatures(`geom=${encodeURIComponent(geom)}`);
    const docs: GPUDocument[] = [];
    for (const { gpu_doc_id, nomfic } of features) {
      const files = await getFilesFromDetails(gpu_doc_id, nomfic);
      if (files.length > 0) {
        const id = `gpu-${gpu_doc_id}`;
        filesCache.set(id, files);
        docs.push({ id, name: `PLU — ${gpu_doc_id}`, type: "PLU", status: "production", legalStatus: "APPROVED", originalName: gpu_doc_id });
      }
    }
    return docs;
  }

  static async getFilesByDocumentId(documentId: string): Promise<GPUFile[]> {
    const cached = filesCache.get(documentId);
    if (cached) { console.log(`[GPU] ${cached.length} cached files for ${documentId}`); return cached; }
    const rawId = documentId.replace(/^gpu-/, "");
    return getFilesFromDetails(rawId, "");
  }

  static filterCriticalFiles(files: GPUFile[]): GPUFile[] { return files; }

  static async diagnose(inseeCode: string): Promise<Record<string, any>> {
    const features = await getZoneUrbaFeatures(`code_insee=${inseeCode}`);
    const result: Record<string, any> = {
      zone_urba_features: features.length,
      gpu_doc_ids: features.map(f => f.gpu_doc_id),
      nomfic_values: features.map(f => f.nomfic),
    };
    for (const { gpu_doc_id } of features.slice(0, 2)) {
      const data = await httpGet(`${GPU_API}/document/${gpu_doc_id}/details`);
      const wm = data?.writingMaterials;
      result[`details_${gpu_doc_id}`] = data ? {
        keys: Object.keys(data),
        writingMaterials_type: Array.isArray(wm) ? "array" : typeof wm,
        writingMaterials_keys: wm && typeof wm === "object" ? Object.keys(wm).slice(0, 5) : wm,
        archiveUrl: data?.archiveUrl ?? null,
      } : "no response";
    }
    if (features.length === 0) {
      // Try REST search to see if it finds anything
      const url = `${GPU_API}/document?documentFamily=DU&status=document.production&legalStatus=APPROVED&limit=1000`;
      const data = await httpGet(url);
      const list: any[] = Array.isArray(data) ? data : data?.content || [];
      const matches = list.filter((d: any) => d?.grid?.name === inseeCode);
      result["rest_search_total"] = list.length;
      result["rest_search_matches"] = matches.length;
      result["rest_search_sample"] = matches.slice(0, 2).map((d: any) => ({ id: d.id, name: d.name, type: d.type }));
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
