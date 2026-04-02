
import { queryRelevantChunks } from "../services/embeddingService.js";
import { resolveJurisdictionContext } from "../services/orchestrator.js";

async function verify() {
  const insee = "37203";
  const jurisdiction = await resolveJurisdictionContext(insee);
  
  console.log("--- TESTING ZONE N (9 Chemin de Bois Soleil) ---");
  const resN = await queryRelevantChunks("Article N", { 
    municipalityId: insee, 
    zoneCode: "N",
    jurisdictionContext: jurisdiction,
    provenances: ["base_ia_plu"]
  });
  console.log(`Found ${resN.length} chunks.`);
  resN.forEach(c => console.log(`[${c.metadata.provenance}] ${c.content}`));

  console.log("\n--- TESTING ZONE UB (1 Rue de la Mairie) ---");
  const resUB = await queryRelevantChunks("Article UB", { 
    municipalityId: insee, 
    zoneCode: "UB",
    jurisdictionContext: jurisdiction,
    provenances: ["base_ia_plu"]
  });
  console.log(`Found ${resUB.length} chunks.`);
  resUB.forEach(c => console.log(`[${c.metadata.provenance}] ${c.content}`));
}

verify().catch(console.error);
