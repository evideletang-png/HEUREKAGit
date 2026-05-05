import { AlertTriangle, CheckCircle2, MapPin, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequiredPieces, type ParcelAnalysisLike, type PieceRequirement } from "@/lib/pieceRequirements";

function confidenceLabel(value?: number) {
  if (typeof value !== "number") return "Confiance non qualifiée";
  if (value >= 0.75) return "Confiance élevée";
  if (value >= 0.5) return "Confiance moyenne";
  return "Confiance faible";
}

function PieceList({ title, pieces }: { title: string; pieces: PieceRequirement[] }) {
  if (pieces.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-bold text-slate-800">{title}</h4>
      <div className="space-y-2">
        {pieces.map((piece) => (
          <div key={piece.code} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{piece.code} · {piece.label}</p>
                {piece.reason ? <p className="mt-1 text-xs text-slate-500">{piece.reason}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                  {piece.source ? <span>Source : {piece.source}</span> : null}
                  {piece.trigger ? <span>Déclencheur : {piece.trigger}</span> : null}
                  <span>{confidenceLabel(piece.confidence)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={piece.level === "obligatoire" ? "default" : "secondary"}>{piece.level}</Badge>
                {piece.blockingIfMissing ? <Badge variant="destructive">bloquant</Badge> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DynamicPieceChecklist({
  procedureType,
  parcelAnalysis,
  selectedAddress,
  isAnalyzingLocation = false,
  onRetryAnalysis,
}: {
  procedureType: string;
  parcelAnalysis?: ParcelAnalysisLike | null;
  selectedAddress?: any | null;
  isAnalyzingLocation?: boolean;
  onRetryAnalysis?: () => void;
}) {
  const result = getRequiredPieces({ procedureType, parcelAnalysis, selectedAddress });
  const { locationContext } = result;
  const analysisIncomplete = isAnalyzingLocation || result.missingContext.length > 0;

  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Pièces attendues
        </CardTitle>
        <CardDescription>
          Checklist enrichie à partir du type de dossier, du projet et de la localisation de la parcelle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Contexte de localisation</p>
              <p className="mt-1">
                {analysisIncomplete ? "Analyse réglementaire en cours" : "Analyse réglementaire contextualisée"}
              </p>
              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
                <span>Commune : {locationContext.commune || "à confirmer"}</span>
                <span>Parcelle : {locationContext.parcel?.fullReference || "en recherche"}</span>
                <span>
                  Zone : {locationContext.pluZone.code ? `Zone ${locationContext.pluZone.code}` : "en recherche"}
                  {locationContext.pluZone.label ? ` — ${locationContext.pluZone.label}` : ""}
                </span>
              </div>
              {result.missingContext.length > 0 ? (
                <p className="mt-2 text-xs text-blue-800">Données manquantes : {result.missingContext.join(", ")}.</p>
              ) : null}
            </div>
            {onRetryAnalysis ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetryAnalysis} disabled={isAnalyzingLocation}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzingLocation ? "animate-spin" : ""}`} />
                Relancer l'analyse
              </Button>
            ) : null}
          </div>
        </div>

        <PieceList title="Pièces principales" pieces={result.requiredPieces} />
        <PieceList title="Pièces complémentaires liées au projet" pieces={result.projectConditionalPieces} />
        <PieceList title="Pièces additionnelles liées à l'adresse" pieces={result.locationAdditionalPieces} />

        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-800">Points de vigilance instructeur</h4>
          <div className="space-y-2">
            {result.vigilancePoints.length > 0 ? result.vigilancePoints.map((warning) => (
              <p key={warning} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {warning}
              </p>
            )) : (
              <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                Aucun point de vigilance local fiable détecté à ce stade.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
