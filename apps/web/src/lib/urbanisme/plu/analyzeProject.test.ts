import { analyzeProject } from "./analyzeProject";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const analysis = analyzeProject({
  parcel: { reference: "CL 0954" },
  zone: {
    code: "UA",
    rules: [
      {
        article: "Article 7",
        rule: "Recul 5m",
        compliant: false,
        explanation: "Le recul mesuré est inférieur à 5m.",
      },
      {
        article: "Article 7",
        rule: "Recul 5m",
        compliant: false,
        explanation: "Doublon qui doit être ignoré.",
      },
      {
        article: "Article 10",
        rule: "Hauteur maximale",
        explanation: "Pas de statut explicite, donc non exploitable.",
      },
    ],
  },
  projectDetails: {
    pluAnalysis: {
      controles: [
        {
          articleNumber: "11",
          articleTitle: "Aspect extérieur",
          statut: "CONFORME",
          explication: "Les matériaux déclarés sont compatibles avec la règle analysée.",
        },
      ],
    },
  },
});

assert(analysis.rulesChecked.length === 2, "Seules les règles avec article, règle et résultat explicite doivent être conservées");
assert(analysis.rulesChecked[0]?.article === "Article 11", "Les contrôles de l'analyse projet doivent être repris");
assert(analysis.rulesChecked.some((rule) => rule.article === "Article 7" && rule.compliant === false), "La non-conformité de zone doit être visible");

const empty = analyzeProject({
  zone: {
    rules: [
      { article: "Article 6", rule: "Implantation" },
      { compliant: true, explanation: "Sans règle source" },
    ],
  },
});

assert(empty.rulesChecked.length === 0, "Le moteur ne doit pas inventer de règle ni de conformité");

console.info("[analyzeProject] analyse PLU projet OK");
