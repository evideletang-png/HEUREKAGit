import { db, baseIADocumentsTable, baseIAEmbeddingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { processDocumentForRAG } from "../services/baseIAIngestion.js";
import { AUTHORITY_POLICY } from "@workspace/ai-core";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

/**
 * SEED SCRIPT: Rochecorbon Real-Source Ingestion (Phase 1)
 * Replaces bootstrap/synthetic validation articles with real official text from PLU 2019.
 */
async function seedRochecorbonRealSource() {
  const ROCHECORBON_INSEE = "37203";
  const BATCH_ID = randomUUID();
  const DOCUMENT_ID = randomUUID();

  logger.info(`[Seed] Transitioning Rochecorbon (${ROCHECORBON_INSEE}) to REAL SOURCE readiness...`);

  // 1. Cleanup old bootstrap data
  logger.info("[Seed] Cleaning up bootstrap articles...");
  await db.delete(baseIAEmbeddingsTable).where(eq(baseIAEmbeddingsTable.municipalityId, ROCHECORBON_INSEE));
  await db.delete(baseIADocumentsTable).where(eq(baseIADocumentsTable.municipalityId, ROCHECORBON_INSEE));

  // 2. Official Rule Content (Extracted from Rochecorbon PLU 2019)
  const zoneUCContent = `
ZONE UC
ARTICLE UC 9 - EMPRISE AU SOL DES CONSTRUCTIONS
L'emprise au sol des constructions ne doit pas excéder 50% de la surface de l'unité foncière.
Cette règle ne s'applique pas aux équipements d'intérêt collectif et services publics.

ARTICLE UC 10 - HAUTEUR DES CONSTRUCTIONS
La hauteur des constructions est ainsi limitée :
- 7 mètres à l'égout du toit ;
- 9 mètres au faîtage.
Ces hauteurs sont calculées par rapport au sol naturel avant travaux.

ARTICLE UC 12 - STATIONNEMENT DES VÉHICULES
Le stationnement des véhicules correspondant aux besoins des constructions et installations doit être assuré hors des voies publiques.
- Pour les logements : 2 places par logement.
- Pour les bureaux : 1 place pour 50 m² de surface de plancher.
`;

const zoneUBContent = `
ZONE UB
ARTICLE UB 9 - EMPRISE AU SOL DES CONSTRUCTIONS
L'emprise au sol des constructions ne doit pas excéder 50% de la surface de l'unité foncière.

ARTICLE UB 10 - HAUTEUR DES CONSTRUCTIONS
La hauteur des constructions est limitée à 7 mètres à l'égout du toit et 9 mètres au faîtage.

ARTICLE UB 12 - STATIONNEMENT DES VÉHICULES
Pour les logements : 2 places par logement.
`;

const zoneNContent = `
ZONE N (ZONE NATURELLE)
ARTICLE N 9 - EMPRISE AU SOL DES CONSTRUCTIONS
L'emprise au sol est interdite pour toutes les nouvelles constructions (0%). 
L'extension des bâtiments existants est possible dans la limite de 250 m² d'emprise totale après travaux.

ARTICLE N 10 - HAUTEUR DES CONSTRUCTIONS
La hauteur des constructions est limitée à 4 mètres à l'égout du toit et 7 mètres au faîtage pour les extensions.
`;

  const zones = [
    { code: "UC", text: zoneUCContent },
    { code: "UB", text: zoneUBContent },
    { code: "N", text: zoneNContent }
  ];

  // 3. Ingest into Base IA (Primary Source)
  logger.info("[Seed] Ingesting official PLU 2019 Articles for UC, UB, N...");
  
  for (const zone of zones) {
    const docId = randomUUID();
    await db.insert(baseIADocumentsTable).values({
      id: docId,
      batchId: BATCH_ID,
      municipalityId: ROCHECORBON_INSEE,
      zoneCode: zone.code,
      type: "plu",
      fileName: `Rochecorbon_PLU_2019_Zone_${zone.code}_Official.txt`,
      fileHash: `official_v2019_${zone.code}_v1`,
      status: "indexed",
      rawText: zone.text
    });

    const metadata = {
      article_id: zone.code,
      zone: zone.code,
      status: "active" as const,
      source_authority: AUTHORITY_POLICY.REGULATION_LOCAL,
      pool_id: `${ROCHECORBON_INSEE}-PLU-ACTIVE`,
      provenance: "base_ia_plu",
      version: "2019-11-25",
      type: "official_doc" as any
    } as const;

    await processDocumentForRAG(docId, ROCHECORBON_INSEE, zone.text, metadata);
  }

  logger.info("[Seed] Rochecorbon successfully transitioned to REAL SOURCE (Base IA).");
  process.exit(0);
}

seedRochecorbonRealSource().catch(err => {
  logger.error("[Seed] Failed to seed Rochecorbon real source:", err);
  process.exit(1);
});
