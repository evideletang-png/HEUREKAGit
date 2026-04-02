
import { db } from "../src/lib/db.js";
import { analysesTable } from "../src/lib/schema/analyses.js";
import { eq } from "drizzle-orm";

async function main() {
  const id = "169e18de-a45a-40f2-b2f4-a4f31b7e066c";
  const result = await db.select().from(analysesTable).where(eq(analysesTable.id, id));
  if (result.length > 0) {
    console.log("Analysis ID:", id);
    console.log("Status:", result[0].status);
    console.log("GeoContextJson:", result[0].geoContextJson);
  } else {
    console.log("Analysis not found");
  }
}

main().catch(console.error);
