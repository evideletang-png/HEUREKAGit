export function normalizeExtractedText(text: string | null | undefined): string {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function scoreTextQuality(text: string | null | undefined): number {
  const normalized = normalizeExtractedText(text);
  if (!normalized) return 0;

  const sample = normalized.slice(0, 12000);
  const length = sample.length || 1;
  const suspiciousChars = (sample.match(/[\uFFFD\u25A1\u25AF\u25FB\u25FC\uFFFC]/g) || []).length;
  const readableChars = (sample.match(/[\p{L}\p{N}\s.,;:!?%()\/'"’"\-+°²]/gu) || []).length;
  const veryShortTokens = sample.split(/\s+/).filter((token) => token.length === 1).length;
  const totalTokens = Math.max(1, sample.split(/\s+/).filter(Boolean).length);

  const suspiciousRatio = suspiciousChars / length;
  const readableRatio = readableChars / length;
  const shortTokenRatio = veryShortTokens / totalTokens;

  let score = readableRatio;
  score -= suspiciousRatio * 4;
  score -= Math.max(0, shortTokenRatio - 0.35) * 0.8;

  if (normalized.length < 120) {
    score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

export function isTextLikelyGarbled(text: string | null | undefined): boolean {
  const normalized = normalizeExtractedText(text);
  if (normalized.length < 120) return true;
  return scoreTextQuality(normalized) < 0.62;
}

export function hasUsableExtractedText(text: string | null | undefined): boolean {
  const normalized = normalizeExtractedText(text);
  if (normalized.length < 100) return false;
  if (normalized.startsWith("[Impossible d'extraire le texte du PDF automatiquement]")) return false;
  return !isTextLikelyGarbled(normalized);
}
