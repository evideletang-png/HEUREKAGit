/**
 * Service d'interfaçage avec le Géoportail de l'Urbanisme (GPU)
 *
 * FLOW:
 *  1. GET https://apicarto.ign.fr/api/gpu/zone-urba?code_insee={insee}
 *     → GeoJSON features. Each feature has:
 *       - properties.partition  → e.g. "DU_37113"  (PLU partition key)
 *       - properties.urlfic     → direct URL to the plan graphique PDF for that zone
 *  2. Collect unique partitions + all urlfic URLs  (plan graphique files)
 *  3. For each partition, fetch ATOM feed → remaining documents (règlement, PADD, OAP…)
 *  4. Fallback: GPU REST /api/document?partition={p} → /files
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

const GPU_API       = "https://www.geoportail-urbanisme.gouv.fr/api";
const ATOM_BASE     = "https://www.geoportail-urbanisme.gouv.fr/atom/download-feed.xml";
const ZONE_URBA     = "https://apicarto.ign.fr/api/gpu/zone-urba";
const DATAGOUV_API  = "https://www.data.gouv.fr/api/1";

const HEADERS = {
  "Accept": "application/json, application/xml, text/xml, */*",
  "Accept-Language": "fr-FR,fr;q=0.9",
  "Referer": "https://www.geoportail-urbanisme.gouv.fr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// Cache keyed by synthetic document id
const filesCache = new Map<string, GPUFile[]>();

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any | null> {
  try {
    console.log(`[GPU] GET ${url}`);
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) { console.warn(`[GPU] ${res.status} ${res.statusText} — ${url}`); return null; }
    const text = await res.text();
    if (!text || text.startsWith("<!") || text.startsWith("<html")) {
      console.warn(`[GPU] HTML/empty response from ${url}`);
      return null;
    }
    return JSON.parse(text);
  } catch (e: any) {
    console.error(`[GPU] fetchJson failed ${url}: ${e.message}`);
    return null;
  }
}

async function fetchXml(url: string): Promise<string | null> {
  try {
    console.log(`[GPU] GET (xml) ${url}`);
    const res = await fetch(url, {
      headers: { ...HEADERS, Accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) { console.warn(`[GPU] ${res.status} ${res.statusText} — ${url}`); return null; }
    const text = await res.text();
    if (!text || text.startsWith("<html") || text.startsWith("<!DOCTYPE")) {
      console.warn(`[GPU] HTML/empty XML response from ${url}`);
      return null;
    }
    return text;
  } catch (e: any) {
    console.error(`[GPU] fetchXml failed ${url}: ${e.message}`);
    return null;
  }
}

// ─── ATOM feed parser ──────────────────────────────────────────────────────────

function parseAtomEntries(xml: string): GPUFile[] {
  const files: GPUFile[] = [];
  const entryRe = /<(?:\w+:)?entry[^>]*>([\s\S]*?)<\/(?:\w+:)?entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/<(?:\w+:)?title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:\w+:)?title>/i);
    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, "&").trim() : "";
    const linkMatch = block.match(/<(?:\w+:)?link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
    const href = linkMatch ? linkMatch[1].trim() : "";
    if (!href) continue;
    const name = decodeURIComponent(href.split("?")[0].split("/").pop() || title || href);
    files.push({ name, title: title || name, url: href });
  }
  return files;
}

// ─── Step 1: zone-urba → partitions + urlfic files ────────────────────────────

interface ZoneUrbaResult {
  partitions: string[];
  urlficFiles: GPUFile[];
}

async function queryZoneUrba(params: string): Promise<ZoneUrbaResult> {
  const url = `${ZONE_URBA}?${params}`;
  const geoJson = await fetchJson(url);
  if (!geoJson) return { partitions: [], urlficFiles: [] };

  const features: any[] = geoJson?.features || [];
  console.log(`[GPU] zone-urba → ${features.length} features`);

  const partitionSet = new Set<string>();
  const urlficFiles: GPUFile[] = [];
  const seenUrls = new Set<string>();

  for (const f of features) {
    const props = f?.properties || {};
    const partition: string = props.partition || props.gpu_doc_id || "";
    if (partition) partitionSet.add(partition);

    // urlfic = direct URL to the graphical plan file for this zone
    const urlfic: string = props.urlfic || props.url_fic || "";
    if (urlfic && !seenUrls.has(urlfic)) {
      seenUrls.add(urlfic);
      const zoneName = props.libelle || props.lib_zone || props.typezone || "zone";
      const fileName = decodeURIComponent(urlfic.split("?")[0].split("/").pop() || urlfic);
      urlficFiles.push({ name: fileName, title: `Plan graphique — ${zoneName}`, url: urlfic });
    }
  }

  const partitions = [...partitionSet];
  console.log(`[GPU] partitions: ${partitions.join(", ") || "none"} | urlfic files: ${urlficFiles.length}`);
  return { partitions, urlficFiles };
}

