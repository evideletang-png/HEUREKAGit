import { execSync } from "child_process";

/**
 * Service d'interfaçage avec le Géoportail de l'Urbanisme (GPU)
 *
 * PRIMARY METHOD: INSPIRE ATOM feed
 *   https://www.geoportail-urbanisme.gouv.fr/atom/download-feed.xml?partition=DU_{inseeCode}
 *   Returns an XML feed with direct PDF download links — no WAF issues.
 *
 * FALLBACK: REST JSON API (various endpoint variants)
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
  private static BASE_URL = "https://www.geoportail-urbanisme.gouv.fr/api";
  private static ATOM_BASE = "https://www.geoportail-urbanisme.gouv.fr/atom/download-feed.xml";
  // WFS endpoints that return GeoJSON with gpu_doc_id per feature
  private static WFS_URLS = [
    "https://data.geopf.fr/wfs/ows",
    "https://www.geoportail-urbanisme.gouv.fr/wfs/",
    "https://wxs.ign.fr/essentiels/geoportail/wfs",
  ];

  // Cache ATOM-derived files so getFilesByDocumentId() works unchanged
  private static atomFilesCache: Map<string, GPUFile[]> = new Map();

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

  // ─── ATOM feed parser ───────────────────────────────────────────────────────

  private static parseAtomEntries(xml: string): GPUFile[] {
    const files: GPUFile[] = [];
    // Match <entry>...</entry> blocks (handles multiline, namespaced tags)
    const entryRe = /<(?:\w+:)?entry[^>]*>([\s\S]*?)<\/(?:\w+:)?entry>/gi;
    let m: RegExpExecArray | null;

    while ((m = entryRe.exec(xml)) !== null) {
      const block = m[1];

      // title — handles CDATA and plain text
      const titleMatch = block.match(/<(?:\w+:)?title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:\w+:)?title>/i);
      const title = titleMatch ? titleMatch[1].replace(/&amp;/g, "&").trim() : "";

      // link href — <link href="..." ...> or <link rel="..." href="...">
      const linkMatch = block.match(/<(?:\w+:)?link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
      const href = linkMatch ? linkMatch[1].trim() : "";

      if (!href) continue;

      // Derive filename from URL path
      const urlPath = href.split("?")[0];
      const name = decodeURIComponent(urlPath.split("/").pop() || title || href);

      files.push({ name, title: title || name, url: href });
    }

    return files;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Step 1 of the Make.com flow: WFS GeoJSON → gpu_doc_id list
   * Step 2: GET /api/document/{gpu_doc_id}/details for each ID
   */
  private static async getDocIdsByWFS(inseeCode: string): Promise<string[]> {
    const wfsParams = new URLSearchParams({
      SERVICE: "WFS",
      VERSION: "2.0.0",
      REQUEST: "GetFeature",
      typeName: "GPU:document",
      outputFormat: "application/json",
      CQL_FILTER: `code_insee='${inseeCode}'`,
    });

    for (const base of GPUProviderService.WFS_URLS) {
      const url = `${base}?${wfsParams.toString()}`;
      console.log(`[GPU] WFS query: ${url}`);
      const raw = GPUProviderService.curl(url, false);
      if (!raw || raw.startsWith("<!") || raw.startsWith("<html")) continue;
      try {
        const geoJson = JSON.parse(raw);
        const features: any[] = geoJson?.features || [];
        const ids = features
          .map((f: any) => f?.properties?.gpu_doc_id || f?.properties?.id || f?.id)
          .filter(Boolean);
        if (ids.length > 0) {
          console.log(`[GPU] WFS ✅ found ${ids.length} gpu_doc_ids via ${base}`);
          return ids;
        }
        console.warn(`[GPU] WFS 0 features at ${base}: ${raw.slice(0, 200)}`);
      } catch {
        console.warn(`[GPU] WFS non-JSON at ${base}: ${raw.slice(0, 100)}`);
      }
    }
    return [];
  }

  static async getDocumentsByInsee(inseeCode: string): Promise<GPUDocument[]> {
    // 1. WFS → gpu_doc_id → /api/document/{id}/details  (exact Make.com flow)
    const docIds = await GPUProviderService.getDocIdsByWFS(inseeCode);
    if (docIds.length > 0) {
      const docs: GPUDocument[] = [];
      for (const docId of docIds) {
        const url = `${GPUProviderService.BASE_URL}/document/${docId}/details`;
        console.log(`[GPU] Fetching details: ${url}`);
        const raw = GPUProviderService.curl(url, false);
        if (!raw) continue;
        try {
          const d = JSON.parse(raw);
          docs.push({
            id: d.id || d.gpu_doc_id || docId,
            name: d.name || d.title || docId,
            type: d.type || d.documentType || "PLU",
            status: d.status || d.etat || "production",
            legalStatus: d.legalStatus || d.statutJuridique || "opposable",
            publicationDate: d.publicationDate || d.datePubli,
            originalName: d.originalName || d.name || docId,
          });
        } catch {
          // Still add with minimal info so getFilesByDocumentId() is called
          docs.push({ id: docId, name: docId, type: "PLU", status: "production", legalStatus: "opposable", originalName: docId });
        }
      }
      if (docs.length > 0) return docs;
    }

    // 2. Try INSPIRE ATOM feed (primary — no WAF, direct PDFs)
    const atomUrl = `${GPUProviderService.ATOM_BASE}?partition=DU_${inseeCode}`;
    console.log(`[GPU] Trying ATOM feed: ${atomUrl}`);
    const xml = GPUProviderService.curl(atomUrl, true);

    if (xml && !xml.startsWith("{") && !xml.startsWith("<html") && !xml.startsWith("<!")) {
      const files = GPUProviderService.parseAtomEntries(xml);
      console.log(`[GPU] ATOM feed returned ${files.length} entries for INSEE ${inseeCode}`);
      if (files.length > 0) {
        const syntheticId = `atom-${inseeCode}`;
        GPUProviderService.atomFilesCache.set(syntheticId, files);
        return [{
          id: syntheticId,
          name: `PLU ${inseeCode}`,
          type: "PLU",
          status: "production",
          legalStatus: "opposable",
          originalName: `Documents d'urbanisme — ${inseeCode}`,
        }];
      }
      // Log first 500 chars of the ATOM response for diagnosis
      console.warn(`[GPU] ATOM feed returned 0 entries. Raw: ${xml.slice(0, 500)}`);
    }

    // 2. REST JSON fallback (multiple parameter variants)
    const jsonUrls = [
      `${GPUProviderService.BASE_URL}/document?codeMunicipalite=${inseeCode}`,
      `${GPUProviderService.BASE_URL}/document?grid=${inseeCode}&gridType=insee`,
      `${GPUProviderService.BASE_URL}/document/by-municipality/${inseeCode}`,
    ];

    for (const url of jsonUrls) {
      console.log(`[GPU] Trying REST fallback: ${url}`);
      const raw = GPUProviderService.curl(url, false);
      if (!raw || raw.startsWith("<!") || raw.startsWith("<html")) continue;
      try {
        const data = JSON.parse(raw);
        const docs = GPUProviderService.extractDocs(data);
        if (docs.length > 0) {
          console.log(`[GPU] ✅ REST fallback returned ${docs.length} docs via ${url}`);
          return docs as GPUDocument[];
        }
        console.warn(`[GPU] REST 0 docs at ${url} — shape: ${raw.slice(0, 200)}`);
      } catch {
        console.warn(`[GPU] Non-JSON response at ${url}: ${raw.slice(0, 200)}`);
      }
    }

    console.warn(`[GPU] No documents found for INSEE ${inseeCode} from ATOM or REST`);
    return [];
  }

  static async getFilesByDocumentId(documentId: string): Promise<GPUFile[]> {
    // Return ATOM-cached files if this is an ATOM synthetic document
    if (GPUProviderService.atomFilesCache.has(documentId)) {
      const files = GPUProviderService.atomFilesCache.get(documentId)!;
      console.log(`[GPU] Returning ${files.length} ATOM-cached files for ${documentId}`);
      return files;
    }

    // REST fallback for real document IDs
    const url = `${GPUProviderService.BASE_URL}/document/${documentId}/files`;
    console.log(`[GPU] Fetching REST file list for ${documentId}`);
    const raw = GPUProviderService.curl(url, false);
    if (!raw) return [];

    try {
      const data = JSON.parse(raw);
      const files: any[] = Array.isArray(data) ? data
        : Array.isArray(data?.content) ? data.content
        : Array.isArray(data?.items) ? data.items
        : [];

      if (files.length === 0) {
        console.warn(`[GPU] No files for document ${documentId}: ${raw.slice(0, 100)}`);
        return [];
      }

      return files.map((f: any) => ({
        name: f.name,
        title: f.title || f.name,
        path: f.path || "",
        url: `${GPUProviderService.BASE_URL}/document/${documentId}/files/${encodeURIComponent(f.name)}`
      }));
    } catch {
      console.warn(`[GPU] Non-JSON file list for ${documentId}: ${raw.slice(0, 100)}`);
      return [];
    }
  }

  static filterCriticalFiles(files: GPUFile[]): GPUFile[] {
    return files;
  }

  /** Returns raw responses for each URL variant — included in sync response when 0 docs found */
  static diagnose(inseeCode: string): Record<string, any> {
    const probes: Array<{ url: string; xml: boolean }> = [
      { url: `${GPUProviderService.ATOM_BASE}?partition=DU_${inseeCode}`, xml: true },
      { url: `${GPUProviderService.BASE_URL}/document?codeMunicipalite=${inseeCode}`, xml: false },
      { url: `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeName=GPU:document&outputFormat=application/json&CQL_FILTER=code_insee='${inseeCode}'`, xml: false },
    ];
    const results: Record<string, any> = {};
    for (const { url, xml } of probes) {
      const raw = GPUProviderService.curl(url, xml);
      results[url] = raw ? raw.slice(0, 600) : "(no response)";
    }
    return results;
  }

  private static extractDocs(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    for (const key of ["content", "items", "documents", "results"]) {
      if (Array.isArray(data[key])) return data[key];
    }
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && (v as any[]).length > 0) return v as any[];
    }
    return [];
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
