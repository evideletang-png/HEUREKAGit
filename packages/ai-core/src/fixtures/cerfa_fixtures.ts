import { CerfaExtraction } from "../schemas/extraction.js";

/**
 * Ideal CERFA Extraction (Complete and Clear)
 */
export const CERFA_IDEAL: CerfaExtraction = {
  document_type: "PCMI",
  reference_form: "13406*07",
  applicant: {
    name: "Jean Dupont",
    is_company: false
  },
  project_address: "123 Rue de la Paix, 75002 Paris",
  cadastre: [
    { section: "A", parcel_number: "456" }
  ],
  surfaces: {
    existing_m2: 120,
    created_m2: 45,
    taxable_m2: 165
  },
  requested_height_m: 7.5,
  requested_footprint_m2: 85,
  parking_spaces: 2,
  confidence: {
    score: 0.98,
    level: "high",
    review_status: "auto_ok",
    reason: "All fields extracted from clear high-resolution scan.",
    ambiguities: [],
    missing_critical_data: []
  },
  sources: [
    {
      document_id: "550e8400-e29b-41d4-a716-446655440000",
      file_name: "cerfa_dupont.pdf",
      page_number: 1,
      raw_snippet: "Jean Dupont, domicilié au 123 Rue de la Paix",
      relevance_score: 1.0
    }
  ]
};

/**
 * Noisy CERFA Extraction (OCR errors, ambiguous values)
 */
export const CERFA_NOISY: CerfaExtraction = {
  document_type: "DP",
  reference_form: "13404*07",
  applicant: {
    name: "M. M0RD0R", // OCR error
    is_company: false
  },
  project_address: "45 Av. des Champs-Elyseés",
  cadastre: [],
  surfaces: {
    existing_m2: 100,
    created_m2: null, // Ambiguous notation in scan
    taxable_m2: 100
  },
  requested_height_m: null,
  requested_footprint_m2: 20,
  confidence: {
    score: 0.4,
    level: "low",
    review_status: "manual_required",
    reason: "OCR quality is very low. Hand-written values are illegible.",
    ambiguities: ["Surface créée '20m2?' barbouillée", "Nom demandeur mal reconnu"],
    missing_critical_data: ["cadastre"]
  },
  sources: [
    {
      document_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      file_name: "dp_noisy.jpg",
      page_number: 1,
      raw_snippet: "M. M...R... 45 Av...",
      relevance_score: 0.5
    }
  ]
};

/**
 * Incomplete CERFA (Missing critical fields)
 */
export const CERFA_INCOMPLETE: CerfaExtraction = {
  document_type: "autre",
  reference_form: undefined,
  applicant: undefined,
  project_address: "Adresse inconnue",
  cadastre: [],
  surfaces: {
    existing_m2: null,
    created_m2: null,
    taxable_m2: null
  },
  confidence: {
    score: 0.1,
    level: "low",
    review_status: "manual_required",
    reason: "Document is likely not a CERFA form.",
    ambiguities: ["Structure not matching standard 13406/13404 forms"],
    missing_critical_data: ["applicant", "surfaces", "cadastre"]
  },
  sources: []
};
