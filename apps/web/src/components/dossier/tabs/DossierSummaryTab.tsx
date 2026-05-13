import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, FileText, Info, ListChecks, MapPin, MessageSquare, Search, User, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDossierTypeLabel } from "@/lib/urbanisme/dossier/dossierTypeLabels";
import type { DossierDetail, InstructionPayload } from "@/hooks/dossier/useDossierData";
import type { ConformityAnalysisResult } from "@/lib/urbanisme/conformity/conformityAnalysisService";
import { LegalAlerts } from "@/components/instruction/LegalAlerts";
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

  // Génération du résumé IA structuré
  const generateIASummary = () => {
    const surfaceDescription = surface ? `${surface} m² SP` : "Surface non déclarée";
    const zoneDescription = zone !== "Non renseignée" ? `Zone ${zone}${zoneLabel ? ` (${zoneLabel})` : ""}` : "Zone PLU non identifiée";
    
    const constraintsText = orientationConstraints.length > 0 
      ? orientationConstraints.map(c => c.label).slice(0, 3).join(", ")
      : "Aucune contrainte majeure identifiée";

    const piecesStatus = `${conformityAnalysis.cards.pieces.detected} pièces détectées, ${conformityAnalysis.cards.pieces.missing} manquante(s)`;
    
    const vigliancesText = conformityAnalysis.cards.vigilances.length > 0
      ? conformityAnalysis.cards.vigilances.slice(0, 2).map(v => v.label).join(", ")
      : "Aucune vigilance particulière";

    return {
      natureProjet: `${getDossierTypeLabel(dossier.typeProcedure)} déposé par ${dossier.userName || "demandeur non identifié"}`,
      travauxDeclares: `Projet déclaré sur ${surfaceDescription}${dossier.metadata?.description ? ` - ${dossier.metadata.description}` : ""}`,
      elementsUrbanistiques: `Localisation en ${zoneDescription}. CES/COS et hauteur à vérifier selon règlement de zone.`,
      contraintesConnues: constraintsText,
      pointsVigilance: vigliancesText,
      incoherences: conformityAnalysis.cards.pieces.incoherent > 0 
        ? `${conformityAnalysis.cards.pieces.incoherent} incohérence(s) détectée(s) entre documents`
        : "Cohérence documentaire satisfaisante",
      prochainesVerifications: [
        piecesStatus,
        zone !== "Non renseignée" ? "Vérifier conformité au règlement de zone" : "Identifier zone PLU applicable",
        orientationConstraints.some(c => /abf/i.test(c.label)) ? "Solliciter avis ABF requis" : null,
        conformityAnalysis.cards.pieces.missing > 0 ? "Compléter pièces manquantes" : null
      ].filter(Boolean)
    };
  };

  const iaSummary = generateIASummary();

  return (
    <div className="space-y-6">
      {/* Résumé IA du dossier */}
      <InfoCard title="Résumé IA du dossier">
        <div className="space-y-6">
          {/* Nature du projet */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
              📋 Nature du projet
            </h4>
            <div className="space-y-2 text-sm text-slate-600">
              <p><span className="font-medium">Type:</span> {iaSummary.natureProjet}</p>
              <p><span className="font-medium">Travaux:</span> {iaSummary.travauxDeclares}</p>
            </div>
          </div>

          {/* Éléments urbanistiques */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
              🏗️ Éléments urbanistiques
            </h4>
            <div className="space-y-2 text-sm text-slate-600">
              <p>{iaSummary.elementsUrbanistiques}</p>
            </div>
          </div>

          {/* Contraintes identifiées */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
              ⚠️ Contraintes identifiées
            </h4>
            <div className="space-y-2 text-sm text-slate-600">
              <p>{iaSummary.contraintesConnues}</p>
            </div>
          </div>

          {/* Points de vigilance */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
              🔍 Points de vigilance
            </h4>
            <div className="space-y-2 text-sm text-slate-600">
              <p><span className="font-medium">Vigilances automatiques:</span> {iaSummary.pointsVigilance}</p>
              <p><span className="font-medium">Cohérence:</span> {iaSummary.incoherences}</p>
            </div>
          </div>

          {/* Prochaines vérifications */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
              ➡️ Prochaines vérifications
            </h4>
            <ul className="space-y-1 text-sm text-slate-600">
              {iaSummary.prochainesVerifications.map((item, index) => (
                <li key={index} className="flex gap-2">
                  <span>•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lien vers analyse détaillée */}
          <div className="pt-4 border-t border-slate-200">
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={onShowConformityDetails}
            >
              Voir l'analyse détaillée (Score: {conformityAnalysis.score}/100)
            </Button>
          </div>
        </div>
      </InfoCard>

      {/* Points d'attention principaux */}
      {((instruction.alerts && instruction.alerts.length > 0) || orientationConstraints.length > 0) && (
        <InfoCard title="Points d'attention principaux">
          <div className="space-y-4">
            {/* Alertes légales */}
            {instruction.alerts && instruction.alerts.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Alertes légales</h4>
                <LegalAlerts alerts={instruction.alerts.slice(0, 3)} />
              </div>
            )}

            {/* Contraintes majeures */}
            {orientationConstraints.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Contraintes territoriales</h4>
                <div className="space-y-2">
                  {orientationConstraints.slice(0, 2).map((constraint) => (
                    <div key={`${constraint.type}-${constraint.label}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="font-medium text-slate-900 text-sm">{constraint.label}</p>
                      {constraint.impact.decisionImpact && (
                        <p className="mt-1 text-xs text-slate-600">{constraint.impact.decisionImpact}</p>
                      )}
                    </div>
                  ))}
                  {orientationConstraints.length > 2 && (
                    <p className="text-xs text-slate-500">
                      +{orientationConstraints.length - 2} autre(s) contrainte(s) - Voir onglet "Instruction"
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </InfoCard>
      )}
    </div>
  );
}