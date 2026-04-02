import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { extractRelevantPLUSections } from "./src/services/pluAnalysis.js";
import fs from "fs";

async function debug() {
  const url = "https://www.geoportail-urbanisme.gouv.fr/api/document/ce5cabb5e455f8255681dc1f79e5076b/files/37214_reglement_20250224.pdf";
  console.log("Downloading PDF...");
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  
  console.log("Parsing PDF...");
  const data = await pdfParse(buffer);
  const fullText = data.text;
  console.log("Full text length:", fullText.length);
  
  // I'll just run the actual function and log inside it (I'll add console logs to pluAnalysis.ts temporarily)
  const extracted = extractRelevantPLUSections(fullText, "UBb");
  let m; // m needs to be declared if it's used here and not elsewhere
  const p2 = new RegExp(`ZONE\\s+UBB\\b`, "gi"); // p2 needs to be declared if it's used here
  while ((m = p2.exec(fullText)) !== null) {
    console.log(`Found "ZONE UBB" at index ${m.index}. Context: "${fullText.substring(m.index, m.index+50).replace(/\n/g, " ")}"`);
  }

  const zone = "UBb"; // zone needs to be declared again if it's used below
  console.log(`Extracting segments for zone ${zone}...`);
  // The line below was removed as per the instruction's replacement block.
  // const extracted = extractRelevantPLUSections(fullText, zone); 
  
  console.log("Extracted text length:", extracted.length);
  fs.writeFileSync("extracted_debug.txt", extracted);
  console.log("Saved to extracted_debug.txt");

  // Check for keywords
  const hasArt12 = extracted.toLowerCase().includes("article 12") || extracted.toLowerCase().includes("art 12");
  const hasUbb = extracted.toUpperCase().includes("ZONE UBB");
  console.log("Has Article 12?", hasArt12);
  console.log("Has Zone UBB?", hasUbb);
}

debug().catch(console.error);
