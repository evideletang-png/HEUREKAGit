import { db } from "./src/db/index.js";
import { townHallDocumentsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

async function checkDocs() {
  try {
    const city = "Saint-Cyr-sur-Loire".toLowerCase();
    const docs = await db.select().from(townHallDocumentsTable)
      .where(eq(sql`lower(commune)`, city));

    console.log(`Found ${docs.length} docs for Saint-Cyr-sur-Loire`);
    docs.forEach(d => {
      console.log(`- Title: ${d.title}, Length: ${d.rawText?.length || 0}`);
    });

    if (docs.length === 0) {
      const all = await db.select({ commune: townHallDocumentsTable.commune }).from(townHallDocumentsTable);
      console.log("Available communes:", [...new Set(all.map(a => a.commune))]);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkDocs();
