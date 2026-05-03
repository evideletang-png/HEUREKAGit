import { db } from "@workspace/db";
import { dossiersTable } from "@workspace/db/schema";
import { documentReviewsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { PROCEDURES } from "../constants/procedures.js";

export interface PreControlReport {
  completude: string; // e.g., "50%", "100%"
  pieces_manquantes: Array<{ code: string; nom: string; motif: string }>;
  pieces_incorrectes: Array<{ code: string; nom: string; motif: string }>;
  incoherences: string[];
  suggestedAction: string; // ex. : "Passer en dossier incomplet"
}

export async function executePreControl(dossierId: string): Promise<PreControlReport> {
  // 1. Fetch Dossier configuration
  const dossierResults = await db.select()
    .from(dossiersTable)
    .where(eq(dossiersTable.id, dossierId))
    .limit(1);

  if (dossierResults.length === 0) {
    throw new Error(`Dossier introuvable: ${dossierId}`);
  }
  const dossier = dossierResults[0];
  const procType = dossier.typeProcedure; // e.g., "PC"

  // 2. Fetch expected pieces for this procedure
  const procedureDef = PROCEDURES[procType];
  if (!procedureDef) {
    throw new Error(`Type de procédure inconnu: ${procType}`);
  }
  const mandatoryPieces = procedureDef.pieces.filter(p => p.isMandatory);

  // 3. Fetch existing pieces uploaded for this dossier
  const existingDocs = await db.select()
    .from(documentReviewsTable)
    .where(eq(documentReviewsTable.dossierId, dossierId));

  const report: PreControlReport = {
    completude: "0%",
    pieces_manquantes: [],
    pieces_incorrectes: [],
    incoherences: [],
    suggestedAction: "Passer en dossier incomplet"
  };

  let validCount = 0;

  // 4. Analyze each mandatory piece
  for (const exp of mandatoryPieces) {
    const doc = existingDocs.find(d => d.pieceCode === exp.code);
    
    if (!doc) {
      report.pieces_manquantes.push({
        code: exp.code,
        nom: exp.name,
        motif: "Pièce absente du dossier"
      });
    } else if (doc.pieceStatus === "manquante") {
      report.pieces_manquantes.push({
        code: exp.code,
        nom: exp.name,
        motif: doc.failureReason || "Pièce déclarée manquante par le système"
      });
    } else if (doc.pieceStatus === "incorrecte") {
      report.pieces_incorrectes.push({
        code: exp.code,
        nom: exp.name,
        motif: doc.failureReason || "La pièce ne correspond pas aux normes attendues (ex: illisible, mauvaise échelle)"
      });
    } else {
      validCount++;
    }
  }

  // Calculate completion percentage based on mandatory pieces only
  const totalMandatory = mandatoryPieces.length;
  const percentage = totalMandatory > 0 ? Math.round((validCount / totalMandatory) * 100) : 100;
  report.completude = `${percentage}%`;

  // 5. Workflow suggestion logic
  if (percentage === 100 && report.pieces_incorrectes.length === 0) {
    report.suggestedAction = "Passer en instruction démarrée (pré-contrôle validé)";
  } else {
    report.suggestedAction = "Passer en dossier incomplet (notification à envoyer au pétitionnaire)";
  }

  return report;
}
