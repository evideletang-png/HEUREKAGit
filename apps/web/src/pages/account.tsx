import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { MairieNavigation } from "@/components/layout/MairieNavigation";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2, LockKeyhole, Save, User } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function splitName(fullName?: string | null) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export default function AccountPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialName = useMemo(() => splitName(user?.name), [user?.name]);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
      return;
    }
    const nextName = splitName(user?.name);
    setFirstName(nextName.firstName);
    setLastName(nextName.lastName);
    setEmail(user?.email || "");
  }, [isAuthenticated, isLoading, setLocation, user?.email, user?.name]);

  const updateAccount = useMutation({
    mutationFn: async () => {
      if (newPassword && newPassword !== confirmPassword) {
        throw new Error("Les deux nouveaux mots de passe ne correspondent pas.");
      }
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
          email: email.trim(),
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Impossible de mettre à jour le compte.");
      return payload.user;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(getGetMeQueryKey(), updatedUser);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Compte mis à jour", description: "Vos informations personnelles ont été enregistrées." });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const content = (
      <div className="mx-auto mt-8 max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Mon compte</h1>
          <p className="text-muted-foreground">Gérez vos informations personnelles et vos accès.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Informations personnelles
            </CardTitle>
            <CardDescription>
              Ces informations concernent votre compte utilisateur. Les réglages du portail restent dans Paramètres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Profil</Label>
              <p className="text-sm text-muted-foreground">
                {user?.role || "-"} · membre depuis {user?.createdAt ? format(new Date(user.createdAt), "d MMMM yyyy", { locale: fr }) : "-"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole className="w-5 h-5" />
              Mot de passe
            </CardTitle>
            <CardDescription>
              Renseignez votre mot de passe actuel uniquement si vous voulez le remplacer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Mot de passe actuel</Label>
              <Input id="currentPassword" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-4 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Les paramètres métier du site restent dans l’onglet Paramètres du portail.</p>
            <Button className="gap-2" onClick={() => updateAccount.mutate()} disabled={updateAccount.isPending}>
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
  );

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (["mairie", "admin", "super_admin"].includes((user?.role as string) || "")) {
    return (
      <div className="min-h-screen bg-[#f7f7f6] text-slate-950">
        <main className="mx-auto w-full max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
          <MairieNavigation />
          {content}
        </main>
      </div>
    );
  }

  return (
    <ProtectedLayout>
      {content}
    </ProtectedLayout>
  );
}
