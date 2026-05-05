import { getRequiredPieces } from "./pieceRequirements";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function hasPiece(result: ReturnType<typeof getRequiredPieces>, code: string) {
  return result.locationAdditionalPieces.some((piece) => piece.code === code)
    || result.projectConditionalPieces.some((piece) => piece.code === code)
    || result.requiredPieces.some((piece) => piece.code === code);
}

const baseAddress = { label: "4 Place Loiseau d'Entraigues 37000 Tours", city: "Tours", citycode: "37261" };

const cases = [
  {
    name: "adresse sans contrainte particulière",
    result: getRequiredPieces({
      procedureType: "PCMI",
      selectedAddress: baseAddress,
      parcelAnalysis: { parcelRef: "CL 0954", section: "CL", number: "0954", zoneCode: "UA", constraints: [] },
    }),
    expect: (result: ReturnType<typeof getRequiredPieces>) => {
      assert(hasPiece(result, "PCMI1"), "PCMI1 attendu");
      assert(result.locationAdditionalPieces.length === 0, "aucune pièce locale ne doit être inventée");
    },
  },
  {
    name: "adresse en ABF",
    result: getRequiredPieces({
      procedureType: "DP",
      selectedAddress: baseAddress,
      parcelAnalysis: {
        parcelRef: "CL 0954",
        zoneCode: "UA",
        constraints: [{ title: "Abords de monument historique AC1", source: "GPU" }],
      },
    }),
    expect: (result: ReturnType<typeof getRequiredPieces>) => {
      assert(hasPiece(result, "LOC-ABF-INSERTION"), "pièce ABF insertion attendue");
      assert(hasPiece(result, "LOC-ABF-FACADES"), "pièce ABF façade attendue pour DP");
    },
  },
  {
    name: "adresse en OAP",
    result: getRequiredPieces({
      procedureType: "PC",
      selectedAddress: baseAddress,
      parcelAnalysis: { parcelRef: "CL 0954", zoneCode: "UB", constraints: [{ title: "OAP Centre-bourg" }] },
    }),
    expect: (result: ReturnType<typeof getRequiredPieces>) => {
      assert(hasPiece(result, "LOC-OAP-COMPAT"), "compatibilité OAP attendue");
    },
  },
  {
    name: "adresse en PPRI",
    result: getRequiredPieces({
      procedureType: "PCMI",
      selectedAddress: baseAddress,
      parcelAnalysis: { parcelRef: "CL 0954", zoneCode: "N", constraints: [{ title: "Zone inondable - PPRI Val de Loire PM1" }] },
    }),
    expect: (result: ReturnType<typeof getRequiredPieces>) => {
      assert(hasPiece(result, "LOC-PPRI-NGF"), "pièce altimétrique PPRI attendue");
    },
  },
  {
    name: "zone PLU inconnue",
    result: getRequiredPieces({
      procedureType: "DP",
      selectedAddress: baseAddress,
      parcelAnalysis: { parcelRef: "CL 0954", constraints: [] },
    }),
    expect: (result: ReturnType<typeof getRequiredPieces>) => {
      assert(result.vigilancePoints.some((warning) => /Checklist provisoire/i.test(warning)), "vigilance zonage attendue");
    },
  },
  {
    name: "contrainte faible confiance",
    result: getRequiredPieces({
      procedureType: "PCMI",
      selectedAddress: baseAddress,
      parcelAnalysis: { parcelRef: "CL 0954", constraints: [{ title: "argile retrait gonflement à vérifier" }] },
    }),
    expect: (result: ReturnType<typeof getRequiredPieces>) => {
      assert(hasPiece(result, "LOC-RISQUE-GEOTECH"), "pièce risque géotechnique attendue");
      assert(result.locationAdditionalPieces.some((piece) => piece.confidence && piece.confidence < 0.7), "confiance faible/moyenne attendue");
    },
  },
];

for (const testCase of cases) {
  testCase.expect(testCase.result);
}

console.info(`[pieceRequirements] ${cases.length} cas de checklist contextualisée OK`);
