import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Clock,
  FileCheck,
  FileText,
  Landmark,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useGetApiDocuments } from "@workspace/api-client-react";

const stepLabels: Record<string, { label: string; color: string; icon: any }> = {
  depot: { label: "Dépôt validé", color: "text-blue-700 bg-blue-50 border-blue-200", icon: Clock },
  analyse: { label: "Analyse experte en cours", color: "text-violet-700 bg-violet-50 border-violet-200", icon: Search },
  instruction: { label: "Instruction mairie", color: "text-amber-700 bg-amber-50 border-amber-200", icon: Users },
  pieces: { label: "Pièces à compléter", color: "text-rose-700 bg-rose-50 border-rose-200", icon: ShieldAlert },
  decision: { label: "Décision rendue", color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: FileCheck },
};

const communeHighlights = [
  "Urbanisme & autorisations",
  "Suivi transparent des délais",
  "Échanges directs avec les services",
];

const portalInfoCards = [
  {
    title: "Déposez vos demandes en ligne",
    description: "Constituez un dossier, ajoutez vos pièces et transmettez-le au service instructeur sans vous déplacer.",
    icon: FileText,
  },
  {
    title: "Suivez l'instruction étape par étape",
    description: "Consultez l’avancement de vos démarches, les demandes de compléments et les notifications en temps réel.",
    icon: Search,
  },
  {
    title: "Échangez avec la mairie",
    description: "Centralisez vos messages, rendez-vous et éléments attendus dans un espace unique et lisible.",
    icon: Users,
  },
];

function getFirstName(fullName: string | null | undefined) {
  const normalized = String(fullName || "").trim();
  if (!normalized) return "Bonjour";
  return normalized.split(/\s+/)[0] || normalized;
}

function getPortalCommuneName(documents: any[]) {
  const communeCounts = new Map<string, number>();
  for (const document of documents || []) {
    const commune = String(document?.commune || "").trim();
    if (!commune) continue;
    communeCounts.set(commune, (communeCounts.get(commune) || 0) + 1);
  }

  return Array.from(communeCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || "votre ville";
}

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
  const firstName = getFirstName(user?.name);
  const communeName = getPortalCommuneName(documents);
  const lastActivityLabel = documents[0] ? new Date(documents[0].createdAt).toLocaleDateString("fr-FR") : "Aucune";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-20">
      <header className="bg-white/90 backdrop-blur border-b border-border/40 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-primary/10 bg-white shadow-sm">
              <img src="/favicon.svg" alt="Heureka Citoyen" className="h-8 w-8 rounded-lg" />
            </div>
            <div className="leading-tight">
              <p className="font-bold text-primary tracking-tight">Heureka Citoyen</p>
              <p className="text-xs text-muted-foreground">Guichet numérique urbanisme • {communeName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium hidden sm:block">{user?.name}</span>
            <Button variant="outline" size="sm" asChild>
              <Link href="/account">Mon compte</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <section className="rounded-3xl border border-primary/10 bg-white shadow-sm p-6 md:p-8">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
            <div className="space-y-4 max-w-3xl">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                Portail urbanisme citoyen
              </Badge>
              <div className="space-y-2">
                <p className="text-sm font-medium text-primary">Bonjour {firstName},</p>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                  Bienvenue sur votre guichet numérique de la Mairie de {communeName}
                </h1>
              </div>
              <p className="text-slate-600 text-base md:text-lg">
                Déposez vos demandes d'urbanisme, échangez avec le service instructeur et suivez votre dossier dans un espace conçu pour rendre chaque étape lisible, documentée et accessible.
              </p>
              <div className="flex flex-wrap gap-2">
                {communeHighlights.map((item) => (
                  <span key={item} className="inline-flex items-center rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 min-w-[240px]">
              <Button size="lg" className="w-full gap-2" asChild>
                <Link href="/citoyen/nouveau">
                  <Plus className="w-4 h-4" />
                  Déposer un nouveau dossier
                </Link>
              </Button>
              <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-primary" />
                  Hôtel de Ville – {communeName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Les coordonnées et permanences de votre commune sont centralisées ici pour faciliter vos démarches.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-primary/10 bg-white shadow-sm p-6 md:p-8">
          <div className="space-y-2 mb-5">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              Informations relatives au portail citoyen
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Un espace unique pour suivre vos demandes d’urbanisme
            </h2>
            <p className="text-sm md:text-base text-slate-600 max-w-3xl">
              Ce portail vous permet de déposer un dossier, transmettre des pièces complémentaires, suivre l’avancement de l’instruction et retrouver les échanges liés à votre demande dans un seul espace.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {portalInfoCards.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border bg-slate-50/80 p-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-primary/10">
            <CardHeader className="pb-2">
              <CardDescription>Dossiers actifs</CardDescription>
              <CardTitle className="text-3xl">{documents.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Toutes demandes en cours de traitement confondues.</CardContent>
          </Card>
          <Card className="border-primary/10">
            <CardHeader className="pb-2">
              <CardDescription>Dernière activité</CardDescription>
              <CardTitle className="text-base">{lastActivityLabel}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Consultez les nouveaux messages et pièces demandées.</CardContent>
          </Card>
          <Card className="border-primary/10">
            <CardHeader className="pb-2">
              <CardDescription>Prochaine permanence</CardDescription>
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> Jeudi matin</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Accompagnement aux démarches en mairie sur rendez-vous.</CardContent>
          </Card>
        </section>

        {documents.length === 0 ? (
          <Card className="border-dashed bg-white/80 shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-primary/60" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Aucun dossier en cours</h3>
              <p className="text-muted-foreground max-w-md mb-6">
                Commencez votre première démarche urbanisme en quelques minutes : la mairie sera notifiée automatiquement dès l'envoi.
              </p>
              <Button asChild>
                <Link href="/citoyen/nouveau">Commencer ma demande</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Mes dossiers</h2>
              <p className="text-sm text-muted-foreground">Classement par date de dépôt</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {documents.map((doc: any) => {
                const step = stepLabels[doc.timelineStep || "depot"] || stepLabels.depot;
                const Icon = step.icon;

                return (
                  <Link key={doc.id} href={`/citoyen/dossier/${doc.id}`} className="block group">
                    <Card className="transition-all bg-white/95 hover:shadow-lg hover:-translate-y-0.5 border-border/80 flex flex-col justify-between h-full">
                      <CardHeader className="pb-4 space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${step.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {step.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                            {((doc.documentType as string) || "autre").replace(/_/g, " ")}
                          </span>
                        </div>
                        <CardTitle className="text-lg line-clamp-1 text-slate-900">
                          {doc.title}
                          {doc.documentCount && doc.documentCount > 1 && (
                            <span className="text-xs font-medium text-primary ml-2 bg-primary/10 px-1.5 py-0.5 rounded">
                              + {doc.documentCount - 1} document{doc.documentCount - 1 > 1 ? "s" : ""}
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1.5 mt-1.5 text-slate-500">
                          <Building2 className="w-3.5 h-3.5" />
                          {doc.commune || "Mairie non spécifiée"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-6">
                          Déposé le {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                        </p>

                        <div className="flex justify-end mt-4">
                          <Button variant="ghost" size="sm" className="text-primary gap-1 group">
                            Voir le suivi
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
