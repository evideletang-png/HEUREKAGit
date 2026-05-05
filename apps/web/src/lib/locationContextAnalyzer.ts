export type LocationConstraintContext = {
  commune: string;
  codeInsee: string;
  address: string;
  parcel: {
    prefix?: string;
    section: string;
    number: string;
    fullReference: string;
  } | null;
  pluZone: {
    code: string | null;
    label?: string;
    confidence: number;
    source: string | null;
  };
  constraints: {
    abf: {
      isConcerned: boolean;
      perimeterType?: "monument_historique" | "site_patrimonial_remarquable" | "abords" | "unknown";
      source?: string;
    };
    protectedArea: {
      isConcerned: boolean;
      types: string[];
    };
    floodRisk: {
      isConcerned: boolean;
      ppriName?: string;
      level?: string;
    };
    naturalRisk: {
      isConcerned: boolean;
      types: string[];
    };
    forestFireRisk: {
      isConcerned: boolean;
    };
    seismicRisk: {
      isConcerned: boolean;
      level?: string;
    };
    clayShrinkSwell: {
      isConcerned: boolean;
      level?: string;
    };
    oap: {
      isConcerned: boolean;
      names: string[];
    };
    servitudes: {
      isConcerned: boolean;
      items: string[];
    };
    lotissement: {
      isConcerned: boolean;
      source?: string;
    };
  };
  missingData: string[];
  confidenceScore: number;
};

export type LocationContextInput = {
  selectedAddress?: any | null;
  parcelAnalysis?: any | null;
  addressLabel?: string | null;
};

function normalizeText(value: unknown): string {
  return String(value || "").toLowerCase();
}

function stringifySignals(value: unknown): string {
  try {
    return JSON.stringify(value || "").toLowerCase();
  } catch {
    return normalizeText(value);
  }
}

function collectConstraints(parcelAnalysis?: any | null): unknown[] {
  return [
    ...(Array.isArray(parcelAnalysis?.constraints) ? parcelAnalysis.constraints : []),
    ...(Array.isArray(parcelAnalysis?.overlays) ? parcelAnalysis.overlays : []),
    ...(Array.isArray(parcelAnalysis?.geoConstraints) ? parcelAnalysis.geoConstraints : []),
  ];
}

function labelsMatching(constraints: unknown[], pattern: RegExp): string[] {
  const labels = constraints
    .map((constraint: any) => {
      const label = constraint?.title || constraint?.label || constraint?.name || constraint?.description || constraint?.type || constraint?.code;
      return typeof label === "string" ? label : "";
    })
    .filter((label) => pattern.test(label));
  return Array.from(new Set(labels));
}

function parseParcel(parcelAnalysis?: any | null): LocationConstraintContext["parcel"] {
  const section = parcelAnalysis?.section || parcelAnalysis?.parcel?.section || "";
  const number = parcelAnalysis?.number || parcelAnalysis?.numero || parcelAnalysis?.parcel?.number || parcelAnalysis?.parcel?.numero || "";
  const fullReference = parcelAnalysis?.parcelRef || parcelAnalysis?.parcelId || [section, number].filter(Boolean).join(" ");
  if (!section && !number && !fullReference) return null;
  return {
    prefix: parcelAnalysis?.prefix || parcelAnalysis?.parcel?.prefix || undefined,
    section: String(section || "").trim(),
    number: String(number || "").trim(),
    fullReference: String(fullReference || "").trim(),
  };
}

function detectAbf(text: string, constraints: unknown[]) {
  const labels = labelsMatching(constraints, /(abf|monument|historique|abords|spr|patrimonial|ac1|ac2|avap|zppaup)/i);
  const isConcerned = labels.length > 0 || /(abf|monument|historique|abords|spr|patrimonial|ac1|ac2|avap|zppaup)/i.test(text);
  const perimeterType: LocationConstraintContext["constraints"]["abf"]["perimeterType"] = /spr|patrimonial|avap|zppaup/i.test(text)
    ? "site_patrimonial_remarquable"
    : /monument|historique/i.test(text)
      ? "monument_historique"
      : /abords|ac1/i.test(text)
        ? "abords"
        : isConcerned
          ? "unknown"
          : undefined;
  return {
    isConcerned,
    perimeterType,
    source: labels[0] || (isConcerned ? "Contraintes de localisation" : undefined),
  };
}

