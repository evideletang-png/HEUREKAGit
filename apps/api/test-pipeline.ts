import { geocodeAddress } from "./src/services/geocoding.js";
import { getParcelByCoords } from "./src/services/parcel.js";

async function run() {
  const query = "9 Rue Dorus 76790 Étretat";
  const geo = await geocodeAddress(query);
  if (!geo.length) {
    console.log("No geocoding");
    return;
  }
  const { lat, lng, banId, label } = geo[0];
  console.log("Geocoded:", { lat, lng, banId, label });

  try {
    const parcel = await getParcelByCoords(lat, lng, banId || "", label);
    console.log("SUCCESS! Parcel:", parcel.cadastralSection, parcel.parcelNumber);
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
  }
}
run();
