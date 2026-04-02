/**
 * Data.gouv.fr API Service
 * 
 * Provides official French open data lookup for datasets (PLU, PPRN, etc.)
 * documentation: https://doc.data.gouv.fr/api/
 */

const DATAGOUV_API = "https://www.data.gouv.fr/api/1";

export interface DataGouvDataset {
  id: string;
  title: string;
  description: string;
  page: string;
  organization: string;
  resources: DataGouvResource[];
}

export interface DataGouvResource {
  id: string;
  title: string;
  url: string;
  format: string;
  type: string;
}

/**
 * Searches for datasets based on a query (e.g., "PLU Nogent-sur-Marne")
 */
export async function searchDatasets(query: string, limit = 5): Promise<DataGouvDataset[]> {
  try {
    const url = `${DATAGOUV_API}/datasets/?q=${encodeURIComponent(query)}&page_size=${limit}`;
    const res = await fetch(url, { 
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000) 
    });

    if (!res.ok) throw new Error(`Data.gouv.fr search error: ${res.status}`);

    const resJson = await res.json() as any;
    const data = resJson.data || [];

    return data.map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      page: d.page,
      organization: d.organization?.name || "Inconnue",
      resources: (d.resources || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        format: r.format,
        type: r.type,
      })),
    }));
  } catch (err) {
    console.error("[dataGouv] Search failed:", (err as Error).message);
    return [];
  }
}

/**
 * Heuristic to find the best PLU regulation PDF in a dataset
 */
export function findBestPluResource(dataset: DataGouvDataset): { id: string, title: string, url: string } | null {
  // Priority keywords for regulations
  const priorities = ["reglement", "règlement", "écrit", "ecrit", "notice"];
  
  const pdfResources = dataset.resources.filter(r => 
    r.format?.toLowerCase() === "pdf" || 
    (r.url || "").toLowerCase().endsWith(".pdf") ||
    (r.title || "").toLowerCase().includes("pdf")
  );

  if (pdfResources.length === 0) return null;

  // 1. Try exact matches with priorities
  for (const p of priorities) {
    const found = pdfResources.find(r => (r.title || "").toLowerCase().includes(p));
    if (found) return { id: found.id, title: found.title, url: found.url };
  }

  // 2. Default to the largest/first PDF if no keywords match
  const first = pdfResources[0];
  return { id: first.id, title: first.title, url: first.url };
}

/**
 * Fetches a city's "Territorial Context" labels if any specific meta-datasets exist
 * (e.g., Perimètre de protection, Monuments historiques)
 */
export async function getCityContextMeta(city: string): Promise<string[]> {
  const query = `urbanisme ${city}`;
  const datasets = await searchDatasets(query, 3);
  return datasets.map(d => d.title);
}
