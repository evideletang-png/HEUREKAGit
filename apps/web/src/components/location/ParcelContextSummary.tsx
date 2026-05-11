import { AlertTriangle, CheckCircle2, Clock3, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ParcelContextAnalysis } from "@/lib/location-intelligence/analyzeParcelContext";

function confidenceLabel(score?: number) {
  if (!score) return "Confiance faible";
  if (score >= 0.75) return "Confiance élevée";
  if (score >= 0.5) return "Confiance moyenne";
  return "Confiance faible";
}

function detectedItems(analysis: ParcelContextAnalysis) {
  const c = analysis.detectedConstraints;
  return [
    analysis.pluZone?.code ? `Zone ${analysis.pluZone.code}` : null,
    c.abf ? "Périmètre ABF détecté" : null,
    c.spr ? "Site patrimonial remarquable" : null,
    c.ppri || c.pprn || c.pprt ? "Plan de prévention des risques identifié" : null,
    c.natura2000 ? "Natura 2000" : null,
    c.oap ? "OAP détectée" : null,
    c.sup ? "Servitude d'utilité publique possible" : null,
    c.sis || c.formerIcpe ? "Sols / ancien site ICPE à vérifier" : null,
    c.metropolisInstruction ? "Service instructeur métropolitain probable" : null,
  ].filter(Boolean) as string[];
}

export function ParcelContextSummary(props: {
  analysis?: ParcelContextAnalysis | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onShowDetails?: () => void;
}) {
  const analysis = props.analysis;
  if (props.loading) return null;

  if (props.error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Certaines informations n'ont pas pu être confirmées automatiquement.</p>
            <p className="mt-1">{props.error}</p>
            {props.onRetry ? <Button type="button" variant="outline" size="sm" className="mt-3" onClick={props.onRetry}>Relancer l'analyse</Button> : null}
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        Renseignez une adresse ou une parcelle pour lancer l'analyse automatique du terrain.
      </div>
    );
  }

  const items = detectedItems(analysis);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 font-semibold text-slate-950">
            <MapPin className="h-4 w-4 text-primary" />
            Analyse automatique du terrain
          </h4>
          <p className="mt-1 text-sm text-slate-600">Heureka a détecté les éléments suivants à partir de l'adresse ou de la parcelle.</p>
        </div>
        <Badge variant="outline">{confidenceLabel(analysis.confidence)}</Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.length > 0 ? items.slice(0, 6).map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            {item}
          </div>
        )) : (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Aucune contrainte territoriale majeure détectée à ce stade.</div>
        )}
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">Parcelle</p>
          <p className="mt-1 font-semibold text-slate-950">{analysis.parcel?.fullReference || "Non déterminée"}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">Consultations</p>
          <p className="mt-1 flex items-center gap-1 font-semibold text-slate-950">
            <Users className="h-3.5 w-3.5" />
            {analysis.probableConsultations.length || "Aucune"}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">Délai indicatif</p>
          <p className="mt-1 flex items-center gap-1 font-semibold text-slate-950">
            <Clock3 className="h-3.5 w-3.5" />
            {analysis.estimatedInstructionImpacts.totalDelay} mois
          </p>
        </div>
      </div>

      {analysis.unresolvedChecks.length > 0 ? (
        <p className="mt-3 text-xs text-amber-700">Certaines sources restent à confirmer : {analysis.unresolvedChecks.join(", ")}.</p>
      ) : null}

      {props.onShowDetails ? (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={props.onShowDetails}>
          Voir le détail réglementaire
        </Button>
      ) : null}
    </div>
  );
}
