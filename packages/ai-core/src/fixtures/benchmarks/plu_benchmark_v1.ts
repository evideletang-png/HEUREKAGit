import { BenchmarkTestCase } from "../../schemas/eval.js";

/**
 * PLU_BENCHMARK_V1
 * A synthetic-realistic dataset for evaluating HEUREKA's accuracy.
 * Uses anonymized context and "Gold Standard" expected outcomes.
 */
export const PLU_BENCHMARK_V1: BenchmarkTestCase[] = [
  {
    id: "CASE_H_UA_10_OK",
    insee: "94000",
    dossier_type: "PCMI",
    input_text: "Projet de construction d'une maison individuelle. Hauteur totale en limite séparative prévue à 7.50 mètres.",
    expected_retrieval: {
      query: "Hauteur maximale des constructions",
      matching_article_ids: ["10"],
      relevant_content_regex: "hauteur.*maximale",
      forbidden_pool_ids: ["75000-PLU-ACTIVE", "69000-PLU-ACTIVE"] 
    },
    expected_extraction: [
      { field_name: "hauteur_maximale", expected_value: 7.5, is_uncertain: false }
    ],
    expected_compliance: {
      expected_decision: "favorable",
      should_require_manual_review: false
    }
  },
  {
    id: "CASE_P_UA_12_KO",
    insee: "94000",
    dossier_type: "PCMI",
    input_text: "Extension de 40m2 habitables. Aucune place de stationnement supplémentaire n'est créée.",
    expected_retrieval: {
      query: "Stationnement des véhicules",
      matching_article_ids: ["12"],
      relevant_content_regex: "stationnement.*véhicules",
      forbidden_pool_ids: []
    },
    expected_extraction: [
      { field_name: "places_stationnement", expected_value: 0, is_uncertain: false }
    ],
    expected_compliance: {
      expected_decision: "defavorable",
      expected_blocking_points: ["Insuffisance de places de stationnement"],
      should_require_manual_review: true
    }
  },
  {
    id: "CASE_CES_UNCERTAIN",
    insee: "94000",
    dossier_type: "PCMI",
    input_text: "Mise en place d'une véranda de 15m2. L'emprise au sol totale n'est pas spécifiée dans la notice.",
    expected_retrieval: {
      query: "Emprise au sol des constructions",
      matching_article_ids: ["9"],
      relevant_content_regex: "emprise.*sol",
      forbidden_pool_ids: []
    },
    expected_extraction: [
      { field_name: "emprise_au_sol", expected_value: null, is_uncertain: true }
    ],
    expected_compliance: {
      expected_decision: "incertain",
      should_require_manual_review: true
    }
  },
  {
    id: "CASE_CONTAMINATION_CHECK",
    insee: "75015",
    dossier_type: "PCMI",
    input_text: "Consultation PLU Paris 15ème pour hauteur.",
    expected_retrieval: {
      query: "Hauteur",
      matching_article_ids: ["UG.10"],
      forbidden_pool_ids: ["94000-PLU-ACTIVE"] 
    }
  }
];
