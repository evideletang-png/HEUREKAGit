import { seedDefaultPrompts } from "./services/promptLoader.js";

async function main() {
  console.log("Seeding prompts...");
  await seedDefaultPrompts();
  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
