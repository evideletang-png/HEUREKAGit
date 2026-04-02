
import { db } from "../src/lib/db";
import { eventLogsTable } from "../src/lib/schema/eventLogs";
import { eq, desc } from "drizzle-orm";

async function main() {
  const id = "169e18de-a45a-40f2-b2f4-a4f31b7e066c";
  const result = await db.select()
    .from(eventLogsTable)
    .where(eq(eventLogsTable.analysisId, id))
    .orderBy(desc(eventLogsTable.createdAt));
    
  console.log("Logs for Analysis:", id);
  result.forEach(log => {
    console.log(`[${log.createdAt.toISOString()}] ${log.step} - ${log.status}: ${log.message}`);
  });
}

main().catch(console.error);
1)