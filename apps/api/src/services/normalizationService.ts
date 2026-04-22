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
  green_space_ratio: z.array(z.number()).default([]),
  parking_requirements: z.array(z.string()).default([]),
  landscaping_requirements: z.array(z.string()).default([]),
  special_conditions: z.array(z.string()).default([])
});

export type CalculationParameters = z.infer<typeof CalculationParametersSchema>;

type StructuredRuleData = {
  family?: string | null;
  topic?: string | null;
  value_type?: string | null;
  value_min?: number | null;
  value_max?: number | null;
  value_exact?: number | null;
  unit?: string | null;
  condition?: string | null;
  exception?: string | null;
};

type StructuredUrbanRuleLike = {
  ruleFamily?: string | null;
  ruleTopic?: string | null;
  ruleLabel?: string | null;
  ruleTextRaw?: string | null;
  ruleSummary?: string | null;
  ruleValueType?: string | null;
  ruleValueMin?: number | null;
  ruleValueMax?: number | null;
  ruleValueExact?: number | null;
  ruleUnit?: string | null;
  ruleCondition?: string | null;
  ruleException?: string | null;
};

/**
 * Normalization Service (Step 4 & 5)
 * Converts qualitative "operational_rules" into quantitative calculation parameters.
 * Handles Step 5: Regulatory Overrides (ABF, PPRI, etc.)
 */
export class NormalizationService {
  static createEmptyParameters(): CalculationParameters {
    return {
      road_setback: [],
      boundary_setback: [],
      internal_spacing: [],
      max_footprint: [],
      max_height: [],
      green_space_ratio: [],
      parking_requirements: [],
      landscaping_requirements: [],
      special_conditions: [],
    };
  }

  /**
   * Normalizes a set of PLU rules into a calculation-ready layer.
   */
  static async normalizeRules(articles: PluRule[], overlays: any[] = []): Promise<CalculationParameters> {
    logger.info(`[Normalization] Normalizing ${articles.length} articles with ${overlays.length} overlays...`);

    const params = this.createEmptyParameters();

    for (const art of articles) {
      const rawArticle = (art as any)?.article ?? (art as any)?.articleNumber ?? (art as any)?.title ?? null;
      const operationalRule = this.resolveOperationalRule(art);
      const structured = this.resolveStructuredData(art);
      const structuredFamily = typeof structured.family === "string" && structured.family.trim().length > 0
        ? structured.family.trim()
        : null;

      if (structuredFamily && this.applyStructuredRule(params, structuredFamily, operationalRule, {
        valueType: structured.value_type,
        valueMin: structured.value_min,
        valueMax: structured.value_max,
        valueExact: structured.value_exact,
        unit: structured.unit,
        condition: structured.condition,
        exception: structured.exception,
        label: String((art as any)?.title ?? (art as any)?.section ?? structured.topic ?? structuredFamily),
      })) {
        continue;
      }

      const artNum = this.resolveArticleNumber(rawArticle, art, operationalRule);
      
      // Article 6: Position by roads
      if (artNum === "6") {
        const setback = this.pickLegacySetbackValue(operationalRule, "public");
        if (setback != null) this.pushUniqueNumber(params.road_setback, setback);
      }
      // Article 7: Side boundaries
      if (artNum === "7") {
        const setback = this.pickLegacySetbackValue(operationalRule, "boundary");
        if (setback != null) this.pushUniqueNumber(params.boundary_setback, setback);
      }
      // Article 8: Internal spacing
      if (artNum === "8") {
        const spacing = this.pickLegacySetbackValue(operationalRule, "spacing");
        if (spacing != null) this.pushUniqueNumber(params.internal_spacing, spacing);
      }
      // Article 9: Footprint
      if (artNum === "9") {
        const footprint = this.pickLegacyFootprintValue(operationalRule);
        if (footprint != null) this.pushUniqueNumber(params.max_footprint, footprint);
      }
      // Article 10: Height
      if (artNum === "10") {
        const height = this.pickLegacyHeightValue(operationalRule);
        if (height != null) this.pushUniqueNumber(params.max_height, height);
      }
      // Article 12: Parking
      if (artNum === "12") {
        if (operationalRule) this.pushUniqueText(params.parking_requirements, operationalRule);
      }
      // Article 13: Greenery
      if (artNum === "13") {
        const greenRatio = this.pickLegacyGreenSpaceRatio(operationalRule);
        if (greenRatio != null) this.pushUniqueNumber(params.green_space_ratio, greenRatio);
        if (operationalRule) this.pushUniqueText(params.landscaping_requirements, operationalRule);
      }
    }

    return this.applyRegulatoryOverrides(params, overlays);
  }

