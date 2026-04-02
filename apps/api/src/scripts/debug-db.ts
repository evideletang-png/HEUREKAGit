
import { db, baseIADocumentsTable, communesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function check() {
  const communeCode = "37203"; // Rochecorbon
  const poolId = `${communeCode}-PLU-ACTIVE`;
  
  const [commune] = await db.select().from(communesTable).where(eq(communesTable.inseeCode, communeCode)).limit(1);
  console.log("COMMUNE:", JSON.stringify(commune, null, 2));
  
  const docs = await db.select().from(baseIADocumentsTable).where(eq(baseIADocumentsTable.poolId, poolId));
  console.log("DOCUMENTS FOUND:", docs.length);
  docs.forEach(d => {
    console.log(`- [${d.id}] ${d.title} (Provenance: ${(d.metadata as any)?.provenance})`);
    console.log(`  Content length: ${d.content?.length || 0}`);
  });
}

check().catch(console.error);
