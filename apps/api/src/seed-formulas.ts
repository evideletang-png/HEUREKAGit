import { db, globalConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { DEFAULT_FORMULAS } from "./services/financialAnalysis";

async function seedFormulas() {
  console.log("Seeding global finance formulas...");
  
  const existing = await db.select().from(globalConfigsTable)
    .where(eq(globalConfigsTable.key, "finance_formulas")).limit(1);

  if (existing.length === 0) {
    await db.insert(globalConfigsTable).values({
      key: "finance_formulas",
      value: DEFAULT_FORMULAS
    });
    console.log("Default formulas seeded successfully.");
  } else {
    console.log("Formulas already exist, skipping seed.");
  }
}

seedFormulas().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
