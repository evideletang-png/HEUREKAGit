import app from "./app";
import { runMigrations, db } from "@workspace/db";
import { analysesTable } from "@workspace/db";
import { inArray, lt, sql } from "drizzle-orm";
import { seedDefaultPrompts } from "./services/promptLoader.js";
import { seedAdminUser } from "./services/seedAdminUser.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** Reset analyses that were left mid-flight by a previous crashed/restarted process. */
async function recoverStuckAnalyses() {
  const stuckStatuses = ["collecting_data", "parsing_documents", "extracting_rules", "calculating"] as const;
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const result = await db
    .update(analysesTable)
    .set({ status: "draft", updatedAt: new Date() })
    .where(
      sql`${analysesTable.status} = ANY(${stuckStatuses}) AND ${analysesTable.updatedAt} < ${tenMinutesAgo}`
    )
    .returning({ id: analysesTable.id });

  if (result.length > 0) {
    console.log(`[recovery] Reset ${result.length} stuck analyse(s) to draft: ${result.map(r => r.id).join(", ")}`);
  }
}

async function start() {
  // Run DB migrations before accepting traffic
  try {
    await runMigrations();
    console.log("[db] Migrations applied.");
  } catch (err) {
    console.error("[db] Migration failed — aborting startup.", err);
    process.exit(1);
  }

  // Recover any analyses left in-flight by a previous process
  try {
    await recoverStuckAnalyses();
  } catch (err) {
    console.warn("[recovery] Stuck analysis recovery skipped:", err);
  }

  app.listen(port, "0.0.0.0", async () => {
    console.log(`Server listening on port ${port}`);
    try {
      await seedDefaultPrompts();
      console.log("[prompts] Default prompts seeded.");
    } catch (err) {
      console.warn("[prompts] Seeding skipped:", err);
    }
    try {
      await seedAdminUser();
    } catch (err) {
      console.warn("[seed] Admin user seed skipped:", err);
    }
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled Promise Rejection", String(reason));
});

start();
