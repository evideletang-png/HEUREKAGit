import { PluExtraction } from "../schemas/extraction.js";

/**
 * Ideal PLU Extraction (Clear, structured rules)
 */
export const PLU_IDEAL: PluExtraction = {
  zone_code: "UA",
  zone_label: "Urbain Ancien",
  articles: [
    {
      article: "Article 7",
      title: "Implantation par rapport aux limites séparatives",
      source_text: "Tout bâtiment doit être implanté à une distance au moins égale à la moitié de sa hauteur, et jamais inférieure à 3 mètres.",
      operational_rule: "Distance minimale = Max(3m, Hauteur/2)",
      constraints: [
        { category: "Setback", operator: ">=", value: 3 },
        { category: "Setback_H", operator: ">=", value: 0.5 }
      ],
      exceptions: []
    }
  ],
  confidence: {
    score: 1.0,
    level: "high",
    review_status: "auto_ok",
    reason: "Clear legal text matching standard extraction patterns.",
    ambiguities: [],
    missing_critical_data: []
  },
  sources: [
    {
      document_id: "550e8400-e29b-41d4-a716-446655440001",
      page_number: 14,
      raw_snippet: "Article 7 - Implantation... distance au moins égale à la moitié de sa hauteur",
      relevance_score: 1.0
    }
  ]
};

/**
 * Ambiguous PLU Rule (Vague phrasing, architectural criteria)
 */
export const PLU_AMBIGUOUS: PluExtraction = {
  zone_code: "AV",
  zone_label: "Agricole Viticole",
  articles: [
    {
      article: "Article 11",
      title: "Aspect extérieur",
      source_text: "Les constructions doivent s'insérer harmonieusement dans le paysage avoisinant sans rompre l'unité architecturale des bourgs.",
      operational_rule: "Coherence with neighbors required. Subjective criteria.",
      constraints: [],
      exceptions: []
    }
  ],
  confidence: {
    score: 0.65,
    level: "medium",
    review_status: "review_recommended",
    reason: "Rule contains subjective qualitative terms ('harmonieux', 'unité') that cannot be resolved deterministically.",
    ambiguities: ["Critère d'harmonie architecturale subjectif"],
    missing_critical_data: []
  },
  sources: [
    {
      document_id: "550e8400-e29b-41d4-a716-446655440001",
      page_number: 22,
      raw_snippet: "Article 11 - Aspect... s'insérer harmonieusement dans le paysage",
      relevance_score: 1.0
    }
  ]
};

/**
 * Exception-Heavy PLU Rule (Numerous sub-cases)
 */
export const PLU_EXCEPTION_HEAVY: PluExtraction = {
  zone_code: "UC",
  articles: [
    {
      article: "Article 10",
      title: "Hauteur",
      source_text: "La hauteur maximale est de 9 mètres au faîtage. Toutefois, pour les pignons aveugles en limite de propriété, elle peut être portée à 11 mètres, sauf si la parcelle voisine est en zone Naturelle.",
      operational_rule: "H_max = 9m (default), 11m (pignon aveugle, except neighbor in zone N)",
      constraints: [
        { category: "Height", operator: "<=", value: 9 }
      ],
      exceptions: [
        "Pignon aveugle : 11m possible",
        "Interdit si voisin en Zone N : 9m strict"
      ]
    }
  ],
  confidence: {
    score: 0.85,
    level: "high",
    review_status: "review_recommended",
    reason: "Complex exceptions detected. Verification of neighboring zone required.",
    ambiguities: ["Détermination de la zone cadastrale voisine pour appliquer l'exception"],
    missing_critical_data: []
  },
  sources: []
};
