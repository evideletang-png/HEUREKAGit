import { CheckCircle2, XCircle, FileText, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DossierDetail } from "@/hooks/dossier/useDossierData";
import type { SignatureWorkflowResult } from "@/lib/urbanisme/signature/signatureProvider.interface";

interface DossierDecisionTabProps {
  dossier: DossierDetail;
  onAcceptDossier: () => void;
  onRefuseDossier: () => void;
  onRequestPieces: () => void;
  isPreparingSignature: boolean;
  signatureResult: SignatureWorkflowResult | null;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function DecisionGuard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-900 mb-1">Attention - Décisions finales</p>
          <p className="text-amber-800">
            Ces actions génèrent des courriers officiels qui seront transmis au parapheur pour signature. 
            Assurez-vous que l'instruction est complète avant de prendre une décision.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DossierDecisionTab({ 
  dossier, 
  onAcceptDossier, 
  onRefuseDossier, 
  onRequestPieces,
  isPreparingSignature,
  signatureResult 
}: DossierDecisionTabProps) {
  
  return (
    <div className="space-y-6">
      <DecisionGuard />
      
      {/* Actions principales */}
      <InfoCard title="Actions de décision">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Accepter */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 mb-4" />
            <h3 className="font-semibold text-emerald-900 mb-2">Accepter le dossier</h3>
            <p className="text-sm text-emerald-800 mb-4">
              Générer un arrêté d'acceptation favorable du dossier d'urbanisme.
            </p>
            <Button 
              onClick={onAcceptDossier}
              disabled={isPreparingSignature}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Accepter
            </Button>
          </div>

          {/* Refuser */}
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-600 mb-4" />
            <h3 className="font-semibold text-red-900 mb-2">Refuser le dossier</h3>
            <p className="text-sm text-red-800 mb-4">
              Générer un arrêté de refus avec motifs réglementaires.
            </p>
            <Button 
              onClick={onRefuseDossier}
              disabled={isPreparingSignature}
              variant="destructive"
              className="w-full"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Refuser
            </Button>
          </div>

          {/* Demander pièces */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
            <FileText className="mx-auto h-12 w-12 text-amber-600 mb-4" />
            <h3 className="font-semibold text-amber-900 mb-2">Demander des pièces</h3>
            <p className="text-sm text-amber-800 mb-4">
              Suspendre l'instruction et demander des pièces complémentaires.
            </p>
            <Button 
              onClick={onRequestPieces}
              disabled={isPreparingSignature}
              className="w-full bg-amber-600 text-white hover:bg-amber-700"
            >
              <FileText className="h-4 w-4 mr-2" />
              Demander pièces
            </Button>
          </div>
        </div>

        {/* État de la signature */}
        {signatureResult && (
          <div className="mt-6 rounded-lg border border-violet-200 bg-violet-50 p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-violet-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-violet-900 mb-1">
                  Parapheur : {signatureResult.status === "sent" ? "en attente de signature" : signatureResult.status}
                </p>
                <p className="text-violet-800 mb-1">
                  Demande {signatureResult.signatureRequestId} préparée via {signatureResult.provider}.
                </p>
                {signatureResult.legalNotice && (
                  <p className="text-xs text-violet-700">{signatureResult.legalNotice}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {isPreparingSignature && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-sm text-blue-900">
                Préparation du courrier en cours...
              </p>
            </div>
          </div>
        )}
      </InfoCard>

      {/* Historique des décisions */}
      <InfoCard title="Historique des décisions">
        <div className="text-center py-8 text-slate-500">
          <FileText className="mx-auto h-8 w-8 mb-3 opacity-50" />
          <p className="text-sm">Aucune décision prise pour ce dossier.</p>
          <p className="text-xs mt-1">L'historique des courriers générés apparaîtra ici.</p>
        </div>
      </InfoCard>

      {/* Informations légales */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <h4 className="font-semibold text-slate-900 mb-2">Informations légales</h4>
        <ul className="space-y-1 text-xs">
          <li>• Les décisions d'urbanisme sont soumises aux délais légaux d'instruction</li>
          <li>• Tout refus doit être motivé par des considérations d'urbanisme</li>
          <li>• La demande de pièces suspend le délai d'instruction</li>
          <li>• Les courriers générés suivent les modèles paramétrés de la commune</li>
        </ul>
      </div>
    </div>
  );
}