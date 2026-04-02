import app from "./app";
import { seedDefaultPrompts } from "./services/promptLoader.js";


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
