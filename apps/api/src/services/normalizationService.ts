import { z } from "zod";
import { logger } from "../utils/logger.js";
import { PluRule } from "@workspace/ai-core";

/**
 * Standard Calculation Parameters Structure (Step 4)
 */
export const CalculationParametersSchema = z.object({
  road_setback: z.array(z.number()).default([]),
  boundary_setback: z.array(z.number()).default([]),
  internal_spacing: z.array(z.number()).default([]),
  max_footprint: z.array(z.number()).default([]), // As percentage or m2
  max_height: z.array(z.number()).default([]),
  parking_requirements: z.array(z.string()).default([]),
  landscaping_requirements: z.array(z.string()).default([]),
  special_conditions: z.array(z.string()).default([])
});

export type CalculationParameters = z.infer<typeof CalculationParametersSchema>;

/**
 * Normalization Service (Step 4 & 5)
 * Converts qualitative "operational_rules" into quantitative calculation parameters.
 * Handles Step 5: Regulatory Overrides (ABF, PPRI, etc.)
 */
export class NormalizationService {
  /**
   * Normalizes a set of PLU rules into a calculation-ready layer.
   */
  static async normalizeRules(articles: PluRule[], overlays: any[] = []): Promise<CalculationParameters> {
    logger.info(`[Normalization] Normalizing ${articles.length} articles with ${overlays.length} overlays...`);
    
    const params: CalculationParameters = {
      road_setback: [],
      boundary_setback: [],
      internal_spacing: [],
      max_footprint: [],
      max_height: [],
      parking_requirements: [],
      landscaping_requirements: [],
      special_conditions: []
    };

    for (const art of articles) {
      const artNum = art.article.toString();
      
      // Article 6: Position by roads
      if (artNum === "6") {
        this.extractNumbers(art.operational_rule).forEach(n => params.road_setback.push(n));
      }
      // Article 7: Side boundaries
      if (artNum === "7") {
        this.extractNumbers(art.operational_rule).forEach(n => params.boundary_setback.push(n));
      }
      // Article 9: Footprint
      if (artNum === "9") {
        this.extractNumbers(art.operational_rule).forEach(n => params.max_footprint.push(n));
      }
      // Article 10: Height
      if (artNum === "10") {
        this.extractNumbers(art.operational_rule).forEach(n => params.max_height.push(n));
      }
      // Article 12: Parking
      if (artNum === "12") {
        params.parking_requirements.push(art.operational_rule);
      }
      // Article 13: Greenery
      if (artNum === "13") {
        params.landscaping_requirements.push(art.operational_rule);
      }
    }

    // Step 5: APPLY REGULATORY OVERRIDES
    for (const overlay of overlays) {
      logger.info(`[Normalization] Applying override from ${overlay.source_name || "Overlay"}`);
      if (overlay.target_item === "height" && overlay.max_value) {
        params.max_height = params.max_height.map(h => Math.min(h, overlay.max_value));
        params.special_conditions.push(`Override Hauteur: ${overlay.reason || "Contrainte patrimoniale"}`);
      }
      if (overlay.target_item === "footprint" && overlay.max_value) {
          params.max_footprint = params.max_footprint.map(f => Math.min(f, overlay.max_value));
          params.special_conditions.push(`Override Emprise: ${overlay.reason || "Contrainte environnementale"}`);
      }
    }

    return params;
  }

  private static extractNumbers(text: string): number[] {
    const matches = text.match(/\d+([.,]\d+)?/g);
    if (!matches) return [];
    return matches.map(m => parseFloat(m.replace(",", ".")));
  }
}
