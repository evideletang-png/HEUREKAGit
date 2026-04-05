import { db, dossiersTable, documentReviewsTable } from "@workspace/db";
import { orchestrateDossierAnalysis } from "../services/orchestrator.js";
import { eq } from "drizzle-orm";

async function runRochecorbonAnalysis() {
  const dossierId = "550e8400-e29b-41d4-a716-446655440002";
  const insee = "37203";
  const address = "9 Chemin du Bois Soleil, 37210 Rochecorbon";

  console.log(`\n🚀 Running End-to-End Analysis for: ${address}`);

  // 1. Setup Mock Dossier
  await db.delete(dossiersTable).where(eq(dossiersTable.id, dossierId));
  await db.insert(dossiersTable).values({
    id: dossierId,
    userId: "2f7d0923-0a9c-477a-a3ac-80f831463fe8",
    title: "Validation Projet - Bois Soleil",
    typeProcedure: "PCMI",
    address: address,
    status: "BROUILLON",
    metadata: {
       project: {
         description: "Construction d'une maison individuelle R+1 avec garage.",
         height: 6.5,
         footprint: 120,
         parking_spaces: 2
       }
    }
  });

  // 2. Setup Mock Document (Notice Descriptive)
  const docId = "550e8400-e29b-41d4-a716-446655440003";
  await db.delete(documentReviewsTable).where(eq(documentReviewsTable.id, docId));
  await db.insert(documentReviewsTable).values({
    id: docId,
    dossierId: dossierId,
    userId: "2f7d0923-0a9c-477a-a3ac-80f831463fe8",
    title: "Notice Descriptive",
    documentType: "autre",
    pieceCode: "PCMI4",
    zoneCode: "UC", // Explicit zone for the 9 Chemin de Bois Soleil address
    status: "pending",
    rawText: `
      Description du projet:
      Maison de 6.5 mètres de hauteur.
      Emprise au sol de 120 m2 sur un terrain de 400 m2.
      2 places de stationnement prévues.
    `
  });

  // 3. EXECUTE ORCHESTRATION
  const result = await orchestrateDossierAnalysis(dossierId, [], { userId: "admin-user" });

  console.log("\n--- ANALYSIS RESULTS ---");
  console.log(`Status: ${result.status}`);
  console.log(`Final Decision: ${result.businessDecision?.decision}`);
  console.log(`Summary: ${result.businessDecision?.summary.substring(0, 200)}...`);
  
  if (result.pluAnalysis) {
    console.log(`\n--- PLU CONTROLS ---`);
    result.pluAnalysis.controles.forEach((c: any) => {
      console.log(`[${c.statut}] ${c.article}: ${c.message}`);
    });
  }

  const [finalDossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId));
  const meta = finalDossier.metadata as any;
  if (meta.retrievalTrace) {
    console.log(`\n--- RETRIEVAL TRACE (Audit) ---`);
    console.log(`Trace Type: ${typeof meta.retrievalTrace === 'string' ? meta.retrievalTrace : 'Detailed'}`);
  }

  console.log("\n✅ Validation Run Complete.");
}

runRochecorbonAnalysis().catch(console.error);
