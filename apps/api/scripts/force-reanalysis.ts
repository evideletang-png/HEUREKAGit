console.log("--- FORCE REANALYSIS START ---");
import path from "path";
import { fileURLToPath } from "url";
import { db, analysesTable, parcelsTable } from "../../../lib/db/src/index.ts";
import { eq, sql } from "drizzle-orm";
import { runAnalysisPipeline } from "../src/routes/analyses.ts";
import { ParcelData } from "../src/services/parcel.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const analysisId = process.argv[2];
  if (!analysisId) {
    console.error("Usage: tsx scripts/force-reanalysis.ts <analysis_id>");
    process.exit(1);
  }

  console.log(`Force-triggering analysis for ${analysisId}...`);

  const [analysis] = await db.select().from(analysesTable).where(eq(analysesTable.id, analysisId)).limit(1);
  if (!analysis) {
    console.error(`Analysis ${analysisId} not found`);
    process.exit(1);
  }

  // Get geocoding results first if no parcel exists
  let parcelData: ParcelData;
  const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.analysisId, analysisId)).limit(1);
  
  if (parcel) {
      console.log("Using existing parcel data...");
      parcelData = {
        cadastralSection: parcel.cadastralSection || "",
        parcelNumber: parcel.parcelNumber || "",
        parcelSurfaceM2: parcel.parcelSurfaceM2 || 0,
        geometryJson: parcel.geometryJson ? JSON.parse(parcel.geometryJson) : {},
        centroidLat: parcel.centroidLat || 0,
        centroidLng: parcel.centroidLng || 0,
        roadFrontageLengthM: parcel.roadFrontageLengthM || 0,
        sideBoundaryLengthM: parcel.sideBoundaryLengthM || 0,
        metadata: parcel.metadataJson ? JSON.parse(parcel.metadataJson) : {},
      };
      
      if (parcel.metadataJson) {
          const meta = JSON.parse(parcel.metadataJson);
          (parcelData as any)._perimeterM = meta._perimeterM;
          (parcelData as any)._depthM = meta._depthM;
          (parcelData as any)._shapeRatio = meta._shapeRatio;
          (parcelData as any)._isCornerPlot = meta._isCornerPlot;
          (parcelData as any)._topography = meta._topography;
          (parcelData as any)._bboxString = meta._bboxString;
          (parcelData as any)._classifyBoundariesResult = meta._classifyBoundariesResult;
          (parcelData as any)._roadFeatures = meta._roadFeatures;
          (parcelData as any)._neighbourBuildingFeatures = meta._neighbourBuildingFeatures;
      }
  } else {
      console.log("No parcel found. The pipeline will geocode from scratch.");
      // Dummy parcel data to satisfy type, runAnalysisPipeline will re-geocode if needed
      // Actually, runAnalysisPipeline handles the whole thing.
      parcelData = {} as any;
  }

  console.log("Running pipeline...");
  // Note: runAnalysisPipeline internally geocodes if status is updated correctly.
  // We'll call it and let it do its thing.
  await runAnalysisPipeline(analysisId, parcelData, analysis.userId, analysis.title || "");
  console.log("Done!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
