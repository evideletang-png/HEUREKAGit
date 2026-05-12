import type { ParcelContextAnalysis } from "@/lib/location-intelligence/analyzeParcelContext";

export type OperationalConstraint = {
  key: string;
  label: string;
  detected: boolean;
  severity: "info" | "warning" | "high";
  source: string;
};

export function buildOperationalConstraints(analysis: ParcelContextAnalysis | null | undefined): OperationalConstraint[] {
  const constraints = analysis?.detectedConstraints;
  if (!constraints) return [];
  return [
    { key: "abf", label: "ABF / abords monuments historiques", detected: constraints.abf || constraints.monumentHistoriqueAbords, severity: "warning", source: "Patrimoine" },
    { key: "spr", label: "Site patrimonial remarquable", detected: constraints.spr, severity: "warning", source: "Patrimoine" },
    { key: "siteClasse", label: "Site classé / inscrit", detected: constraints.siteClasse || constraints.siteInscrit, severity: "high", source: "Patrimoine" },
    { key: "ppri", label: "PPRI / risque inondation", detected: constraints.ppri, severity: "high", source: "Géorisques" },
    { key: "pprn", label: "Risques naturels", detected: constraints.pprn || constraints.pprt, severity: "warning", source: "Géorisques" },
    { key: "natura2000", label: "Natura 2000 / environnement", detected: constraints.natura2000 || constraints.environmentalConstraints.length > 0, severity: "warning", source: "INPN" },
    { key: "sup", label: "Servitudes d'utilité publique", detected: constraints.sup, severity: "warning", source: "GPU / SUP" },
    { key: "oap", label: "OAP applicable", detected: constraints.oap, severity: "info", source: "GPU" },
    { key: "sis", label: "Secteur d'information sur les sols / ancienne ICPE", detected: constraints.sis || constraints.formerIcpe, severity: "warning", source: "Géorisques" },
    { key: "metropolis", label: "Service instructeur métropolitain / voirie", detected: constraints.metropolisInstruction || constraints.roadAuthority, severity: "info", source: "EPCI" },
  ];
}

export function getVigilanceLevel(constraints: OperationalConstraint[]) {
  const detected = constraints.filter((constraint) => constraint.detected);
  if (detected.some((constraint) => constraint.severity === "high")) return "Élevé";
  if (detected.some((constraint) => constraint.severity === "warning")) return "Modéré";
  if (detected.length > 0) return "Faible";
  return "Standard";
}
