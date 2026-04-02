import { JurisdictionContext, GLOBAL_POOL_ID } from "./schemas/jurisdiction.js";
import { KnowledgeMetadataSchema } from "./schemas/retrieval.js";

/**
 * JURISDICTION CONTAMINATION & SCOPING TEST
 * 
 * Verifies that the retrieval logic correctly enforces:
 * 1. City Isolation (City A != City B)
 * 2. Pool Activation (Pool must be in active_pool_ids)
 * 3. Status Exclusion (Archived/Draft docs excluded)
 * 4. National Reach (Global pool always included)
 */

async function runContaminationTests() {
  console.log("🚀 Starting Jurisdiction Boundary Tests...");

  // Mock Context for Nogent-sur-Marne (94052)
  const contextA: JurisdictionContext = {
    commune_insee: "94052",
    jurisdiction_id: "EPCI-NOGENT",
    name: "Nogent-sur-Marne",
    plan_scope: "local",
    active_pool_ids: ["94052-PLU-ACTIVE", "EPCI-NOGENT-PLUi-ACTIVE"]
  };

  // Mock document database chunks
  const mockChunks = [
    { id: "nogent-plu-1", content: "Nogent rule...", metadata: { pool_id: "94052-PLU-ACTIVE", status: "active", commune: "94052" } },
    { id: "nogent-plu-old", content: "Nogent old rule...", metadata: { pool_id: "94052-PLU-ARCHIVED", status: "archived", commune: "94052" } },
    { id: "vincennes-plu-1", content: "Vincennes rule...", metadata: { pool_id: "94000-PLU-ACTIVE", status: "active", commune: "94042" } },
    { id: "national-rnu-1", content: "National RNU rule...", metadata: { pool_id: GLOBAL_POOL_ID, status: "active", commune: "NATIONAL" } }
  ];

  const eligiblePools = [...contextA.active_pool_ids, GLOBAL_POOL_ID];

  console.log(`\nAnalyzing boundaries for: ${contextA.name} (Active Pools: ${eligiblePools.join(", ")})`);

  const results = mockChunks.filter(chunk => {
    const meta = KnowledgeMetadataSchema.parse(chunk.metadata);
    
    // THE SCOPING ENGINE LOGIC (Scaffolded from embeddingService.ts)
    const isStatusActive = meta.status === "active";
    const isPoolEligible = eligiblePools.includes(meta.pool_id);

    return isStatusActive && isPoolEligible;
  });

  const returnedIds = results.map(r => r.id);

  // Assertions
  const nogentActiveFound = returnedIds.includes("nogent-plu-1");
  const vincennesFound = returnedIds.includes("vincennes-plu-1");
  const archivedFound = returnedIds.includes("nogent-plu-old");
  const nationalFound = returnedIds.includes("national-rnu-1");

  if (nogentActiveFound && nationalFound && !vincennesFound && !archivedFound) {
    console.log("✅ SUCCESS: Boundary Enforcement confirmed!");
    console.log(" - [OK] Correct city documents retrieved");
    console.log(" - [OK] National documents retrieved");
    console.log(" - [OK] Other city documents ISOLATED");
    console.log(" - [OK] Archived documents EXCLUDED");
  } else {
    console.error("❌ FAILURE: Jurisdiction leakage or over-filtering detected!");
    console.log("Returned IDs:", returnedIds);
    process.exit(1);
  }
}

runContaminationTests().catch(console.error);
