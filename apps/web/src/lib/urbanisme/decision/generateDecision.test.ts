import type { ProjectContext } from "../cerfa/officialPieces.types";
import { generateDecision } from "./generateDecision";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const projectContext: ProjectContext = {
  dossierType: "PCMI",
  projectFlags: {},
  locationContext: {
    commune: "Tours",
    parcel: "CL 0954",
    pluZone: "UA",
  },
};

const approved = generateDecision({
  projectContext,
  pluAnalysis: {
    controles: [
      {
        articleNumber: "10",
        articleTitle: "Hauteur",
        compliant: true,
        justification: "La hauteur déclarée respecte le plafond analysé.",
      },
    ],
  },
  consultations: [],
  complianceStatus: { status: "complete", missingPieces: [], message: "Complet" },
});
assert(approved.decision === "approved", "Une analyse PLU conforme et un dossier complet doivent produire un accord");
assert(approved.motivations.length === 1, "La motivation conforme doit être reprise");
assert(approved.legalText.includes("Article 10 - Hauteur"), "Le texte doit citer l'article PLU fourni");

const refused = generateDecision({
  projectContext,
  pluAnalysis: {
    controles: [
      {
        sourceArticle: "Article 7 - Limites séparatives",
        result: "non conforme",
        reason: "Le recul déclaré est inférieur au recul minimal analysé.",
      },
    ],
  },
  consultations: [],
  complianceStatus: { status: "complete", missingPieces: [], message: "Complet" },
});
assert(refused.decision === "refused", "Une non-conformité PLU doit produire un refus");
assert(refused.motivations[0]?.result === "non-compliant", "La motivation doit porter le résultat non conforme");
assert(refused.legalText.includes("La demande d'autorisation d'urbanisme est refusée"), "Le texte doit générer un arrêté de refus");

const conditional = generateDecision({
  projectContext,
  pluAnalysis: {
    controles: [
      {
        rule: "Article 11 - Aspect extérieur",
        result: "conforme",
        justification: "Les matériaux décrits sont compatibles avec la règle analysée.",
      },
    ],
  },
  consultations: [{ service: "ABF", required: true, reason: "SPR", status: "pending", messagingTarget: "@ABF" }],
  complianceStatus: { status: "complete", missingPieces: [], message: "Complet" },
});
assert(conditional.decision === "conditional", "Une consultation obligatoire non reçue doit produire un accord sous réserve");
assert(conditional.legalText.includes("ABF"), "Le texte doit mentionner la consultation en attente");

const noInventedRule = generateDecision({
  projectContext,
  pluAnalysis: {
    controles: [
      {
        result: "conforme",
        justification: "Résultat sans règle source.",
      },
    ],
  },
  consultations: [],
  complianceStatus: { status: "complete", missingPieces: [], message: "Complet" },
});
assert(noInventedRule.decision === "approved", "Sans non-conformité explicite, la décision reste un accord");
assert(noInventedRule.motivations.length === 0, "Aucune motivation ne doit être inventée sans règle source");
assert(noInventedRule.legalText.includes("sans article PLU exploitable explicitement référencé"), "Le texte doit signaler l'absence de référence exploitable");

const globalRefusal = generateDecision({
  projectContext,
  pluAnalysis: { conclusion: "NON CONFORME" },
  consultations: [],
  complianceStatus: { status: "complete", missingPieces: [], message: "Complet" },
});
assert(globalRefusal.decision === "refused", "Une conclusion PLU globale non conforme doit refuser même sans motivation détaillée");

console.info("[generateDecision] décision d'urbanisme OK");
