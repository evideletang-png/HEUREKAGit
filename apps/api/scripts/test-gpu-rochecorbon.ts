import { GPUProviderService } from "../src/services/gpuProviderService";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Bypass SSL for prototype tests with GPU API

async function testRochecorbon() {
  const inseeCode = "37203"; // Rochecorbon
  console.log(`[TEST] Démarrage du test d'auto-ingestion pour Rochecorbon (${inseeCode})`);
  
  try {
    // 1. Lister les documents
    const documents = await GPUProviderService.getDocumentsByInsee(inseeCode);
    console.log(`[TEST] ${documents.length} documents trouvés sur le GPU.`);
    
    if (documents.length === 0) {
      console.warn("[TEST] Aucun document trouvé. Fin du test.");
      return;
    }

    const latestDoc = documents[0];
    console.log(`[TEST] Document le plus récent: ${latestDoc.originalName} (ID: ${latestDoc.id})`);
    console.log(`[TEST] Statut Légal: ${latestDoc.legalStatus} - Date: ${latestDoc.publicationDate}`);

    // 2. Lister les fichiers
    const filesResponse = await GPUProviderService.getFilesByDocumentId(latestDoc.id);
    const criticalFiles = GPUProviderService.filterCriticalFiles(filesResponse);
    
    console.log(`[TEST] ${criticalFiles.length} fichiers critiques (Règlements/Zonages) identifiés.`);
    
    for (const file of criticalFiles) {
      // 3. Génération de la note explicative
      const note = await GPUProviderService.generateExplanatoryNote(file.name);
      console.log(`\n- Fichier: ${file.name}`);
      console.log(`  🔗 URL: ${file.url}`);
      console.log(`  🤖 Note IA: "${note}"`);
    }

    console.log("\n[TEST] Fin du test Rochecorbon avec succès.");
  } catch (err) {
    console.error("[TEST] Erreur lors du test Rochecorbon:", err);
  }
}

testRochecorbon();
