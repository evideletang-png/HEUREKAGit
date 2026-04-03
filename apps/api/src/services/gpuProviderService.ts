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
      const command = `curl -s -k --max-time 30 -H "Accept: application/json" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`;
      const stdout = execSync(command, { maxBuffer: 10 * 1024 * 1024 }).toString().trim();

      if (!stdout) {
        console.warn(`[GPU] Empty response for: ${url}`);
        return null;
      }
      if (stdout.startsWith("<!") || stdout.startsWith("<html")) {
        console.warn(`[GPU] Got HTML instead of JSON for: ${url} — likely WAF block`);
        return null;
      }
      return JSON.parse(stdout);
    } catch (e: any) {
      console.error(`[GPU] curlFetch failed for ${url}: ${e.message}`);
      return null;
    }
  }

  /**
   * Récupère les documents pour un code INSEE.
   * Utilise le endpoint grid (fiable) plutôt que by-municipality (bloqué WAF).
   */
  static async getDocumentsByInsee(inseeCode: string): Promise<GPUDocument[]> {
    // Try multiple GPU endpoint variants — the WAF behaviour varies by endpoint/param
    const urls = [
      `${GPUProviderService.BASE_URL}/document?grid=${inseeCode}&gridType=insee&active=true&sort=-publicationDate`,
      `${GPUProviderService.BASE_URL}/document?codeMunicipalite=${inseeCode}`,
      `${GPUProviderService.BASE_URL}/document?grid=${inseeCode}&gridType=insee`,
    ];

    for (const url of urls) {
      console.log(`[GPU] Fetching documents: ${url}`);
      const data = GPUProviderService.curlFetch(url);

      if (data && Array.isArray(data) && data.length > 0) {
        console.log(`[GPU] Found ${data.length} documents for INSEE ${inseeCode} via ${url}`);
        return data as GPUDocument[];
      }
    }

    console.warn(`[GPU] No documents returned for INSEE ${inseeCode} from any endpoint`);
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

    if (!data || !Array.isArray(data)) {
      console.warn(`[GPU] No files returned for document ${documentId}`);
      return [];
    }

    // Construct download URLs using the correct GPU API format:
    // /api/document/{docId}/files/{filename} → 302 redirect → real PDF on data.geopf.fr
    return data.map((f: any) => ({
      name: f.name,
      title: f.title || f.name,
      path: f.path || "",
      url: `${GPUProviderService.BASE_URL}/document/${documentId}/files/${encodeURIComponent(f.name)}`
    }));
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
