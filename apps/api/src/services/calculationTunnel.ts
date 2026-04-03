import { logger } from "../utils/logger.js";
import { CalculationParameters } from "./normalizationService.js";

export interface TunnelResult {
  parcel_surface_m2: number | null;
  existing_footprint_m2: number | null;
  max_authorized_footprint_m2: number | null;
  remaining_footprint_m2: number | null;
  road_setback_rule: string;
  boundary_setback_rule: string;
  internal_spacing_rule: string;
  max_height_rule: string;
  parking_rule: string;
  landscaping_rule: string;
  blocking_constraints: string[];
  uncertainties: string[];
  theoretical_potential_synthesis: string;
}

/**
 * Calculation Tunnel Service (Step 6)
 * Using the parcel/project data and the normalized rules, calculate step by step.
 */
export class CalculationTunnel {
  /**
   * Executes the full calculation tunnel.
   */
  static async runTunnel(
    parcel: any, 
    project: any, 
    normalizedRules: CalculationParameters
  ): Promise<TunnelResult> {
    logger.info(`[Calculation Tunnel] Starting step-by-step calculation for parcel ${parcel.cadastralSection}${parcel.parcelNumber}`);

    // A. Parcel Context
    const surface = parcel.parcelSurfaceM2 || 0;
    const existingFootprint = (parcel.buildings || []).reduce((sum: number, b: any) => sum + (b.footprintM2 || 0), 0);
    
    const blocking: string[] = [];
    const uncertainties: string[] = [];

    // B. Buildability Calculations
    
    // 1. Footprint (Article 9)
    let maxAuthorizedFootprint = 0;
    const footprintRule = normalizedRules.max_footprint[0] || 0;
    
    if (footprintRule > 0 && footprintRule < 1) { // Percentage
       maxAuthorizedFootprint = surface * footprintRule;
    } else if (footprintRule >= 1) { // Absolute m2 (or literal search error)
       maxAuthorizedFootprint = footprintRule;
    } else {
       uncertainties.push("Pas de règle d'emprise au sol (Art. 9) détectée ou interprétée.");
    }

    // Use null when no rule found — 0 is falsy in the frontend and hides the field
    const hasFootprintRule = maxAuthorizedFootprint > 0;
    const remainingFootprint = hasFootprintRule
      ? Math.max(0, maxAuthorizedFootprint - existingFootprint)
      : null;

    // 2. Setbacks & Heights (Summaries)
    const roadRule = normalizedRules.road_setback.length > 0
      ? `Retrait minimum de ${normalizedRules.road_setback.join("/")}m par rapport à l'alignement.`
      : "Règle non spécifiée (Article 6).";

    const boundaryRule = normalizedRules.boundary_setback.length > 0
      ? `Recul de ${normalizedRules.boundary_setback.join("/")}m par rapport aux limites séparatives.`
      : "Règle non spécifiée (Article 7).";

    const maxHeightRule = normalizedRules.max_height.length > 0
      ? `Hauteur limitée à ${normalizedRules.max_height.join("/")}m.`
      : "Pas de limite de hauteur détectée (Article 10).";

    // C. Buildable Potential Synthesis
    let synthesis = "";
    if (hasFootprintRule) {
      synthesis = `La parcelle de ${surface}m² autorise théoriquement une emprise totale de ${Math.round(maxAuthorizedFootprint)}m². `;
      synthesis += `L'emprise existante étant de ${Math.round(existingFootprint)}m², il reste un potentiel de ${Math.round(remainingFootprint!)}m² constructible au sol.`;
    } else if (surface > 0) {
      synthesis = `Parcelle de ${surface}m² identifiée. Les règles d'emprise (Art. 9), hauteur (Art. 10) et reculs ne sont pas encore indexées — synchronisez le GPU depuis le portail mairie pour obtenir le calcul complet.`;
    } else {
      synthesis = "Données parcellaires insuffisantes pour calculer le potentiel constructible.";
    }

    if (hasFootprintRule && existingFootprint > maxAuthorizedFootprint) {
      blocking.push("SUR-EMPRISE : L'emprise existante dépasse déjà le maximum réglementaire.");
    }

    return {
      parcel_surface_m2: surface,
      existing_footprint_m2: existingFootprint,
      max_authorized_footprint_m2: hasFootprintRule ? maxAuthorizedFootprint : null,
      remaining_footprint_m2: remainingFootprint,
      road_setback_rule: roadRule,
      boundary_setback_rule: boundaryRule,
      internal_spacing_rule: normalizedRules.internal_spacing.length > 0 ? `${normalizedRules.internal_spacing.join("/")}m` : "N/A",
      max_height_rule: maxHeightRule,
      parking_rule: normalizedRules.parking_requirements.join("; ") || "Pas de règle spécifique",
      landscaping_rule: normalizedRules.landscaping_requirements.join("; ") || "Pas de règle spécifique",
      blocking_constraints: blocking,
      uncertainties: uncertainties,
      theoretical_potential_synthesis: synthesis
    };
  }
}
