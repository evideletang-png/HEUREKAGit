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

const DEFAULT_FOOTPRINT_RATIO = 0.4;
const DEFAULT_HEIGHT_M = 15;
const DEFAULT_SETBACK_ROAD_M = 5;
const DEFAULT_SETBACK_BOUNDARY_M = 3;
const DEFAULT_GREEN_RATIO = 0.2;
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
    footprintRatio = DEFAULT_FOOTPRINT_RATIO;
    assumptions.push(`Emprise au sol : valeur par défaut de ${Math.round(DEFAULT_FOOTPRINT_RATIO * 100)}% retenue (article 9 non identifié clairement).`);
  }

  // Resolve max height
  maxConfidencePoints += 25;
  let maxHeightM = input.calculationVariables.maxHeightM;
  if (maxHeightM !== null) {
    confidencePoints += 25;
  } else {
    maxHeightM = DEFAULT_HEIGHT_M;
    assumptions.push(`Hauteur maximale : valeur par défaut de ${DEFAULT_HEIGHT_M} m retenue (article 10 non identifié clairement).`);
  }

  // Resolve setback from road
  maxConfidencePoints += 15;
  let setbackRoadM = input.calculationVariables.minSetbackFromRoadM;
  if (setbackRoadM !== null) {
    confidencePoints += 15;
  } else {
    setbackRoadM = DEFAULT_SETBACK_ROAD_M;
    assumptions.push(`Recul voie : valeur par défaut de ${DEFAULT_SETBACK_ROAD_M} m retenue.`);
  }

  // Resolve setback from boundaries
  maxConfidencePoints += 15;
  let setbackBoundaryM = input.calculationVariables.minSetbackFromBoundariesM;
  if (setbackBoundaryM !== null) {
    confidencePoints += 15;
  } else {
    setbackBoundaryM = DEFAULT_SETBACK_BOUNDARY_M;
    assumptions.push(`Recul limites séparatives : valeur par défaut de ${DEFAULT_SETBACK_BOUNDARY_M} m retenue.`);
  }

  // Resolve green space ratio
  maxConfidencePoints += 10;
  let greenSpaceRatio = input.calculationVariables.greenSpaceRatio;
  if (greenSpaceRatio !== null) {
    while (greenSpaceRatio > 1) greenSpaceRatio /= 100; // Sanitize % to decimal
    confidencePoints += 10;
  } else {
    greenSpaceRatio = DEFAULT_GREEN_RATIO;
    assumptions.push(`Espaces verts : valeur par défaut de ${Math.round(DEFAULT_GREEN_RATIO * 100)}% retenue.`);
  }

  // Calculate max theoretical footprint from PLU
  const maxFootprintFromPLU = input.parcelSurfaceM2 * footprintRatio;

  // Calculate buildable area after green space requirement
  const greenSpaceRequired = input.parcelSurfaceM2 * greenSpaceRatio;
  const maxBuildableArea = input.parcelSurfaceM2 - greenSpaceRequired;

  // Net footprint = min of PLU limit and buildable area
  const maxFootprintM2 = Math.min(maxFootprintFromPLU, maxBuildableArea);

  // Remaining footprint after existing buildings
  const remainingFootprintM2 = Math.max(0, maxFootprintM2 - input.existingFootprintM2);

  // Estimated number of floors
  const estimatedFloors = Math.floor(maxHeightM / FLOOR_HEIGHT_M);

  // Generate summary
  const parkingRequirement = input.calculationVariables.parkingRules || "1 place / logement (règle par défaut)";
  const greenSpaceRequirement = `${Math.round(greenSpaceRatio * 100)}% de la superficie (${Math.round(greenSpaceRequired)} m²)`;

  const confidenceScore = maxConfidencePoints > 0 ? confidencePoints / maxConfidencePoints : 0;

  // Add general assumptions
  if (input.parcelSurfaceM2 > 0) {
    assumptions.push(`Surface de parcelle : ${input.parcelSurfaceM2} m² (source : données cadastrales).`);
    assumptions.push(`Emprise bâtie existante : ${input.existingFootprintM2} m² prise en compte.`);
    assumptions.push(`Nombre d'étages estimé : R+${estimatedFloors - 1} sur la base d'une hauteur sous plafond de ${FLOOR_HEIGHT_M} m.`);
    assumptions.push(`Ce calcul est une estimation théorique. Il ne tient pas compte des contraintes de forme du terrain, des servitudes, ni des règles de prospect.`);
  }

  const resultSummary = `Sur une parcelle de ${input.parcelSurfaceM2} m², le potentiel constructible théorique est de ${Math.round(maxFootprintM2)} m² d'emprise au sol, dont ${Math.round(remainingFootprintM2)} m² restent disponibles après les constructions existantes (${input.existingFootprintM2} m²). La hauteur maximale de ${maxHeightM} m correspond à environ R+${estimatedFloors - 1}. Niveau de confiance : ${Math.round(confidenceScore * 100)}%.`;

  return {
    maxFootprintM2: Math.round(maxFootprintM2 * 100) / 100,
    remainingFootprintM2: Math.round(remainingFootprintM2 * 100) / 100,
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
