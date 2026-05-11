import { useMemo, useState } from "react";
import { CheckCircle2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { analyzeParcelContext, type ParcelContextAnalysis } from "@/lib/location-intelligence/analyzeParcelContext";
import { ParcelContextDetails } from "@/components/location/ParcelContextDetails";
import { ParcelContextSummary } from "@/components/location/ParcelContextSummary";
import { ParcelDetectionLoader } from "@/components/location/ParcelDetectionLoader";
import { ACTION_QUESTIONS, QUESTION_LABELS } from "./orientation.config";
import { determineDossierType } from "./determineDossierType";
import { PROJECT_ACTIONS } from "./projectActions";
import type { OrientationAnswers, OrientationResultPayload, ProjectAction } from "./orientation.types";

function uniqueQuestions(actions: ProjectAction[]) {
  return Array.from(new Set(actions.flatMap((action) => ACTION_QUESTIONS[action] || [])));
}

export function CompositeProjectWizard(props: {
  onResult: (result: OrientationResultPayload) => void;
}) {
  const [actions, setActions] = useState<ProjectAction[]>([]);
  const [answers, setAnswers] = useState<OrientationAnswers>({});
  const [parcelContext, setParcelContext] = useState<ParcelContextAnalysis | null>(null);
  const [parcelContextLoading, setParcelContextLoading] = useState(false);
  const [parcelContextError, setParcelContextError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [expertCorrection, setExpertCorrection] = useState(false);
  const questions = useMemo(() => uniqueQuestions(actions), [actions]);

  const toggleAction = (action: ProjectAction) => {
    setActions((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action]);
  };

  const updateAnswer = (key: string, value: string) => {
    const question = QUESTION_LABELS[key];
    const parsed = question?.type === "number" ? Number(value) : question?.type === "boolean" ? value === "yes" : value;
    setAnswers((current) => ({ ...current, [key]: parsed }));
  };

  const updateBoolean = (key: keyof OrientationAnswers, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value === "yes" }));
  };

  const applyParcelContextToAnswers = (analysis: ParcelContextAnalysis) => {
    const constraints = analysis.detectedConstraints;
    setAnswers((current) => ({
      ...current,
      commune: analysis.commune || current.commune,
      parcel: analysis.parcel?.fullReference || current.parcel,
      pluZone: analysis.pluZone?.code || current.pluZone,
      abf: constraints.abf,
      monumentHistoriqueAbords: constraints.monumentHistoriqueAbords,
      spr: constraints.spr,
      siteClasse: constraints.siteClasse,
      siteInscrit: constraints.siteInscrit,
      parcNationalCore: constraints.parcNationalCore,
      natura2000: constraints.natura2000,
      pprRequiresStudy: constraints.pprRequiresStudy,
      floodRisk: constraints.ppri,
      naturalRisk: constraints.pprn,
      soilInformationSector: constraints.sis,
      formerIcpe: constraints.formerIcpe,
      oap: constraints.oap,
      servitude: constraints.sup,
      metropoleCompetence: constraints.metropolisInstruction || constraints.roadAuthority,
    }));
  };

  const runParcelContextAnalysis = async () => {
    if (!answers.address && !answers.parcel) return;
    setParcelContextLoading(true);
    setParcelContextError(null);
    try {
      const analysis = await analyzeParcelContext({
        address: answers.address,
        parcelId: answers.parcel,
        commune: answers.commune,
        dossierType: "PCMI",
      });
      setParcelContext(analysis);
      applyParcelContextToAnswers(analysis);
    } catch (error) {
      setParcelContextError(error instanceof Error ? error.message : "Analyse territoriale indisponible");
    } finally {
      setParcelContextLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Quels travaux prévoyez-vous ?</h2>
            <p className="mt-1 text-sm text-slate-600">Vous pouvez sélectionner plusieurs éléments si votre projet combine plusieurs travaux.</p>
          </div>
          <Badge variant="outline">{actions.length} sélectionné{actions.length > 1 ? "s" : ""}</Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROJECT_ACTIONS.map((action) => {
            const selected = actions.includes(action.id);
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => toggleAction(action.id)}
                className={cn(
                  "rounded-lg border p-4 text-left transition hover:border-primary/50 hover:bg-primary/5",
                  selected ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{action.label}</p>
                    <p className="mt-1 text-sm text-slate-600">{action.description}</p>
                  </div>
                  {selected ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {questions.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-lg font-semibold text-slate-950">Précisions utiles</h3>
          <p className="mt-1 text-sm text-slate-600">Ces réponses affinent l'orientation et préparent le dépôt.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {questions.map((key) => {
              const question = QUESTION_LABELS[key];
              if (!question) return null;
              return (
                <label key={key} className="rounded-lg border border-slate-200 bg-white p-4">
                  <Label className="text-sm font-semibold text-slate-900">{question.label}</Label>
                  {question.type === "boolean" ? (
                    <Select value={(answers as any)[key] === true ? "yes" : (answers as any)[key] === false ? "no" : ""} onValueChange={(value) => updateAnswer(key, value)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="À renseigner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Oui</SelectItem>
                        <SelectItem value="no">Non</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="mt-2"
                      type={question.type === "number" ? "number" : "text"}
                      value={String((answers as any)[key] ?? "")}
                      onChange={(event) => updateAnswer(key, event.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
          <MapPin className="h-5 w-5 text-primary" />
          Analyse automatique du terrain
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Renseignez uniquement une adresse ou une parcelle. Heureka détecte automatiquement les contraintes territoriales disponibles.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <Label>Adresse du projet</Label>
            <Input value={answers.address || ""} onChange={(event) => setAnswers((current) => ({ ...current, address: event.target.value }))} />
          </label>
          <label className="space-y-2">
            <Label>Parcelle cadastrale si connue</Label>
            <Input value={answers.parcel || ""} onChange={(event) => setAnswers((current) => ({ ...current, parcel: event.target.value }))} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={parcelContextLoading || (!answers.address && !answers.parcel)} onClick={runParcelContextAnalysis}>
            Analyser le terrain
          </Button>
          <Button type="button" variant="ghost" onClick={() => setExpertCorrection((value) => !value)}>
            Corriger ou compléter les informations
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {parcelContextLoading ? <ParcelDetectionLoader /> : null}
          <ParcelContextSummary analysis={parcelContext} error={parcelContextError} onRetry={runParcelContextAnalysis} onShowDetails={() => setShowDetails((value) => !value)} />
          {showDetails ? <ParcelContextDetails analysis={parcelContext} /> : null}
        </div>

        {expertCorrection ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">Correction manuelle avancée</p>
            <p className="mt-1 text-xs text-amber-800">À utiliser uniquement si une donnée automatique est manquante ou manifestement incorrecte.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <Label>Commune</Label>
                <Input value={answers.commune || ""} onChange={(event) => setAnswers((current) => ({ ...current, commune: event.target.value }))} />
              </label>
              <label className="space-y-2">
                <Label>Zone PLU</Label>
                <Input value={answers.pluZone || ""} onChange={(event) => setAnswers((current) => ({ ...current, pluZone: event.target.value }))} />
              </label>
              {[
                ["abf", "Périmètre ABF / abords monument historique"],
                ["spr", "Site patrimonial remarquable"],
                ["natura2000", "Natura 2000"],
                ["pprRequiresStudy", "PPRI / PPRN / PPRT ou risque identifié"],
                ["soilInformationSector", "Secteur d'information sur les sols"],
                ["formerIcpe", "Ancienne ICPE"],
                ["oap", "OAP"],
                ["servitude", "Servitude d'utilité publique"],
                ["metropoleCompetence", "Compétence métropole / voirie"],
                ["erp", "ERP ou accessibilité"],
              ].map(([key, label]) => (
                <label key={key} className="rounded-lg border border-amber-200 bg-white p-3">
                  <Label className="text-sm font-medium text-slate-900">{label}</Label>
                  <Select value={(answers as any)[key] === true ? "yes" : (answers as any)[key] === false ? "no" : ""} onValueChange={(value) => updateBoolean(key as keyof OrientationAnswers, value)}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Non renseigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Oui / détecté</SelectItem>
                      <SelectItem value="no">Non identifié</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex justify-end">
        <Button type="button" size="lg" disabled={actions.length === 0} onClick={() => props.onResult(determineDossierType(actions, answers))}>
          Voir la démarche recommandée
        </Button>
      </div>
    </div>
  );
}
