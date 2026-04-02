import { db, baseIADocumentsTable, baseIAEmbeddingsTable } from "@workspace/db";
import { generateEmbedding } from "../services/embeddingService.js";
import { resolveJurisdictionContext } from "../services/orchestrator.js";
import { AUTHORITY_POLICY } from "@workspace/ai-core";

async function seedRochecorbonValidation() {
  console.log("🌱 Seeding Rochecorbon Bootstrap Validation Data...");

  const insee = "37203";
  const jurisdictionId = "37000-Tours";
  const docId = "550e8400-e29b-41d4-a716-446655443720";
  const poolId = `${insee}-PLU-ACTIVE`;

  // 1. Regulatory Document Metadata
  await db.insert(baseIADocumentsTable).values({
    id: docId,
    batchId: "550e8400-e29b-41d4-a716-446655440001",
    municipalityId: insee,
    fileName: "plu_rochecorbon_bootstrap.txt",
    fileHash: "hash-rochecorbon-v1",
    type: "plu",
    status: "indexed",
   category: "REGULATORY",
   subCategory: "PLU_UC",
    rawText: `
      Règlement de la Zone UC - Rochecorbon (BOOTSTRAP VALIDATION ONLY)
      
      Article UC 9 - Emprise au sol
      L'emprise au sol des constructions ne peut excéder 50% de la surface de l'unité foncière.
      
      Article UC 10 - Hauteur des constructions
      La hauteur maximale des constructions est fixée à 9 mètres au faîtage et 7 mètres à l'égout du toit.
      
      Article UC 12 - Stationnement
      Le stationnement des véhicules doit être assuré en dehors des voies publiques. 
      Il est exigé 2 places de stationnement par logement individuel.
    `
  }).onConflictDoUpdate({
    target: [baseIADocumentsTable.id],
    set: { status: "indexed" }
  });

  const articles = [
    {
      id: "9",
      title: "Emprise au sol",
      content: "L'emprise au sol des constructions ne peut excéder 50% de la surface de l'unité foncière. (Rochecorbon UC 9)"
    },
    {
      id: "10",
      title: "Hauteur des constructions",
      content: "La hauteur maximale des constructions est fixée à 9 mètres au faîtage et 7 mètres à l'égout du toit. (Rochecorbon UC 10)"
    },
    {
      id: "12",
      title: "Stationnement",
      content: "Il est exigé 2 places de stationnement par logement individuel. Le stationnement doit être assuré en dehors des voies publiques. (Rochecorbon UC 12)"
    }
  ];

  const jurisdiction = await resolveJurisdictionContext(insee);

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const embedding = await generateEmbedding(art.content);
    
    await db.insert(baseIAEmbeddingsTable).values({
      documentId: docId,
      municipalityId: insee,
      content: art.content,
      chunkIndex: i,
      embedding: embedding.map(String),
      metadata: {
        article_id: art.id,
        section_title: art.title,
        status: "active",
        pool_id: poolId,
        jurisdiction_id: jurisdictionId,
        document_type: "plu_reglement",
        source_authority: (AUTHORITY_POLICY as any).REGULATION_LOCAL || 9,
        language: "fr",
        is_bootstrap: true
      }
    } as any);
  }

  console.log("✅ Rochecorbon Bootstrap Seeding Complete.");
}

seedRochecorbonValidation().catch(console.error);
