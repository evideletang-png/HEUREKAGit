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
  confidence_score: number;
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
    
    // 1. Footprint (Article 9) and green space (Article 13)
    const footprintRule = normalizedRules.max_footprint?.[0] ?? null;
    const greenSpaceRatio = normalizedRules.green_space_ratio?.[0] ?? null;

    const maxFootprintFromRule = (() => {
      if (footprintRule == null || footprintRule <= 0) return null;
      if (footprintRule < 1) return surface * footprintRule;
      return footprintRule;
    })();

    const maxFootprintFromGreenSpace = greenSpaceRatio != null && greenSpaceRatio >= 0 && greenSpaceRatio < 1
      ? Math.max(0, surface - (surface * greenSpaceRatio))
      : null;

    const maxAuthorizedFootprint = (() => {
      if (maxFootprintFromRule == null && maxFootprintFromGreenSpace == null) return null;
      if (maxFootprintFromRule == null) return maxFootprintFromGreenSpace;
      if (maxFootprintFromGreenSpace == null) return maxFootprintFromRule;
      return Math.min(maxFootprintFromRule, maxFootprintFromGreenSpace);
    })();

    if (maxFootprintFromRule == null) {
      uncertainties.push("Pas de règle d'emprise au sol (Art. 9) détectée ou interprétée.");
    }
    if (greenSpaceRatio == null && normalizedRules.landscaping_requirements.length === 0) {
      uncertainties.push("Pas de règle exploitable d'espaces verts / pleine terre (Art. 13) détectée ou interprétée.");
    }

    const hasFootprintRule = maxAuthorizedFootprint != null && maxAuthorizedFootprint > 0;
    const remainingFootprint = maxAuthorizedFootprint != null
      ? Math.max(0, maxAuthorizedFootprint - existingFootprint)
      : null;

    // 2. Setbacks & Heights (Summaries)
    const roadRule = normalizedRules.road_setback.length > 0
      ? normalizedRules.road_setback[0] === 0
        ? "Implantation à l'alignement ou sans recul minimal explicite par rapport à la voie."
        : `Retrait minimum de ${normalizedRules.road_setback.join("/")}m par rapport à l'alignement.`
      : "Règle non retrouvée de manière opposable (Article 6).";

    const boundaryRule = normalizedRules.boundary_setback.length > 0
      ? normalizedRules.boundary_setback[0] === 0
        ? "Implantation en limite séparative autorisée ou possible sur tout ou partie du linéaire."
        : `Recul de ${normalizedRules.boundary_setback.join("/")}m par rapport aux limites séparatives.`
      : "Règle non retrouvée de manière opposable (Article 7).";

    const maxHeightRule = normalizedRules.max_height.length > 0
      ? `Hauteur limitée à ${normalizedRules.max_height.join("/")}m.`
      : "Règle de hauteur non retrouvée de manière opposable (Article 10).";

    const landscapingRule = normalizedRules.landscaping_requirements.join("; ")
      || (greenSpaceRatio != null ? `Pleine terre / espaces verts : minimum ${Math.round(greenSpaceRatio * 100)}%.` : "")
      || "Règle non retrouvée de manière opposable";

    // C. Buildable Potential Synthesis
    let synthesis = "";
    if (hasFootprintRule) {
      synthesis = `La parcelle de ${surface}m² autorise théoriquement une emprise totale de ${Math.round(maxAuthorizedFootprint!)}m². `;
      if (maxFootprintFromGreenSpace != null && maxFootprintFromRule != null) {
        synthesis += `Le plafond retenu combine l'emprise réglementaire et l'obligation de pleine terre. `;
      } else if (maxFootprintFromGreenSpace != null && maxFootprintFromRule == null) {
        synthesis += `Ce plafond provient à ce stade principalement de la règle d'espaces verts / pleine terre. `;
      }
      synthesis += `L'emprise existante étant de ${Math.round(existingFootprint)}m², il reste un potentiel de ${Math.round(remainingFootprint!)}m² constructible au sol.`;
    } else if (surface > 0) {
      synthesis = `Parcelle de ${surface}m² identifiée. Les règles d'emprise (Art. 9), hauteur (Art. 10) et reculs ne sont pas encore suffisamment extraites depuis la Base IA mairie pour produire un calcul complet.`;
    } else {
      synthesis = "Données parcellaires insuffisantes pour calculer le potentiel constructible.";
    }

    if (hasFootprintRule && existingFootprint > maxAuthorizedFootprint) {
      blocking.push("SUR-EMPRISE : L'emprise existante dépasse déjà le maximum réglementaire.");
    }

    const confidenceSignals = [
      maxAuthorizedFootprint != null || greenSpaceRatio != null,
      normalizedRules.max_height.length > 0,
      normalizedRules.road_setback.length > 0,
      normalizedRules.boundary_setback.length > 0,
      normalizedRules.parking_requirements.length > 0,
      normalizedRules.landscaping_requirements.length > 0 || greenSpaceRatio != null,
    ];
    const confidenceScore = confidenceSignals.filter(Boolean).length / confidenceSignals.length;

    return {
      parcel_surface_m2: surface,
      existing_footprint_m2: existingFootprint,
      max_authorized_footprint_m2: maxAuthorizedFootprint != null ? Math.round(maxAuthorizedFootprint * 100) / 100 : null,
      remaining_footprint_m2: remainingFootprint,
      road_setback_rule: roadRule,
      boundary_setback_rule: boundaryRule,
      internal_spacing_rule: normalizedRules.internal_spacing.length > 0 ? `${normalizedRules.internal_spacing.join("/")}m` : "N/A",
      max_height_rule: maxHeightRule,
      parking_rule: normalizedRules.parking_requirements.join("; ") || "Règle non retrouvée de manière opposable",
      landscaping_rule: landscapingRule,
      blocking_constraints: blocking,
      uncertainties: uncertainties,
      theoretical_potential_synthesis: synthesis,
      confidence_score: Math.round(confidenceScore * 100) / 100,
    };
  }
}
