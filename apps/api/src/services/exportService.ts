import { BusinessDecision } from "../types/pipeline.js";

/**
 * Export Service for HEUREKA.
 * Supports JSON and HTML formats.
 */
export class ExportService {
  /**
   * Generates a clean HTML report for the decision.
   */
  static generateHTMLReport(decision: BusinessDecision, dossierTitle: string): string {
    const statusColor = this.getStatusColor(decision.decision);
    
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
          <meta charset="UTF-8">
          <title>Rapport d'Instruction HEUREKA - ${dossierTitle}</title>
          <style>
              body { font-family: 'Inter', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 40px auto; padding: 20px; }
              .header { border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
              .badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 0.9em; text-transform: uppercase; }
              .badge-favorable { background: #dcfce7; color: #166534; }
              .badge-defavorable { background: #fee2e2; color: #991b1b; }
              .badge-incomplet { background: #fef9c3; color: #854d0e; }
              .section { margin-bottom: 30px; }
              .section-title { font-size: 1.2em; font-weight: bold; margin-bottom: 10px; color: #374151; }
              .score-box { font-size: 2em; font-weight: bold; color: ${statusColor}; }
              ul { padding-left: 20px; }
              li { margin-bottom: 5px; }
              .footer { font-size: 0.8em; color: #9ca3af; margin-top: 50px; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
      </head>
      <body>
          <div class="header">
              <h1>Rapport d'Instruction Réglementaire</h1>
              <p>Dossier : <strong>${dossierTitle}</strong></p>
              <div class="badge badge-${decision.decision}">${decision.decision.replace(/_/g, ' ')}</div>
          </div>

          <div class="section">
              <div class="section-title">Score de Conformité</div>
              <div class="score-box">${decision.score}/100</div>
          </div>

          <div class="section">
              <div class="section-title">Justification</div>
              <p>${decision.justification}</p>
          </div>

          ${decision.blockingPoints.length > 0 ? `
          <div class="section">
              <div class="section-title" style="color: #991b1b;">Points Bloquants</div>
              <ul>
                  ${decision.blockingPoints.map(p => `<li>${p}</li>`).join('')}
              </ul>
          </div>
          ` : ''}

          <div class="section">
              <div class="section-title">Actions Requises</div>
              <ul>
                  ${decision.requiredActions.map(a => `<li>${a}</li>`).join('')}
              </ul>
          </div>

          <div class="footer">
              Généré par HEUREKA Engine v${decision.engineVersion} | ID: ${decision.requestId} | ${decision.timestamp}
          </div>
      </body>
      </html>
    `;
  }

  private static getStatusColor(decision: string): string {
    switch (decision) {
      case "favorable": return "#166534";
      case "defavorable": return "#991b1b";
      case "incomplet": return "#854d0e";
      default: return "#374151";
    }
  }
}
