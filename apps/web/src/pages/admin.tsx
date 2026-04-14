import { useState, useEffect } from "react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useAdminListUsers, useAdminListAnalyses, useGeocodeAddress, getGeocodeAddressQueryKey, useUpdateAdminUser, useAdminListCommunes, useCreateAdminCommune, useDeleteAdminCommune, getAdminListUsersQueryKey, getAdminListCommunesQueryKey } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Shield, Users, Activity, BrainCircuit, RotateCcw, Save, ChevronDown, ChevronRight, MapPin, X, Plus, Building2, UserPlus, Eye, EyeOff, Loader2, Search, Network, Landmark, Pencil, Trash2, Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

const ROLE_LABELS: Record<string, string> = {
  user: "Utilisateur",
  admin: "Administrateur",
  mairie: "Agent Mairie",
  metropole: "Agent Métropole",
  abf: "Architecte ABF",
  citoyen: "Citoyen",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "default",
  mairie: "secondary",
  metropole: "default",
  abf: "default",
  user: "outline",
  citoyen: "outline",
};

async function updateUserRole(userId: string, role: string) {
  const r = await fetch(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function CommunesEditor({ userId, initialCommunes, onSaved }: { userId: string; initialCommunes: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [communes, setCommunes] = useState<string[]>(initialCommunes);
  const [inseeMapping, setInseeMapping] = useState<Record<string, string>>({});
  const [newCommune, setNewCommune] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: geoData, isFetching: isSearching } = useGeocodeAddress(
    { q: debouncedSearch } as any,
    { 
      query: { 
        enabled: debouncedSearch.length >= 2,
        queryKey: getGeocodeAddressQueryKey({ q: debouncedSearch } as any)
      } 
    }
  );
  const saveMutation = useMutation({
    mutationFn: async ({ list, mapping }: { list: string[]; mapping: Record<string, string> }) => {
      const r = await fetch(`/api/admin/mairie/${userId}/communes`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communes: list, inseeMapping: mapping }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminListUsers"] });
      toast({ title: "Communes sauvegardées", description: `${communes.length} commune(s) configurée(s).` });
      onSaved();
      setOpen(false);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de sauvegarder les communes.", variant: "destructive" });
    },
  });

  const addCommune = (v: string, inseeCode?: string) => {
    const term = v.trim();
    if (!term || communes.includes(term)) return;
    setCommunes(prev => [...prev, term]);
    if (inseeCode) setInseeMapping(prev => ({ ...prev, [term]: inseeCode }));
    setSearch("");
  };

  const removeCommune = (c: string) => setCommunes(prev => prev.filter(x => x !== c));

  if (!open) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {initialCommunes.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Aucune commune</span>
        ) : (
          initialCommunes.map(c => (
            <Badge key={c} variant="outline" className="text-xs gap-1">
              <MapPin className="w-2.5 h-2.5" />
              {c}
            </Badge>
          ))
        )}
        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-primary" onClick={() => setOpen(true)}>
          <Building2 className="w-3 h-3" />
          Configurer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/30 min-w-[320px] relative">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Communes gérées</p>
      <div className="flex flex-wrap gap-1.5">
        {communes.map(c => (
          <span key={c} className="flex items-center gap-1 text-xs bg-background border border-border rounded-full px-2 py-0.5">
            <MapPin className="w-2.5 h-2.5 text-primary" />
            {c}
            <button onClick={() => removeCommune(c)} className="ml-0.5 text-muted-foreground hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {communes.length === 0 && <span className="text-xs text-muted-foreground italic">Aucune commune</span>}
      </div>

      <div className="relative group/search">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une commune ou CP…"
            className="h-7 text-xs pl-7 pr-7"
            autoComplete="off"
          />
          {isSearching && (
            <Loader2 className="absolute right-2 top-1.5 w-3.5 h-3.5 animate-spin text-primary" />
          )}
        </div>

        {/* Suggestions Dropdown */}
        {geoData?.results && geoData.results.length > 0 && search.length >= 2 && (
          <div className="absolute top-full left-0 w-full mt-1 bg-popover rounded-md shadow-lg border border-border overflow-hidden z-50 max-h-48 overflow-y-auto">
            {geoData.results.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted flex flex-col gap-0.5 transition-colors border-b border-border/50 last:border-0"
                onClick={() => addCommune(item.city || item.label, item.inseeCode)}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-xs font-medium text-foreground">{item.city || item.label}</span>
                </div>
                {(item.inseeCode || item.postcode) && (
                  <span className="text-[10px] text-muted-foreground ml-5">
                    {item.postcode}{item.inseeCode ? ` — INSEE ${item.inseeCode}` : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setOpen(false); setSearch(""); setCommunes(initialCommunes); }}>
          Annuler
        </Button>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => saveMutation.mutate({ list: communes, mapping: inseeMapping })} disabled={saveMutation.isPending}>
          <Save className="w-3 h-3" />
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

interface AiPromptRow {
  key: string;
  label: string;
  description: string;
  content: string;
  updatedAt: string | null;
}

function PromptCard({ prompt, onSaved }: { prompt: AiPromptRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(prompt.content);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/prompts/${prompt.key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Prompt sauvegardé", description: `"${prompt.label}" mis à jour.` });
      onSaved();
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de sauvegarder le prompt.", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/prompts/${prompt.key}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Réinitialisé", description: "Prompt remis aux valeurs par défaut." });
      onSaved();
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de réinitialiser.", variant: "destructive" });
    },
  });

  const hasChanges = value !== prompt.content;

  return (
    <Card className="border-border/60">
      <CardHeader
        className="cursor-pointer select-none py-4"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
            <div>
              <CardTitle className="text-base">{prompt.label}</CardTitle>
              <CardDescription className="mt-0.5 text-xs">{prompt.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="font-mono text-xs">{prompt.key}</Badge>
            {prompt.updatedAt && (
              <span className="text-xs text-muted-foreground">
                Modifié {format(new Date(prompt.updatedAt), "d MMM yyyy", { locale: fr })}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 space-y-3">
          <Textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={12}
            className="font-mono text-sm resize-y bg-muted/30"
            placeholder="Contenu du prompt…"
          />
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || saveMutation.isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Réinitialiser par défaut
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saveMutation.isPending ? "Sauvegarde…" : "Sauvegarder"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [showPwd, setShowPwd] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => { setName(""); setEmail(""); setPassword(""); setRole("user"); setShowPwd(false); };

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur créé", description: `${name} (${ROLE_LABELS[role]}) a bien été créé.` });
      reset();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = name.trim().length > 0 && email.trim().includes("@") && password.length >= 8;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Créer un utilisateur
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nom complet</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jean Dupont"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email professionnel</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="jean.dupont@mairie-tours.fr"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mot de passe (min. 8 caractères)</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rôle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Utilisateur</SelectItem>
                <SelectItem value="mairie">Agent Mairie</SelectItem>
                <SelectItem value="metropole">Agent Métropole</SelectItem>
                <SelectItem value="abf">Architecte ABF</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
              </SelectContent>
            </Select>
            {role === "admin" && (
              <p className="text-xs text-amber-600 mt-1">⚠ Les administrateurs ont accès à toutes les données et à la configuration de la plateforme.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={createMutation.isPending}>
            Annuler
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="gap-2"
          >
            {createMutation.isPending ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Création…</>
            ) : (
              <><UserPlus className="w-3.5 h-3.5" /> Créer le compte</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── EDIT USER DIALOG ────────────────────────────────────────────────────────

function EditUserDialog({ user, open, onClose }: { user: any; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role || "user");
  const [showPwd, setShowPwd] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
      setPassword("");
    }
  }, [user]);

  const updateMutation = useUpdateAdminUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        toast({ title: "Utilisateur mis à jour", description: `Le profil de ${name} a été enregistré.` });
        onClose();
      },
      onError: (err: any) => {
        toast({ title: "Erreur", description: err.message, variant: "destructive" });
      }
    }
  });

  if (!user) return null;

  const handleUpdate = () => {
    updateMutation.mutate({
      id: user.id,
      data: {
        name: name.trim(),
        email: email.trim(),
        password: password.length > 0 ? password : undefined,
        role
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />
            Modifier l'utilisateur
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nom complet</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jean Dupont" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemple.com" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nouveau mot de passe (optionnel)</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Laisser vide pour ne pas changer"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rôle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Utilisateur</SelectItem>
                <SelectItem value="mairie">Agent Mairie</SelectItem>
                <SelectItem value="metropole">Agent Métropole</SelectItem>
                <SelectItem value="abf">Architecte ABF</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── COMMUNES MANAGEMENT TAB ──────────────────────────────────────────────────

function TerritoiresTab() {
  const { data: communes, isLoading } = useAdminListCommunes();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ name: string; zipCode?: string; inseeCode?: string } | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: geoData, isFetching: isSearching } = useGeocodeAddress(
    { q: debouncedSearch } as any,
    { query: { enabled: debouncedSearch.length >= 2, queryKey: getGeocodeAddressQueryKey({ q: debouncedSearch } as any) } }
  );

  const addMutation = useCreateAdminCommune({
    mutation: {
      onSuccess: () => {
        toast({ title: "Commune ajoutée", description: `${selected?.name} est désormais disponible.` });
        setSelected(null);
        setSearch("");
        queryClient.invalidateQueries({ queryKey: getAdminListCommunesQueryKey() });
      }
    }
  });

  const deleteMutation = useDeleteAdminCommune({
    mutation: {
      onSuccess: () => {
        toast({ title: "Commune supprimée" });
        queryClient.invalidateQueries({ queryKey: getAdminListCommunesQueryKey() });
      }
    }
  });

  if (isLoading) return <div className="py-20 text-center animate-pulse">Chargement des territoires...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Ajouter un territoire
          </CardTitle>
          <CardDescription>Recherchez une commune pour l'enregistrer et l'assigner aux agents.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Rechercher une commune</Label>
              {selected ? (
                <div className="flex items-center gap-2 h-9 px-3 border border-border rounded-md bg-muted/40">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium flex-1">{selected.name}</span>
                  {selected.zipCode && <span className="text-xs text-muted-foreground font-mono">{selected.zipCode}</span>}
                  {selected.inseeCode && <span className="text-[10px] text-muted-foreground">INSEE {selected.inseeCode}</span>}
                  <button onClick={() => { setSelected(null); setSearch(""); }} className="text-muted-foreground hover:text-destructive ml-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ex: Tours, 37000…"
                    className="pl-8"
                    autoComplete="off"
                  />
                  {isSearching && <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-primary" />}
                  {geoData?.results && geoData.results.length > 0 && search.length >= 2 && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-popover rounded-md shadow-lg border border-border overflow-hidden z-50 max-h-48 overflow-y-auto">
                      {geoData.results.map((item: any, idx: number) => (
                        <button key={idx} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted flex flex-col gap-0.5 transition-colors border-b border-border/50 last:border-0"
                          onClick={() => { setSelected({ name: item.city || item.label, zipCode: item.postcode, inseeCode: item.inseeCode }); setSearch(""); }}>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3 text-primary shrink-0" />
                            <span className="text-sm font-medium">{item.city || item.label}</span>
                          </div>
                          {(item.inseeCode || item.postcode) && (
                            <span className="text-[10px] text-muted-foreground ml-5">
                              {item.postcode}{item.inseeCode ? ` — INSEE ${item.inseeCode}` : ""}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={() => selected && addMutation.mutate({ data: { name: selected.name, zipCode: selected.zipCode, inseeCode: selected.inseeCode } as any })}
              disabled={!selected || addMutation.isPending}>
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste des communes officielles</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Code Postal</TableHead>
                <TableHead>Date d'ajout</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {communes?.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-bold">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.zipCode || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "d MMM yyyy", { locale: fr })}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate({ id: c.id })}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {communes?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">Aucune commune enregistrée.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function GovernanceTab() {
  const { data: users, isLoading: loadingUsers } = useAdminListUsers();
  const { data: communesData, isLoading: loadingCommunes } = useAdminListCommunes();

  if (loadingUsers || loadingCommunes) return <div className="py-20 text-center text-muted-foreground animate-pulse text-sm">Chargement du maillage territorial…</div>;

  const communes = (communesData || []).map(c => c.name);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl mb-4">
        <Network className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm text-indigo-900">Maillage des Services</p>
          <p className="text-xs text-indigo-700 mt-0.5">
            Cette vue croisée permet de vérifier les liaisons entre les mairies et les services experts (Métropole & ABF) pour chaque territoire.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {communes?.map(commune => {
          const refers = users?.filter(u => {
             const uCommunes = (u as any).communes;
             if (Array.isArray(uCommunes)) return uCommunes.includes(commune);
             if (typeof uCommunes === 'string') return uCommunes.split(',').map(c => c.trim()).includes(commune);
             return false;
          }) || [];
          const mairies = refers.filter(u => u.role === "mairie");
          const metropoles = refers.filter(u => u.role === "metropole");
          const abfs = refers.filter(u => u.role === "abf");

          return (
            <Card key={commune} className="border-border/60 hover:border-indigo-200 transition-colors">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border/60">
                  <div className="p-4 md:w-1/4 bg-slate-50/50 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="w-4 h-4 text-primary" />
                      <h3 className="font-black text-lg text-slate-800">{commune}</h3>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Territoire</p>
                  </div>
                  
                  <div className="p-4 flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mairies</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mairies.map(u => <Badge key={u.id} variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">{u.name}</Badge>)}
                      {mairies.length === 0 && <span className="text-xs text-slate-300 italic">Aucun agent assigné</span>}
                    </div>
                  </div>

                  <div className="p-4 flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Network className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Métropole</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {metropoles.map(u => <Badge key={u.id} variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-100">{u.name}</Badge>)}
                      {metropoles.length === 0 && <span className="text-xs text-slate-300 italic">Aucun agent assigné</span>}
                    </div>
                  </div>

                  <div className="p-4 flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Landmark className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ABF</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {abfs.map(u => <Badge key={u.id} variant="outline" className="bg-amber-50 text-amber-900 border-amber-100">{u.name}</Badge>)}
                      {abfs.length === 0 && <span className="text-xs text-slate-300 italic">Aucun agent assigné</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {communes?.length === 0 && (
          <div className="py-12 text-center text-slate-400 italic">Aucun territoire configuré dans la base.</div>
        )}
      </div>
    </div>
  );
}

function ProductIntelligenceTab() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["adminStats"],
    queryFn: async () => {
      const r = await fetch("/api/admin/stats", { credentials: "include" });
      if (!r.ok) throw new Error("Échec du chargement des stats");
      return r.json();
    }
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground animate-pulse text-sm">Calcul des indices de performance…</div>;
  if (error) return <div className="py-20 text-center text-destructive text-sm font-medium">Erreur lors de la récupération des statistiques métier.</div>;

  const cards = [
    { title: "Dossiers Complétés", value: stats.completedDossiers, sub: `sur ${stats.totalDossiers} totaux`, icon: Activity, color: "text-blue-600" },
    { title: "Indice ETP (Gagné)", value: `${stats.estimatedEtpHoursSaved}h`, sub: "Temps manuel économisé", icon: Shield, color: "text-green-600" },
    { title: "SLA Moyen (IA)", value: `${(stats.averageSlaSeconds / 60).toFixed(1)}m`, sub: "Temps de traitement total", icon: BrainCircuit, color: "text-purple-600" },
    { title: "Corrections Admin", value: stats.overridesTotal, sub: "Amélioration continue", icon: RotateCcw, color: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <Card key={i} className="border-border/40 shadow-sm overflow-hidden relative">
             <div className={`absolute top-0 left-0 w-1 h-full bg-current ${c.color.replace('text-', 'bg-')}`} />
             <CardHeader className="pb-2">
               <div className="flex items-center justify-between">
                 <CardDescription className="text-[10px] font-bold uppercase tracking-wider">{c.title}</CardDescription>
                 <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
               </div>
               <CardTitle className="text-xl mt-1">{c.value}</CardTitle>
             </CardHeader>
             <CardContent>
               <p className="text-[10px] text-muted-foreground">{c.sub}</p>
             </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Activité des Administrateurs
            </CardTitle>
            <CardDescription className="text-xs">Volume d'amélioration continue par membre</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.statsByAdmin}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted)/0.4)" />
                <XAxis dataKey="adminName" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '10px', backgroundColor: 'hsl(var(--popover))' }}
                />
                <Bar dataKey="overridesCount" radius={[4, 4, 0, 0]} barSize={32}>
                  {stats.statsByAdmin.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={`hsl(var(--accent) / ${0.7 + (index % 3) * 0.15})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              État de la Plateforme
            </CardTitle>
            <CardDescription className="text-xs">Connecteurs actifs et santé du système</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-3">
               <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
                  <span className="text-xs font-medium">Connecteur DVF Etalab</span>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">SYNC OPÉRATIONNELLE</Badge>
               </div>
               <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
                  <span className="text-xs font-medium">Routage de Connaissances</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">ACTIF</Badge>
               </div>
               <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/20">
                 <div className="flex items-start gap-2">
                   <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                   <p className="text-xs text-muted-foreground leading-relaxed">
                     L'indice <strong>ETP Heures</strong> mesure la productivité gagnée grâce à l'IA HEUREKA (gain estimé de 120min par dossier analysé avec succès).
                   </p>
                 </div>
               </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [communeFilter, setCommuneFilter] = useState("");

  const { data: users, isLoading: loadingUsers } = useAdminListUsers({ search: debouncedSearch, commune: communeFilter });
  const { data: communesList } = useAdminListCommunes();

  const [analysesSearch, setAnalysesSearch] = useState("");
  const debouncedAnalysesSearch = useDebounce(analysesSearch, 400);

  const { data: analysesData, isLoading: loadingAnalyses } = useAdminListAnalyses({ 
    limit: 100, 
    search: debouncedAnalysesSearch 
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  const { data: prompts, refetch: refetchPrompts } = useQuery<AiPromptRow[]>({
    queryKey: ["adminPrompts"],
    queryFn: async () => {
      const r = await fetch("/api/admin/prompts", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => updateUserRole(userId, role),
    onSuccess: (_, { role }) => {
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      toast({ title: "Rôle mis à jour", description: `Le rôle a été changé en "${ROLE_LABELS[role] ?? role}".` });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre à jour le rôle.", variant: "destructive" });
    },
  });

  return (
    <ProtectedLayout requireAdmin={true}>
      <div className="mb-8 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Espace Administration</h1>
          <p className="text-muted-foreground">Vue globale sur l'activité de la plateforme.</p>
        </div>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="users" className="px-6"><Users className="w-4 h-4 mr-2" /> Utilisateurs</TabsTrigger>
          <TabsTrigger value="territoires" className="px-6"><MapIcon className="w-4 h-4 mr-2" /> Territoires</TabsTrigger>
          <TabsTrigger value="governance" className="px-6"><Network className="w-4 h-4 mr-2" /> Maillage</TabsTrigger>
          <TabsTrigger value="intelligence" className="px-6"><Shield className="w-4 h-4 mr-2" /> Intelligence Produit</TabsTrigger>
          <TabsTrigger value="analyses" className="px-6"><Activity className="w-4 h-4 mr-2" /> Analyses globales</TabsTrigger>
          <TabsTrigger value="prompts" className="px-6"><BrainCircuit className="w-4 h-4 mr-2" /> Prompts IA</TabsTrigger>
        </TabsList>

        <TabsContent value="territoires">
          <TerritoiresTab />
        </TabsContent>

        <TabsContent value="governance">
          <GovernanceTab />
        </TabsContent>

        <TabsContent value="intelligence">
          <ProductIntelligenceTab />
        </TabsContent>

        <TabsContent value="users">
          <CreateUserDialog open={showCreateUser} onClose={() => setShowCreateUser(false)} />
          <EditUserDialog user={editingUser} open={!!editingUser} onClose={() => setEditingUser(null)} />
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Base utilisateurs</CardTitle>
                <CardDescription>Gérez les accès et périmètres de vos agents.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Rechercher nom ou email..." 
                    className="pl-8 h-9 text-xs"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <Select value={communeFilter || "all"} onValueChange={v => setCommuneFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-48 h-9 text-xs">
                    <SelectValue placeholder="Toutes les communes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les communes</SelectItem>
                    {communesList?.map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="gap-2 h-9" onClick={() => setShowCreateUser(true)}>
                  <UserPlus className="w-4 h-4" />
                  Créer un utilisateur
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identité</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Périmètre Territorial</TableHead>
                    <TableHead className="text-right">Analyses</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{user.name}</span>
                          <span className="text-[10px] text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={ROLE_VARIANTS[user.role] ?? "secondary"}
                          className={`
                            ${user.role === "metropole" ? "bg-indigo-600 text-white border-none shadow-sm px-2 py-0.5" : ""}
                            ${user.role === "abf" ? "bg-amber-700 text-white border-none shadow-sm px-2 py-0.5" : ""}
                            ${user.role === "mairie" ? "bg-slate-100 text-slate-700" : ""}
                          `}
                        >
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(user.role === "mairie" || user.role === "metropole" || user.role === "abf") ? (
                          <CommunesEditor
                            userId={user.id}
                            initialCommunes={(user as { communes?: string[] }).communes ?? []}
                            onSaved={() => {}}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground/40 italic">Global (Citoyen)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums text-slate-600">{user.analysisCount}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                          onClick={() => setEditingUser(user)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun utilisateur</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analyses">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Toutes les analyses ({analysesData?.total || 0})</CardTitle>
                <CardDescription>Liste exhaustive des dossiers déposés sur la plateforme.</CardDescription>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Rechercher par adresse ou ID..." 
                  className="pl-10 h-10"
                  value={analysesSearch}
                  onChange={(e) => setAnalysesSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Utilisateur (ID)</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysesData?.analyses?.map((analysis) => (
                    <TableRow key={analysis.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{analysis.id.slice(0,8)}...</TableCell>
                      <TableCell className="font-mono text-xs">{analysis.userId.slice(0,8)}...</TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">{analysis.address}</TableCell>
                      <TableCell><StatusBadge status={analysis.status} /></TableCell>
                      <TableCell>{format(new Date(analysis.createdAt), "dd/MM/yy HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="prompts">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-accent/5 border border-accent/20 rounded-xl">
              <BrainCircuit className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Gestion des prompts IA</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ces prompts sont injectés dans les requêtes OpenAI. Les modifications sont appliquées immédiatement (cache de 60 secondes). Cliquez sur un prompt pour l'éditer. Le bouton "Réinitialiser" restaure le texte d'origine du code.
                </p>
              </div>
            </div>
            {prompts && prompts.length > 0 ? (
              prompts.map(p => (
                <PromptCard key={p.key} prompt={p} onSaved={() => refetchPrompts()} />
              ))
            ) : (
              <Card className="border-border/60">
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  Chargement des prompts…
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </ProtectedLayout>
  );
}

