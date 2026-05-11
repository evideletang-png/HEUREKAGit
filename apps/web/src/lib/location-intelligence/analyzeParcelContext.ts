import { resolveConsultations } from "@/lib/urbanisme/consultations/resolveConsultations";
import { computeInstructionTimeline } from "@/lib/urbanisme/timeline/computeInstructionTimeline";
import type { DossierType, ProjectContext } from "@/lib/urbanisme/cerfa/officialPieces.types";
import { resolveCadastreContext } from "./providers/cadastreProvider";
import { resolveGpuContext } from "./providers/gpuProvider";
import { resolveGeorisquesContext } from "./providers/georisquesProvider";
import { resolvePatrimoineContext } from "./providers/patrimoineProvider";
import { resolveInpnContext } from "./providers/inpnProvider";
import { resolveMetropolisContext } from "./providers/metropolisProvider";
import { resolveSupContext } from "./providers/supProvider";

export type ParcelContextInput = {
  address?: string;
  parcelId?: string;
  coordinates?: { lat?: number | null; lon?: number | null; lng?: number | null };
  banId?: string;
  banParcelles?: string[];
  commune?: string;
  codeInsee?: string;
  existingParcelAnalysis?: any;
  dossierType?: DossierType;
  projectFlags?: ProjectContext["projectFlags"];
  demo?: boolean;
};

export type LocationProviderName =
  | "cadastre"
  | "gpu"
  | "georisques"
  | "patrimoine"
  | "inpn"
  | "metropolis"
  | "sup";

export type ProviderStatus = "ok" | "partial" | "error" | "skipped";

export type LocationProviderResult = {
  provider: LocationProviderName;
  status: ProviderStatus;
  confidence: number;
  data?: Record<string, any>;
  unresolvedChecks?: string[];
  error?: string;
};

export type DetectedConstraints = {
  abf: boolean;
  monumentHistoriqueAbords: boolean;
  spr: boolean;
  siteClasse: boolean;
  siteInscrit: boolean;
  parcNationalCore: boolean;
  natura2000: boolean;
  ppri: boolean;
  pprn: boolean;
  pprt: boolean;
  pprRequiresStudy: boolean;
  sis: boolean;
  formerIcpe: boolean;
  oap: boolean;
  sup: boolean;
  metropolisInstruction: boolean;
  roadAuthority: boolean;
  environmentalConstraints: string[];
};

export type ParcelContextAnalysis = {
  parcel: {
    id?: string | null;
    section?: string | null;
    number?: string | null;
    fullReference?: string | null;
    surfaceM2?: number | null;
    builtSurfaceApproxM2?: number | null;
    footprintApproxM2?: number | null;
  } | null;
  commune?: string | null;
  codeInsee?: string | null;
  epci?: string | null;
  pluZone?: { code: string | null; label?: string | null; confidence: number; source?: string | null };
  regulations: { label: string; source: string; confidence: number }[];
  detectedConstraints: DetectedConstraints;
  probableConsultations: ReturnType<typeof resolveConsultations>["consultations"];
  estimatedInstructionImpacts: ReturnType<typeof computeInstructionTimeline>;
  confidence: number;
  unresolvedChecks: string[];
  providerResults: LocationProviderResult[];
  updatedAt: string;
};

const CACHE = new Map<string, Promise<ParcelContextAnalysis>>();

function cacheKey(input: ParcelContextInput) {
  return JSON.stringify({
    address: input.address || "",
    parcelId: input.parcelId || "",
    lat: input.coordinates?.lat,
    lon: input.coordinates?.lon ?? input.coordinates?.lng,
    commune: input.commune || "",
    dossierType: input.dossierType || "PCMI",
    demo: !!input.demo,
  });
}

function boolFrom(...values: unknown[]) {
  return values.some((value) => value === true);
}