  static async normalizeUrbanRules(rules: StructuredUrbanRuleLike[], overlays: any[] = []): Promise<CalculationParameters> {
    logger.info(`[Normalization] Normalizing ${rules.length} structured urban rules with ${overlays.length} overlays...`);

    const params = this.createEmptyParameters();

    for (const rule of rules) {
      const family = typeof rule.ruleFamily === "string" && rule.ruleFamily.trim().length > 0
        ? rule.ruleFamily.trim()
        : null;
      if (!family) continue;

      const rawText = String(rule.ruleTextRaw ?? rule.ruleSummary ?? "").trim();
      const applied = this.applyStructuredRule(params, family, rawText, {
        valueType: rule.ruleValueType,
        valueMin: rule.ruleValueMin,
        valueMax: rule.ruleValueMax,
        valueExact: rule.ruleValueExact,
        unit: rule.ruleUnit,
        condition: rule.ruleCondition,
        exception: rule.ruleException,
        label: String(rule.ruleLabel ?? rule.ruleTopic ?? family),
      });

      if (!applied && rawText.length > 0) {
        if (family === "parking") {
          this.pushUniqueText(params.parking_requirements, rawText);
        } else if (family === "green_space") {
          this.pushUniqueText(params.landscaping_requirements, rawText);
        }
      }
    }

    return this.applyRegulatoryOverrides(params, overlays);
  }

  static mergeCalculationParameters(primary: CalculationParameters, fallback: CalculationParameters): CalculationParameters {
    return {
      road_setback: primary.road_setback.length > 0 ? primary.road_setback : fallback.road_setback,
      boundary_setback: primary.boundary_setback.length > 0 ? primary.boundary_setback : fallback.boundary_setback,
      internal_spacing: primary.internal_spacing.length > 0 ? primary.internal_spacing : fallback.internal_spacing,
      max_footprint: primary.max_footprint.length > 0 ? primary.max_footprint : fallback.max_footprint,
      max_height: primary.max_height.length > 0 ? primary.max_height : fallback.max_height,
      green_space_ratio: primary.green_space_ratio.length > 0 ? primary.green_space_ratio : fallback.green_space_ratio,
      parking_requirements: primary.parking_requirements.length > 0 ? primary.parking_requirements : fallback.parking_requirements,
      landscaping_requirements: primary.landscaping_requirements.length > 0 ? primary.landscaping_requirements : fallback.landscaping_requirements,
      special_conditions: Array.from(new Set([...primary.special_conditions, ...fallback.special_conditions])),
    };
  }

  private static resolveOperationalRule(article: PluRule | Record<string, unknown>): string {
    const candidates = [
      (article as any)?.operational_rule,
      (article as any)?.rule,
      (article as any)?.sourceText,
      (article as any)?.summary,
      (article as any)?.interpretation,
      (article as any)?.impactText,
    ];
    const firstText = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
    return typeof firstText === "string" ? firstText : "";
  }

  private static resolveStructuredData(article: PluRule | Record<string, unknown>): StructuredRuleData {
    const raw = (article as any)?.structuredData;
    if (!raw || typeof raw !== "object") return {};
    return raw as StructuredRuleData;
  }

  private static resolveArticleNumber(rawArticle: unknown, article: PluRule | Record<string, unknown>, operationalRule: string): string {
    const explicit = rawArticle == null ? "" : String(rawArticle).replace(/[^0-9]/g, "");
    if (explicit && explicit !== "0") return explicit;

    const title = String((article as any)?.title ?? (article as any)?.section ?? "").toLowerCase();
    const fullText = `${title} ${operationalRule}`.toLowerCase();

    if (fullText.includes("stationnement")) return "12";
    if (fullText.includes("espace vert") || fullText.includes("plantation") || fullText.includes("pleine terre")) return "13";
    if (fullText.includes("hauteur")) return "10";
    if (fullText.includes("emprise") || fullText.includes("ces") || fullText.includes("coefficient d'emprise")) return "9";
    if (fullText.includes("limite séparative") || fullText.includes("limites séparatives")) return "7";
    if (fullText.includes("voie") || fullText.includes("voirie") || fullText.includes("recul")) return "6";
    if (fullText.includes("réseau") || fullText.includes("reseau")) return "4";
    if (fullText.includes("desserte")) return "3";

    return "";
  }

