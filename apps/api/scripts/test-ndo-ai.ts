import { analyzePLUZone } from "../src/services/pluAnalysis.ts";
import { db, townHallDocumentsTable } from "../../../lib/db/src/index.ts";
import { eq, sql } from "drizzle-orm";

async function main() {
  const commune = "Notre-Dame-d'Oé";
  console.log(`Fetching documents for ${commune}...`);
  const docs = await db.select().from(townHallDocumentsTable)
    .where(eq(sql`lower(${townHallDocumentsTable.commune})`, commune.toLowerCase()));
  
  if (docs.length === 0) {
    console.error("No documents found!");
    process.exit(1);
  }

  const rawText = docs[0].rawText;
  const zoneCode = "U";
  const zoneLabel = "Zone U";

  console.log(`Running direct analysis for ${commune} Zone ${zoneCode}...`);
  const result = await analyzePLUZone(rawText, zoneCode, zoneLabel, commune, "", "Standard Project");
  
  console.log("--- ANALYSIS RESULT ---");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
