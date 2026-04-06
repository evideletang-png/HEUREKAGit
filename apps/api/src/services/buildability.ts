/**
 * Buildability Calculator Service
 * Computes the theoretical construction potential based on PLU rules and parcel data.
 * Transparent, assumption-based calculations with confidence scoring.
 */

export interface BuildabilityInput {
  parcelSurfaceM2: number;
  existingFootprintM2: number;
  roadFrontageLengthM: number;
  sideBoundaryLengthM: number;
  calculationVariables: {
    maxFootprintRatio: number | null;
    maxHeightM: number | null;
    minSetbackFromRoadM: number | null;
    minSetbackFromBoundariesM: number | null;
    parkingRules: string | null;
    greenSpaceRatio: number | null;
  };
}

export interface BuildabilityOutput {
  maxFootprintM2: number | null;
  remainingFootprintM2: number | null;
  maxHeightM: number | null;
  setbackRoadM: number | null;
  setbackBoundaryM: number | null;
  parkingRequirement: string | null;
  greenSpaceRequirement: string | null;
  assumptions: string[];
  confidenceScore: number;
  resultSummary: string;
}

const FLOOR_HEIGHT_M = 3.0;

export function calculateBuildability(input: BuildabilityInput): BuildabilityOutput {
  const assumptions: string[] = [];
  let confidencePoints = 0;
  let maxConfidencePoints = 0;

  // Resolve footprint ratio
  maxConfidencePoints += 25;
  let footprintRatio = input.calculationVariables.maxFootprintRatio;
  if (footprintRatio !== null) {
    while (footprintRatio > 1) footprintRatio /= 100; // Sanitize % to decimal
    confidencePoints += 25;
  } else {
    assumptions.push("Emprise au sol : aucune règle opposable stabilisée n'a été retrouvée (article 9).");
  }

  // Resolve max height
  maxConfidencePoints += 25;
  let maxHeightM = input.calculationVariables.maxHeightM;
  if (maxHeightM !== null) {
    confidencePoints += 25;
  } else {
    assumptions.push("Hauteur maximale : aucune règle opposable stabilisée n'a été retrouvée (article 10).");
  }

  // Resolve setback from road
  maxConfidencePoints += 15;
  let setbackRoadM = input.calculationVariables.minSetbackFromRoadM;
  if (setbackRoadM !== null) {
    confidencePoints += 15;
  } else {
    assumptions.push("Recul voie : aucune règle opposable stabilisée n'a été retrouvée (article 6).");
  }

  // Resolve setback from boundaries
  maxConfidencePoints += 15;
  let setbackBoundaryM = input.calculationVariables.minSetbackFromBoundariesM;
  if (setbackBoundaryM !== null) {
    confidencePoints += 15;
  } else {
    assumptions.push("Recul limites séparatives : aucune règle opposable stabilisée n'a été retrouvée (article 7).");
  }

  // Resolve green space ratio
  maxConfidencePoints += 10;
  let greenSpaceRatio = input.calculationVariables.greenSpaceRatio;
  if (greenSpaceRatio !== null) {
    while (greenSpaceRatio > 1) greenSpaceRatio /= 100; // Sanitize % to decimal
    confidencePoints += 10;
  } else {
    assumptions.push("Espaces verts : aucune règle opposable stabilisée n'a été retrouvée (article 13).");
  }

  // Calculate max theoretical footprint from PLU only when a real rule is available.
  const maxFootprintFromPLU = footprintRatio != null ? input.parcelSurfaceM2 * footprintRatio : null;

  // Calculate buildable area after green space requirement only when a real rule is available.
  const greenSpaceRequired = greenSpaceRatio != null ? input.parcelSurfaceM2 * greenSpaceRatio : null;
  const maxBuildableArea = greenSpaceRequired != null ? input.parcelSurfaceM2 - greenSpaceRequired : null;

  // Net footprint only when at least one explicit regulatory limiter exists.
  const maxFootprintM2 = (() => {
    if (maxFootprintFromPLU == null && maxBuildableArea == null) return null;
    if (maxFootprintFromPLU == null) return maxBuildableArea;
    if (maxBuildableArea == null) return maxFootprintFromPLU;
    return Math.min(maxFootprintFromPLU, maxBuildableArea);
  })();

  // Remaining footprint after existing buildings
  const remainingFootprintM2 = maxFootprintM2 != null
    ? Math.max(0, maxFootprintM2 - input.existingFootprintM2)
    : null;

  // Estimated number of floors
  const estimatedFloors = maxHeightM != null ? Math.floor(maxHeightM / FLOOR_HEIGHT_M) : null;

  // Generate summary
  const parkingRequirement = input.calculationVariables.parkingRules || null;
  const greenSpaceRequirement = greenSpaceRatio != null && greenSpaceRequired != null
    ? `${Math.round(greenSpaceRatio * 100)}% de la superficie (${Math.round(greenSpaceRequired)} m²)`
    : null;

  const confidenceScore = maxConfidencePoints > 0 ? confidencePoints / maxConfidencePoints : 0;

  // Add general assumptions
  if (input.parcelSurfaceM2 > 0) {
    assumptions.push(`Surface de parcelle : ${input.parcelSurfaceM2} m² (source : données cadastrales).`);
    assumptions.push(`Emprise bâtie existante : ${input.existingFootprintM2} m² prise en compte.`);
    if (estimatedFloors != null) {
      assumptions.push(`Nombre d'étages estimé : R+${estimatedFloors - 1} sur la base d'une hauteur sous plafond de ${FLOOR_HEIGHT_M} m.`);
    }
    assumptions.push(`Ce calcul est une estimation théorique. Il ne tient pas compte des contraintes de forme du terrain, des servitudes, ni des règles de prospect.`);
  }

  const resultSummary = [
    `Parcelle analysée : ${input.parcelSurfaceM2} m².`,
    maxFootprintM2 != null
      ? `Emprise théorique calculable : ${Math.round(maxFootprintM2)} m², dont ${Math.round(remainingFootprintM2 ?? 0)} m² restent disponibles après les constructions existantes (${input.existingFootprintM2} m²).`
      : "Emprise théorique non calculable faute de règle opposable stabilisée.",
    maxHeightM != null && estimatedFloors != null
      ? `Hauteur maximale retenue : ${maxHeightM} m, soit environ R+${estimatedFloors - 1}.`
      : "Hauteur maximale non déterminée de manière opposable.",
    `Niveau de confiance : ${Math.round(confidenceScore * 100)}%.`,
  ].join(" ");

  return {
    maxFootprintM2: maxFootprintM2 != null ? Math.round(maxFootprintM2 * 100) / 100 : null,
    remainingFootprintM2: remainingFootprintM2 != null ? Math.round(remainingFootprintM2 * 100) / 100 : null,
    maxHeightM,
    setbackRoadM,
    setbackBoundaryM,
    parkingRequirement,
    greenSpaceRequirement,
    assumptions,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    resultSummary,
  };
}
