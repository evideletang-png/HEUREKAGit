import { getBuildingsByParcel } from "./src/services/parcel.js";

async function test() {
  const parcelData: any = {
    centroidLat: 47.403167,
    centroidLng: 0.653205,
    _bboxString: "0.6529,47.4027,0.6538,47.4034",
    geometryJson: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [0.65292077, 47.4026849],
          [0.65386976, 47.4026849],
          [0.65386976, 47.40339636],
          [0.65292077, 47.40339636],
          [0.65292077, 47.4026849]
        ]]
      }
    }
  };

  console.log("Running getBuildingsByParcel test with REAL coordinates...");
  const result = await getBuildingsByParcel(parcelData);
  console.log("Buildings found:", result.buildings.length);
  result.buildings.forEach((b, i) => {
    console.log(`Building ${i+1}: ${b.footprintM2}m2`);
  });
}

test().catch(console.error);
