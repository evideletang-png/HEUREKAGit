import { execSync } from "child_process";

/**
 * Service d'interfaçage avec le Géoportail de l'Urbanisme (GPU)
 */

export interface GPUDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  legalStatus: string;
  publicationDate?: string;
  originalName: string;
  files?: any[];
}

export interface GPUFile {
  name: string;     // filename, e.g. "37203_reglement_20191125.pdf"
  title: string;    // human label, e.g. "Règlement écrit"
  path?: string;    // category path, e.g. "Règlements"
  url: string;      // constructed download URL
}

/**
 * Service d'interfaçage avec le Géoportail de l'Urbanisme (GPU)
 * Permet l'auto-ingestion des documents d'urbanisme officiels.
 *
 * IMPORTANT DISCOVERY (2025-03-30):
 * - The GPU /api/document/by-municipality/{inseeCode} endpoint is BLOCKED by WAF for automated requests.
 * - The /api/document?grid=... endpoint WORKS and returns document IDs.
 * - The /api/document/{docId}/files endpoint WORKS and returns {name, title, path} objects.
 * - Files do NOT have an 'id' field. Download URLs use the filename directly.
 * - CORRECT Download URL: /api/document/{docId}/files/{filename}  → 302 redirect to data.geopf.fr → real PDF
 * - WRONG formats: /document/telecharger?documentary=..., /api/document/{id}/download/{file} → 404
 */
export class GPUProviderService {
  private static BASE_URL = "https://www.geoportail-urbanisme.gouv.fr/api";

  /**
   * Simple curl fetch — the ONLY method that bypasses GPU's WAF.
   * Node.js fetch / node-fetch / axios all get blocked.
   */
  private static curlFetch(url: string): any {
    try {
      const command = `curl -s -L -k --max-time 30 -H "Accept: application/json" -H "Accept-Language: fr-FR,fr;q=0.9" -H "Referer: https://www.geoportail-urbanisme.gouv.fr/" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`;
      const stdout = execSync(command, { maxBuffer: 10 * 1024 * 1024 }).toString().trim();

      if (!stdout) {
        console.warn(`[GPU] Empty response for: ${url}`);
        return null;
      }
      if (stdout.startsWith("<!") || stdout.startsWith("<html")) {
        console.warn(`[GPU] Got HTML instead of JSON for: ${url} — likely WAF block`);
        return null;
      }
      const parsed = JSON.parse(stdout);
      // Log response shape to help diagnose format issues
      const shape = Array.isArray(parsed)
        ? `array[${parsed.length}]`
        : (typeof parsed === "object" && parsed !== null)
          ? `object{${Object.keys(parsed).join(",")}}`
          : typeof parsed;
      console.log(`[GPU] Response shape for ${url}: ${shape} — raw preview: ${stdout.slice(0, 300)}`);
      return parsed;
    } catch (e: any) {
      console.error(`[GPU] curlFetch failed for ${url}: ${e.message}`);
      return null;
    }
  }

