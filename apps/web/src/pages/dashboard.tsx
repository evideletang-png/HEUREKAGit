import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useListAnalyses, useDeleteAnalysis } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Trash2, ArrowRight, Loader2, MapPin, Building, ShieldCheck, Building2, Scale } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPage() {
  const { data, isLoading } = useListAnalyses({ limit: 50 });
  const deleteMutation = useDeleteAnalysis();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/analyses`] });
          toast({ title: "Analyse supprimée" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Erreur lors de la suppression" });
        }
      }
    );
  };

  return (
    <ProtectedLayout>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Tableau de bord</h1>
          <p className="text-muted-foreground">Gérez vos études de faisabilité et lancez de nouvelles analyses.</p>
        </div>
        <Button size="lg" className="shadow-md" asChild>
          <Link href="/analyses/new">
            <Plus className="w-5 h-5 mr-2" />
            Nouvelle analyse
          </Link>
        </Button>
      </div>

      {/* Admin Quick Access Portals */}
      {(useAuth().user?.role === "admin") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Link href="/portail-mairie" className="group p-6 bg-green-50/50 hover:bg-green-100/60 border border-green-200 rounded-2xl shadow-sm transition-all hover:shadow-md flex items-center gap-4 group">
             <div className="w-12 h-12 rounded-xl bg-green-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
               <ShieldCheck className="w-6 h-6" />
             </div>
             <div>
               <h3 className="font-bold text-green-900 group-hover:text-green-950">Portail Mairie</h3>
               <p className="text-xs text-green-700/70 italic">Gestion & Pré-instruction locale</p>
             </div>
          </Link>
          <Link href="/portail-metropole" className="group p-6 bg-indigo-50/50 hover:bg-indigo-100/60 border border-indigo-200 rounded-2xl shadow-sm transition-all hover:shadow-md flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
               <Building2 className="w-6 h-6" />
             </div>
             <div>
               <h3 className="font-bold text-indigo-900 group-hover:text-indigo-950">Portail Métropole</h3>
               <p className="text-xs text-indigo-700/70 italic">Instruction experte mutualisée</p>
             </div>
          </Link>
          <Link href="/portail-abf" className="group p-6 bg-amber-50/50 hover:bg-amber-100/60 border border-amber-200 rounded-2xl shadow-sm transition-all hover:shadow-md flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-amber-700 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
               <Scale className="w-6 h-6" />
             </div>
             <div>
               <h3 className="font-bold text-amber-900 group-hover:text-amber-950">Avis ABF</h3>
               <p className="text-xs text-amber-700/70 italic">Consultation Patrimoine & Bâtiments</p>
             </div>
          </Link>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
        </div>
      ) : data?.analyses?.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border/60 p-12 text-center shadow-sm flex flex-col items-center max-w-2xl mx-auto mt-12">
          <img 
            src={`${import.meta.env.BASE_URL}images/empty-analyses.png`} 
            alt="Aucune analyse" 
            className="w-48 h-48 mb-6 opacity-90 mix-blend-multiply"
          />
          <h3 className="text-xl font-bold mb-2 text-primary">Aucune analyse pour le moment</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Lancez votre première analyse en renseignant une adresse ou une référence cadastrale.
          </p>
          <Button asChild>
            <Link href="/analyses/new">
              <Plus className="w-4 h-4 mr-2" />
              Démarrer une analyse
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.analyses?.map((analysis) => (
            <div key={analysis.id} className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 hover:shadow-md transition-all group flex flex-col h-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="flex justify-between items-start mb-4">
                <StatusBadge status={analysis.status} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-2 -mr-2">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer cette analyse ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Toutes les données, documents et résultats associés seront effacés.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction 
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => handleDelete(analysis.id)}
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Supprimer"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="mb-6 flex-grow">
                <h3 className="font-bold text-lg text-primary line-clamp-2 mb-2" title={analysis.title || analysis.address}>
                  {analysis.title || analysis.address}
                </h3>
                
                <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{analysis.address}</span>
                  </div>
                  {(analysis.zoneCode || analysis.parcelRef) && (
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 shrink-0" />
                      <span>
                        {analysis.parcelRef && <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs mr-2">{analysis.parcelRef}</span>}
                        {analysis.zoneCode && <span className="font-semibold text-primary">Zone {analysis.zoneCode}</span>}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                <div className="text-xs text-muted-foreground">
                  {format(new Date(analysis.createdAt), "d MMM yyyy", { locale: fr })}
                </div>
                <Button variant="secondary" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors" asChild>
                  <Link href={`/analyses/${analysis.id}`}>
                    Ouvrir
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ProtectedLayout>
  );
}
