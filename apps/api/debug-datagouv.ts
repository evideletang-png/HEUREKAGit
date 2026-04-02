import { searchDatasets, findBestPluResource, getCityContextMeta } from "./src/services/dataGouv.js";

async function test() {
  console.log("--- Testing Data.gouv.fr Integration ---");
  
  const city = "Nogent-sur-Marne";
  console.log(`\n1. Searching for PLU datasets for ${city}...`);
  const datasets = await searchDatasets(`PLU ${city}`, 3);
  console.log(`Found ${datasets.length} datasets.`);
  
  if (datasets.length > 0) {
    datasets.forEach(d => console.log(` - [${d.id}] ${d.title} (by ${d.organization})`));
    const best = findBestPluResource(datasets[0]);
    console.log(`\n2. Best resource for ${datasets[0].title}:`);
    console.log(best ? ` - Found: ${best.title}\n - URL: ${best.url}` : " - No PDF found.");
  }

  console.log(`\n3. Fetching territorial context for ${city}...`);
  const meta = await getCityContextMeta(city);
  console.log(`Context labels: ${meta.join(", ")}`);
  
  console.log("\n--- Test Finished ---");
}

test().catch(console.error);
