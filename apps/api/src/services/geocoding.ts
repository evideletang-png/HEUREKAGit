/**
 * Geocoding Service
 * Uses the IGN Géoplateforme API (data.geopf.fr) for French addresses.
 * Falls back to mock data if the API is unavailable.
 */

export interface GeocodeItem {
  label: string;
  score: number;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  lat: number;
  lng: number;
  banId?: string;
  inseeCode?: string;
  /** Cadastral parcel IDUs directly linked to this address by the BAN (e.g. ["75056000AB0042"]) */
  parcelles?: string[];
}

export async function geocodeAddress(query: string, type?: string): Promise<GeocodeItem[]> {
  try {
    // Primary: BAN (Base Adresse Nationale) — generally more robust for house numbers
    let url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`;
    if (type) {
      url += `&type=${encodeURIComponent(type)}`;
    }
    
    let response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    
    // Fallback: IGN Geoportal if BAN fails
    if (!response.ok) {
      url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(query)}&limit=5`;
      if (type) url += `&type=${encodeURIComponent(type)}`;
      response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    }

    if (!response.ok) throw new Error(`Geocoding API error: ${response.status}`);

    const data = await response.json() as any;

    if (!data.features || data.features.length === 0) {
      console.warn(`[geocoding] No results found for query: "${query}"`);
      return [];
    }

    return data.features.map((f: any) => ({
      label: f.properties.label,
      score: f.properties.score,
      housenumber: f.properties.housenumber,
      street: f.properties.street,
      postcode: f.properties.postcode,
      city: f.properties.city,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      banId: f.properties.id,
      inseeCode: f.properties.citycode,
      parcelles: Array.isArray(f.properties.parcelles) && f.properties.parcelles.length > 0
        ? f.properties.parcelles as string[]
        : undefined,
    }));
  } catch (err) {
    console.error("[geocoding] Error during geocoding:", (err as Error).message);
    // Do NOT return mock data for search queries — it's confusing.
    // Return empty results so the UI can show "No results".
    return [];
  }
}
