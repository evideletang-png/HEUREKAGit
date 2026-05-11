import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DossierType } from "@/lib/urbanisme/cerfa/officialPieces.types";
import { ORIENTATION_STORAGE_KEY, type OrientationResultPayload } from "./orientation.types";
import { getProjectActionLabel } from "./projectActions";

const DOSSIER_LABELS: Record<string, string> = {
  PCMI: "Permis de construire maison individuelle",
  PC: "Permis de construire",
  DPC: "Déclaration préalable — constructions et travaux",
  DPA: "Déclaration préalable — installations et aménagements",
  PA: "Permis d'aménager",
  PD: "Permis de démolir",
  NO_FORMALITY: "Aucune formalité identifiée",
  UNKNOWN: "Démarche à confirmer",
};

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
        <h2 className="text-3xl font-semibold text-slate-950">{DOSSIER_LABELS[result.recommendedDossierType]}</h2>
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
