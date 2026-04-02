import { db } from "@workspace/db";
import { dossiersTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export class DocumentGenerationService {
  /**
   * Génère un brouillon d'arrêté basé sur les conclusions de l'instruction.
   */
  static async generateArreteDraft(dossierId: string, authorId: string) {
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId)).limit(1);
    if (!dossier) throw new Error("DOSSIER_NOT_FOUND");

    const [author] = await db.select().from(usersTable).where(eq(usersTable.id, authorId)).limit(1);

    const metadata = dossier.metadata as any;
    const dateStr = new Date().toLocaleDateString('fr-FR');
    
    let content = `# ARRÊTÉ DE PERMIS DE CONSTRUIRE\n\n`;
    content += `**Dossier N° :** ${dossier.dossierNumber || 'N/A'}\n`;
    content += `**Date :** ${dateStr}\n`;
    content += `**Adresse du projet :** ${dossier.address}, ${dossier.commune}\n\n`;
    
    content += `## VISA\n\n`;
    content += `- Vu le Code de l'Urbanisme ;\n`;
    content += `- Vu le Plan Local d'Urbanisme de la commune de ${dossier.commune} ;\n`;
    
    if (dossier.isAbfConcerned) {
      content += `- Vu l'avis de l'Architecte des Bâtiments de France en date du ${dateStr} ;\n`;
    }
    
    content += `\n## CONSIDÉRANT\n\n`;
    
    // Auto-generate reasons from PLU Analysis
    if (metadata?.pluAnalysis?.controles) {
      const conformes = metadata.pluAnalysis.controles.filter((c: any) => c.statut === 'CONFORME');
      conformes.forEach((c: any) => {
        content += `- Considérant que le projet respecte les dispositions de l'article ${c.article || 'N/A'} relatif à ${c.categorie} ;\n`;
      });
    }
    
    content += `\n## DÉCISION\n\n`;
    const isReady = metadata?.pluAnalysis?.conclusion === 'CONFORME';
    content += `**Le Maire de la commune de ${dossier.commune} ARRÊTE :**\n\n`;
    content += `**Article 1 :** Le permis de construire est **${isReady ? 'ACCORDÉ' : 'REJETÉ'}**.\n`;
    
    if (!isReady) {
      content += `\n**Motifs du rejet :**\n`;
      content += metadata?.pluAnalysis?.summary || "Le projet ne présente pas les garanties de conformité nécessaires.";
    }
    
    content += `\n\nFait à ${dossier.commune}, le ${dateStr}\n\n`;
    content += `**Signataire :** ${author?.name || 'Le Maire'}\n`;

    return {
      title: `Brouillon Arrêté - ${dossier.dossierNumber}`,
      content: content,
      type: "DECISION_DRAFT",
      generatedAt: new Date().toISOString()
    };
  }
}