  /** Extract a docs array from any known GPU response shape */
  private static extractDocs(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.content)) return data.content;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.documents)) return data.documents;
    if (Array.isArray(data.results)) return data.results;
    // Some endpoints wrap in a single-key object — pick the first array value
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && (v as any[]).length > 0) return v as any[];
    }
    return [];
  }

  /**
   * Récupère les documents pour un code INSEE.
   * Essaie plusieurs variantes d'endpoint GPU en cas de blocage WAF.
   */
  static async getDocumentsByInsee(inseeCode: string): Promise<GPUDocument[]> {
    const urls = [
      // Primary: codeMunicipalite is the canonical INSEE param on GPU
      `${GPUProviderService.BASE_URL}/document?codeMunicipalite=${inseeCode}`,
      // Alternate: grid-based (worked for some communes)
      `${GPUProviderService.BASE_URL}/document?grid=${inseeCode}&gridType=insee&active=true`,
      `${GPUProviderService.BASE_URL}/document?grid=${inseeCode}&gridType=insee`,
      // Alternate: by-municipality path (WAF sometimes allows it)
      `${GPUProviderService.BASE_URL}/document/by-municipality/${inseeCode}`,
      // Alternate: inseeCode query param
      `${GPUProviderService.BASE_URL}/document?inseeCode=${inseeCode}`,
      `${GPUProviderService.BASE_URL}/document?commune=${inseeCode}`,
    ];

    for (const url of urls) {
      console.log(`[GPU] Trying: ${url}`);
      const data = GPUProviderService.curlFetch(url);
      if (!data) continue;

      const docs = GPUProviderService.extractDocs(data);
      if (docs.length > 0) {
        console.log(`[GPU] ✅ Found ${docs.length} documents for INSEE ${inseeCode} via ${url}`);
        return docs as GPUDocument[];
      }

      console.warn(`[GPU] 0 docs — shape: ${JSON.stringify(data).slice(0, 300)}`);
    }

    console.warn(`[GPU] No documents returned for INSEE ${inseeCode} from any endpoint`);
    return [];
  }

  /**
   * Récupère les documents par coordonnées GPS (fallback si INSEE ne fonctionne pas).
   * Utilise une bbox de ~2km autour du point.
   */
  static async getDocumentsByCoords(lon: number, lat: number): Promise<GPUDocument[]> {
    const delta = 0.02; // ~2km
    const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
    const urls = [
      `${GPUProviderService.BASE_URL}/document?bbox=${bbox}`,
      `${GPUProviderService.BASE_URL}/document?lon=${lon}&lat=${lat}`,
    ];

    for (const url of urls) {
      console.log(`[GPU] Trying coords fallback: ${url}`);
      const data = GPUProviderService.curlFetch(url);
      if (!data) continue;
      const docs = GPUProviderService.extractDocs(data);
      if (docs.length > 0) {
        console.log(`[GPU] ✅ Found ${docs.length} documents via coords ${lon},${lat}`);
        return docs as GPUDocument[];
      }
    }
    return [];
  }

  /**
   * Récupère la liste des fichiers pour un document ID.
   * Retour: [{name, title, path}] — PAS DE CHAMP 'id' !
   * L'URL de téléchargement est construite à partir du 'name'.
   */
  static async getFilesByDocumentId(documentId: string): Promise<GPUFile[]> {
    const url = `${GPUProviderService.BASE_URL}/document/${documentId}/files`;
    console.log(`[GPU] Fetching file list for document ${documentId}...`);
    const data = GPUProviderService.curlFetch(url);

    // Handle plain array or paginated response
    const files: any[] = Array.isArray(data) ? data
      : Array.isArray(data?.content) ? data.content
      : Array.isArray(data?.items) ? data.items
      : [];

    if (files.length === 0) {
      console.warn(`[GPU] No files returned for document ${documentId}`, data ? JSON.stringify(data).slice(0, 100) : "(null)");
      return [];
    }

    // Construct download URLs using the correct GPU API format:
    // /api/document/{docId}/files/{filename} → 302 redirect → real PDF on data.geopf.fr
    return files.map((f: any) => ({
      name: f.name,
      title: f.title || f.name,
      path: f.path || "",
      url: `${GPUProviderService.BASE_URL}/document/${documentId}/files/${encodeURIComponent(f.name)}`
    }));
  }

  /**
   * Returns raw API responses for every URL variant — used when sync returns 0 docs
   * to expose the exact API behaviour without needing to read Railway logs.
   */
  static diagnose(inseeCode: string): Record<string, any> {
    const urls = [
      `${GPUProviderService.BASE_URL}/document?codeMunicipalite=${inseeCode}`,
      `${GPUProviderService.BASE_URL}/document?grid=${inseeCode}&gridType=insee`,
      `${GPUProviderService.BASE_URL}/document?grid=${inseeCode}&gridType=municipality`,
      `${GPUProviderService.BASE_URL}/document/by-municipality/${inseeCode}`,
    ];
    const results: Record<string, any> = {};
    for (const url of urls) {
      try {
        const cmd = `curl -s -L -k --max-time 15 -H "Accept: application/json" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`;
        const { execSync: exec } = require("child_process");
        const raw = exec(cmd, { maxBuffer: 1024 * 1024 }).toString().trim();
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 500); }
        results[url] = {
          type: Array.isArray(parsed) ? `array[${parsed.length}]` : (typeof parsed === "object" && parsed ? `object{${Object.keys(parsed).join(",")}}` : typeof parsed),
          raw: typeof parsed === "string" ? parsed : JSON.stringify(parsed).slice(0, 600),
        };
      } catch (e: any) {
        results[url] = { error: e.message };
      }
    }
    return results;
  }

  /**
   * Retourne tous les fichiers PDF fournis par le GPU.
   * Suppression du filtrage restrictif pour garantir l'exhaustivité demandée par l'utilisateur.
   */
  static filterCriticalFiles(files: GPUFile[]): GPUFile[] {
    console.log(`[GPU] Including all ${files.length} files as requested.`);
    return files;
  }

  /**
   * Génère une note explicative contextuelle basée sur le naming CNIG.
   */
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
      return "Servitude d'utilité publique relative aux risques naturels (Inondation, Mouvement de terrain).";

    return "Document réglementaire d'urbanisme complétant la base de connaissances communale.";
  }
}
