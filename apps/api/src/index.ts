import app from "./app";
import { runMigrations } from "@workspace/db";
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

async function start() {
  // Run DB migrations before accepting traffic
  try {
    await runMigrations();
    console.log("[db] Migrations applied.");
  } catch (err) {
    console.error("[db] Migration failed — aborting startup.", err);
    process.exit(1);
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
