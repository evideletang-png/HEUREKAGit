import { db, baseIAEmbeddingsTable, baseIADocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { smartArticleChunking } from "../services/baseIAIngestion.js";
import { insertChunk } from "../services/embeddingService.js";
import { resolveJurisdictionContext } from "../services/orchestrator.js";
import { AUTHORITY_POLICY } from "@workspace/ai-core";
import { logger } from "../utils/logger.js";

async function reindexAllDocuments() {
  logger.info("🚀 Starting Knowledge Base Re-indexing...");
  console.log(`[DEBUG] DB URL is set: ${!!process.env.DATABASE_URL}`);

  try {
    const documents = await db.select().from(baseIADocumentsTable);
    console.log(`[DEBUG] Found ${documents.length} docs in baseIADocumentsTable.`);

    for (const doc of documents) {
      console.log(`[DEBUG] Processing Doc: ${doc.fileName} (INSEE: ${doc.municipalityId})`);
      
      const inferredDocType = (doc.type || "plu") as any;
      const authority = (AUTHORITY_POLICY as any)[inferredDocType.toUpperCase()] || AUTHORITY_POLICY.UNKNOWN;
      const jurisdiction = await resolveJurisdictionContext(doc.municipalityId || "94000");

      if (!doc.rawText) {
        console.warn(`[DEBUG] Skipping ${doc.fileName}: rawText is missing.`);
        continue;
      }

      // Cleanup
      await db.delete(baseIAEmbeddingsTable).where(eq(baseIAEmbeddingsTable.documentId, doc.id));

      const smartChunks = smartArticleChunking(doc.rawText);
      console.log(`[DEBUG] Generated ${smartChunks.length} chunks for ${doc.fileName}`);

      for (let i = 0; i < smartChunks.length; i++) {
        const { content, articleId, sectionTitle } = smartChunks[i];
        
        await insertChunk(doc.id, doc.municipalityId || "unknown", content, i, null, {
          status: "active",
          document_id: doc.id,
          document_type: doc.type === "plu" ? "plu_reglement" : (doc.type as any),
          commune: doc.municipalityId || "unknown",
          jurisdiction_id: jurisdiction.jurisdiction_id,
          pool_id: (jurisdiction.active_pool_ids && jurisdiction.active_pool_ids[0]) || `${doc.municipalityId}-PLU-ACTIVE`,
          article_id: articleId,
          section_title: sectionTitle,
          source_authority: authority,
          language: "fr",
          topic_tags: [],
          version_date: new Date().toISOString()
        } as any);
      }
      console.log(`✅ Successfully re-indexed ${doc.fileName}`);
    }
  } catch (err) {
    console.error("❌ Fatal Re-index Error:", err);
  }

  logger.info("✨ Knowledge Base Re-indexing Complete!");
}

reindexAllDocuments().catch(console.error);
