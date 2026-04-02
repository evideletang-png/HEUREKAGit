import { db, municipalitySettingsTable } from "@workspace/db";
import { eq } from 'drizzle-orm';

async function main() {
  console.log("🧼 Cleaning legacy formulas for Rochecorbon...");
  
  const res = await db.update(municipalitySettingsTable)
    .set({ formulas: {} }) // Reset to empty object to use defaults
    .where(eq(municipalitySettingsTable.commune, 'Rochecorbon'));
    
  console.log("✅ Database update result:", res);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
