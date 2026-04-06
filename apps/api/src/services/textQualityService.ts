export function normalizeExtractedText(text: string | null | undefined): string {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function repairExtractedText(text: string | null | undefined): string {
  const normalized = normalizeExtractedText(text);
  return normalized
    .replace(/\u00A0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[“”«»]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\uFFFD+/g, "")
    .replace(/\b([A-ZÀ-ÖØ-Ý])\s+([A-ZÀ-ÖØ-Ý])\s+([A-ZÀ-ÖØ-Ý])\b/g, "$1$2$3")
    .replace(/\b([A-Za-zÀ-ÿ]{2,})\s*-\s*\n\s*([A-Za-zÀ-ÿ]{2,})\b/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countSuspiciousArtifacts(text: string): number {
  const sample = text.slice(0, 12000);
  const suspiciousChars = (sample.match(/[\uFFFD\u25A1\u25AF\u25FB\u25FC\uFFFC]/g) || []).length;
  const brokenWords = (sample.match(/\b[\p{L}\p{N}]*[\uFFFD][\p{L}\p{N}\uFFFD]*\b/gu) || []).length;
  return suspiciousChars + brokenWords * 3;
}

export function scoreTextQuality(text: string | null | undefined): number {
  const normalized = repairExtractedText(text);
  if (!normalized) return 0;

  const sample = normalized.slice(0, 12000);
  const length = sample.length || 1;
  const suspiciousChars = countSuspiciousArtifacts(sample);
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
  const normalized = repairExtractedText(text);
  if (normalized.length < 120) return true;
  if (countSuspiciousArtifacts(normalized) >= 8) return true;
  return scoreTextQuality(normalized) < 0.62;
}

export function hasUsableExtractedText(text: string | null | undefined): boolean {
  const normalized = repairExtractedText(text);
  if (normalized.length < 100) return false;
  if (normalized.startsWith("[Impossible d'extraire le texte du PDF automatiquement]")) return false;
  return !isTextLikelyGarbled(normalized);
}
