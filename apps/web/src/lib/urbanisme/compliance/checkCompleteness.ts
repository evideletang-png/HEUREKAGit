import type { ResolvedPiece } from "../cerfa/officialPieces.types";

export type UploadedDocumentForCompleteness = {
  code?: string;
  filename: string;
  type?: string;
  detectedCode?: string;
  confidence?: number;
};

export type CompletenessStatus = "complete" | "incomplete" | "uncertain";

export type MatchedPiece = {
  piece: ResolvedPiece;
  document: UploadedDocumentForCompleteness;
  matchMethod: "code" | "detectedCode" | "filename" | "type";
  confidence: number;
};

export type AmbiguousMatch = {
  piece: ResolvedPiece;
  candidates: UploadedDocumentForCompleteness[];
  reason: string;
};

export type CompletenessResult = {
  status: CompletenessStatus;
  missingPieces: ResolvedPiece[];
  matchedPieces: MatchedPiece[];
  ambiguousMatches: AmbiguousMatch[];
  confidenceScore: number;
  message: string;
  officialLetterPayload: {
    status: CompletenessStatus;
    missingPieceCodes: string[];
    missingPieces: { code: string; label: string; legalReference?: string; conditionLabel?: string }[];
    message: string;
  };
};

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactCode(value: unknown) {
  return normalize(value).replace(/[^a-z0-9]/g, "").toUpperCase();
}

function codePattern(code: string) {
  return new RegExp(`(^|[^a-z0-9])${code.replace(/-/g, "[-_ ]?")}([^a-z0-9]|$)`, "i");
}

function documentConfidence(document: UploadedDocumentForCompleteness, fallback: number) {
  if (typeof document.confidence !== "number") return fallback;
  return Math.max(0, Math.min(1, document.confidence));
}

function findMatches(piece: ResolvedPiece, uploadedDocuments: UploadedDocumentForCompleteness[]): MatchedPiece[] {
  const code = compactCode(piece.code);
  const matches: MatchedPiece[] = [];

  for (const document of uploadedDocuments) {
    if (compactCode(document.code) === code) {
      matches.push({ piece, document, matchMethod: "code", confidence: documentConfidence(document, 0.98) });
      continue;
    }
    if (compactCode(document.detectedCode) === code) {
      matches.push({ piece, document, matchMethod: "detectedCode", confidence: documentConfidence(document, 0.82) });
      continue;
    }
    if (codePattern(piece.code).test(document.filename)) {
      matches.push({ piece, document, matchMethod: "filename", confidence: documentConfidence(document, 0.72) });
      continue;
    }
    if (document.type && normalize(document.type).includes(normalize(piece.code))) {
      matches.push({ piece, document, matchMethod: "type", confidence: documentConfidence(document, 0.65) });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

function isRequiredForCompleteness(piece: ResolvedPiece) {
  return piece.requirementState === "required";
}

export function generateCompletenessMessage(result: Pick<CompletenessResult, "status" | "missingPieces" | "ambiguousMatches">) {
  if (result.status === "complete") return "Votre dossier est complet au regard des pièces CERFA requises identifiées.";
  if (result.status === "uncertain") {
    const missing = result.missingPieces.map((piece) => piece.code).join(", ");
    return missing
      ? `Votre dossier est à vérifier. Certaines pièces sont manquantes ou détectées avec une confiance faible : ${missing}.`
      : "Votre dossier est à vérifier. Certaines pièces ont été détectées avec une confiance faible.";
  }
  return `Votre dossier est incomplet. Les pièces suivantes sont manquantes : ${result.missingPieces.map((piece) => `${piece.code} — ${piece.label}`).join("; ")}.`;
}

export function checkCompleteness(args: {
  requiredPieces: ResolvedPiece[];
  uploadedDocuments: UploadedDocumentForCompleteness[];
}): CompletenessResult {
  const requiredPieces = args.requiredPieces.filter(isRequiredForCompleteness);
  const matchedPieces: MatchedPiece[] = [];
  const missingPieces: ResolvedPiece[] = [];
  const ambiguousMatches: AmbiguousMatch[] = [];
  const usedDocuments = new Set<UploadedDocumentForCompleteness>();

  for (const piece of requiredPieces) {
    const matches = findMatches(piece, args.uploadedDocuments);
    if (matches.length === 0) {
      missingPieces.push(piece);
      continue;
    }

    const best = matches[0];
    matchedPieces.push(best);
    usedDocuments.add(best.document);

    if (matches.length > 1) {
      ambiguousMatches.push({
        piece,
        candidates: matches.map((match) => match.document),
        reason: `Plusieurs documents peuvent correspondre à ${piece.code}.`,
      });
    }
  }

  const lowConfidenceMatches = matchedPieces.filter((match) => match.confidence < 0.65);
  const rawConfidence = requiredPieces.length === 0
    ? 1
    : matchedPieces.reduce((sum, match) => sum + match.confidence, 0) / requiredPieces.length;
  const confidenceScore = Math.max(0, Math.min(1, rawConfidence));
  const status: CompletenessStatus = missingPieces.length > 0
    ? "incomplete"
    : lowConfidenceMatches.length > 0 || ambiguousMatches.length > 0
      ? "uncertain"
      : "complete";
  const partial = { status, missingPieces, ambiguousMatches };
  const message = generateCompletenessMessage(partial);

  return {
    status,
    missingPieces,
    matchedPieces,
    ambiguousMatches,
    confidenceScore,
    message,
    officialLetterPayload: {
      status,
      missingPieceCodes: missingPieces.map((piece) => piece.code),
      missingPieces: missingPieces.map((piece) => ({
        code: piece.code,
        label: piece.label,
        legalReference: piece.legalReference,
        conditionLabel: piece.conditionLabel,
      })),
      message,
    },
  };
}
