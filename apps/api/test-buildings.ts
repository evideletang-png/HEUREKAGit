import { geocodeAddress } from "./src/services/geocoding.js";
import { getParcelByCoords, getBuildingsByParcel } from "./src/services/parcel.js";

async function test() {
  const query = "9 Rue Dorus 76790 Étretat";
  const geo = await geocodeAddress(query);
  if (!geo.length) return;
  const { lat, lng } = geo[0];
  
  const parcel = await getParcelByCoords(lat, lng);
  console.log("Parcel:", parcel.cadastralSection, parcel.parcelNumber);
  
  const result = await getBuildingsByParcel(parcel);
  if (result.analyseParcelleResult) {
    console.log("AnalyseResult.buildings.length:", result.analyseParcelleResult.buildings?.length);
    if (result.analyseParcelleResult.buildings && result.analyseParcelleResult.buildings.length > 0) {
       console.log("First Building Sample:", JSON.stringify(result.analyseParcelleResult.buildings[0], null, 2));
    }
  }
  console.log("Result.buildings.length (returned to UI):", result.buildings.length);
  
  result.buildings.forEach((b, i) => {
    console.log(`Building ${i}:`, b.footprintM2, "m2");
  });
}

test();