  private static applyStructuredRule(
    params: CalculationParameters,
    family: string,
    text: string,
    structured: {
      valueType?: string | null;
      valueMin?: number | null;
      valueMax?: number | null;
      valueExact?: number | null;
      unit?: string | null;
      condition?: string | null;
      exception?: string | null;
      label?: string | null;
    },
  ): boolean {
    let applied = false;

    switch (family) {
      case "setback_public": {
        const setback = this.pickStructuredSetbackValue(structured, text, "public");
        if (setback != null) {
          this.pushUniqueNumber(params.road_setback, setback);
          applied = true;
        }
        break;
      }
      case "setback_side":
      case "setback_rear": {
        const setback = this.pickStructuredSetbackValue(structured, text, "boundary");
        if (setback != null) {
          this.pushUniqueNumber(params.boundary_setback, setback);
          applied = true;
        }
        break;
      }
      case "setback_between_buildings": {
        const spacing = this.pickStructuredSetbackValue(structured, text, "spacing");
        if (spacing != null) {
          this.pushUniqueNumber(params.internal_spacing, spacing);
          applied = true;
        }
        break;
      }
      case "footprint": {
        const footprint = this.pickStructuredFootprintValue(structured, text);
        if (footprint != null) {
          this.pushUniqueNumber(params.max_footprint, footprint);
          applied = true;
        }
        break;
      }
      case "height": {
        const height = this.pickStructuredHeightValue(structured, text);
        if (height != null) {
          this.pushUniqueNumber(params.max_height, height);
          applied = true;
        }
        break;
      }
      case "parking": {
        this.pushUniqueText(params.parking_requirements, this.pickRuleTextSummary(structured.label, text));
        applied = true;
        break;
      }
      case "green_space": {
        const ratio = this.pickStructuredGreenSpaceRatio(structured, text);
        if (ratio != null) {
          this.pushUniqueNumber(params.green_space_ratio, ratio);
          applied = true;
        }
        this.pushUniqueText(params.landscaping_requirements, this.pickGreenSpaceSummary(structured, text, ratio));
        applied = true;
        break;
      }
      default:
        break;
    }

    if (structured.condition) {
      this.pushUniqueText(params.special_conditions, `${structured.label || family} — condition : ${structured.condition}`);
    }
    if (structured.exception) {
      this.pushUniqueText(params.special_conditions, `${structured.label || family} — exception : ${structured.exception}`);
    }

    return applied;
  }

  private static applyRegulatoryOverrides(params: CalculationParameters, overlays: any[] = []): CalculationParameters {
    for (const overlay of overlays) {
      logger.info(`[Normalization] Applying override from ${overlay.source_name || "Overlay"}`);
      if (overlay.target_item === "height" && overlay.max_value) {
        params.max_height = params.max_height.map((h) => Math.min(h, overlay.max_value));
        this.pushUniqueText(params.special_conditions, `Override Hauteur: ${overlay.reason || "Contrainte patrimoniale"}`);
      }
      if (overlay.target_item === "footprint" && overlay.max_value) {
        params.max_footprint = params.max_footprint.map((f) => Math.min(f, overlay.max_value));
        this.pushUniqueText(params.special_conditions, `Override Emprise: ${overlay.reason || "Contrainte environnementale"}`);
      }
    }

    return params;
  }

