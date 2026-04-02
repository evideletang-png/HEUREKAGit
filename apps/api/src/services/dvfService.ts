import { db, municipalitySettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface DVFTransaction {
  id: string;
  date: string;
  valeur: number;
  surface: number;
  type: string;
  prixM2: number;
}

/**
 * Service pour interroger les données DVF (Etalab via cquest)
 */
export class DVFService {
  /**
   * Récupère le prix au m2 moyen pour une parcelle spécifique (DVF)
   */
  static async getMarketValueByParcel(commune: string, parcelRef: string): Promise<number | null> {
    try {
      // Nettoyage de la référence parcelle (souvent au format 000 section num)
      // L'API attend souvent un format concaténé ou spécifique.
      // Pour cet exemple, on interroge par parcelle si le format est compatible
      const url = `https://api.cquest.org/dvf?parcelle=${encodeURIComponent(parcelRef)}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as any;
      const features = data.features || [];
      if (features.length === 0) return null;

      let totalValue = 0;
      let totalSurface = 0;
      let count = 0;

      features.forEach((f: any) => {
        const val = f.properties.valeur_fonciere;
        const surf = f.properties.surface_terrain || f.properties.surface_reelle_bati;
        if (val && surf && surf > 0) {
          totalValue += val;
          totalSurface += surf;
          count++;
        }
      });

      return count > 0 ? Math.round(totalValue / totalSurface) : null;
    } catch (err) {
      console.error("[DVF] Error fetching parcel data:", err);
      return null;
    }
  }

  /**
   * Récupère les dernières transactions réelles pour une commune (DVF)
   * avec calcul de statistiques (moyenne/médiane)
   */
  static async getLatestTransactions(commune: string, typeLocal?: string, limit: number = 5): Promise<{
    transactions: DVFTransaction[];
    stats: { moyen: number; median: number; count: number };
  } | null> {
    try {
      const inseeCode = await this.getOrFetchInseeCode(commune);
      if (!inseeCode) return null;

      const url = `https://api.cquest.org/dvf/commune/${inseeCode}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data: any = await response.json();
      if (!data.features || data.features.length === 0) return null;

      // 1. Transformer et filtrer les transactions
      let transactions: DVFTransaction[] = data.features
        .map((f: any) => {
          const p = f.properties;
          return {
            id: f.id,
            date: p.date_mutation,
            valeur: p.valeur_fonciere,
            surface: p.surface_reelle_bati || p.surface_terrain || 0,
            type: p.type_local || "Autre",
            prixM2: (p.valeur_fonciere && (p.surface_reelle_bati || p.surface_terrain)) 
              ? Math.round(p.valeur_fonciere / (p.surface_reelle_bati || p.surface_terrain)) 
              : 0
          };
        })
        .filter((t: any) => 
          t.valeur > 0 && 
          t.surface > 0 && 
          (!typeLocal || t.type.toLowerCase().includes(typeLocal.toLowerCase()))
        )
        // Trier par date décroissante
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (transactions.length === 0) return null;

      // 2. Calculer les statistiques sur l'ensemble des transactions trouvées (pas seulement les 5)
      const allPrixM2 = transactions.map(t => t.prixM2).sort((a, b) => a - b);
      const sum = allPrixM2.reduce((acc, val) => acc + val, 0);
      const moyen = Math.round(sum / allPrixM2.length);
      
      const mid = Math.floor(allPrixM2.length / 2);
      const median = allPrixM2.length % 2 !== 0 ? allPrixM2[mid] : Math.round((allPrixM2[mid - 1] + allPrixM2[mid]) / 2);

      return {
        transactions: transactions.slice(0, limit),
        stats: { moyen, median, count: transactions.length }
      };
    } catch (err) {
      console.error("[DVF] Error fetching latest transactions:", err);
      return null;
    }
  }

  /**
   * Récupère le prix moyen au m2 pour une commune (méthode simplifiée)
   */
  static async getAveragePrice(commune: string): Promise<number | null> {
    const result = await this.getLatestTransactions(commune);
    return result?.stats.moyen || null;
  }

  /**
   * Récupère l'INSEE code depuis la DB ou via API Adresse
   */
  private static async getOrFetchInseeCode(commune: string): Promise<string | null> {
    const [settings] = await db.select().from(municipalitySettingsTable)
      .where(eq(municipalitySettingsTable.commune, commune))
      .limit(1);

    if (settings?.inseeCode) return settings.inseeCode;

    // Pas d'INSEE, on cherche via l'API Adresse
    try {
      const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(commune)}&type=municipality&limit=1`;
      const res = await fetch(url);
      const data: any = await res.json();
      const code = data.features?.[0]?.properties?.citycode;

      if (code) {
        console.log(`[DVF] Found INSEE code ${code} for ${commune}. Saving...`);
        if (settings) {
          await db.update(municipalitySettingsTable).set({ inseeCode: code }).where(eq(municipalitySettingsTable.commune, commune));
        } else {
          await db.insert(municipalitySettingsTable).values({ commune, inseeCode: code });
        }
        return code;
      }
    } catch (e) {
      console.error("[DVF] INSEE lookup failed:", e);
    }

    return null;
  }
}
