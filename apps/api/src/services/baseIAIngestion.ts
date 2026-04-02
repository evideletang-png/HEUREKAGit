import { insertChunk, ChunkMetadata } from "./embeddingService.js";
import { logger } from "../utils/logger.js";
import { AUTHORITY_POLICY } from "@workspace/ai-core";

/**
 * Smart Chunker that respects legal/regulatory boundaries.
 * Splits text into coherent sections (Articles, Chapters, Sections).
 */
export function smartArticleChunking(text: string): { content: string; articleId?: string; sectionTitle?: string }[] {
  // Regex to detect "Article X", "Art. X", his children, "Section Y", or "[0-9]+." list starters
  // Added support for digit-only starts (e.g. "10. Hauteur")
  const splitPattern = /(?=\bArticle\s+[0-9A-Z.]+\b|\bArt\.\s+[0-9A-Z.]+\b|\bSection\s+[0-9]+\b|\bChapitre\s+[0-9IVX]+\b|^\s*[0-9]+\.\s+)/gim;
  
  const segments = text.split(splitPattern);
  const chunks: { content: string; articleId?: string; sectionTitle?: string }[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed || trimmed.length < 50) continue;

    // Extract Article ID 
    // Patterns: "Article 10", "Art 10", "10. "
    const articleMatch = trimmed.match(/\bArticle\s+([0-9A-Z.]+)\b|\bArt\.\s+([0-9A-Z.]+)\b|^\s*([0-9]+)\.\s+/im);
    const articleId = articleMatch ? (articleMatch[1] || articleMatch[2] || articleMatch[3]) : undefined;

    // Extract Section/Chapter Title
    const sectionMatch = trimmed.match(/\b(?:Section|Chapitre)\s+([0-9IVX]+)\b/i);
    const sectionTitle = sectionMatch ? sectionMatch[0] : undefined;

    // If segment is too large (> 4000 chars), further split it by paragraphs
    if (trimmed.length > 4000) {
      const subSegments = trimmed.split(/\n\n+/);
      let currentSub = "";
      
      for (const sub of subSegments) {
        if ((currentSub.length + sub.length) < 3000) {
          currentSub += (currentSub ? "\n\n" : "") + sub;
        } else {
          chunks.push({ content: currentSub, articleId, sectionTitle });
          currentSub = sub;
        }
      }
      if (currentSub) chunks.push({ content: currentSub, articleId, sectionTitle });
    } else {
      chunks.push({ content: trimmed, articleId, sectionTitle });
    }
  }

  return chunks;
}

export async function processDocumentForRAG(
  documentId: string, 
  municipalityId: string, 
  rawText: string,
  baseMetadata: Partial<ChunkMetadata>
) {
  try {
    logger.info(`[BaseIA] Starting smart RAG ingestion for document ${documentId}`);
    
    // 1. Text Chunking
    const chunks = smartArticleChunking(rawText);
    logger.info(`[BaseIA] Split document into ${chunks.length} smart chunks.`);

    // 2. Vectorization & Insertion
    let successCount = 0;
    
    for (let index = 0; index < chunks.length; index++) {
      const { content, articleId, sectionTitle } = chunks[index];
      
      const metadata: ChunkMetadata = {
        ...baseMetadata,
        article_id: articleId,
        section_title: sectionTitle,
        source_authority: baseMetadata.source_authority || AUTHORITY_POLICY.UNKNOWN
      } as any;
      
      await insertChunk(
        documentId,
        municipalityId,
        content,
        index,
        null, // pageNumber fallback
        metadata
      );
      
      successCount++;
    }

    logger.info(`[BaseIA] Successfully indexed ${successCount} chunks for document ${documentId}`);
    return { status: "success", indexedChunks: successCount };

  } catch (err) {
    logger.error(`[BaseIA] Ingestion failed for document ${documentId}`, err);
    throw err;
  }
}
