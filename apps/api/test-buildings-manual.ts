import { geocodeAddress } from "./src/services/geocoding.js";
import { getParcelByCoords } from "./src/services/parcel.js";
import { getBdTopoBatiments } from "./src/services/parcel.js";
import * as turf from "@turf/turf";

async function test() {
  const query = "9 Rue Dorus 76790 Étretat";
  const geo = await geocodeAddress(query);
  if (!geo.length) return;
  const { lat, lng } = geo[0];
  
  const parcel = await getParcelByCoords(lat, lng);
  console.log("Parcel Geometry:", JSON.stringify(parcel.geometryJson.geometry));
  
  const d = 0.001; // Smaller bbox for focus
  const bboxString = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const rawBuildings = await getBdTopoBatiments(bboxString, 100);
  
  console.log("Total buildings in BBOX:", rawBuildings.length);
  const parcelPoly = (parcel as any).geometryJson.geometry;
  if (rawBuildings.length > 0) {
    console.log("First Building Sample Geometry:", JSON.stringify(rawBuildings[0].geometry));
  }
  const poly = parcelPoly.type === "MultiPolygon" ? turf.multiPolygon(parcelPoly.coordinates) : turf.polygon(parcelPoly.coordinates);
  
  const inside = rawBuildings.filter((f: any) => {
    try {
      const bCenter = turf.centroid(f.geometry);
      return turf.booleanPointInPolygon(bCenter, poly as any) || turf.booleanIntersects(f.geometry, poly as any);
    } catch (e) {
      return false;
    }
  });
  
  console.log("Buildings inside Parcel 1159 (Manual Turf check):", inside.length);
  inside.forEach((f: any, i: number) => {
    console.log(`Building ${i}: ID=${f.properties.cleabs}, Height=${f.properties.hauteur}`);
  });
}

test();
