import { Link } from "wouter";
import { LockKeyhole, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DemoAccessGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Chargement de l'accès démo...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" /> Démo protégée</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">Connectez-vous avec le compte autorisé pour accéder au scénario de démonstration figé.</p>
            <Button asChild><Link href="/login">Aller à la connexion</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user?.email !== "test@heureka.fr") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-lg">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-600" /> Accès refusé</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>Ce module est réservé au compte de démonstration <span className="font-semibold">test@heureka.fr</span>.</p>
            <p>Aucune donnée réelle n'est modifiée depuis cet écran.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
