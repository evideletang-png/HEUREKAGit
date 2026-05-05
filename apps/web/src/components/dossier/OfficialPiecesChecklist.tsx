import { useMemo } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, ClipboardCheck, FileText, MapPinned, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { analyzeLocationContext } from "@/lib/locationContextAnalyzer";
import { CERFA_DYNAMIC_QUESTIONS, triggerSourceLabel } from "@/lib/urbanisme/cerfa/pieceTriggers";
import { normalizeOfficialDossierType, resolveOfficialPieces } from "@/lib/urbanisme/cerfa/resolveOfficialPieces";
import type { ProjectContext, ResolvedPiece } from "@/lib/urbanisme/cerfa/officialPieces.types";
import type { ParcelAnalysisLike } from "@/lib/pieceRequirements";
import { checkCompleteness, type UploadedDocumentForCompleteness } from "@/lib/urbanisme/compliance/checkCompleteness";

type ProjectFlags = ProjectContext["projectFlags"];

function stateLabel(piece: ResolvedPiece) {
  if (piece.status === "mandatory") return "Obligatoire";
  if (piece.requirementState === "required") return "Requise";
  return "À confirmer";
}

function stateIcon(piece: ResolvedPiece) {
  if (piece.status === "mandatory") return <CheckCircle2 className="h-4 w-4 text-emerald-700" />;
  if (piece.requirementState === "required") return <FileText className="h-4 w-4 text-slate-700" />;
  return <CircleDashed className="h-4 w-4 text-amber-700" />;
}

function statusVariant(piece: ResolvedPiece): "default" | "secondary" | "outline" {
  if (piece.status === "mandatory") return "default";
  if (piece.requirementState === "required") return "secondary";
  return "outline";
}

