export type SourcePriority = {
  field: string;
  priority: string[]; // List of document types in order of priority
};

export type CandidateValue<T> = {
  source: string; // doc type or doc title
  value: T | null;
  confidence: number;
  citation?: {
    documentId: string;
    page: number;
  };
};

export type ResolvedField<T> = {
  field: string;
  value: T | null;
  status: "resolved" | "conflict" | "uncertain";
  confidence: number;
  chosenSource?: string;
  candidates: CandidateValue<T>[];
  overriddenByHuman?: boolean;
};

// Default priorities for urban planning
const DEFAULT_PRIORITIES: Record<string, string[]> = {
  "hauteur": ["plan_coupe", "elevation", "cerfa", "autre"],
  "emprise": ["cadastre", "plan_masse", "cerfa", "autre"],
  "surface": ["cadastre", "cerfa", "plan_masse", "autre"],
  "recul": ["plan_masse", "autre"],
  "destination": ["cerfa", "autre"],
  "cloture": ["elevation", "plan_masse", "autre"]
};

/**
 * Field Resolution Service.
 * Resolves one value from multiple candidates based on document priority.
 */
export function resolveField<T>(
  fieldName: string,
  candidates: CandidateValue<T>[],
  humanOverride?: T
): ResolvedField<T> {
  console.log(`[FieldResolver] Resolving field ${fieldName} with ${candidates.length} candidates...`);

  if (humanOverride !== undefined) {
    return {
      field: fieldName,
      value: humanOverride,
      status: "resolved",
      confidence: 1.0,
      chosenSource: "human_override",
      candidates,
      overriddenByHuman: true
    };
  }

  const priorities = DEFAULT_PRIORITIES[fieldName] || ["cerfa", "plan_masse", "plan_coupe", "autre"];
  
  // Sort candidates by priority
  const sorted = [...candidates].sort((a, b) => {
    const ai = priorities.indexOf(a.source);
    const bi = priorities.indexOf(b.source);
    if (ai === -1 && bi === -1) return b.confidence - a.confidence;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const best = sorted[0];
  
  // Detect conflicts (significant diff between top candidates from different source types)
  let status: "resolved" | "conflict" = "resolved";
  if (sorted.length > 1) {
    const secondBest = sorted[1];
    if (best.value !== secondBest.value && best.source !== secondBest.source) {
       // Deep comparison for numbers
       if (typeof best.value === "number" && typeof secondBest.value === "number") {
          const diff = Math.abs(best.value - secondBest.value);
          if (diff > (best.value * 0.05)) status = "conflict"; // > 5% diff
       } else if (best.value !== secondBest.value) {
          status = "conflict";
       }
    }
  }

  return {
    field: fieldName,
    value: best?.value ?? null,
    status: best ? status : "uncertain",
    confidence: best?.confidence ?? 0,
    chosenSource: best?.source,
    candidates
  };
}

/**
 * Resolves a full object of extracted data.
 */
export function resolveProjectData(
  aggregatedCandidates: Record<string, CandidateValue<any>[]>
): Record<string, { value: any; source: string | undefined; confidence: number; status: string }> {
  const result: any = {};
  for (const [field, candidates] of Object.entries(aggregatedCandidates)) {
    const resolved = resolveField(field, candidates);
    result[field] = {
      value: resolved.value,
      source: resolved.chosenSource,
      confidence: resolved.confidence,
      status: resolved.status
    };
  }
  return result;
}
