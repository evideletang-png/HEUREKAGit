import { OFFICIAL_PIECES } from "./officialPieces.registry";
import type { DossierType, OfficialPiece, ProjectContext, ResolvedPiece, TriggerSource } from "./officialPieces.types";
import { isTriggerMatched, triggerSourceLabel } from "./pieceTriggers";

function codeSortValue(code: string) {
  const match = code.match(/^([A-Z]+)(\d+)(?:-(\d+))?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) * 10 + Number(match[3] || 0);
}

function sortOfficialPieces(a: ResolvedPiece, b: ResolvedPiece) {
  const stateRank = { required: 0, potentially_required: 1, not_applicable: 2 };
  const byState = stateRank[a.requirementState] - stateRank[b.requirementState];
  if (byState !== 0) return byState;
  return codeSortValue(a.code) - codeSortValue(b.code);
}

function confidenceFor(piece: OfficialPiece, context: ProjectContext, matched: string[], unknown: string[]) {
  if (piece.status === "mandatory") return 1;
  if (matched.length > 0) return context.locationContext.confidence ?? 0.82;
  if (unknown.length > 0) return Math.min(0.62, context.locationContext.confidence ?? 0.5);
  return undefined;
}

function explanationFor(piece: OfficialPiece, matched: string[], unknown: string[]) {
  if (piece.status === "mandatory") return "Pièce obligatoire prévue par le bordereau officiel du CERFA.";
  if (matched.length > 0) return `Condition officielle déclenchée : ${matched.map(triggerSourceLabel).join(", ")}.`;
  if (unknown.length > 0) return `Condition officielle à confirmer : ${unknown.map(triggerSourceLabel).join(", ")}.`;
  return "Condition officielle non applicable au contexte renseigné.";
}

function sourceForTriggers(piece: OfficialPiece, matched: string[], unknown: string[]): TriggerSource[] {
  if (piece.status === "mandatory") return ["always"];
  if (matched.length === 0 && unknown.length === 0) return piece.source;
  return piece.source;
}

function resolvePiece(piece: OfficialPiece, context: ProjectContext): ResolvedPiece {
  if (piece.status === "mandatory") {
    return {
      ...piece,
      requirementState: "required",
      matchedTriggers: ["always"],
      explanation: explanationFor(piece, ["always"], []),
      confidence: 1,
    };
  }

  const matched: string[] = [];
  const unknown: string[] = [];
  for (const trigger of piece.triggers) {
    const result = isTriggerMatched(trigger, context);
    if (result === true) matched.push(trigger);
    if (result === "unknown") unknown.push(trigger);
  }

  const requirementState = matched.length > 0 ? "required" : unknown.length > 0 ? "potentially_required" : "not_applicable";
  return {
    ...piece,
    source: sourceForTriggers(piece, matched, unknown),
    requirementState,
    matchedTriggers: matched.length > 0 ? matched : unknown,
    explanation: explanationFor(piece, matched, unknown),
    confidence: confidenceFor(piece, context, matched, unknown),
  };
}

export function resolveOfficialPieces(context: ProjectContext): ResolvedPiece[] {
  const registry = OFFICIAL_PIECES[context.dossierType] || [];
  const deduped = new Map<string, ResolvedPiece>();

  for (const piece of registry.map((item) => resolvePiece(item, context))) {
    if (piece.requirementState === "not_applicable") continue;
    const existing = deduped.get(piece.code);
    if (!existing) {
      deduped.set(piece.code, piece);
      continue;
    }
    if (existing.requirementState === "potentially_required" && piece.requirementState === "required") deduped.set(piece.code, piece);
  }

  return Array.from(deduped.values()).sort(sortOfficialPieces);
}

export function normalizeOfficialDossierType(value: string | null | undefined): DossierType {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "declaration_prealable" || normalized === "dp") return "DPC";
  if (normalized === "permis_de_construire") return "PC";
  if (normalized === "permis_amenager") return "PA";
  const upper = raw.toUpperCase();
  if (upper === "PCMI" || upper === "PC" || upper === "DPC" || upper === "DPA" || upper === "PA" || upper === "PD") return upper;
  return "DPC";
}