export function analyzeLocationContext(input: LocationContextInput): LocationConstraintContext {
  const parcelAnalysis = input.parcelAnalysis || null;
  const selectedAddress = input.selectedAddress || null;
  const constraints = collectConstraints(parcelAnalysis);
  const contextText = stringifySignals({
    parcelAnalysis,
    constraints,
    selectedAddress,
  });

  const servitudeItems = labelsMatching(constraints, /(servitude|sup|ac1|ac2|pm1|pm2|i4|pt1|pt2|pt3)/i);
  const protectedTypes = labelsMatching(constraints, /(natura|znieff|parc|reserve|réserve|zone humide|bois|ebc|protection)/i);
  const naturalRiskTypes = labelsMatching(constraints, /(cavit|mouvement|argile|retrait|gonflement|sism|feu|incendie|risque naturel|pprn)/i);
  const oapNames = labelsMatching(constraints, /(oap|orientation d.aménagement|orientation d’amenagement|orientation d’aménagement)/i);

  const zoneCode = parcelAnalysis?.zoneCode || parcelAnalysis?.zone_code || parcelAnalysis?.zoningPreview?.zoneCode || null;
  const missingData: string[] = [];
  if (!selectedAddress?.label && !input.addressLabel) missingData.push("adresse normalisée");
  if (!parseParcel(parcelAnalysis)) missingData.push("référence cadastrale");
  if (!zoneCode) missingData.push("zonage PLU/PLUi");
  if (constraints.length === 0) missingData.push("servitudes et contraintes publiques");

  const hasFlood = /(ppri|inond|pm1|zone inondable|crue)/i.test(contextText);
  const hasClay = /(argile|retrait|gonflement)/i.test(contextText);
  const hasSeismic = /(sism|séisme|seisme)/i.test(contextText);
  const hasForestFire = /(feu de forêt|feu de foret|incendie|forestier)/i.test(contextText);
  const hasLotissement = /(lotissement|colotis|cahier des charges|règlement de lotissement)/i.test(contextText);

  const positiveSignals = [
    zoneCode,
    parseParcel(parcelAnalysis)?.fullReference,
    constraints.length > 0,
    selectedAddress?.city || parcelAnalysis?.commune,
  ].filter(Boolean).length;

  return {
    commune: selectedAddress?.city || parcelAnalysis?.commune || "",
    codeInsee: selectedAddress?.citycode || selectedAddress?.insee || parcelAnalysis?.codeInsee || "",
    address: selectedAddress?.label || input.addressLabel || "",
    parcel: parseParcel(parcelAnalysis),
    pluZone: {
      code: zoneCode,
      label: parcelAnalysis?.zoneLabel || parcelAnalysis?.zoningLabel || parcelAnalysis?.zoningPreview?.zoningLabel || undefined,
      confidence: zoneCode ? 0.78 : 0.2,
      source: zoneCode ? parcelAnalysis?.source || "parcel-analysis" : null,
    },
    constraints: {
      abf: detectAbf(contextText, constraints),
      protectedArea: { isConcerned: protectedTypes.length > 0, types: protectedTypes },
      floodRisk: {
        isConcerned: hasFlood,
        ppriName: labelsMatching(constraints, /(ppri|inond|pm1)/i)[0],
        level: hasFlood ? "à vérifier" : undefined,
      },
      naturalRisk: { isConcerned: naturalRiskTypes.length > 0, types: naturalRiskTypes },
      forestFireRisk: { isConcerned: hasForestFire },
      seismicRisk: { isConcerned: hasSeismic, level: hasSeismic ? "à vérifier" : undefined },
      clayShrinkSwell: { isConcerned: hasClay, level: hasClay ? "à vérifier" : undefined },
      oap: { isConcerned: oapNames.length > 0 || /\boap\b/i.test(contextText), names: oapNames },
      servitudes: { isConcerned: servitudeItems.length > 0, items: servitudeItems },
      lotissement: { isConcerned: hasLotissement, source: hasLotissement ? "Détection contextuelle" : undefined },
    },
    missingData,
    confidenceScore: Math.min(0.95, 0.25 + positiveSignals * 0.18),
  };
}
