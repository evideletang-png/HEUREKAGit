import { useMemo } from "react";
import { CheckCircle2, Clock3, Download, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeadlineWidget } from "@/components/instruction/DeadlineWidget";
import { InstructionTimeline } from "@/components/instruction/InstructionTimeline";
import { LegalAlerts } from "@/components/instruction/LegalAlerts";
import type { DossierDetail, InstructionPayload } from "@/hooks/dossier/useDossierData";
import type {
  OrientationLocationConstraint,
  OrientationExpectedConsultation,
  OrientationEstimatedTimeline,
} from "@/modules/orientation/orientation.types";

interface DossierInstructionTabProps {
  dossier: DossierDetail;
  instruction: InstructionPayload["instruction"];
  instructionTimeline: InstructionPayload["timeline"];
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

export function DossierInstructionTab({ dossier, instruction, instructionTimeline }: DossierInstructionTabProps) {
  // Données orientationContext
  const orientationContext = dossier.metadata?.orientationContext as {
    locationConstraints?: OrientationLocationConstraint[];
    expectedConsultations?: OrientationExpectedConsultation[];
    estimatedInstructionTimeline?: OrientationEstimatedTimeline;
  } | undefined;

  const orientationConstraints = Array.isArray(orientationContext?.locationConstraints)
    ? orientationContext.locationConstraints.filter((constraint) => constraint.detected)
    : [];
  
  const orientationConsultations = Array.isArray(orientationContext?.expectedConsultations)
    ? orientationContext.expectedConsultations
    : [];
  
  const orientationTimeline = orientationContext?.estimatedInstructionTimeline;

  // Données projet
  const parcelAnalysis = dossier.metadata?.parcelAnalysis || {};
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

  const documents = dossier.documents?.length ? dossier.documents : [];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Section Instruction */}
      <InfoCard title="Instruction">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
            Statut : {instruction.instructionStatus || "depose"}
          </span>
          <span className={`rounded-full px-4 py-2 text-sm font-bold ${instruction.isTacite ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
            {instruction.isTacite ? "Risque de décision tacite" : "Instruction suivie"}
          </span>
        </div>
        <InstructionTimeline
          events={instructionTimeline}
          dates={[
            { label: "Dépôt", value: instruction.dateDepot },
            { label: "Complétude", value: instruction.dateCompletude },
            { label: "Limite", value: instruction.dateLimiteInstruction },
          ]}
        />
      </InfoCard>

      {/* Section Délais & Alertes */}
      <InfoCard title="Délais & Alertes">
        <div className="space-y-5">
          <DeadlineWidget deadline={instruction.dateLimiteInstruction} isTacite={instruction.isTacite} />
          <LegalAlerts alerts={instruction.alerts || []} />
        </div>
      </InfoCard>

      {/* Section Informations du projet */}
      <InfoCard title="Informations du projet">
        <div className="grid gap-5 sm:grid-cols-2">
          {projectFacts.map(([label, value]) => (
            <div key={label}>
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Section Analyse de contexte */}
      <InfoCard title="Analyse de contexte">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-500">Contraintes détectées</p>
            {orientationConstraints.length > 0 ? (
              <div className="mt-3 space-y-2">
                {orientationConstraints.map((constraint) => (
                  <div key={`${constraint.type}-${constraint.label}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{constraint.label}</p>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">{constraint.confidence}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">Source : {constraint.source}</p>
                    {constraint.impact.decisionImpact ? <p className="mt-1 text-sm text-slate-700">{constraint.impact.decisionImpact}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Aucune contrainte issue de l'orientation n'a été transmise.</p>
            )}
          </div>
          
          <div>
            <p className="text-sm font-semibold text-slate-500">Services à consulter</p>
            {orientationConsultations.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {orientationConsultations.map((consultation) => (
                  <div key={`${consultation.service}-${consultation.reason}`} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-950">{consultation.service}</p>
                    <p className="mt-1 text-sm text-slate-600">{consultation.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">{consultation.required ? "Consultation probable" : "À confirmer"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Aucun service additionnel proposé à ce stade.</p>
            )}
          </div>
          
          {orientationTimeline ? (
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              Délai indicatif orientation : {orientationTimeline.baseDelay.durationMonths} mois de base
              {orientationTimeline.possibleMajorations.length > 0 ? `, ${orientationTimeline.possibleMajorations.length} majoration(s) possible(s)` : ""}.
            </div>
          ) : null}
        </div>
      </InfoCard>

      {/* Section Documents */}
      <InfoCard title="Documents">
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="font-semibold">{doc.title || doc.fileName || doc.documentType || "Document"}</span>
              <Button variant="ghost" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </InfoCard>

      {/* Section Avis des services */}
      <InfoCard title="Avis des services">
        <div className="mb-4">
          <Button variant="outline" className="gap-2 rounded-lg border-slate-300">
            <Plus className="h-4 w-4" />
            Consulter un autre service
          </Button>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 p-4 text-emerald-950">
            <p className="flex items-center gap-2 text-lg font-bold">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> 
              Métropole - Avis favorable
            </p>
            <p className="mt-2 text-sm">Reçu le 20 mars 2026</p>
            <p className="mt-2 text-sm italic text-emerald-800">Motif : Surface &gt; 40m² en zone urbaine</p>
            <p className="mt-2">Le projet respecte les règles d'urbanisme applicables.</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-4 text-amber-950">
            <p className="flex items-center gap-2 text-lg font-bold">
              <Clock3 className="h-5 w-5 text-amber-600" /> 
              ABF - En attente
            </p>
            <p className="mt-2 text-sm">Demandé le 18 mars 2026</p>
            <p className="mt-2 text-sm italic text-amber-800">Motif : Périmètre de protection monument historique</p>
            <p className="mt-2">Avis de l'Architecte des Bâtiments de France en attente.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <strong>Consultations automatiques :</strong> Le système détermine automatiquement les services à consulter selon les caractéristiques du projet. Vous pouvez ajouter manuellement d'autres services si nécessaire.
          </div>
        </div>
      </InfoCard>
    </div>
  );
}