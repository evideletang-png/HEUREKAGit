import { geocodeAddress } from "./src/services/geocoding.js";
import { getZoningByCoords } from "./src/services/planning.js";

async function run() {
  const geo = await geocodeAddress("9 Rue Dorus Étretat");
  if (!geo[0]) {
    console.log("Not found");
    return;
  }
  const zoning = await getZoningByCoords(geo[0].lat, geo[0].lng);
  console.log("Zoning URL:", zoning?.sourceUrl);
  console.log("Document Title:", zoning?.documentTitle);
}
run();