// ─── Step 2a: ATOM feed ────────────────────────────────────────────────────────

async function fetchAtomFiles(partition: string): Promise<GPUFile[]> {
  const xml = await fetchXml(`${ATOM_BASE}?partition=${partition}`);
  if (!xml) return [];
  const files = parseAtomEntries(xml);
  console.log(`[GPU] ATOM(${partition}) → ${files.length} files`);
  return files;
}

// ─── Step 2b: GPU REST fallback ───────────────────────────────────────────────

async function fetchRestFiles(partition: string): Promise<GPUFile[]> {
  const data = await fetchJson(`${GPU_API}/document?partition=${partition}`);
  if (!data) return [];

  const docs: any[] = Array.isArray(data) ? data
    : Array.isArray(data?.content) ? data.content
    : Array.isArray(data?.items) ? data.items : [];

  const allFiles: GPUFile[] = [];
  for (const doc of docs) {
    const docId = doc.id || doc.gpu_doc_id;
    if (!docId) continue;
    const filesData = await fetchJson(`${GPU_API}/document/${docId}/files`);
    if (!filesData) continue;
    const files: any[] = Array.isArray(filesData) ? filesData : filesData?.content || [];
    for (const f of files) {
      allFiles.push({
        name: f.name, title: f.title || f.name, path: f.path || "",
        url: `${GPU_API}/document/${docId}/files/${encodeURIComponent(f.name)}`,
      });
    }
  }
  console.log(`[GPU] REST(${partition}) → ${allFiles.length} files`);
  return allFiles;
}

// ─── Build GPUDocument from partition + files ─────────────────────────────────

function makeDocument(partition: string, files: GPUFile[]): GPUDocument {
  const id = `gpu-${partition}`;
  filesCache.set(id, files);
  return {
    id, name: `PLU — ${partition}`, type: "PLU",
    status: "production", legalStatus: "opposable",
    originalName: `Documents d'urbanisme — ${partition}`,
  };
}

// ─── Resolve files for a set of partitions + seed urlfic ──────────────────────

async function resolveDocuments(partitions: string[], seedFiles: GPUFile[]): Promise<GPUDocument[]> {
  // If zone-urba returned no partitions, guess the default one (tried later in ATOM)
  const toSearch = partitions.length > 0 ? partitions : [];
  const docs: GPUDocument[] = [];

  // Group seed urlfic files by partition (or put them all in the first partition)
  const seedByPartition = new Map<string, GPUFile[]>();
  if (seedFiles.length > 0 && toSearch.length > 0) {
    seedByPartition.set(toSearch[0], seedFiles);
  }

  for (const partition of toSearch) {
    const seed = seedByPartition.get(partition) || [];
    let files = await fetchAtomFiles(partition);
    if (files.length === 0) files = await fetchRestFiles(partition);
    // Merge urlfic files (avoid duplicates by URL)
    const allUrls = new Set(files.map(f => f.url));
    for (const s of seed) { if (!allUrls.has(s.url)) files.push(s); }
    if (files.length > 0) docs.push(makeDocument(partition, files));
  }

  // If partitions gave nothing but we have urlfic seed files, expose them
  if (docs.length === 0 && seedFiles.length > 0) {
    const syntheticPartition = "urlfic-direct";
    docs.push(makeDocument(syntheticPartition, seedFiles));
  }

  return docs;
}

// ─── data.gouv.fr GPU dataset ─────────────────────────────────────────────────
// The GPU (Géoportail de l'Urbanisme) publishes all PLU documents on data.gouv.fr
// under the organization "geoportail-urbanisme". Each commune's partition is a
// separate dataset resource. We search by INSEE code in the dataset title/description.

async function fetchDataGouvFiles(inseeCode: string): Promise<GPUFile[]> {
  // Search for GPU datasets matching this INSEE code
  const searchUrl = `${DATAGOUV_API}/datasets/?q=${inseeCode}&organization=geoportail-urbanisme&page_size=20`;
  const data = await fetchJson(searchUrl);
  if (!data) {
    // Fallback: broader search without org filter
    const data2 = await fetchJson(`${DATAGOUV_API}/datasets/?q=PLU+${inseeCode}&tag=plu&page_size=10`);
    if (!data2) return [];
    return extractDataGouvFiles(data2, inseeCode);
  }
  const files = extractDataGouvFiles(data, inseeCode);
  if (files.length > 0) return files;

  // Second try: search by partition key DU_{inseeCode}
  const partitionSearch = await fetchJson(`${DATAGOUV_API}/datasets/?q=DU_${inseeCode}&page_size=10`);
  return partitionSearch ? extractDataGouvFiles(partitionSearch, inseeCode) : [];
}

