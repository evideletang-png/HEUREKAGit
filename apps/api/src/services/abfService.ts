import { logger } from "../utils/logger.js";
import { WorkflowService } from "./workflowService.js";

/**
 * ABF Detection Service (Architecte des Bâtiments de France)
 * Queries IGN APIs to detect Heritage perimeters (SPR, Monuments Historiques).
 */
export class ABFService {
  /**
   * Diagnostic d'un dossier vis-à-vis des contraintes ABF
   */
  static async checkABFConstraints(lat: number, lng: number): Promise<{ isConcerned: boolean; reasons: string[] }> {
    logger.info(`[ABF] Checking constraints for ${lat}, ${lng}...`);
    const reasons: string[] = [];

    try {
      // 1. Interroger l'API Carto IGN (SUP - Servitudes d'Utilité Publique)
      // On cherche les codes AC1 (Monuments Historiques) et SPR
      const geom = JSON.stringify({ type: "Point", coordinates: [lng, lat] });
      const url = `https://apicarto.ign.fr/api/gpu/donnees-urba?geom=${encodeURIComponent(geom)}&format=geojson`;
      
      const res = await fetch(url);
      if (!res.ok) {
        logger.warn(`[ABF] IGN API returned ${res.status}`);
        return { isConcerned: false, reasons: [] };
      }

      const data: any = await res.json();
      const SUPs = data.features || [];

      SUPs.forEach((f: any) => {
        const typeSup = f.properties?.type_sup || "";
        const label = f.properties?.nom_regroupement || f.properties?.libelle || "Servitude Patrimoniale";
        
        if (typeSup.includes("AC1") || typeSup.includes("AC2") || typeSup.includes("SPR")) {
          reasons.push(`${label} (${typeSup}) détecté.`);
        }
      });

      // 2. Fallback de proximité (Rayon de 500m autour des MH)
      // En l'absence de GPU à jour, on assume que si le dossier est "Secteur Protégé", l'ABF est compétent.
      
      return {
        isConcerned: reasons.length > 0,
        reasons
      };
    } catch (err) {
      logger.error("[ABF] Detection failed", err);
      return { isConcerned: false, reasons: [] };
    }
  }

  /**
   * Déclenchement automatique du flux ABF si nécessaire
   */
  static async autoTriggerABF(dossierId: string, lat: number, lng: number) {
    const diagnostic = await this.checkABFConstraints(lat, lng);
    
    if (diagnostic.isConcerned) {
      const reasonStr = diagnostic.reasons.join(" ; ");
      logger.info(`[ABF] Engagement automatique pour dossier ${dossierId} : ${reasonStr}`);
      await WorkflowService.engageABF(dossierId, reasonStr);
      return true;
    }
    
    return false;
  }
}
