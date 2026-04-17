import { loadPrompt } from "./promptLoader.js";

export const REGULATORY_SINGLE_PIPE_PROMPT_KEY = "regulatory_single_pipe_system";
export const REGULATORY_SINGLE_PIPE_TIMEOUT_MS = 45_000;
export const REGULATORY_SINGLE_PIPE_DOCUMENT_MAX_CHARS = 60_000;
export const REGULATORY_SINGLE_PIPE_CORPUS_MAX_CHARS = 45_000;
export const REGULATORY_SINGLE_PIPE_ADJUDICATION_MAX_CHARS = 35_000;

export async function loadRegulatorySinglePipePrompt() {
  return loadPrompt(REGULATORY_SINGLE_PIPE_PROMPT_KEY);
}

export function buildRegulatorySinglePipeContext(stage: string, payload: Record<string, unknown>) {
  return JSON.stringify({
    pipeline: "regulatory_single_pipe_v1",
    stage,
    payload,
  });
}

export function truncateSinglePipeField(value: string | null | undefined, maxChars = 120000) {
  const normalized = String(value || "");
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}\n\n[TRONQUE - LIMITE CONTEXTE SINGLE PIPE]`
    : normalized;
}
