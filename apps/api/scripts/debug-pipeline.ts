
import { db } from "../../lib/db/src/index";
import { analysesTable, eventLogsTable } from "../../lib/db/src/schema/analyses";
import { eq, desc } from "drizzle-orm";

async function check() {
  const analysisId = "169e18de-a45a-40f2-b2f4-a4f31b7e066c";
  console.log(`Checking analysis: ${analysisId}`);

  try {
    const [analysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1);
    if (!analysis) {
      console.log("Analysis not found.");
      return;
    }

    console.log(`Status: ${analysis.status}`);
    console.log(`City: ${analysis.city}`);
    console.log(`GeoContext length: ${analysis.geoContextJson?.length || 0}`);
    
    if (analysis.geoContextJson) {
      console.log("GeoContext Sample:", analysis.geoContextJson.substring(0, 200));
      try {
        const gc = typeof analysis.geoContextJson === 'string' ? JSON.parse(analysis.geoContextJson) : analysis.geoContextJson;
        console.log("GeoContext Keys:", Object.keys(gc));
        console.log("Market Data:", !!gc.market_data);
        console.log("Admin Guide:", !!gc.admin_guide);
        console.log("Financial Analysis:", !!gc.financial_analysis);
      } catch (e) {
        console.log("Parse Error:", (e as Error).message);
      }
    }

    console.log("\nLast 15 Logs:");
    const logs = await db.select().from(eventLogsTable)
      .where(eq(eventLogsTable.analysisId, analysisId))
      .orderBy(desc(eventLogsTable.createdAt))
      .limit(15);
    
    logs.reverse().forEach(l => {
      console.log(`[${l.createdAt.toISOString().substring(11, 19)}] [${l.step}] ${l.status}: ${l.message}`);
    });
  } catch (err) {
    console.error("DB Error:", err);
  }
}

check().catch(console.error);
