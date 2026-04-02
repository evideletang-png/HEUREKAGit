import { db, baseIADocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function checkDocs() {
  const docs = await db.select().from(baseIADocumentsTable).where(eq(baseIADocumentsTable.municipalityId, "37203"));
  console.log(`Found ${docs.length} documents for Rochecorbon (37203)`);
  docs.forEach(d => {
    console.log(`- ${d.title} (ID: ${d.id}, Status: ${d.status}, Text Length: ${d.rawText?.length || 0})`);
  });
  process.exit(0);
}

checkDocs().catch(err => {
  console.error(err);
  process.exit(1);
});
