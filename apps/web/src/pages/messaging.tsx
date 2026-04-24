import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Gavel, Loader2, MessageSquare, ShieldCheck } from "lucide-react";

async function apiFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return response.json();
}

type DossierEntry = {
  id: string;
  title?: string | null;
  dossierNumber?: string | null;
  address?: string | null;
  commune?: string | null;
  typeProcedure?: string | null;
  status?: string | null;
};

type AppealEntry = {
  id: string;
  summary?: string | null;
  appealType?: string | null;
  status?: string | null;
  commune?: string | null;
  projectAddress?: string | null;
  decisionReference?: string | null;
  messagesCount?: number | null;
  dossier?: DossierEntry | null;
};

function dossierMessageHref(role: string, dossierId: string) {
  if (role === "citoyen" || role === "user") return `/citoyen/dossier/${dossierId}`;
  return `/portail-mairie/${dossierId}`;
}

export default function MessagingPage() {
  const { user } = useAuth();
  const role = (user?.role as string) || "";

  const dossiersQuery = useQuery<{ dossiers: DossierEntry[] }>({
    queryKey: ["messaging-dossiers"],
    queryFn: () => apiFetch("/api/appeals/options/dossiers"),
  });

  const appealsQuery = useQuery<{ appeals: AppealEntry[] }>({
    queryKey: ["messaging-appeals"],
    queryFn: () => apiFetch("/api/appeals"),
  });

  const dossiers = dossiersQuery.data?.dossiers || [];
  const appeals = appealsQuery.data?.appeals || [];
  const isLoading = dossiersQuery.isLoading || appealsQuery.isLoading;
  const hasEntries = dossiers.length > 0 || appeals.length > 0;

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 bg-primary/5 text-primary border-primary/20">
              Messagerie transversale
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">Messagerie</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Les échanges restent attachés à un dossier ou à un recours pour conserver une trace opposable, mais cette page sert de point d’entrée unique.
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-primary">Principe de lecture</p>
            <p>Un fil = un objet métier traçable : dossier, recours, contradictoire.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-primary" />
                Point d’entrée unique
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Accède aux fils sans devoir te souvenir dans quelle page ils sont rangés.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Traçabilité conservée
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Les messages restent liés au dossier ou au recours concerné.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gavel className="h-4 w-4 text-primary" />
                Contradictoire lisible
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Les recours ont leur propre fil pour séparer le contradictoire du suivi courant.
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !hasEntries ? (
          <Card className="border-dashed">
            <CardContent className="py-14 text-center">
              <MessageSquare className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
              <p className="font-semibold">Aucun fil de messagerie disponible</p>
              <p className="mt-2 text-sm text-muted-foreground">
                La messagerie apparaîtra dès qu’un dossier ou un recours sera créé.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Dossiers urbanisme
                </CardTitle>
                <CardDescription>Échanges entre citoyen, mairie et services instructeurs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dossiers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Aucun dossier accessible pour ce profil.
                  </div>
                ) : dossiers.map((dossier) => (
                  <div key={dossier.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-semibold">{dossier.dossierNumber || dossier.title || "Dossier urbanisme"}</p>
                        <p className="text-sm text-muted-foreground">{dossier.address || "Adresse non renseignée"}</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {dossier.commune && <Badge variant="outline">{dossier.commune}</Badge>}
                          {dossier.typeProcedure && <Badge variant="outline">{dossier.typeProcedure}</Badge>}
                          {dossier.status && <Badge variant="outline">{dossier.status}</Badge>}
                        </div>
                      </div>
                      <Button asChild size="sm" className="shrink-0">
                        <Link href={dossierMessageHref(role, dossier.id)}>
                          Ouvrir les messages
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="h-5 w-5 text-primary" />
                  Recours
                </CardTitle>
                <CardDescription>Messages liés au contradictoire, aux griefs et aux pièces de recours.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {appeals.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Aucun recours accessible pour ce profil.
                  </div>
                ) : appeals.map((appeal) => (
                  <div key={appeal.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-semibold">{appeal.summary || appeal.decisionReference || "Recours"}</p>
                        <p className="text-sm text-muted-foreground">
                          {appeal.projectAddress || appeal.dossier?.address || "Adresse non renseignée"}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {appeal.commune && <Badge variant="outline">{appeal.commune}</Badge>}
                          {appeal.appealType && <Badge variant="outline">{appeal.appealType}</Badge>}
                          {appeal.status && <Badge variant="outline">{appeal.status}</Badge>}
                        </div>
                      </div>
                      <Button asChild size="sm" className="shrink-0">
                        <Link href={`/recours/${appeal.id}`}>
                          Ouvrir le fil
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
