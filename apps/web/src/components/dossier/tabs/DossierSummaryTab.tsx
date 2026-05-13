import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeadlineWidget } from "@/components/instruction/DeadlineWidget";
import { InstructionTimeline } from "@/components/instruction/InstructionTimeline";
import { LegalAlerts } from "@/components/instruction/LegalAlerts";
import type { DossierDetail, InstructionPayload } from "@/hooks/dossier/useDossierData";
import type { ConformityAnalysisResult } from "@/lib/urbanisme/conformity/conformityAnalysisService";
import type { OrientationLocationConstraint } from "@/modules/orientation/orientation.types";

interface DossierSummaryTabProps {
  dossier: DossierDetail;
  instruction: InstructionPayload["instruction"];
  instructionTimeline: InstructionPayload["timeline"];
  conformityAnalysis: ConformityAnalysisResult;
  onShowConformityDetails: () => void;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Non daté";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function scoreClass(analysis: ConformityAnalysisResult) {
  if (analysis.severity === "success") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (analysis.severity === "warning") return "bg-amber-50 text-amber-900 border-amber-200";
  if (analysis.severity === "danger") return "bg-red-50 text-red-900 border-red-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function compactBool(value: boolean | "unknown") {
  if (value === "unknown") return "À confirmer";
  return value ? "Oui" : "Non";
}

