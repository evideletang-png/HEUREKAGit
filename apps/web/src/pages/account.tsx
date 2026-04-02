import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <ProtectedLayout>
      <div className="max-w-2xl mx-auto mt-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Mon compte</h1>
          <p className="text-muted-foreground">Gérez vos informations personnelles.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profil Utilisateur
            </CardTitle>
            <CardDescription>
              Ces informations sont utilisées pour personnaliser vos rapports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input value={user?.name || ""} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Label>Membre depuis le</Label>
              <p className="text-sm text-muted-foreground">
                {user?.createdAt ? format(new Date(user.createdAt), "d MMMM yyyy", { locale: fr }) : "-"}
              </p>
            </div>
            
            <div className="pt-4 border-t border-border">
              <Button disabled>Enregistrer les modifications</Button>
              <p className="text-xs text-muted-foreground mt-2 inline-block ml-4">
                La modification du profil sera disponible prochainement.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
