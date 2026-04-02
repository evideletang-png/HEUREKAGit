import app from "./app";
import { seedDefaultPrompts } from "./services/promptLoader.js";

// Bypass SSL for GPU API (official government certificates issues with Node.js fetch)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

app.listen(port, "0.0.0.0", async () => {
  console.log(`Server listening on port ${port}`);
  try {
    await seedDefaultPrompts();
    console.log("[prompts] Default prompts seeded.");
  } catch (err) {
    console.warn("[prompts] Seeding skipped:", err);
  }
});
