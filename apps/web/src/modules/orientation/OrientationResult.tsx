import { AlertTriangle, CheckCircle2, Clock3, RotateCcw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDossierTypeLabel } from "@/lib/urbanisme/dossier/dossierTypeLabels";
import type { DossierType } from "@/lib/urbanisme/cerfa/officialPieces.types";
import { ORIENTATION_STORAGE_KEY, type OrientationResultPayload } from "./orientation.types";
import { getProjectActionLabel } from "./projectActions";

function canCreateRecommended(type: string): type is DossierType {
  return type === "PCMI" || type === "PC" || type === "DPC" || type === "DPA" || type === "PA" || type === "PD";
}

export function OrientationResult(props: {
  result: OrientationResultPayload;
  onCreate: (dossierType: DossierType) => void;
  onEdit: () => void;
  onChooseOther: () => void;
}) {
  const result = props.result;
  const canCreate = canCreateRecommended(result.recommendedDossierType);

  const create = () => {
    const dossierType = result.recommendedDossierType;
    if (!canCreateRecommended(dossierType)) return;
    sessionStorage.setItem(ORIENTATION_STORAGE_KEY, JSON.stringify(result));
    props.onCreate(dossierType);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
        <Badge className="mb-3">Démarche recommandée</Badge>
        <h2 className="text-3xl font-semibold text-slate-950">{getDossierTypeLabel(result.recommendedDossierType)}</h2>
        <p className="mt-2 text-sm text-slate-600">Confiance : {result.confidence === "high" ? "élevée" : result.confidence === "medium" ? "moyenne" : "faible"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {result.selectedActions.map((action) => (
            <Badge key={action} variant="outline">{getProjectActionLabel(action)}</Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Raisons
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {result.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
          </ul>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Points à vérifier
          </h3>
          {result.warnings.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Aucun point d'attention particulier à ce stade.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {result.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-950">Contraintes détectées à l'adresse</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {result.locationConstraints.filter((constraint) => constraint.detected).slice(0, 6).map((constraint) => (
            <div key={`${constraint.type}-${constraint.label}`} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{constraint.label}</p>
                <Badge variant="outline">{constraint.confidence}</Badge>
              </div>
              {constraint.impact.delayImpact ? <p className="mt-1 text-xs text-slate-600">{constraint.impact.delayImpact}</p> : null}
            </div>
          ))}
          {result.locationConstraints.filter((constraint) => constraint.detected).length === 0 ? (
            <p className="text-sm text-slate-600">Aucune contrainte locale renseignée à ce stade. L'analyse sera complétée avec l'adresse et la parcelle.</p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <Users className="h-5 w-5 text-primary" />
            Services susceptibles d'être consultés
          </h3>
          {result.expectedConsultations.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Aucune consultation additionnelle identifiée à ce stade.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {result.expectedConsultations.map((consultation) => (
                <li key={`${consultation.service}-${consultation.reason}`} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">{consultation.service}</p>
                    <Badge variant={consultation.required ? "default" : "outline"}>{consultation.required ? "probable/à confirmer" : "possible"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{consultation.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-950">
            <Clock3 className="h-5 w-5 text-primary" />
            Délai indicatif
          </h3>
          <p className="mt-3 text-sm text-slate-700">
            Délai de base : {result.estimatedInstructionTimeline.baseDelay.durationMonths} mois.
          </p>
          {result.estimatedInstructionTimeline.possibleMajorations.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {result.estimatedInstructionTimeline.possibleMajorations.map((majoration) => (
                <li key={`${majoration.service}-${majoration.reason}`}>
                  • {majoration.durationMonths ? `+${majoration.durationMonths} mois` : "Majoration possible"} — {majoration.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Aucune majoration identifiée à ce stade.</p>
          )}
          <p className="mt-3 text-sm font-semibold text-slate-950">
            Estimation : {result.estimatedInstructionTimeline.estimatedTotalDelayMonths ?? "à confirmer"} mois
          </p>
          <p className="mt-2 text-xs text-slate-500">{result.estimatedInstructionTimeline.warning}</p>
        </section>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Cette orientation est générée à partir des informations renseignées et des données disponibles. Elle ne remplace pas l'analyse du service instructeur et doit être vérifiée avant transmission.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="gap-2" onClick={props.onEdit}>
          <RotateCcw className="h-4 w-4" />
          Modifier mes réponses
        </Button>
        <Button type="button" variant="outline" onClick={props.onChooseOther}>
          Choisir un autre dossier
        </Button>
        <Button type="button" disabled={!canCreate} onClick={create}>
          Créer ce dossier
        </Button>
      </div>
    </div>
  );
}
