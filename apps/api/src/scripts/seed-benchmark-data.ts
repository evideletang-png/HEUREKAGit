import { db, baseIADocumentsTable, communesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

async function seedBenchmarkData() {
  console.log("🌱 Seeding Benchmark Data...");

  // 1. Seed Communes
  const benchmarkCommunes = [
    { id: "94000", name: "Créteil", inseeCode: "94000", jurisdictionId: "94-EST", zipCode: "94000" },
    { id: "75015", name: "Paris 15", inseeCode: "75015", jurisdictionId: "75-VILLE", zipCode: "75015" }
  ];

  for (const c of benchmarkCommunes) {
    await db.insert(communesTable).values(c).onConflictDoUpdate({
      target: [communesTable.id],
      set: { inseeCode: c.inseeCode, jurisdictionId: c.jurisdictionId }
    });
  }
  console.log("✅ Benchmark Communes Seeded.");

  // 2. Seed PLU Documents (94000 - CONTROL & MESSY)
  const doc94000 = {
    id: "550e8400-e29b-41d4-a716-446655449400",
    batchId: "550e8400-e29b-41d4-a716-446655440000",
    municipalityId: "94000",
    fileName: "plu_creteil_benchmark.txt",
    fileHash: createHash("sha256").update("creteil_plu").digest("hex"),
    type: "plu",
    status: "indexed",
    rawText: `
      COORDONNÉES DE LA COMMUNE DE CRÉTEIL
      
      ARTICLE 9 - EMPRISE AU SOL DES CONSTRUCTIONS
      L'emprise au sol des constructions ne peut excéder un coefficient de 0,4 (CES = 0.4).
      
      ARTICLE 10 - HAUTEUR MAXIMALE DES CONSTRUCTIONS
      La hauteur maximale des constructions est fixée à 7.50 mètres au faîtage. 
      Dans certains cas particuliers, une dérogation peut être accordée.
      
      ARTICLE 12 - STATIONNEMENT DES VÉHICULES
      Le stationnement des véhicules doit être assuré sur le terrain. 
      Il est exigé 2 places de stationnement par logement créé.
      
      --- MESSY VARIANTS SECTION ---
      
      Art. 10 : Les bâtiments ne peuvent excéder une hauteur de 10 mètres en zone UB.
      
      10. Hauteur maximale : la limite est fixée à 8 mètres pour les annexes.
      
      Article Dix — Dispositions relatives à la hauteur : le maximum est de 12m.
    `
  };

  // 3. Seed PLU Documents (75015)
  const doc75015 = {
    id: "550e8400-e29b-41d4-a716-446655447515",
    batchId: "550e8400-e29b-41d4-a716-446655440000",
    municipalityId: "75015",
    fileName: "plu_paris_benchmark.txt",
    fileHash: createHash("sha256").update("paris_plu").digest("hex"),
    type: "plu",
    status: "indexed",
    rawText: `
      RÈGLEMENT DE PARIS - ZONE UG
      
      ARTICLE UG.10 - HAUTEUR DES CONSTRUCTIONS
      Le plafond des hauteurs est fixé à 12 mètres pour les constructions nouvelles.
    `
  };

  await db.insert(baseIADocumentsTable).values(doc94000).onConflictDoUpdate({
    target: [baseIADocumentsTable.id],
    set: { rawText: doc94000.rawText, status: "indexed" }
  });
  
  await db.insert(baseIADocumentsTable).values(doc75015).onConflictDoUpdate({
    target: [baseIADocumentsTable.id],
    set: { rawText: doc75015.rawText, status: "indexed" }
  });

  console.log("✅ Benchmark Documents Seeded.");
  console.log("✨ Seeding Complete!");
}

seedBenchmarkData().catch(console.error);
