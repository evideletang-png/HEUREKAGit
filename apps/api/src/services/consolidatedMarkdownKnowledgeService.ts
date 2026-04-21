import path from "path";

export type ConsolidatedMarkdownDocumentRole =
  | "plu_reglement"
  | "oap"
  | "plu_annexe"
  | "contextual";

export type ConsolidatedMarkdownLogicalDocument = {
  partRoman: string;
  logicalDocumentIndex: number;
  sourceMarkdownHeading: string;
  title: string;
  rawText: string;
  canonicalType: ConsolidatedMarkdownDocumentRole;
  category: string;
  subCategory: string;
  documentType: string;
  isOpposable: boolean;
  sourceAuthority: number;
  tags: string[];
};

export type ParsedConsolidatedMarkdownKnowledge = {
  metadata: {
    commune: string | null;
    inseeCode: string | null;
    postalCode: string | null;
  };
  promptBlock: string | null;
  documents: ConsolidatedMarkdownLogicalDocument[];
};

function normalizeMarkdownText(raw: string) {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripAccents(raw: string) {
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isMarkdownUpload(fileName?: string | null, mimeType?: string | null) {
  const lowerName = String(fileName || "").toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();
  return lowerName.endsWith(".md")
    || lowerName.endsWith(".markdown")
    || lowerMime === "text/markdown"
    || lowerMime === "text/x-markdown"
    || (lowerMime === "text/plain" && /\.(md|markdown)$/i.test(lowerName));
}

function extractMetadata(rawText: string) {
  const communeMatch = rawText.match(/>\s*\*\*Commune\*\*\s*:\s*([^\n(]+)(?:\(([^)]*)\))?/i);
  const inseeMatch = rawText.match(/>\s*\*\*Code\s+INSEE\*\*\s*:\s*([0-9A-Z]+)/i)
    || rawText.match(/\bINSEE\s+([0-9A-Z]{5})\b/i);
  const postalMatch = rawText.match(/>\s*\*\*Code\s+postal\*\*\s*:\s*([0-9A-Z]+)/i);

  return {
    commune: communeMatch?.[1]?.trim() || null,
    inseeCode: inseeMatch?.[1]?.trim() || null,
    postalCode: postalMatch?.[1]?.trim() || null,
  };
}

function extractPromptBlock(rawText: string) {
  const authorityMatch = rawText.match(/===\s*SOURCE\s+AUTORITAIRE[\s\S]*?===\s*FIN\s+SOURCE\s+AUTORITAIRE[^\n]*===/i);
  if (authorityMatch?.[0]) return authorityMatch[0].trim();

  const promptSectionMatch = rawText.match(/PROMPT\s+SYST[ÈE]ME[\s\S]*?```(?:[a-z]*)?\n([\s\S]*?)```/i);
  return promptSectionMatch?.[1]?.trim() || null;
}

function classifyLogicalDocument(heading: string): Omit<ConsolidatedMarkdownLogicalDocument, "partRoman" | "logicalDocumentIndex" | "sourceMarkdownHeading" | "title" | "rawText"> {
  const normalized = stripAccents(heading).toLowerCase();

  if (normalized.includes("reglement")) {
    return {
      canonicalType: "plu_reglement",
      category: "REGULATORY",
      subCategory: "PLU",
      documentType: "Written regulation",
      isOpposable: true,
      sourceAuthority: 100,
      tags: ["markdown-consolide", "reglement-ecrit"],
    };
  }

  if (normalized.includes("oap") || normalized.includes("orientation")) {
    return {
      canonicalType: "oap",
      category: "REGULATORY",
      subCategory: "OAP",
      documentType: "OAP",
      isOpposable: true,
      sourceAuthority: 85,
      tags: ["markdown-consolide", "oap", "source-complementaire"],
    };
  }

  if (normalized.includes("annexe") || normalized.includes("vegetaux")) {
    return {
      canonicalType: "plu_annexe",
      category: "ANNEXES",
      subCategory: "PLU",
      documentType: "Regulatory appendix",
      isOpposable: true,
      sourceAuthority: 70,
      tags: ["markdown-consolide", "annexe", "source-complementaire"],
    };
  }

  if (normalized.includes("padd")) {
    return {
      canonicalType: "plu_annexe",
      category: "REGULATORY",
      subCategory: "PADD",
      documentType: "PADD",
      isOpposable: false,
      sourceAuthority: 35,
      tags: ["markdown-consolide", "padd", "orientation"],
    };
  }

  if (normalized.includes("rapport")) {
    return {
      canonicalType: "contextual",
      category: "REGULATORY",
      subCategory: "CONTEXT",
      documentType: "Presentation report",
      isOpposable: false,
      sourceAuthority: 30,
      tags: ["markdown-consolide", "rapport", "contexte"],
    };
  }

  return {
    canonicalType: "contextual",
    category: "OTHER",
    subCategory: "MARKDOWN",
    documentType: "Consolidated Markdown section",
    isOpposable: false,
    sourceAuthority: 20,
    tags: ["markdown-consolide", "piece-logique"],
  };
}

export function buildLogicalMarkdownFileName(parentFileName: string, logicalDocumentIndex: number) {
  const parsed = path.parse(parentFileName || "document-consolide.md");
  const safeBase = (parsed.name || "document-consolide")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || "document-consolide";
  return `${safeBase}__document-${logicalDocumentIndex}.md`;
}

export function parseConsolidatedMarkdownKnowledge(rawInput: string, parentFileName = "document-consolide.md"): ParsedConsolidatedMarkdownKnowledge | null {
  const rawText = normalizeMarkdownText(rawInput);
  const headingRegex = /^#\s+PARTIE\s+([IVXLCDM]+)\s+[—-]\s+DOCUMENT\s+(\d+)\s*:\s*(.+)$/gim;
  const matches = Array.from(rawText.matchAll(headingRegex));
  if (matches.length === 0) return null;

  const metadata = extractMetadata(rawText);
  const promptBlock = extractPromptBlock(rawText);

  const documents = matches.map((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index ?? rawText.length;
    const sectionText = rawText.slice(start, end).trim();
    const partRoman = match[1]?.trim() || String(index + 1);
    const logicalDocumentIndex = Number(match[2] || index + 1);
    const sourceMarkdownHeading = match[0].trim();
    const headingLabel = match[3]?.trim() || `Document ${logicalDocumentIndex}`;
    const classification = classifyLogicalDocument(headingLabel);
    const titlePrefix = metadata.commune ? `${metadata.commune} - ` : "";

    return {
      partRoman,
      logicalDocumentIndex,
      sourceMarkdownHeading,
      title: `${titlePrefix}${headingLabel}`,
      rawText: sectionText,
      ...classification,
    };
  });

  return {
    metadata,
    promptBlock,
    documents,
  };
}
