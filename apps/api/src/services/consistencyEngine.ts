/**
 * Consistency Engine Service.
 * Detects discrepancies and inconsistencies between different documents in a dossier.
 */

export interface ConsistencyIssue {
  doc1: string;
  doc2: string;
  field: string;
  value1: any;
  value2: any;
  severity: "warning" | "critical";
  message: string;
}

export function checkCrossDocumentConsistency(currentDoc: any, dossierContext: any[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const currentCode = currentDoc.document_code;
  const currentData = currentDoc.extracted_data || {};

  for (const otherDoc of dossierContext) {
    const otherCode = otherDoc.document_code;
    const otherData = otherDoc.extracted_data || {};

    // 1. Footprint (PCMI2 vs PCMI4)
    if (currentCode === "PCMI2" && otherCode === "PCMI4") {
       compareMeasurements(currentData.footprint_m2, otherData.emprise_au_sol_m2, "footprint", "PCMI2", "PCMI4", issues);
    }
    if (currentCode === "PCMI4" && otherCode === "PCMI2") {
       compareMeasurements(currentData.emprise_au_sol_m2, otherData.footprint_m2, "footprint", "PCMI4", "PCMI2", issues);
    }

    // 2. Height (PCMI3 vs PCMI5 vs PCMI4)
    if (currentCode === "PCMI3" && otherCode === "PCMI5") {
       compareMeasurements(currentData.building_height_m, otherData.Max_heights, "height", "PCMI3", "PCMI5", issues);
    }
  }

  return issues;
}

function compareMeasurements(val1: any, val2: any, field: string, doc1: string, doc2: string, issues: ConsistencyIssue[]) {
  if (val1 == null || val2 == null) return;
  
  const num1 = parseFloat(String(val1));
  const num2 = parseFloat(String(val2));
  
  if (isNaN(num1) || isNaN(num2)) return;

  // Tolerance of 5% or 0.5m
  const diff = Math.abs(num1 - num2);
  const percentDiff = (diff / Math.max(num1, num2)) * 100;

  if (diff > 0.5 && percentDiff > 5) {
    issues.push({
      doc1,
      doc2,
      field,
      value1: num1,
      value2: num2,
      severity: diff > 2 ? "critical" : "warning",
      message: `Incohérence détectée sur le champ '${field}' entre ${doc1} (${num1}) et ${doc2} (${num2}). Différence de ${diff.toFixed(2)}.`
    });
  }
}
