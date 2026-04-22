import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, BrainCircuit, FileSearch, Gavel, Loader2, Plus, ShieldAlert, Sparkles } from "lucide-react";

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

type DossierOption = {
  id: string;
  title: string;
  dossierNumber?: string | null;
  address?: string | null;
  commune?: string | null;
  typeProcedure?: string | null;
  status?: string | null;
};

type AppealListItem = {
  id: string;
  appealType: string;
  status: string;
  commune?: string | null;
  summary?: string | null;
  projectAddress?: string | null;
  decisionReference?: string | null;
  admissibilityScore?: number | null;
  urbanRiskScore?: number | null;
  createdAt: string;
  dossier?: DossierOption | null;
  groundsCount: number;
  documentsCount: number;
  documentAnalysesCount?: number;
  latestAnalysisStatus?: string | null;
  groundSuggestionsCount?: number;
  pendingGroundSuggestionsCount?: number;
  nextDeadline?: { label: string; dueDate: string } | null;
  deadlineState?: string;
};

const APPEAL_TYPE_LABELS: Record<string, string> = {
  signalement: "Signalement",
  gracieux: "Recours gracieux",
  contentieux: "Recours contentieux",
  deja_engage: "Contentieux déjà engagé",
};

const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  nouveau: "Nouveau",
  analyse_recevabilite: "Analyse recevabilité",
  precontentieux: "Pré-contentieux",
  contentieux: "Contentieux",
  regularisation: "Régularisation",
  clos: "Clos",
};

const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  processing: "Analyse en cours",
  completed: "Analyse IA terminée",
  failed: "Analyse échouée",
};

function scoreTone(score?: number | null) {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-red-50 text-red-700 border-red-100";
  if (score >= 45) return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-emerald-50 text-emerald-700 border-emerald-100";
}