function extractDataGouvFiles(data: any, inseeCode: string): GPUFile[] {
  const datasets: any[] = data?.data || data?.results || [];
  const files: GPUFile[] = [];
  const PDF_EXTS = [".pdf", ".zip", ".xml", ".json"];

  for (const ds of datasets) {
    const resources: any[] = ds?.resources || [];
    for (const r of resources) {
      const url: string = r?.url || r?.latest || "";
      if (!url) continue;
      const lower = url.toLowerCase();
      if (!PDF_EXTS.some(ext => lower.includes(ext))) continue;
      const title: string = r?.title || r?.description || ds?.title || url;
      const name = decodeURIComponent(url.split("?")[0].split("/").pop() || title);
      files.push({ name, title, url });
    }
  }

  console.log(`[GPU] data.gouv.fr → ${files.length} files for INSEE ${inseeCode}`);
  return files;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class GPUProviderService {
  static async getDocumentsByInsee(inseeCode: string): Promise<GPUDocument[]> {
    const { partitions, urlficFiles } = await queryZoneUrba(`code_insee=${inseeCode}`);

    // Also try the default DU_ partition directly if Apicarto returned nothing
    const allPartitions = partitions.length > 0 ? partitions : [`DU_${inseeCode}`];
    let docs = await resolveDocuments(allPartitions, urlficFiles);

    // Fallback: data.gouv.fr open data API
    if (docs.length === 0) {
      console.log(`[GPU] Trying data.gouv.fr for INSEE ${inseeCode}`);
      const files = await fetchDataGouvFiles(inseeCode);
      if (files.length > 0) {
        const id = `datagouv-${inseeCode}`;
        filesCache.set(id, files);
        docs = [{
          id, name: `PLU — ${inseeCode} (data.gouv.fr)`, type: "PLU",
          status: "production", legalStatus: "opposable",
          originalName: `Documents d'urbanisme — ${inseeCode}`,
        }];
      }
    }

    if (docs.length === 0) console.warn(`[GPU] No documents found for INSEE ${inseeCode}`);
    return docs;
  }

  static async getDocumentsByCoords(lon: number, lat: number): Promise<GPUDocument[]> {
    const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
    const { partitions, urlficFiles } = await queryZoneUrba(`geom=${encodeURIComponent(geom)}`);
    return resolveDocuments(partitions, urlficFiles);
  }

  static async getFilesByDocumentId(documentId: string): Promise<GPUFile[]> {
    const cached = filesCache.get(documentId);
    if (cached) { console.log(`[GPU] ${cached.length} cached files for ${documentId}`); return cached; }
    // Direct REST lookup as last resort
    const data = await fetchJson(`${GPU_API}/document/${documentId}/files`);
    if (!data) return [];
    const files: any[] = Array.isArray(data) ? data : data?.content || [];
    return files.map((f: any) => ({
      name: f.name, title: f.title || f.name, path: f.path || "",
      url: `${GPU_API}/document/${documentId}/files/${encodeURIComponent(f.name)}`,
    }));
  }

  static filterCriticalFiles(files: GPUFile[]): GPUFile[] { return files; }

  static async diagnose(inseeCode: string): Promise<Record<string, any>> {
    const { partitions, urlficFiles } = await queryZoneUrba(`code_insee=${inseeCode}`);
    const result: Record<string, any> = {
      zone_urba_partitions: partitions,
      zone_urba_urlfic_count: urlficFiles.length,
      zone_urba_urlfic_sample: urlficFiles.slice(0, 3).map(f => f.url),
    };
    const toCheck = partitions.length > 0 ? partitions : [`DU_${inseeCode}`];
    for (const p of toCheck) {
      const xml = await fetchXml(`${ATOM_BASE}?partition=${p}`);
      result[`atom_${p}`] = xml ? `${parseAtomEntries(xml).length} files` : "no response";
    }
    const dgFiles = await fetchDataGouvFiles(inseeCode);
    result["data_gouv_files"] = dgFiles.length;
    result["data_gouv_sample"] = dgFiles.slice(0, 3).map(f => f.url);
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
