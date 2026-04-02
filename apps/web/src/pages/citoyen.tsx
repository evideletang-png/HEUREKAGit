import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Plus, FileText, Clock, FileCheck, Search, Users, ShieldAlert, ArrowRight } from "lucide-react";
import { useGetApiDocuments } from "@workspace/api-client-react";

export default function CitoyenPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: docsData, isLoading: docsLoading } = useGetApiDocuments();

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading || docsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <p>Chargement...</p>
      </div>
    );
  }
  
  const documents = docsData?.documents || [];

  return (
    <div className="min-h-screen bg-muted/40 pb-20">
      <header className="bg-white border-b border-border/40 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-primary tracking-tight">HEUREKA <span className="text-muted-foreground font-normal">Citoyen</span></span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium hidden sm:block">{user?.name}</span>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account">Mon Compte</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Mes Dossiers d'Urbanisme</h1>
            <p className="text-muted-foreground mt-1">Suivez l'avancement de vos demandes (PC, DP, CU) et échangez avec votre Mairie.</p>
          </div>
          <Button size="lg" className="shadow-sm bg-primary text-white flex gap-2" asChild>
            <Link href="/citoyen/nouveau">
              <Plus className="w-5 h-5" />
              Déposer un dossier
            </Link>
          </Button>
        </div>

        {documents.length === 0 ? (
          <Card className="border-dashed shadow-none bg-transparent">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-primary/60" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Aucun dossier en cours</h3>
              <p className="text-muted-foreground max-w-md mb-6">
                Vous n'avez pas encore soumis de demande d'urbanisme. Cliquez sur le bouton ci-dessous pour démarrer un nouveau dossier de Permis ou de Déclaration.
              </p>
              <Button asChild>
                <Link href="/citoyen/nouveau">Commencer mon premier dossier</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc: any) => {
               const stepLabels: Record<string, { label: string, color: string, icon: any }> = {
                 "depot": { label: "Dépôt validé", color: "text-blue-600 bg-blue-100", icon: Clock },
                 "analyse": { label: "Analyse experte en cours", color: "text-purple-600 bg-purple-100", icon: Search },
                 "instruction": { label: "En instruction Mairie", color: "text-amber-600 bg-amber-100", icon: Users },
                 "pieces": { label: "Pièces manquantes", color: "text-red-600 bg-red-100", icon: ShieldAlert },
                 "decision": { label: "Décision rendue", color: "text-emerald-700 bg-emerald-100", icon: FileCheck },
               };
               const step = stepLabels[doc.timelineStep || "depot"] || stepLabels["depot"];
               const Icon = step.icon;

               return (
                <Link key={doc.id} href={`/citoyen/dossier/${doc.id}`} className="block group">
                  <Card className="transition-all hover:shadow-md hover:border-primary/20 flex flex-col justify-between h-full">
                    <CardHeader className="pb-4">
                      <div className="flex justify-between items-start mb-2">
                         <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${step.color}`}>
                           <Icon className="w-3.5 h-3.5" />
                           {step.label}
                         </span>
                         <span className="text-xs text-muted-foreground font-medium uppercase">{((doc.documentType as string) || "autre").replace(/_/g, " ")}</span>
                      </div>
                      <CardTitle className="text-lg line-clamp-1">
                        {doc.title}
                        {doc.documentCount && doc.documentCount > 1 && (
                          <span className="text-xs font-medium text-primary ml-2 bg-primary/10 px-1.5 py-0.5 rounded">
                            + {doc.documentCount - 1} documents
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1.5 mt-1.5">
                        <Building2 className="w-3.5 h-3.5" /> 
                        {doc.commune || "Mairie non spécifiée"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 relative">
                       <p className="text-sm text-muted-foreground line-clamp-2 mb-6">
                         Soumis le {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                       </p>
                       
                       <div className="flex justify-end mt-4">
                         <Button variant="ghost" size="sm" className="text-primary gap-1 group">
                           Ouvrir le suivi
                           <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                         </Button>
                       </div>
                    </CardContent>
                  </Card>
                </Link>
               );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
