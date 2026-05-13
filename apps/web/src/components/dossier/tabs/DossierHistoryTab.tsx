import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DossierDetail } from "@/hooks/dossier/useDossierData";

interface DossierHistoryTabProps {
  dossier: DossierDetail;
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

export function DossierHistoryTab({ dossier }: DossierHistoryTabProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Section Historique */}
      <InfoCard title="Historique">
        <div className="space-y-5">
          <div className="flex gap-3">
            <span className="mt-2 h-3 w-3 rounded-full bg-green-700" />
            <div>
              <p className="font-bold">Dossier complet</p>
              <p className="text-slate-500">18 mars 2026</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="mt-2 h-3 w-3 rounded-full bg-green-700" />
            <div>
              <p className="font-bold">Dossier déposé</p>
              <p className="text-slate-500">{formatDate(dossier.createdAt)}</p>
            </div>
          </div>
        </div>
      </InfoCard>

      {/* Section Messagerie */}
      <InfoCard title="Contacter le demandeur">
        <div className="space-y-4">
          <Textarea 
            placeholder="Votre message..." 
            className="min-h-32 rounded-lg border-slate-300" 
          />
          <Button className="gap-2 rounded-lg bg-slate-950 text-white hover:bg-slate-800">
            <Send className="h-4 w-4" />
            Envoyer
          </Button>
        </div>
      </InfoCard>

      {/* Section Messages existants (si disponibles) */}
      {dossier.messages && dossier.messages.length > 0 && (
        <InfoCard title="Messages échangés">
          <div className="space-y-4">
            {dossier.messages.map((message) => (
              <div key={message.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">
                  {formatDate(message.createdAt)}
                </p>
                <p className="mt-2 text-slate-900">
                  {message.content || "Message sans contenu"}
                </p>
              </div>
            ))}
          </div>
        </InfoCard>
      )}

      {/* Section Timeline détaillée */}
      <div className="xl:col-span-2">
        <InfoCard title="Timeline détaillée du dossier">
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-emerald-900">Dossier complet</p>
                <span className="text-sm text-emerald-700">18 mars 2026</span>
              </div>
              <p className="mt-1 text-sm text-emerald-800">
                Toutes les pièces obligatoires ont été fournies. Le délai d'instruction commence.
              </p>
            </div>
            
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-blue-900">Dossier déposé</p>
                <span className="text-sm text-blue-700">{formatDate(dossier.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-blue-800">
                Dépôt initial par {dossier.userName || "le demandeur"}.
              </p>
            </div>
            
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p>
                <strong>Note :</strong> La timeline complète sera enrichie au fur et à mesure 
                de l'avancement de l'instruction du dossier.
              </p>
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  );
}