function PieceCard({ piece }: { piece: ResolvedPiece }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{stateIcon(piece)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-md font-mono text-xs">{piece.code}</Badge>
            <Badge variant={statusVariant(piece)} className="rounded-md text-[11px]">{stateLabel(piece)}</Badge>
            <Badge variant="outline" className="rounded-md text-[11px]">
              {piece.status === "mandatory" ? "obligatoire" : "conditionnelle"}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-semibold leading-snug text-slate-950">{piece.label}</p>
          {piece.conditionLabel ? (
            <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs italic text-slate-700">
              Condition : {piece.conditionLabel}
            </p>
          ) : null}
          <div className="mt-2 grid gap-1 text-xs text-slate-600">
            {piece.legalReference ? <p>Base légale : {piece.legalReference}</p> : null}
            <p>Déclenché par : {piece.matchedTriggers.map(triggerSourceLabel).join(", ")}</p>
            <p>{piece.explanation}</p>
            {typeof piece.confidence === "number" && piece.requirementState === "potentially_required" ? (
              <p>Confiance Heureka : {Math.round(piece.confidence * 100)}%</p>
            ) : null}
            {piece.notes ? <p className="text-amber-700">{piece.notes}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PieceGroup({ title, pieces, empty }: { title: string; pieces: ResolvedPiece[]; empty: string }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {pieces.length > 0 ? (
        <div className="space-y-2">{pieces.map((piece) => <PieceCard key={piece.code} piece={piece} />)}</div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

export function OfficialPiecesChecklist({
  dossierType,
  parcelAnalysis,
  selectedAddress,
  projectFlags,
  onProjectFlagsChange,
  uploadedDocuments = [],
  isAnalyzingLocation = false,
}: {
  dossierType: string;
  parcelAnalysis?: ParcelAnalysisLike | null;
  selectedAddress?: any | null;
  projectFlags: ProjectFlags;
  onProjectFlagsChange: (flags: ProjectFlags) => void;
  uploadedDocuments?: UploadedDocumentForCompleteness[];
  isAnalyzingLocation?: boolean;
}) {
  const dossierTypeNormalized = normalizeOfficialDossierType(dossierType);
  const locationAnalysis = useMemo(
    () => analyzeLocationContext({ selectedAddress, parcelAnalysis }),
    [selectedAddress, parcelAnalysis],
  );
  const projectContext = useMemo<ProjectContext>(() => ({
    dossierType: dossierTypeNormalized,
    projectFlags,
    locationContext: {
      commune: locationAnalysis.commune,
      parcel: locationAnalysis.parcel?.fullReference,
      pluZone: locationAnalysis.pluZone.code,
      abf: locationAnalysis.constraints.abf.isConcerned,
      spr: locationAnalysis.constraints.abf.perimeterType === "site_patrimonial_remarquable",
      monumentHistoriqueAbords: locationAnalysis.constraints.abf.perimeterType === "abords" || locationAnalysis.constraints.abf.isConcerned,
      immeubleInscritMH: locationAnalysis.constraints.abf.perimeterType === "monument_historique",
      natura2000: locationAnalysis.constraints.protectedArea.types.some((type) => /natura/i.test(type)),
      parcNationalCore: locationAnalysis.constraints.protectedArea.types.some((type) => /parc national|coeur|cœur/i.test(type)),
      pprRequiresStudy: locationAnalysis.constraints.floodRisk.isConcerned,
      seismicZoneRequiresAttestation: locationAnalysis.constraints.seismicRisk.isConcerned,
      sis: locationAnalysis.constraints.servitudes.items.some((item) => /sis|secteur d'information/i.test(item)),
      formerIcpe: locationAnalysis.constraints.servitudes.items.some((item) => /icpe/i.test(item)),
      lotissement: locationAnalysis.constraints.lotissement.isConcerned,
      confidence: locationAnalysis.confidenceScore,
      unresolvedChecks: locationAnalysis.missingData,
    },
  }), [dossierTypeNormalized, locationAnalysis, projectFlags]);
  const resolvedPieces = useMemo(() => resolveOfficialPieces(projectContext), [projectContext]);
  const completeness = useMemo(
    () => checkCompleteness({ requiredPieces: resolvedPieces, uploadedDocuments }),
    [resolvedPieces, uploadedDocuments],
  );

  const mandatory = resolvedPieces.filter((piece) => piece.status === "mandatory");
  const required = resolvedPieces.filter((piece) => piece.status === "conditional" && piece.requirementState === "required");
  const potential = resolvedPieces.filter((piece) => piece.requirementState === "potentially_required");
  const questions = CERFA_DYNAMIC_QUESTIONS.filter((question) => question.dossierTypes.includes(dossierTypeNormalized));
  const detectedConstraints = [
    projectContext.locationContext.abf ? "ABF / abords MH" : null,
    projectContext.locationContext.spr ? "SPR" : null,
    projectContext.locationContext.natura2000 ? "Natura 2000" : null,
    projectContext.locationContext.pprRequiresStudy ? "PPR / risque" : null,
    projectContext.locationContext.lotissement ? "Lotissement" : null,
  ].filter(Boolean);
  const completenessLabel = completeness.status === "complete" ? "Complet" : completeness.status === "incomplete" ? "Incomplet" : "À vérifier";
  const completenessClass = completeness.status === "complete"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : completeness.status === "incomplete"
      ? "border-red-200 bg-red-50 text-red-950"
      : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <Card className="border border-slate-200 bg-slate-50/40 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
          <FileText className="h-5 w-5 text-slate-800" />
          Pièces à joindre à votre dossier
        </CardTitle>
        <CardDescription>
          Nomenclature officielle du CERFA, recalculée selon le type de dossier, le projet et les contraintes détectées.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <MapPinned className="h-4 w-4" />
            Contexte utilisé pour la checklist
          </p>
          <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-5">
            <span>Type : <strong className="text-slate-900">{dossierTypeNormalized}</strong></span>
            <span>Commune : <strong className="text-slate-900">{projectContext.locationContext.commune || "à confirmer"}</strong></span>
            <span>Parcelle : <strong className="text-slate-900">{projectContext.locationContext.parcel || "en recherche"}</strong></span>
            <span>Zone PLU : <strong className="text-slate-900">{projectContext.locationContext.pluZone || "en cours"}</strong></span>
            <span>Analyse : <strong className="text-slate-900">{isAnalyzingLocation ? "en cours" : "active"}</strong></span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Contraintes détectées : {detectedConstraints.length > 0 ? detectedConstraints.join(", ") : "aucune contrainte certaine à ce stade"}.
          </p>
          {projectContext.locationContext.unresolvedChecks?.length ? (
            <p className="mt-1 flex gap-1 text-xs text-amber-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Analyse en cours : {projectContext.locationContext.unresolvedChecks.join(", ")}.
            </p>
          ) : null}
        </div>

        <div className={`rounded-lg border p-3 text-sm ${completenessClass}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                {completeness.status === "complete" ? <ShieldCheck className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                État de complétude du dossier
              </p>
              <p className="mt-1 text-xs leading-relaxed">{completeness.message}</p>
              <p className="mt-1 text-[11px] opacity-80">
                Documents reconnus : {completeness.matchedPieces.length} / {resolvedPieces.filter((piece) => piece.requirementState === "required").length}
                {" · "}Confiance : {Math.round(completeness.confidenceScore * 100)}%
              </p>
            </div>
            <Badge variant={completeness.status === "complete" ? "default" : completeness.status === "incomplete" ? "destructive" : "outline"} className="w-fit">
              {completenessLabel}
            </Badge>
          </div>
        </div>

        {questions.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-900">Questions CERFA pour affiner les pièces complémentaires</p>
            <div className="mt-3 grid gap-3">
              {questions.map((question) => (
                <div key={question.trigger} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-2">
                  <Label htmlFor={`cerfa-${question.trigger}`} className="text-xs leading-snug text-slate-700">{question.label}</Label>
                  <Switch
                    id={`cerfa-${question.trigger}`}
                    checked={projectFlags[question.trigger] === true}
                    onCheckedChange={(checked) => onProjectFlagsChange({ ...projectFlags, [question.trigger]: checked })}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <PieceGroup title="Pièces obligatoires pour tous les dossiers" pieces={mandatory} empty="Aucune pièce obligatoire trouvée pour ce type de dossier." />
        <PieceGroup title="Pièces complémentaires requises" pieces={required} empty="Aucune pièce complémentaire requise avec les réponses et contraintes actuelles." />
        <PieceGroup title="Pièces potentiellement requises" pieces={potential} empty="Aucune pièce à confirmer à ce stade." />
      </CardContent>
    </Card>
  );
}