  private static pickStructuredSetbackValue(
    structured: {
      valueType?: string | null;
      valueMin?: number | null;
      valueMax?: number | null;
      valueExact?: number | null;
      unit?: string | null;
    },
    text: string,
    mode: "public" | "boundary" | "spacing",
  ): number | null {
    const exact = this.normalizeValueUnit(structured.valueExact, structured.unit);
    const min = this.normalizeValueUnit(structured.valueMin, structured.unit);
    const max = this.normalizeValueUnit(structured.valueMax, structured.unit);

    if (exact != null) return exact;
    if (min != null && max != null) return Math.max(min, max);
    if (min != null) return min;
    if (max != null) return max;

    const extracted = this.extractDistanceValues(text);
    if (extracted.length > 0) return Math.max(...extracted);

    if (mode === "public" && /(?:à l['’]alignement|en alignement|alignement obligatoire|sans recul)/i.test(text)) {
      return 0;
    }
    if (mode === "boundary" && /(?:en limite s[ée]parative|sur limite s[ée]parative|implantation en limite|en mitoyennet[eé])/i.test(text)) {
      return 0;
    }

    return null;
  }

  private static pickStructuredFootprintValue(
    structured: {
      valueType?: string | null;
      valueMin?: number | null;
      valueMax?: number | null;
      valueExact?: number | null;
      unit?: string | null;
    },
    text: string,
  ): number | null {
    if (this.isLinearDistanceUnit(structured.unit)) {
      return this.pickLegacyFootprintValue(text);
    }

    const exact = this.normalizeFootprintOrRatio(structured.valueExact, structured.unit);
    const max = this.normalizeFootprintOrRatio(structured.valueMax, structured.unit);
    const min = this.normalizeFootprintOrRatio(structured.valueMin, structured.unit);

    if (exact != null) return exact;
    if (max != null) return max;
    if ((structured.valueType || "").toLowerCase() === "range" && min != null && max != null) {
      return Math.min(min, max);
    }

    return this.pickLegacyFootprintValue(text);
  }

  private static pickStructuredHeightValue(
    structured: {
      valueMin?: number | null;
      valueMax?: number | null;
      valueExact?: number | null;
      unit?: string | null;
    },
    text: string,
  ): number | null {
    if (String(structured.unit || "").trim() === "%") return this.pickLegacyHeightValue(text);

    const exact = this.normalizeValueUnit(structured.valueExact, structured.unit);
    const max = this.normalizeValueUnit(structured.valueMax, structured.unit);
    const min = this.normalizeValueUnit(structured.valueMin, structured.unit);

    if (exact != null && this.isPlausibleBuildingHeight(exact, text)) return exact;
    if (max != null && this.isPlausibleBuildingHeight(max, text)) return max;
    if (min != null && max != null) {
      const upper = Math.max(min, max);
      if (this.isPlausibleBuildingHeight(upper, text)) return upper;
    }

    return this.pickLegacyHeightValue(text);
  }

  private static pickStructuredGreenSpaceRatio(
    structured: {
      valueMin?: number | null;
      valueMax?: number | null;
      valueExact?: number | null;
      unit?: string | null;
    },
    text: string,
  ): number | null {
    const exact = this.normalizePercentageRatio(structured.valueExact, structured.unit);
    const min = this.normalizePercentageRatio(structured.valueMin, structured.unit);
    const max = this.normalizePercentageRatio(structured.valueMax, structured.unit);

    if (exact != null) return exact;
    if (min != null && max != null) return Math.max(min, max);
    if (min != null) return min;
    if (max != null) return max;

    return this.pickLegacyGreenSpaceRatio(text);
  }

  private static pickLegacySetbackValue(text?: string | null, mode: "public" | "boundary" | "spacing" = "public"): number | null {
    const raw = text || "";
    const values = this.extractDistanceValues(raw);
    if (values.length > 0) return Math.max(...values);

    if (mode === "public" && /(?:à l['’]alignement|en alignement|alignement obligatoire|sans recul)/i.test(raw)) {
      return 0;
    }
    if (mode === "boundary" && /(?:en limite s[ée]parative|sur limite s[ée]parative|implantation en limite|en mitoyennet[eé])/i.test(raw)) {
      return 0;
    }

    return null;
  }

  private static pickLegacyFootprintValue(text?: string | null): number | null {
    const values = this.extractFootprintValues(text);
    if (values.length === 0) return null;
    const positiveValues = values.filter((value) => value > 0);
    if (positiveValues.length === 0) return null;
    return Math.min(...positiveValues);
  }

  private static pickLegacyHeightValue(text?: string | null): number | null {
    const values = this.extractDistanceValues(text)
      .filter((value) => this.isPlausibleBuildingHeight(value, text || ""));
    if (values.length === 0) return null;
    return Math.max(...values);
  }

  private static pickLegacyGreenSpaceRatio(text?: string | null): number | null {
    if (!text) return null;
    const percentageMatches = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g));
    if (percentageMatches.length === 0) return null;
    const values = percentageMatches
      .map((match) => this.normalizePercentageRatio(parseFloat(match[1].replace(",", ".")), "%"))
      .filter((value): value is number => value != null);
    if (values.length === 0) return null;
    return Math.max(...values);
  }

  private static pickGreenSpaceSummary(
    structured: { label?: string | null },
    text: string,
    ratio: number | null,
  ): string {
    if (ratio != null) return `Pleine terre / espaces verts : minimum ${Math.round(ratio * 100)}%.`;
    if (text.trim().length > 0) return this.pickRuleTextSummary(structured.label, text);
    return structured.label || "Espaces verts & pleine terre";
  }

  private static pickRuleTextSummary(label: string | null | undefined, text: string): string {
    const normalized = text
      .replace(/\*\*/g, "")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length === 0) return String(label || "").trim();
    return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
  }

  private static normalizeValueUnit(value: number | null | undefined, unit: string | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    if ((unit || "").trim() === "%") return value;
    return value;
  }

  private static normalizeFootprintOrRatio(value: number | null | undefined, unit: string | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    if ((unit || "").trim() === "%") {
      return value > 1 ? value / 100 : value;
    }
    return value;
  }

  private static normalizePercentageRatio(value: number | null | undefined, unit: string | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    if ((unit || "").trim() === "%" || value > 1) {
      return value > 1 ? value / 100 : value;
    }
    return value >= 0 && value <= 1 ? value : null;
  }

  private static pushUniqueNumber(target: number[], value: number | null) {
    if (value == null || !Number.isFinite(value)) return;
    if (!target.some((current) => Math.abs(current - value) < 0.001)) {
      target.push(value);
    }
  }

  private static pushUniqueText(target: string[], value: string | null | undefined) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized.length === 0) return;
    if (!target.includes(normalized)) {
      target.push(normalized);
    }
  }

  private static extractNumbers(text?: string | null): number[] {
    if (!text) return [];
    const matches = text.match(/\d+([.,]\d+)?/g);
    if (!matches) return [];
    return matches.map(m => parseFloat(m.replace(",", ".")));
  }

  private static extractDistanceValues(text?: string | null): number[] {
    if (!text) return [];
    const matches = Array.from(
      text.matchAll(
        /(?:\b(?:recul|retrait|distance|implantation|au moins|minimum|min\.)[^.\n:;]{0,40}?)?(\d+(?:[.,]\d+)?)\s*(?:m(?:\b|[èe]tre(?:s)?\b))/gi,
      ),
    );
    if (matches.length === 0) return [];
    return matches
      .map((match) => Number.parseFloat(String(match[1] || "").replace(",", ".")))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }

  private static extractFootprintValues(text?: string | null): number[] {
    if (!text) return [];
    const values = this.extractNumbers(text);
    const normalized = text.toLowerCase();
    const isPercentageRule = normalized.includes("%")
      || normalized.includes("pourcent")
      || normalized.includes("ces")
      || normalized.includes("coefficient d'emprise");

    if (isPercentageRule) {
      return Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:%|pour\s*cent)/gi))
        .map((match) => Number.parseFloat(String(match[1] || "").replace(",", ".")))
        .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100)
        .map((value) => (value > 1 ? value / 100 : value));
    }

    if (/\bemprise\b/.test(normalized) && /\b(?:m²|m2|mètres carrés|metres carres)\b/.test(normalized)) {
      return values.filter((value) => Number.isFinite(value) && value > 0 && value < 100000);
    }

    return [];
  }

  private static isLinearDistanceUnit(unit: string | null | undefined) {
    const normalized = String(unit || "").trim().toLowerCase();
    return normalized === "m" || normalized === "metre" || normalized === "mètre" || normalized === "metres" || normalized === "mètres";
  }

  private static isPlausibleBuildingHeight(value: number, text: string) {
    if (!Number.isFinite(value)) return false;
    if (value <= 0 || value > 80) return false;
    if (value >= 1900 && value <= 2099) return false;
    const normalized = text.toLowerCase();
    if (/\bngf\b|altitude|cote altim[eé]trique/.test(normalized)) return false;
    if (
      /cl[oô]ture|muret|mur de cl[oô]ture|haie|portail|portillon|garde[- ]corps/.test(normalized)
      && !/construction(?:s)?|b[aâ]timent(?:s)?|fa[iî]tage|[ée]gout|acrot[eè]re|toiture/.test(normalized)
    ) {
      return false;
    }
    return true;
  }
}