export function DossierSummaryTab({ 
  dossier, 
  instruction, 
  instructionTimeline, 
  conformityAnalysis,
  onShowConformityDetails 
}: DossierSummaryTabProps) {
  // Données contextuelles
  const parcelAnalysis = dossier.metadata?.parcelAnalysis || {};
  const orientationContext = dossier.metadata?.orientationContext as {
    locationConstraints?: OrientationLocationConstraint[];
  } | undefined;
  
  const orientationConstraints = Array.isArray(orientationContext?.locationConstraints)
    ? orientationContext.locationConstraints.filter((constraint) => constraint.detected)
    : [];

  const zone = dossier.metadata?.zoneCode
    || dossier.metadata?.zone_code
    || parcelAnalysis.zoneCode
    || dossier.metadata?.pluAnalysis?.zone?.code
    || dossier.metadata?.pluAnalysis?.zone
    || "Non renseignée";
  
  const zoneLabel = parcelAnalysis.zoneLabel || parcelAnalysis.zoningLabel || dossier.metadata?.pluAnalysis?.zone?.label;
  const surface = dossier.metadata?.surfacePlancher || dossier.metadata?.surface_plancher || dossier.metadata?.requested_surface_m2 || 120;

  const projectFacts = useMemo(() => [
    ["Type de demande", dossier.typeProcedure || "Permis de Construire"],
    ["Date de dépôt", formatDate(dossier.createdAt)],
    ["Surface de plancher", `${surface} m²`],
    ["Zonage PLU", zone === "Non renseignée" ? "Zone non renseignée" : `Zone ${zone}${zoneLabel ? ` — ${zoneLabel}` : ""}`],
  ], [dossier, surface, zone, zoneLabel]);

  return (
    <div className="space-y-6">
      {/* Synthèse globale du dossier */}
      <div className="grid gap-6 lg:grid-cols-3">
        <InfoCard title="Délais d'instruction">
          <DeadlineWidget deadline={instruction.dateLimiteInstruction} isTacite={instruction.isTacite} />
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Dépôt :</span>
              <span>{formatDate(instruction.dateDepot)}</span>
            </div>
            <div className="flex justify-between">
              <span>Complétude :</span>
              <span>{formatDate(instruction.dateCompletude)}</span>
            </div>
            <div className="flex justify-between">
              <span>Limite :</span>
              <span>{formatDate(instruction.dateLimiteInstruction)}</span>
            </div>
          </div>
        </InfoCard>

        <InfoCard title="Informations projet">
          <div className="space-y-3">
            {projectFacts.map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="font-medium text-slate-500">{label} :</span>
                <span className="text-slate-900">{value}</span>
              </div>
            ))}
          </div>
        </InfoCard>

        <InfoCard title="Statut instruction">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-500">Statut :</span>
              <span className="text-slate-900">{instruction.instructionStatus || "depose"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-500">Tacite :</span>
              <span className={instruction.isTacite ? "text-red-700" : "text-emerald-700"}>
                {instruction.isTacite ? "Risque" : "Suivi"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-500">Documents :</span>
              <span className="text-slate-900">{dossier.documents?.length || 0} pièce(s)</span>
            </div>
          </div>
        </InfoCard>
      </div>

      {/* Timeline du dossier */}
      <InfoCard title="Timeline du dossier">
        <InstructionTimeline
          events={instructionTimeline}
          dates={[
            { label: "Dépôt", value: instruction.dateDepot },
            { label: "Complétude", value: instruction.dateCompletude },
            { label: "Limite", value: instruction.dateLimiteInstruction },
          ]}
        />
      </InfoCard>

      {/* Analyse IA globale */}
      <InfoCard title="Première analyse IA globale">
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black uppercase tracking-wide text-slate-400">Analyse de conformité</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className={`rounded-full border px-4 py-2 text-sm font-black ${scoreClass(conformityAnalysis)}`}>
                  {conformityAnalysis.label}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
                  Score {conformityAnalysis.score}/100
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
                  {conformityAnalysis.riskLabel}
                </span>
              </div>
              <div className="mt-4 max-w-3xl space-y-1 text-sm leading-6 text-slate-600">
                {conformityAnalysis.summary.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
            <Button variant="outline" className="rounded-lg border-slate-300" onClick={onShowConformityDetails}>
              Voir l'analyse détaillée
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Pièces</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{conformityAnalysis.cards.pieces.detected} détectées</p>
              <p className="mt-1 text-sm text-slate-600">{conformityAnalysis.cards.pieces.missing} manquante(s), {conformityAnalysis.cards.pieces.incoherent} incohérence(s)</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Urbanisme</p>
              <p className="mt-2 text-lg font-black text-slate-950">Zone {conformityAnalysis.cards.urbanism.zone}</p>
              <p className="mt-1 text-sm text-slate-600">ABF : {compactBool(conformityAnalysis.cards.urbanism.abf)} · PPRI : {compactBool(conformityAnalysis.cards.urbanism.ppri)} · OAP : {compactBool(conformityAnalysis.cards.urbanism.oap)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Vigilances</p>
              {conformityAnalysis.cards.vigilances.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {conformityAnalysis.cards.vigilances.slice(0, 5).map((check) => (
                    <Badge key={check.topic} variant="outline" className="bg-white">{check.label}</Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">Aucune vigilance majeure.</p>
              )}
            </div>
          </div>
        </div>
      </InfoCard>

      {/* Alertes principales */}
      {instruction.alerts && instruction.alerts.length > 0 && (
        <InfoCard title="Alertes principales">
          <LegalAlerts alerts={instruction.alerts} />
        </InfoCard>
      )}

      {/* Contraintes urbanistiques */}
      {orientationConstraints.length > 0 && (
        <InfoCard title="Contraintes urbanistiques principales">
          <div className="space-y-3">
            {orientationConstraints.slice(0, 3).map((constraint) => (
              <div key={`${constraint.type}-${constraint.label}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{constraint.label}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">{constraint.confidence}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">Source : {constraint.source}</p>
                {constraint.impact.decisionImpact ? <p className="mt-1 text-sm text-slate-700">{constraint.impact.decisionImpact}</p> : null}
              </div>
            ))}
            {orientationConstraints.length > 3 && (
              <p className="text-sm text-slate-500">
                +{orientationConstraints.length - 3} autre(s) contrainte(s) - Voir onglet "Instruction"
              </p>
            )}
          </div>
        </InfoCard>
      )}
    </div>
  );
}