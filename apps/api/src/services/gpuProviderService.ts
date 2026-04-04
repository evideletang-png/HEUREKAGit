import { execSync } from "child_process";

/**
 * Service d'interfaçage avec le Géoportail de l'Urbanisme (GPU)
 *
 * FLOW:
 *  1. GET https://apicarto.ign.fr/api/gpu/zone-urba?code_insee={insee}
 *     → GeoJSON features, each with properties.partition (e.g. "DU_37112")
 *  2. Deduplicate partitions
 *  3. For each partition:
 *     a. ATOM feed: https://www.geoportail-urbanisme.gouv.fr/atom/download-feed.xml?partition={partition}
 *        → direct PDF download links, no WAF issues
 *     b. Fallback: GPU REST /api/document?partition={partition} → document IDs → /files
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

export class GPUProviderService {
  private static GPU_API   = "https://www.geoportail-urbanisme.gouv.fr/api";
  private static ATOM_BASE = "https://www.geoportail-urbanisme.gouv.fr/atom/download-feed.xml";
  private static ZONE_URBA = "https://apicarto.ign.fr/api/gpu/zone-urba";

  // Cache files keyed by partition so getFilesByDocumentId() works with synthetic IDs
  private static filesCache: Map<string, GPUFile[]> = new Map();

  // ─── HTTP helper ────────────────────────────────────────────────────────────

  private static curl(url: string, acceptXml = false): string | null {
    try {
      const accept = acceptXml ? "application/xml,text/xml,*/*" : "application/json";
      const command = [
        "curl", "-s", "-L", "-k", "--max-time", "30",
        "-H", `"Accept: ${accept}"`,
        "-H", '"Accept-Language: fr-FR,fr;q=0.9"',
        "-H", '"Referer: https://www.geoportail-urbanisme.gouv.fr/"',
        "-A", '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
        `"${url}"`,
      ].join(" ");
      const stdout = execSync(command, { maxBuffer: 10 * 1024 * 1024 }).toString().trim();
      if (!stdout) { console.warn(`[GPU] Empty response: ${url}`); return null; }
      return stdout;
    } catch (e: any) {
      console.error(`[GPU] curl failed for ${url}: ${e.message}`);
      return null;
    }
  }

  // ─── Step 1: Apicarto zone-urba → partitions ───────────────────────────────

  private static getPartitionsByInsee(inseeCode: string): string[] {
    const url = `${GPUProviderService.ZONE_URBA}?code_insee=${inseeCode}`;
    console.log(`[GPU] zone-urba: ${url}`);
    const raw = GPUProviderService.curl(url, false);
    if (!raw || raw.startsWith("<!") || raw.startsWith("<html")) return [];
    try {
      const geoJson = JSON.parse(raw);
      const features: any[] = geoJson?.features || [];
      const partitions = [
        ...new Set(
          features
            .map((f: any) => f?.properties?.partition || f?.properties?.gpu_doc_id)
            .filter(Boolean) as string[]
        ),
      ];
      console.log(`[GPU] zone-urba → ${features.length} features, ${partitions.length} partitions: ${partitions.join(", ")}`);
      return partitions;
    } catch {
      console.warn(`[GPU] zone-urba non-JSON: ${raw.slice(0, 100)}`);
      return [];
    }
  }

  private static getPartitionsByCoords(lon: number, lat: number): string[] {
    const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
    const url = `${GPUProviderService.ZONE_URBA}?geom=${encodeURIComponent(geom)}`;
    console.log(`[GPU] zone-urba by coords: ${url}`);
    const raw = GPUProviderService.curl(url, false);
    if (!raw || raw.startsWith("<!") || raw.startsWith("<html")) return [];
    try {
      const geoJson = JSON.parse(raw);
      const features: any[] = geoJson?.features || [];
      return [
        ...new Set(
          features
            .map((f: any) => f?.properties?.partition || f?.properties?.gpu_doc_id)
            .filter(Boolean) as string[]
        ),
      ];
    } catch { return []; }
  }

  // ─── Step 2a: ATOM feed → files ─────────────────────────────────────────────

  private static parseAtomEntries(xml: string): GPUFile[] {
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
      const urlPath = href.split("?")[0];
      const name = decodeURIComponent(urlPath.split("/").pop() || title || href);
      files.push({ name, title: title || name, url: href });
    }
    return files;
  }

  private static fetchFilesFromAtom(partition: string): GPUFile[] {
    const url = `${GPUProviderService.ATOM_BASE}?partition=${partition}`;
    console.log(`[GPU] ATOM feed: ${url}`);
    const xml = GPUProviderService.curl(url, true);
    if (!xml || xml.startsWith("{") || xml.startsWith("<html") || xml.startsWith("<!")) {
      console.warn(`[GPU] ATOM feed bad response for ${partition}`);
      return [];
    }
    const files = GPUProviderService.parseAtomEntries(xml);
    console.log(`[GPU] ATOM → ${files.length} files for ${partition}`);
    return files;
  }

  // ─── Step 2b: GPU REST fallback ─────────────────────────────────────────────

  private static fetchFilesFromRest(partition: string): GPUFile[] {
    // Get document list by partition
    const listUrl = `${GPUProviderService.GPU_API}/document?partition=${partition}`;
    console.log(`[GPU] REST list: ${listUrl}`);
    const listRaw = GPUProviderService.curl(listUrl, false);
    if (!listRaw || listRaw.startsWith("<!") || listRaw.startsWith("<html")) return [];

    let docIds: string[] = [];
    try {
      const data = JSON.parse(listRaw);
      const docs: any[] = Array.isArray(data) ? data
        : Array.isArray(data?.content) ? data.content
        : Array.isArray(data?.items) ? data.items
        : [];
      docIds = docs.map((d: any) => d.id || d.gpu_doc_id).filter(Boolean);
    } catch { return []; }

    if (docIds.length === 0) {
      console.warn(`[GPU] REST list returned 0 docs for ${partition}: ${listRaw.slice(0, 200)}`);
      return [];
    }

    const allFiles: GPUFile[] = [];
    for (const docId of docIds) {
      const filesUrl = `${GPUProviderService.GPU_API}/document/${docId}/files`;
      const raw = GPUProviderService.curl(filesUrl, false);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        const files: any[] = Array.isArray(data) ? data
          : Array.isArray(data?.content) ? data.content
          : [];
        for (const f of files) {
          allFiles.push({
            name: f.name,
            title: f.title || f.name,
            path: f.path || "",
            url: `${GPUProviderService.GPU_API}/document/${docId}/files/${encodeURIComponent(f.name)}`,
          });
        }
      } catch { continue; }
    }
    console.log(`[GPU] REST → ${allFiles.length} files for ${partition}`);
    return allFiles;
  }

  // ─── Partition → GPUDocument ─────────────────────────────────────────────────

  private static partitionToDocument(partition: string, files: GPUFile[]): GPUDocument {
    const syntheticId = `gpu-${partition}`;
    GPUProviderService.filesCache.set(syntheticId, files);
    return {
      id: syntheticId,
      name: `PLU — ${partition}`,
      type: "PLU",
      status: "production",
      legalStatus: "opposable",
      originalName: `Documents d'urbanisme — ${partition}`,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  static async getDocumentsByInsee(inseeCode: string): Promise<GPUDocument[]> {
    const partitions = GPUProviderService.getPartitionsByInsee(inseeCode);

    // Fallback: if Apicarto returns nothing, try the default DU_ partition directly
    const toSearch = partitions.length > 0 ? partitions : [`DU_${inseeCode}`];

    const docs: GPUDocument[] = [];
    for (const partition of toSearch) {
      let files = GPUProviderService.fetchFilesFromAtom(partition);
      if (files.length === 0) files = GPUProviderService.fetchFilesFromRest(partition);
      if (files.length > 0) docs.push(GPUProviderService.partitionToDocument(partition, files));
    }

    if (docs.length === 0) console.warn(`[GPU] No documents found for INSEE ${inseeCode}`);
    return docs;
  }

  static async getDocumentsByCoords(lon: number, lat: number): Promise<GPUDocument[]> {
    const partitions = GPUProviderService.getPartitionsByCoords(lon, lat);
    if (partitions.length === 0) return [];
    const docs: GPUDocument[] = [];
    for (const partition of partitions) {
      let files = GPUProviderService.fetchFilesFromAtom(partition);
      if (files.length === 0) files = GPUProviderService.fetchFilesFromRest(partition);
      if (files.length > 0) docs.push(GPUProviderService.partitionToDocument(partition, files));
    }
    return docs;
  }

  static async getFilesByDocumentId(documentId: string): Promise<GPUFile[]> {
    const cached = GPUProviderService.filesCache.get(documentId);
    if (cached) {
      console.log(`[GPU] Returning ${cached.length} cached files for ${documentId}`);
      return cached;
    }
    // If somehow called with a real document ID, try REST directly
    const url = `${GPUProviderService.GPU_API}/document/${documentId}/files`;
    const raw = GPUProviderService.curl(url, false);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      const files: any[] = Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : [];
      return files.map((f: any) => ({
        name: f.name, title: f.title || f.name, path: f.path || "",
        url: `${GPUProviderService.GPU_API}/document/${documentId}/files/${encodeURIComponent(f.name)}`,
      }));
    } catch { return []; }
  }

  static filterCriticalFiles(files: GPUFile[]): GPUFile[] {
    return files;
  }

  static diagnose(inseeCode: string): Record<string, any> {
    const partitions = GPUProviderService.getPartitionsByInsee(inseeCode);
    const results: Record<string, any> = {
      "zone-urba": `${partitions.length} partitions: ${partitions.join(", ") || "none"}`,
    };
    const toCheck = partitions.length > 0 ? partitions : [`DU_${inseeCode}`];
    for (const p of toCheck) {
      const atomUrl = `${GPUProviderService.ATOM_BASE}?partition=${p}`;
      const raw = GPUProviderService.curl(atomUrl, true);
      results[atomUrl] = raw ? raw.slice(0, 600) : "(no response)";
    }
    return results;
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