export default function AppealsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentRole = (user?.role as string) || "";

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [communeFilter, setCommuneFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [linkedUrbanismCaseId, setLinkedUrbanismCaseId] = useState("");
  const [step, setStep] = useState<"autorisation" | "requérant" | "qualification" | "griefs" | "validation">("autorisation");

  const [form, setForm] = useState({
    appealType: "signalement",
    claimantRole: currentRole === "mairie" || currentRole === "admin" || currentRole === "super_admin" ? "mairie" : "tiers_requerant",
    claimantName: user?.name || "",
    claimantEmail: user?.email || "",
    claimantAddress: "",
    claimantInterestDescription: "",
    beneficiaryName: "",
    beneficiaryEmail: "",
    authorityName: "",
    authorityEmail: "",
    decisionReference: "",
    permitType: "",
    postingStartDate: "",
    postingEvidenceStatus: "a_confirmer",
    filingDate: "",
    notificationToAuthorityDate: "",
    notificationToBeneficiaryDate: "",
    summary: "",
  });
  const [grounds, setGrounds] = useState<Array<{
    category: string;
    title: string;
    description: string;
    linkedPluArticle: string;
    linkedDocumentId: string;
    linkedExtractedMetric: string;
    seriousnessScore: string;
    responseDraft: string;
    status: string;
  }>>([
    {
      category: "urbanisme",
      title: "",
      description: "",
      linkedPluArticle: "",
      linkedDocumentId: "",
      linkedExtractedMetric: "",
      seriousnessScore: "",
      responseDraft: "",
      status: "a_qualifier",
    },
  ]);

  const appealsQuery = useQuery<{ appeals: AppealListItem[] }>({
    queryKey: ["appeals", typeFilter, statusFilter, communeFilter, deadlineFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (communeFilter !== "all") params.set("commune", communeFilter);
      if (deadlineFilter !== "all") params.set("deadline", deadlineFilter);
      return apiFetch(`/api/appeals${params.size ? `?${params.toString()}` : ""}`);
    },
  });

  const dossiersQuery = useQuery<{ dossiers: DossierOption[] }>({
    queryKey: ["appeal-dossier-options"],
    queryFn: () => apiFetch("/api/appeals/options/dossiers"),
  });

  const communes = useMemo(
    () => Array.from(new Set((appealsQuery.data?.appeals || []).map((appeal) => appeal.commune).filter(Boolean))) as string[],
    [appealsQuery.data?.appeals],
  );

  const selectedDossier = useMemo(
    () => (dossiersQuery.data?.dossiers || []).find((dossier) => dossier.id === linkedUrbanismCaseId) || null,
    [dossiersQuery.data?.dossiers, linkedUrbanismCaseId],
  );

  const createAppeal = useMutation({
    mutationFn: async () => {
      if (!linkedUrbanismCaseId) throw new Error("Veuillez lier le recours à un dossier existant.");
      return apiFetch("/api/appeals", {
        method: "POST",
        body: JSON.stringify({
          linkedUrbanismCaseId,
          appealType: form.appealType,
          claimantRole: form.claimantRole,
          claimantIdentity: {
            name: form.claimantName,
            email: form.claimantEmail,
            address: form.claimantAddress,
            quality: form.claimantRole,
            interestDescription: form.claimantInterestDescription,
          },
          beneficiaryIdentity: {
            name: form.beneficiaryName,
            email: form.beneficiaryEmail,
          },
          authorityIdentity: {
            name: form.authorityName,
            email: form.authorityEmail,
          },
          projectAddress: selectedDossier?.address || "",
          decisionReference: form.decisionReference || selectedDossier?.dossierNumber || "",
          permitType: form.permitType || selectedDossier?.typeProcedure || "",
          postingStartDate: form.postingStartDate || null,
          postingEvidenceStatus: form.postingEvidenceStatus,
          filingDate: form.filingDate || null,
          notificationToAuthorityDate: form.notificationToAuthorityDate || null,
          notificationToBeneficiaryDate: form.notificationToBeneficiaryDate || null,
          summary: form.summary,
          grounds: grounds.filter((ground) => ground.title && ground.description).map((ground) => ({
            ...ground,
            seriousnessScore: ground.seriousnessScore ? Number(ground.seriousnessScore) : null,
          })),
          status: "nouveau",
        }),
      });
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ["appeals"] });
      toast({ title: "Recours créé", description: "Le module Recours est maintenant initialisé pour ce dossier." });
      setLocation(`/recours/${payload.appeal.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Création impossible", description: error.message || "Le recours n'a pas pu être créé.", variant: "destructive" });
    },
  });

  const roleTone = currentRole === "mairie" || currentRole === "admin" || currentRole === "super_admin"
    ? "Espace contradictoire et sécurisation procédurale pour l'instruction."
    : "Déclarez un signalement ou un recours dans un cadre contradictoire, sans rompre la continuité du dossier.";

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Recours</h1>
            <p className="text-muted-foreground mt-2 max-w-3xl">
              {roleTone}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Gestion contradictoire</Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100">MVP</Badge>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-amber-50/60">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5 text-primary" />
                      Analyse automatique des recours PDF
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Ouvre un recours, dépose le PDF dans l’onglet Pièces, puis Heuréka extrait les moyens point par point avec une recevabilité prudente.
                    </CardDescription>
                  </div>
                  <Badge className="w-fit bg-primary text-primary-foreground border-0">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Disponible
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
                <div className="rounded-xl border bg-background/80 p-3">
                  <p className="font-medium">1. Déposer le PDF</p>
                  <p className="text-muted-foreground mt-1">Catégorie recours, requête ou mémoire : l’analyse démarre automatiquement.</p>
                </div>
                <div className="rounded-xl border bg-background/80 p-3">
                  <p className="font-medium">2. Points détectés</p>
                  <p className="text-muted-foreground mt-1">Procédure, affichage, intérêt à agir, pièces, fond PLU et autres moyens.</p>
                </div>
                <div className="rounded-xl border bg-background/80 p-3">
                  <p className="font-medium">3. Suggestions validables</p>
                  <p className="text-muted-foreground mt-1">Chaque point peut être converti en grief ou écarté, sans création automatique.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Index des recours</CardTitle>
                <CardDescription>Suivez les contestations, recours gracieux et contentieux liés aux autorisations d'urbanisme.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les types</SelectItem>
                      {Object.entries(APPEAL_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={communeFilter} onValueChange={setCommuneFilter}>
                    <SelectTrigger><SelectValue placeholder="Commune" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les communes</SelectItem>
                      {communes.map((commune) => (
                        <SelectItem key={commune} value={commune}>{commune}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={deadlineFilter} onValueChange={setDeadlineFilter}>
                    <SelectTrigger><SelectValue placeholder="Délais" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les délais</SelectItem>
                      <SelectItem value="proche">Délai proche</SelectItem>
                      <SelectItem value="depasse">Délai dépassé</SelectItem>
                      <SelectItem value="ok">Délai maîtrisé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {appealsQuery.isLoading ? (
                  <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : (appealsQuery.data?.appeals || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
                    Aucun recours ne correspond aux filtres actuels.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(appealsQuery.data?.appeals || []).map((appeal) => (
                      <button
                        key={appeal.id}
                        type="button"
                        onClick={() => setLocation(`/recours/${appeal.id}`)}
                        className="w-full rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{appeal.summary}</p>
                              <Badge variant="outline">{APPEAL_TYPE_LABELS[appeal.appealType] || appeal.appealType}</Badge>
                              <Badge className="bg-slate-900 text-white border-0">{STATUS_LABELS[appeal.status] || appeal.status}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {appeal.projectAddress || appeal.dossier?.address || "Adresse non renseignée"}
                              {appeal.commune ? ` · ${appeal.commune}` : ""}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span>Dossier lié: {appeal.dossier?.dossierNumber || appeal.decisionReference || "N/A"}</span>
                              <span>{appeal.groundsCount} grief(s)</span>
                              <span>{appeal.documentsCount} pièce(s)</span>
                              <span>{appeal.groundSuggestionsCount || 0} suggestion(s) IA</span>
                              {appeal.nextDeadline && <span>Prochaine échéance: {new Date(appeal.nextDeadline.dueDate).toLocaleDateString("fr-FR")}</span>}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={scoreTone(appeal.admissibilityScore)}>Recevabilité {appeal.admissibilityScore ?? "N/A"}</Badge>
                            <Badge variant="outline" className={scoreTone(appeal.urbanRiskScore)}>Risque urb. {appeal.urbanRiskScore ?? "N/A"}</Badge>
                            {appeal.latestAnalysisStatus ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">
                                <FileSearch className="w-3 h-3 mr-1" />
                                {ANALYSIS_STATUS_LABELS[appeal.latestAnalysisStatus] || appeal.latestAnalysisStatus}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-muted text-muted-foreground">
                                <FileSearch className="w-3 h-3 mr-1" />
                                PDF non analysé
                              </Badge>
                            )}
                            {(appeal.pendingGroundSuggestionsCount || 0) > 0 && (
                              <Badge className="bg-primary text-primary-foreground border-0">
                                {appeal.pendingGroundSuggestionsCount} à valider
                              </Badge>
                            )}
                            {appeal.deadlineState === "depasse" && <Badge className="bg-red-600 text-white border-0">Délai dépassé</Badge>}
                            {appeal.deadlineState === "proche" && <Badge className="bg-amber-500 text-white border-0">Délai proche</Badge>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Nouveau recours</CardTitle>
              <CardDescription>Formulaire guidé multi-étapes pour qualifier une contestation et la rattacher au dossier initial.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {[
                  ["autorisation", "Autorisation"],
                  ["requérant", "Requérant"],
                  ["qualification", "Qualification"],
                  ["griefs", "Griefs"],
                  ["validation", "Validation"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStep(value as typeof step)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${step === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <Tabs value={step} onValueChange={(value) => setStep(value as typeof step)}>
                <TabsList className="hidden">
                  <TabsTrigger value="autorisation">Autorisation</TabsTrigger>
                  <TabsTrigger value="requérant">Requérant</TabsTrigger>
                  <TabsTrigger value="qualification">Qualification</TabsTrigger>
                  <TabsTrigger value="griefs">Griefs</TabsTrigger>
                  <TabsTrigger value="validation">Validation</TabsTrigger>
                </TabsList>

                <TabsContent value="autorisation" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Dossier urbanisme lié</Label>
                    <Select value={linkedUrbanismCaseId} onValueChange={(value) => {
                      setLinkedUrbanismCaseId(value);
                      const next = (dossiersQuery.data?.dossiers || []).find((dossier) => dossier.id === value);
                      if (next) {
                        setForm((current) => ({
                          ...current,
                          decisionReference: current.decisionReference || next.dossierNumber || "",
                          permitType: current.permitType || next.typeProcedure || "",
                        }));
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un dossier" /></SelectTrigger>
                      <SelectContent>
                        {(dossiersQuery.data?.dossiers || []).map((dossier) => (
                          <SelectItem key={dossier.id} value={dossier.id}>
                            {(dossier.dossierNumber || dossier.title) + (dossier.commune ? ` · ${dossier.commune}` : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedDossier && (
                    <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                      <p className="font-medium">{selectedDossier.title}</p>
                      <p className="text-muted-foreground">{selectedDossier.address || "Adresse indisponible"}</p>
                      <p className="text-muted-foreground">{selectedDossier.dossierNumber || "Sans numéro"} · {selectedDossier.typeProcedure || "Type non défini"}</p>
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Référence décision</Label>
                      <Input value={form.decisionReference} onChange={(e) => setForm((current) => ({ ...current, decisionReference: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Type d'autorisation</Label>
                      <Input value={form.permitType} onChange={(e) => setForm((current) => ({ ...current, permitType: e.target.value }))} placeholder="PC, DP, PA, PD..." />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="requérant" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Qualité du requérant</Label>
                    <Select value={form.claimantRole} onValueChange={(value) => setForm((current) => ({ ...current, claimantRole: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tiers_requerant">Tiers / voisin requérant</SelectItem>
                        <SelectItem value="petitionnaire">Pétitionnaire / bénéficiaire</SelectItem>
                        <SelectItem value="mairie">Mairie / service urbanisme</SelectItem>
                        <SelectItem value="conseil">Conseil / avocat / expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nom</Label>
                      <Input value={form.claimantName} onChange={(e) => setForm((current) => ({ ...current, claimantName: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={form.claimantEmail} onChange={(e) => setForm((current) => ({ ...current, claimantEmail: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Adresse / localisation du requérant</Label>
                    <Input value={form.claimantAddress} onChange={(e) => setForm((current) => ({ ...current, claimantAddress: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Intérêt à agir / qualité à contester</Label>
                    <Textarea value={form.claimantInterestDescription} onChange={(e) => setForm((current) => ({ ...current, claimantInterestDescription: e.target.value }))} placeholder="Expliquer le lien avec le projet, la proximité, l'atteinte alléguée, la qualité pour agir..." />
                  </div>
                </TabsContent>

                <TabsContent value="qualification" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Type de démarche</Label>
                    <Select value={form.appealType} onValueChange={(value) => setForm((current) => ({ ...current, appealType: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(APPEAL_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Début d'affichage</Label>
                      <Input type="date" value={form.postingStartDate} onChange={(e) => setForm((current) => ({ ...current, postingStartDate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Preuve d'affichage</Label>
                      <Select value={form.postingEvidenceStatus} onValueChange={(value) => setForm((current) => ({ ...current, postingEvidenceStatus: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="a_confirmer">À confirmer</SelectItem>
                          <SelectItem value="justifie">Justifiée</SelectItem>
                          <SelectItem value="contestee">Contestée</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Date d'introduction</Label>
                      <Input type="date" value={form.filingDate} onChange={(e) => setForm((current) => ({ ...current, filingDate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Notif. autorité</Label>
                      <Input type="date" value={form.notificationToAuthorityDate} onChange={(e) => setForm((current) => ({ ...current, notificationToAuthorityDate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Notif. bénéficiaire</Label>
                      <Input type="date" value={form.notificationToBeneficiaryDate} onChange={(e) => setForm((current) => ({ ...current, notificationToBeneficiaryDate: e.target.value }))} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="griefs" className="space-y-4">
                  {grounds.map((ground, index) => (
                    <div key={index} className="rounded-xl border p-3 space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Catégorie</Label>
                          <Input value={ground.category} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: e.target.value } : item))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Titre du grief</Label>
                          <Input value={ground.title} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea value={ground.description} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item))} />
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input placeholder="Article PLU/PLUi" value={ground.linkedPluArticle} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, linkedPluArticle: e.target.value } : item))} />
                        <Input placeholder="Pièce liée" value={ground.linkedDocumentId} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, linkedDocumentId: e.target.value } : item))} />
                        <Input placeholder="Métrique extraite" value={ground.linkedExtractedMetric} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, linkedExtractedMetric: e.target.value } : item))} />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input placeholder="Score de gravité (0-100)" value={ground.seriousnessScore} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, seriousnessScore: e.target.value } : item))} />
                        <Input placeholder="Statut du grief" value={ground.status} onChange={(e) => setGrounds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: e.target.value } : item))} />
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={() => setGrounds((current) => [...current, {
                    category: "urbanisme",
                    title: "",
                    description: "",
                    linkedPluArticle: "",
                    linkedDocumentId: "",
                    linkedExtractedMetric: "",
                    seriousnessScore: "",
                    responseDraft: "",
                    status: "a_qualifier",
                  }])}>
                    Ajouter un grief
                  </Button>
                </TabsContent>

                <TabsContent value="validation" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Synthèse du recours</Label>
                    <Textarea value={form.summary} onChange={(e) => setForm((current) => ({ ...current, summary: e.target.value }))} placeholder="Résumer la contestation, les enjeux procéduraux, les pièces et le niveau de risque identifié." />
                  </div>

                  <div className="rounded-2xl border bg-muted/30 p-4 text-sm space-y-2">
                    <p className="font-semibold">Validation finale</p>
                    <p>Dossier lié: {selectedDossier?.dossierNumber || selectedDossier?.title || "Non sélectionné"}</p>
                    <p>Type: {APPEAL_TYPE_LABELS[form.appealType]}</p>
                    <p>Qualité du requérant: {form.claimantRole}</p>
                    <p>Griefs qualifiés: {grounds.filter((ground) => ground.title && ground.description).length}</p>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={step === "autorisation"}
                  onClick={() => {
                    const order = ["autorisation", "requérant", "qualification", "griefs", "validation"] as const;
                    const index = order.indexOf(step);
                    if (index > 0) setStep(order[index - 1]);
                  }}
                >
                  Étape précédente
                </Button>

                {step !== "validation" ? (
                  <Button
                    type="button"
                    onClick={() => {
                      const order = ["autorisation", "requérant", "qualification", "griefs", "validation"] as const;
                      const index = order.indexOf(step);
                      if (index < order.length - 1) setStep(order[index + 1]);
                    }}
                  >
                    Continuer <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button onClick={() => createAppeal.mutate()} disabled={createAppeal.isPending || !linkedUrbanismCaseId || !form.summary}>
                    {createAppeal.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gavel className="w-4 h-4 mr-2" />}
                    Créer le recours
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-primary" /> Socle IA Recours actif</CardTitle>
            <CardDescription>Le module sait maintenant analyser un PDF de recours et produire des suggestions prudentes, validables par un humain.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
            <div className="rounded-xl border p-3"><p className="font-medium">Extraction PDF</p><p className="text-muted-foreground mt-1">Texte extrait puis conservé dans l’analyse du document.</p></div>
            <div className="rounded-xl border p-3"><p className="font-medium">Recevabilité prudente</p><p className="text-muted-foreground mt-1">Labels : probable, discutable, irrecevable probable ou à confirmer.</p></div>
            <div className="rounded-xl border p-3"><p className="font-medium">Suggestions de griefs</p><p className="text-muted-foreground mt-1">Chaque moyen détecté reste une suggestion convertissable, jamais automatique.</p></div>
            <div className="rounded-xl border p-3"><p className="font-medium">Sources citées</p><p className="text-muted-foreground mt-1">PDF recours, dossier lié, pièces, PLU, constructibilité et contraintes si disponibles.</p></div>
          </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
