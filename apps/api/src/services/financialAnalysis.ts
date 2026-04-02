import { logger } from "../utils/logger.js";
import { evaluateFinanceModule, ProjectVariables, MairieParameters, FormulaOutput } from "./formulaEngine.js";

/**
 * Focus: Regulatory Taxes (Taxe d'Aménagement, RAP, etc.)
 * Removed: Profitability, Yields, Market Price ROI.
 */
export const DEFAULT_FORMULAS: Record<string, string> = {
  "taxe_amenagement_commune": "surface_taxable_creee * valeur_forfaitaire_ta_m2 * taux_taxe_amenagement_commune",
  "taxe_amenagement_dept": "surface_taxable_creee * valeur_forfaitaire_ta_m2 * taux_taxe_amenagement_departement",
  "redevance_archeologie_preventive": "surface_taxable_creee * valeur_forfaitaire_ta_m2 * taux_rap",
  "taxe_amenagement_totale": "taxe_amenagement_commune + taxe_amenagement_dept + redevance_archeologie_preventive",
  "estimation_taxe_fonciere_annuelle": "(surface_taxable_creee + surface_taxable_existante) * 45 * 0.5 * taux_taxe_fonciere" // Base forfaitaire estimée
};

/**
 * Maps DB settings to the MairieParameters structure.
 */
export function mapSettingsToParams(settings: any): MairieParameters {
  return {
    fiscalite_locale: {
      taux_taxe_amenagement_commune: settings?.taRateCommunal ?? 0.05,
      taux_taxe_amenagement_departement: settings?.taRateDept ?? 0.025,
      taux_taxe_fonciere: settings?.taxeFonciereRate ?? 0.40,
      taux_teom: settings?.teomRate ?? 0.12,
      taux_rap: settings?.rapRate ?? 0.004,
    },
    valeurs_forfaitaires: {
      valeur_forfaitaire_ta_m2: settings?.valeurForfaitaireTA ?? 900,
      valeur_forfaitaire_piscine_m2: settings?.valeurForfaitairePiscine ?? 250,
      valeur_forfaitaire_stationnement: settings?.valeurForfaitaireStationnement ?? 2000,
    },
    abattements: {
      residence_principale: settings?.abattementRP ?? 0.5,
      surface_abattement: settings?.surfaceAbattement ?? 100,
    },
    // We keep these for formula context but they are no longer the primary focus
    marché_local: {
      prix_m2: settings?.prixM2Maison ?? 2500,
      rendement_locatif_maison: 0, 
      rendement_locatif_collectif: 0,
    }
  };
}

/**
 * Main entry point for tax calculations.
 * Prioritizes Mairie-specific formulas if provided.
 */
export function calculateFinancials(
  projectVars: ProjectVariables,
  mairieParams: MairieParameters,
  municipalityFormulas?: Record<string, string>
): FormulaOutput {
  const activeFormulas = (municipalityFormulas && Object.keys(municipalityFormulas).length > 0) 
    ? municipalityFormulas 
    : DEFAULT_FORMULAS;
    
  logger.info(`[Fiscal Analysis] Calculating taxes for project on ${projectVars.surface_taxable_creee}m2 created.`);
  return evaluateFinanceModule(projectVars, mairieParams, activeFormulas);
}
