import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Trash2 } from "lucide-react";
import { ProfessionalShell } from "@/components/layout/ProfessionalShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const STANDARD_PERMISSIONS = [
  "dossier.read",
  "dossier.write",
  "dossier.instruct",
  "dossier.assign",
  "dossier.request_pieces",
  "dossier.generate_decision",
  "dossier.consult_services",
  "message.read",
  "message.write",
  "plu.read",
  "plu.write",
  "fiscalite.read",
  "fiscalite.write",
  "settings.read",
  "settings.write",
  "users.manage",
  "demo.access",
];

const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: ["dossier.read", "dossier.write", "dossier.instruct", "dossier.assign", "message.read", "message.write", "settings.read", "settings.write", "users.manage"],
  instructeur: ["dossier.read", "dossier.write", "dossier.instruct", "dossier.request_pieces", "dossier.generate_decision", "dossier.consult_services", "message.read", "message.write", "plu.read", "fiscalite.read"],
  consultation: ["dossier.read", "message.read", "plu.read", "settings.read"],
  super_admin: STANDARD_PERMISSIONS,
};

type AdminUser = { id: string; name: string; email: string; role: string };
type Commune = { id: string; name: string };
type Assignment = {
  id?: string;
  userId: string;
  actorType: string;
  roleKey: string;
  scopeType: string;
  scopeId: string | null;
  permissions: string[];
  source?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Erreur de chargement.");
  return response.json();
}

export default function AdminPermissionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const canManageUsers = Boolean((user as any)?.hasGlobalAccess || ((user as any)?.permissions || []).includes("users.manage") || ["admin", "super_admin"].includes(String((user as any)?.role || "")));
  const { data: users = [] } = useQuery({ queryKey: ["admin-users-for-permissions"], queryFn: () => fetchJson<AdminUser[]>("/api/admin/users") });
  const { data: communes = [] } = useQuery({ queryKey: ["admin-communes-for-permissions"], queryFn: () => fetchJson<Commune[]>("/api/admin/communes") });
  const { data: assignmentsData } = useQuery({
    queryKey: ["admin-assignments"],
    queryFn: () => fetchJson<{ assignments: Array<{ user: AdminUser; assignments: Assignment[] }> }>("/api/admin/assignments"),
  });

  const [userId, setUserId] = useState("");
  const [actorType, setActorType] = useState("collectivite");
  const [roleKey, setRoleKey] = useState("instructeur");
  const [scopeType, setScopeType] = useState("commune");
  const [scopeId, setScopeId] = useState("");
  const [permissions, setPermissions] = useState<string[]>(ROLE_DEFAULTS.instructeur);

  const selectedUser = useMemo(() => users.find((user) => user.id === userId), [userId, users]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/assignments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, actorType, roleKey, scopeType, scopeId, permissions }),
      });
      if (!response.ok) throw new Error((await response.json()).message || "Création impossible.");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Droits enregistrés", description: "Le périmètre utilisateur a été ajouté." });
      queryClient.invalidateQueries({ queryKey: ["admin-assignments"] });
    },
    onError: (error) => toast({ variant: "destructive", title: "Erreur", description: error instanceof Error ? error.message : "Action impossible." }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ assignmentUserId, assignmentId }: { assignmentUserId: string; assignmentId: string }) => {
      const response = await fetch(`/api/admin/assignments/${assignmentUserId}/${assignmentId}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Suppression impossible.");
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-assignments"] }),
  });

  return (
    <ProfessionalShell portalType="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-950">Gestion des droits</h1>
          <p className="mt-1 text-slate-600">Attribuez des profils par rôle, périmètre et permissions.</p>
        </div>

        {!isLoading && !canManageUsers ? (
          <Alert className="border-red-200 bg-red-50 text-red-900">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Accès refusé</AlertTitle>
            <AlertDescription>La gestion des droits est réservée aux profils autorisés.</AlertDescription>
          </Alert>
        ) : null}

        <Alert className="border-slate-200 bg-white">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Modèle Role + Scope + Permissions</AlertTitle>
          <AlertDescription>
            Les anciens rôles restent compatibles. Les nouveaux droits permettent de limiter un instructeur métropole, ABF ou SDIS à ses communes autorisées.
          </AlertDescription>
        </Alert>

        {canManageUsers ? <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Attribuer un droit</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <Label>Utilisateur</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Choisir un utilisateur" /></SelectTrigger>
                <SelectContent>
                  {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name} · {user.email}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedUser ? <p className="text-xs text-slate-500">Rôle historique : {selectedUser.role}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Profil</Label>
              <Select value={actorType} onValueChange={setActorType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collectivite">Collectivité</SelectItem>
                  <SelectItem value="metropole">Métropole</SelectItem>
                  <SelectItem value="abf">ABF</SelectItem>
                  <SelectItem value="sdis">SDIS</SelectItem>
                  <SelectItem value="extra_super_admin">Extra Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={roleKey} onValueChange={(value) => { setRoleKey(value); setPermissions(ROLE_DEFAULTS[value] || []); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="instructeur">Instructeur</SelectItem>
                  <SelectItem value="consultation">Consultation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Périmètre</Label>
              <Select value={scopeType} onValueChange={setScopeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="commune">Commune</SelectItem>
                  <SelectItem value="epci">EPCI</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-3">
              <Label>Identifiant du périmètre</Label>
              {scopeType === "commune" ? (
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger><SelectValue placeholder="Commune autorisée" /></SelectTrigger>
                  <SelectContent>{communes.map((commune) => <SelectItem key={commune.id} value={commune.name}>{commune.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={scopeId} onChange={(event) => setScopeId(event.target.value)} placeholder={scopeType === "global" ? "Non requis" : "Identifiant EPCI ou service"} disabled={scopeType === "global"} />
              )}
            </div>
            <div className="space-y-2 lg:col-span-4">
              <Label>Permissions</Label>
              <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
                {STANDARD_PERMISSIONS.map((permission) => (
                  <label key={permission} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Checkbox
                      checked={permissions.includes(permission)}
                      onCheckedChange={(checked) => setPermissions((current) => checked ? [...current, permission] : current.filter((item) => item !== permission))}
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </div>
            <div className="lg:col-span-4">
              <Button className="w-full bg-slate-950 text-white hover:bg-slate-800" disabled={!userId || createMutation.isPending} onClick={() => createMutation.mutate()}>
                Enregistrer le droit
              </Button>
            </div>
          </CardContent>
        </Card> : null}

        {canManageUsers ? <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Droits attribués</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Profil</TableHead>
                  <TableHead>Périmètre</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(assignmentsData?.assignments || []).flatMap(({ user, assignments }) => assignments.map((assignment) => (
                  <TableRow key={`${user.id}-${assignment.id || assignment.scopeId || assignment.roleKey}`}>
                    <TableCell>
                      <div className="font-semibold text-slate-950">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </TableCell>
                    <TableCell>{assignment.actorType} · {assignment.roleKey}</TableCell>
                    <TableCell>{assignment.scopeType}{assignment.scopeId ? ` · ${assignment.scopeId}` : ""}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {assignment.permissions.slice(0, 5).map((permission) => <Badge key={permission} variant="secondary">{permission}</Badge>)}
                        {assignment.permissions.length > 5 ? <Badge variant="outline">+{assignment.permissions.length - 5}</Badge> : null}
                        {assignment.source === "fallback" ? <Badge variant="outline">fallback</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {assignment.id ? (
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ assignmentUserId: user.id, assignmentId: assignment.id! })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          </CardContent>
        </Card> : null}
      </div>
    </ProfessionalShell>
  );
}
