import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileCheck2, Info, Landmark, MapPinned, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRequiredPieces, type ParcelAnalysisLike, type PieceRequirement } from "@/lib/pieceRequirements";

function confidenceLabel(value?: number) {
  if (typeof value !== "number") return null;
  if (value >= 0.75) return "confiance élevée";
  if (value >= 0.5) return "confiance moyenne";
  return "confiance faible";
}

function statusLabel(piece: PieceRequirement) {
  if (piece.status === "mandatory") return "Obligatoire";
  if (piece.status === "conditional_project") return "Selon projet";
  if (piece.status === "conditional_location") return "Selon adresse";
  if (piece.status === "recommended") return "Recommandée";
  return "Vigilance";
}

function statusIcon(piece: PieceRequirement) {
  if (piece.status === "mandatory") return <FileCheck2 className="h-4 w-4 text-slate-700" />;
  if (piece.additionalReasons.length > 0) return <MapPinned className="h-4 w-4 text-slate-700" />;
  return <Info className="h-4 w-4 text-slate-600" />;
}

function PieceCard({ piece }: { piece: PieceRequirement }) {
  const confidence = confidenceLabel(piece.confidence);
  return (
    <Collapsible className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {statusIcon(piece)}
            <Badge variant="outline" className="rounded-md border-slate-300 bg-slate-50 font-mono text-[11px] text-slate-800">
              {piece.code}
            </Badge>
            <Badge variant={piece.status === "mandatory" ? "default" : "secondary"} className="rounded-md text-[11px]">
              {statusLabel(piece)}
            </Badge>
            {piece.additionalReasons.length > 0 ? (
              <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 text-[11px] text-amber-900">
                contexte local
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold leading-snug text-slate-950">{piece.label}</p>
          {piece.reason ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{piece.reason}</p> : null}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>Source : {piece.source || "CERFA"}</span>
            {confidence ? <span>{confidence}</span> : null}
          </div>
        </div>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 text-xs">
            Détail
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="border-t border-slate-100 px-3 py-3 text-xs text-slate-600">
          <p><span className="font-semibold text-slate-800">Nomenclature :</span> code officiel {piece.code}, libellé officiel conservé.</p>
          {piece.additionalReasons.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="font-semibold text-slate-800">Motifs additionnels rattachés à cette pièce :</p>
              {piece.additionalReasons.map((reason) => (
                <div key={`${reason.trigger}-${reason.reason}`} className="rounded-md bg-slate-50 p-2">
                  <p>{reason.reason}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Source : {reason.source}
                    {typeof reason.confidence === "number" ? ` · ${confidenceLabel(reason.confidence)}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PieceSection({ emptyText, pieces }: { emptyText: string; pieces: PieceRequirement[] }) {
  if (pieces.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">{emptyText}</p>;
  }
  return (
    <div className="grid gap-2">
      {pieces.map((piece) => <PieceCard key={piece.code} piece={piece} />)}
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
  const result = useMemo(
    () => getRequiredPieces({ procedureType, parcelAnalysis, selectedAddress }),
    [procedureType, parcelAnalysis, selectedAddress],
  );
  const { locationContext } = result;
  const analysisIncomplete = isAnalyzingLocation || result.missingContext.length > 0;
  const piecesWithLocationReasons = result.allOfficialPieces.filter((piece) => piece.additionalReasons.length > 0);

  return (
    <Card className="border border-slate-200 bg-slate-50/40 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
          <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          Pièces attendues
        </CardTitle>
        <CardDescription>
          Nomenclature officielle recalculée selon le type de dossier, le projet et le contexte réglementaire détecté.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-900">
                <Landmark className="h-4 w-4" />
                {analysisIncomplete ? "Analyse réglementaire en cours" : "Analyse réglementaire contextualisée"}
              </p>
              <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-4">
                <span>Commune : <strong className="text-slate-900">{locationContext.commune || "à confirmer"}</strong></span>
                <span>Parcelle : <strong className="text-slate-900">{locationContext.parcel?.fullReference || "en recherche"}</strong></span>
                <span>
                  Zone PLU : <strong className="text-slate-900">{locationContext.pluZone.code ? `Zone ${locationContext.pluZone.code}` : "en cours"}</strong>
                </span>
                <span>Servitudes : <strong className="text-slate-900">{locationContext.constraints.servitudes.isConcerned ? "détectées" : "en cours"}</strong></span>
              </div>
              {result.missingContext.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">Données à confirmer : {result.missingContext.join(", ")}.</p>
              ) : null}
            </div>
            {onRetryAnalysis ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetryAnalysis} disabled={isAnalyzingLocation}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzingLocation ? "animate-spin" : ""}`} />
                Relancer
              </Button>
            ) : null}
          </div>
        </div>

        <Tabs defaultValue="mandatory" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg bg-white p-1 sm:grid-cols-4">
            <TabsTrigger value="mandatory">Obligatoires</TabsTrigger>
            <TabsTrigger value="project">Selon projet</TabsTrigger>
            <TabsTrigger value="location">Selon l'adresse</TabsTrigger>
            <TabsTrigger value="alerts">Vigilances</TabsTrigger>
          </TabsList>

          <TabsContent value="mandatory" className="mt-3">
            <PieceSection pieces={result.requiredPieces} emptyText="Aucune pièce obligatoire nationale identifiée pour ce type de dossier." />
          </TabsContent>

          <TabsContent value="project" className="mt-3">
            <PieceSection pieces={result.projectConditionalPieces} emptyText="Aucune pièce conditionnelle projet certaine à ce stade." />
          </TabsContent>

          <TabsContent value="location" className="mt-3 space-y-3">
            {analysisIncomplete ? (
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Les pièces liées à l'adresse seront recalculées automatiquement après identification du zonage, des servitudes et des périmètres réglementaires.
              </p>
            ) : null}
            <PieceSection
              pieces={piecesWithLocationReasons}
              emptyText="Aucune pièce officielle n'est enrichie par une contrainte locale fiable à ce stade."
            />
          </TabsContent>

          <TabsContent value="alerts" className="mt-3">
            <div className="space-y-2">
              {result.instructorAlerts.length > 0 ? result.instructorAlerts.map((alert) => (
                <div key={`${alert.type}-${alert.title}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <div className="flex gap-2">
                    {alert.severity === "warning" ? <ShieldAlert className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                    <div>
                      <p className="font-semibold">{alert.title}</p>
                      <p className="mt-1 text-xs leading-relaxed">{alert.message}</p>
                      <p className="mt-1 text-[11px] text-amber-800">Source : {alert.source}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                  Aucun point de vigilance local fiable détecté à ce stade.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
