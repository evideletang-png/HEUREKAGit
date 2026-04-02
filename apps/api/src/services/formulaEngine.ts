import { create, all } from 'mathjs';
import { logger } from "../utils/logger.js";

const math = create(all);

export interface ProjectVariables {
  surface_habitable: number;
  surface_taxable: number;
  surface_taxable_creee: number;
  surface_taxable_existante: number;
  type_projet: 'maison' | 'collectif';
  cout_construction: number;
  valeur_projet?: number; // Valeur manuelle utilisateur
  nombre_stationnements: number;
  surface_piscine: number;
  [key: string]: any;
}

export interface MairieParameters {
  fiscalite_locale: {
    taux_taxe_amenagement_commune: number;
    taux_taxe_amenagement_departement: number;
    taux_taxe_fonciere: number;
    taux_teom: number;
    taux_rap: number;
  };
  valeurs_forfaitaires: {
    valeur_forfaitaire_ta_m2: number;
    valeur_forfaitaire_piscine_m2: number;
    valeur_forfaitaire_stationnement: number;
  };
  marché_local: {
    prix_m2: number;
    rendement_locatif_maison: number;
    rendement_locatif_collectif: number;
  };
  abattements: {
    residence_principale: number;
    surface_abattement: number;
  };
  [key: string]: any;
}

export interface FormulaOutput {
  resultats: Record<string, number | string>;
  detail_calculs: Array<{
    nom: string;
    formule: string;
    valeurs: Record<string, number>;
    resultat: number | string;
  }>;
  parametres_utilises: Record<string, any>;
  hypotheses: string[];
  errors?: string[];
  niveau_confiance: "Faible" | "Moyen" | "Élevé";
}

/**
 * Core engine to evaluate dynamic formulas based on Mairie parameters and project variables.
 */
export function evaluateFinanceModule(
  projectVars: ProjectVariables,
  mairieParams: MairieParameters,
  globalFormulas: Record<string, string>
): FormulaOutput {
  const context: Record<string, any> = { ...projectVars };
  const hypotheses: string[] = [];
  const errors: string[] = [];
  const detail_calculs: FormulaOutput['detail_calculs'] = [];
  const resultats: Record<string, number | string> = {};

  // 1. Flatten Mairie Parameters into context for easy access in formulas
  // e.g., mairieParams.fiscalite_locale.taux_taxe_amenagement_commune -> taux_taxe_amenagement_commune
  const flatten = (obj: any) => {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        flatten(obj[key]);
      } else {
        context[key] = obj[key];
      }
    }
  };
  flatten(mairieParams);

  // 2. Add specific logic for project type derived values
  if (projectVars.type_projet === 'maison') {
    context.prix_m2 = mairieParams.marché_local.prix_m2 || 2500;
    context.rendement = mairieParams.marché_local.rendement_locatif_maison || 0.04;
  } else {
    context.prix_m2 = mairieParams.marché_local.prix_m2 || 3000;
    context.rendement = mairieParams.marché_local.rendement_locatif_collectif || 0.05;
  }

  // 3. Sequential evaluation of Super Admin formulas
  for (const [name, formula] of Object.entries(globalFormulas)) {
    try {
      // Skip empty formulas
      if (!formula || formula.trim() === "") continue;

      // Find which variables are used in the formula for traceability
      const usedVars: Record<string, number> = {};
      const node = math.parse(formula);
      node.traverse((n: any) => {
         if (n.isSymbolNode && context[n.name] !== undefined) {
           usedVars[n.name] = context[n.name];
         }
      });

      const res = math.evaluate(formula, context);
      const roundedRes = typeof res === 'number' ? Math.round(res * 100) / 100 : res;
      
      context[name] = roundedRes;
      resultats[name] = roundedRes;

      detail_calculs.push({
        nom: name,
        formule: formula,
        valeurs: usedVars,
        resultat: roundedRes
      });
    } catch (error) {
      // Log math/variable errors but don't show them as "hypotheses" unless critical
      logger.error(`[FormulaEngine] Error evaluating ${name}: ${formula}`);
      errors.push(`${name} failed: ${formula}`);
      resultats[name] = 0; // Default to 0 for downstream consistency
    }
  }

  // 4. Determine confidence level
  const totalVars = Object.keys(projectVars).length;
  const missingVars = Object.values(projectVars).filter(v => v === 0 || v === "").length;
  const confidence: FormulaOutput['niveau_confiance'] = missingVars > totalVars / 2 ? "Faible" : missingVars > 0 ? "Moyen" : "Élevé";

  return {
    resultats,
    detail_calculs,
    parametres_utilises: mairieParams,
    hypotheses,
    errors, // New field for internal tracking if needed
    niveau_confiance: confidence
  };
}
