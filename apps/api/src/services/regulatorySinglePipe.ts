import { loadPrompt } from "./promptLoader.js";

export const REGULATORY_SINGLE_PIPE_PROMPT_KEY = "regulatory_single_pipe_system";

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
