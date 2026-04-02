import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { db, townHallDocumentsTable } from "../../../lib/db/src/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pdfPath = path.join(__dirname, "ndo_plu.pdf");
  console.log(`Loading PDF from ${pdfPath}...`);
  const buffer = fs.readFileSync(pdfPath);
  const data = await pdf(buffer);
  
  const rawText = data.text;
  console.log(`Extracted ${rawText.length} characters.`);

  const commune = "Notre-Dame-d'Oé";
  const userId = "0a9809d3-042e-417f-bd87-eee7653baeff"; // Admin user

  console.log(`Inserting into town_hall_documents for ${commune}...`);
  await db.insert(townHallDocumentsTable).values({
    userId,
    title: "Règlement PLU Officiel (GPU 2021)",
    fileName: "37172_reglement_20210527.pdf",
    rawText: rawText,
    commune: commune,
    category: "REGULATORY",
    subCategory: "PLU",
    isRegulatory: true,
    isOpposable: true
  });

  console.log("Done!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