function unique(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function providerData(results: LocationProviderResult[], provider: LocationProviderName) {
  return results.find((result) => result.provider === provider)?.data || {};
}

function averageConfidence(results: LocationProviderResult[]) {
  const usable = results.filter((result) => result.status !== "skipped");
  if (usable.length === 0) return 0.35;
  return Math.round((usable.reduce((sum, result) => sum + result.confidence, 0) / usable.length) * 100) / 100;
}

function buildAnalysis(input: ParcelContextInput, results: LocationProviderResult[]): ParcelContextAnalysis {
  const cadastre = providerData(results, "cadastre");
  const gpu = providerData(results, "gpu");
  const georisques = providerData(results, "georisques");
  const patrimoine = providerData(results, "patrimoine");
  const inpn = providerData(results, "inpn");
  const metropolis = providerData(results, "metropolis");
  const sup = providerData(results, "sup");

  const detectedConstraints: DetectedConstraints = {
    abf: boolFrom(patrimoine.abf, patrimoine.monumentHistoriqueAbords, patrimoine.spr),
    monumentHistoriqueAbords: boolFrom(patrimoine.monumentHistoriqueAbords, patrimoine.abf),
    spr: boolFrom(patrimoine.spr),
    siteClasse: boolFrom(patrimoine.siteClasse),
    siteInscrit: boolFrom(patrimoine.siteInscrit),
    parcNationalCore: boolFrom(inpn.parcNationalCore),
    natura2000: boolFrom(inpn.natura2000),
    ppri: boolFrom(georisques.ppri),
    pprn: boolFrom(georisques.pprn),
    pprt: boolFrom(georisques.pprt),
    pprRequiresStudy: boolFrom(georisques.ppri, georisques.pprn, georisques.pprt),
    sis: boolFrom(georisques.sis),
    formerIcpe: boolFrom(georisques.formerIcpe),
    oap: boolFrom(gpu.oap),
    sup: boolFrom(gpu.sup, sup.sup),
    metropolisInstruction: boolFrom(metropolis.metropolisInstruction),
    roadAuthority: boolFrom(metropolis.roadAuthority),
    environmentalConstraints: unique([
      ...(Array.isArray(inpn.environmentalConstraints) ? inpn.environmentalConstraints : []),
      ...(Array.isArray(gpu.environmentalConstraints) ? gpu.environmentalConstraints : []),
    ]),
  };

  const dossierType = input.dossierType || "PCMI";
  const projectFlags = input.projectFlags || {};
  const locationContext: ProjectContext["locationContext"] = {
    commune: cadastre.commune || input.commune,
    parcel: cadastre.parcel?.fullReference || input.parcelId,
    pluZone: gpu.pluZone?.code || null,
    abf: detectedConstraints.abf,
    spr: detectedConstraints.spr,
    monumentHistoriqueAbords: detectedConstraints.monumentHistoriqueAbords,
    siteClasse: detectedConstraints.siteClasse,
    siteInscrit: detectedConstraints.siteInscrit,
    parcNationalCore: detectedConstraints.parcNationalCore,
    natura2000: detectedConstraints.natura2000,
    pprRequiresStudy: detectedConstraints.pprRequiresStudy,
    sis: detectedConstraints.sis,
    formerIcpe: detectedConstraints.formerIcpe,
    confidence: averageConfidence(results),
    unresolvedChecks: [],
  };
  const projectContext: ProjectContext = { dossierType, projectFlags, locationContext };

  const unresolvedChecks = unique(results.flatMap((result) => result.unresolvedChecks || []));

  return {
    parcel: cadastre.parcel || null,
    commune: cadastre.commune || input.commune || null,
    codeInsee: cadastre.codeInsee || input.codeInsee || null,
    epci: metropolis.epci || null,
    pluZone: gpu.pluZone || { code: null, confidence: gpu.confidence || 0.35, source: gpu.source || null },
    regulations: [
      ...(Array.isArray(gpu.regulations) ? gpu.regulations : []),
      ...(Array.isArray(sup.regulations) ? sup.regulations : []),
    ],
    detectedConstraints,
    probableConsultations: resolveConsultations(projectContext).consultations,
    estimatedInstructionImpacts: computeInstructionTimeline({ dossierType, projectFlags, locationContext }),
    confidence: averageConfidence(results),
    unresolvedChecks,
    providerResults: results,
    updatedAt: new Date().toISOString(),
  };
}

export async function analyzeParcelContext(input: ParcelContextInput): Promise<ParcelContextAnalysis> {
  const key = cacheKey(input);
  const cached = CACHE.get(key);
  if (cached) return cached;

  const promise = Promise.all([
    resolveCadastreContext(input),
    resolveGpuContext(input),
    resolvePatrimoineContext(input),
    resolveGeorisquesContext(input),
    resolveInpnContext(input),
    resolveMetropolisContext(input),
    resolveSupContext(input),
  ]).then((results) => buildAnalysis(input, results));

  CACHE.set(key, promise);
  return promise;
}
