export interface Issue {
  article: string;
  msg: string;
  severity: "blocking" | "major" | "minor";
}

export interface ScoringResult {
  score: number;
  issues: Issue[];
  severityReport: any;
}

/**
 * Hybrid Scoring Engine.
 * Combines LLM semantic analysis with deterministic backend checks.
 */
export function calculateGlobalScore(analysisData: any, projectDataList: any[]): ScoringResult {
  console.log(`[ScoringService] Calculating compliance score...`);

  let score = 100;
  const issues: Issue[] = [];

  // 1. PROJECT DATA AGGREGATION
  // Flattening extracted data for comparison
  const project = projectDataList.reduce((acc, curr) => ({ ...acc, ...curr }), {});

  // 2. DETERMINISTIC HARD RULES (Math-based)
  // These are 100% reliable and skip LLM "fuzziness"
  
  // Rule: Surface Threshold (Example: max 200m2 in some simplified context)
  if (project.requested_surface_m2 > 1000) {
    issues.push({ 
      article: "General", 
      msg: `Projet hors échelle (> 1000m²). Vérification manuelle requise.`, 
      severity: "major" 
    });
    score -= 30;
  }

  // Rule: Footprint (Emprise au sol)
  if (project.requested_emprise_m2 > 500) {
    issues.push({ 
      article: "Emprise", 
      msg: `L'emprise au sol dépasse 500m².`, 
      severity: "minor" 
    });
    score -= 10;
  }

  // 3. AI-DERIVED SÉMANTIC ANALYSIS (Interpretative)
  // Analysis from LLM is used to identify complex issues
  if (Array.isArray(analysisData.issues)) {
    analysisData.issues.forEach((issue: any) => {
      const severity = issue.severity === "bloquante" ? "blocking" : "major";
      issues.push({
        article: issue.article || "Inconnu",
        msg: issue.msg || issue.explanation,
        severity: severity,
      });

      if (severity === "blocking") score = 0; // Immediate failure
      else if (severity === "major") score -= 20;
    });
  }

  // Rule: Inconsistency Detection (Cross-Document)
  // If surfaces differ significantly between docs (simulated check)
  // In production, this would compare specific fields from different UploadedDocuments

  const finalScore = Math.max(0, score);

  return {
    score: finalScore,
    issues: issues,
    severityReport: {
      blockingCount: issues.filter(i => i.severity === "blocking").length,
      majorCount: issues.filter(i => i.severity === "major").length,
      minorCount: issues.filter(i => i.severity === "minor").length,
    }
  };
}
