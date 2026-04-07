import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CheckCircle2, Eye, FileText, Layers3, LibraryBig, Loader2, MapPin, ScrollText, Send, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type DocumentSummary = {
  id: string;
  title: string;
  fileName: string | null;
  category: string | null;
  subCategory: string | null;
  documentType: string | null;
  explanatoryNote?: string | null;
  hasStoredFile?: boolean;
  availabilityStatus?: string;
  availabilityMessage?: string;
  textQualityLabel?: string | null;
  textQualityScore?: number | null;
};

type ZoneItem = {
  id: string;
  communeId: string;
  zoneCode: string;
  zoneLabel: string | null;
  parentZoneCode: string | null;
  sectorCode: string | null;
  guidanceNotes: string | null;
  displayOrder: number;
  isActive: boolean;
};

type ThemeItem = {
  code: string;
  label: string;
  description: string | null;
  articleHint: string | null;
};

type WorkspaceData = {
  commune: string;
  communeId: string;
  document: {
    id: string;
    title: string;
    fileName: string | null;
    category: string | null;
    subCategory: string | null;
    documentType: string | null;
    hasStoredFile: boolean;
    availabilityStatus: string;
    availabilityMessage: string | null;
    rawTextLength: number;
  };
  zones: ZoneItem[];
  themes: ThemeItem[];
  articleReference: Array<{ code: string; label: string }>;
  pages: Array<{ pageNumber: number; text: string; startOffset: number; endOffset: number }>;
  excerpts: Array<{
    id: string;
    zoneId: string;
    articleCode: string | null;
    selectionLabel: string | null;
    sourceText: string;
    sourcePage: number;
    sourcePageEnd: number | null;
    status: string;
    aiSuggested: boolean;
    zone: ZoneItem | null;
    rules: Array<{
      id: string;
      articleCode: string;
      themeCode: string;
      ruleLabel: string;
      operator: string | null;
      valueNumeric: number | null;
      valueText: string | null;
      unit: string | null;
      conditionText: string | null;
      interpretationNote: string | null;
      scopeType: string;
      sourceText: string;
      sourcePage: number;
      confidenceScore: number | null;
      conflictFlag: boolean;
      status: string;
    }>;
  }>;
  aiSuggestions: {
    sections: Array<{ id: string; zoneCode: string; heading: string; startPage: number | null; endPage: number | null; sourceText: string }>;
    rules: Array<{ id: string; zoneCode: string | null; articleCode: string | null; themeCode: string; label: string; sourceText: string; sourcePage: number | null; confidenceScore: number | null }>;
  };
};

type LibraryResponse = {
  commune: string;
  communeId: string;
  visibility: string;
  summary: {
    ruleCount: number;
    publishedCount: number;
    conflictCount: number;
    historyCount: number;
  };
  rules: Array<{
    id: string;
    zoneId: string | null;
    zoneCode: string | null;
    zoneLabel: string | null;
    articleCode: string;
    themeCode: string;
    themeLabel: string;
    ruleLabel: string;
    operator: string | null;
    valueNumeric: number | null;
    valueText: string | null;
    unit: string | null;
    conditionText: string | null;
    interpretationNote: string | null;
    sourceText: string;
    sourcePage: number;
    confidenceScore: number | null;
    conflictFlag: boolean;
    status: string;
    publishedAt: string | null;
    documentTitle: string | null;
  }>;
  conflicts: Array<{ id: string; conflictSummary: string; status: string }>;
  history: Array<{ id: string; entityType: string; action: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
};

type OverviewResponse = {
  commune: string;
  communeId: string;
  summary: {
    documentCount: number;
    zoneCount: number;
    excerptCount: number;
    ruleCount: number;
    publishedRuleCount: number;
    validatedRuleCount: number;
    inReviewRuleCount: number;
    draftRuleCount: number;
    conflictCount: number;
    openConflictCount: number;
  };
};

async function apiFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload && (payload.message || payload.error)) || "Requête impossible");
  }
  return payload;
}

const STATUS_ORDER = ["draft", "in_review", "validated", "published"] as const;

function getStatusBadge(status: string) {
  switch (status) {
    case "published":
      return { label: "Publié", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "validated":
      return { label: "Validé", className: "bg-sky-50 text-sky-700 border-sky-200" };
    case "in_review":
      return { label: "En revue", className: "bg-amber-50 text-amber-700 border-amber-200" };
    default:
      return { label: "Brouillon", className: "bg-muted text-muted-foreground border-border" };
  }
}

function formatRuleValue(rule: LibraryResponse["rules"][number] | WorkspaceData["excerpts"][number]["rules"][number]) {
  const numeric = typeof rule.valueNumeric === "number" ? `${rule.operator || ""} ${rule.valueNumeric}${rule.unit ? ` ${rule.unit}` : ""}`.trim() : null;
  return numeric || rule.valueText || "Valeur non structurée";
}

export function RegulatoryCalibrationModule({
  currentCommune,
  documents,
  loadingDocuments,
}: {
  currentCommune: string;
  documents: DocumentSummary[];
  loadingDocuments: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("zones");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ zoneCode: "", zoneLabel: "", parentZoneCode: "", guidanceNotes: "" });
  const [selectionZoneId, setSelectionZoneId] = useState("");
  const [selectionArticleCode, setSelectionArticleCode] = useState("");
  const [selectionLabel, setSelectionLabel] = useState("");
  const [pendingSelection, setPendingSelection] = useState<{ text: string; pageNumber: number } | null>(null);
  const [activeExcerptId, setActiveExcerptId] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, {
    themeCode: string;
    ruleLabel: string;
    operator: string;
    valueNumeric: string;
    valueText: string;
    unit: string;
    conditionText: string;
    interpretationNote: string;
  }>>({});

  const { data: themesData, error: themesError } = useQuery<{ themes: ThemeItem[]; articleReference: Array<{ code: string; label: string }> }>({
    queryKey: ["reg-calibration-themes"],
    queryFn: () => apiFetch("/api/mairie/regulatory-calibration/themes"),
    enabled: currentCommune !== "all",
  });

  const { data: overviewData, error: overviewError } = useQuery<OverviewResponse>({
    queryKey: ["reg-calibration-overview", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/overview?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all",
  });

  const { data: zonesData, isLoading: loadingZones, error: zonesError } = useQuery<{ commune: string; communeId: string; zones: ZoneItem[] }>({
    queryKey: ["reg-calibration-zones", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/zones?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all",
  });

  const { data: workspaceData, isLoading: loadingWorkspace, error: workspaceError } = useQuery<WorkspaceData>({
    queryKey: ["reg-calibration-workspace", currentCommune, selectedDocumentId],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/documents/${selectedDocumentId}/workspace?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !!selectedDocumentId,
  });

  const { data: libraryData, error: libraryError } = useQuery<LibraryResponse>({
    queryKey: ["reg-calibration-library", currentCommune, "internal"],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/library?commune=${encodeURIComponent(currentCommune)}&visibility=internal`),
    enabled: currentCommune !== "all",
  });

  const { data: publishedData, error: publishedError } = useQuery<LibraryResponse>({
    queryKey: ["reg-calibration-library", currentCommune, "published"],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/library?commune=${encodeURIComponent(currentCommune)}&visibility=published`),
    enabled: currentCommune !== "all",
  });

  const refreshCalibration = () => {
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-overview", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-zones", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-workspace", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-library", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["mairie-documents", currentCommune] });
  };

  const createZoneMutation = useMutation({
    mutationFn: async () => apiFetch("/api/mairie/regulatory-calibration/zones", {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        zoneCode: zoneForm.zoneCode,
        zoneLabel: zoneForm.zoneLabel,
        parentZoneCode: zoneForm.parentZoneCode,
        guidanceNotes: zoneForm.guidanceNotes,
      }),
    }),
    onSuccess: () => {
      setZoneForm({ zoneCode: "", zoneLabel: "", parentZoneCode: "", guidanceNotes: "" });
      refreshCalibration();
      toast({ title: "Zone créée", description: "La zone est prête pour le calibrage." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => apiFetch(`/api/mairie/regulatory-calibration/zones/${zoneId}?commune=${encodeURIComponent(currentCommune)}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshCalibration();
      toast({ title: "Zone supprimée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createExcerptMutation = useMutation({
    mutationFn: async () => apiFetch("/api/mairie/regulatory-calibration/excerpts", {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        zoneId: selectionZoneId,
        documentId: selectedDocumentId,
        articleCode: selectionArticleCode,
        selectionLabel,
        sourceText: pendingSelection?.text,
        sourcePage: pendingSelection?.pageNumber,
      }),
    }),
    onSuccess: (payload) => {
      refreshCalibration();
      setActiveExcerptId(payload.excerpt.id);
      setSelectionLabel("");
      toast({ title: "Extrait calibré", description: "Tu peux maintenant créer une ou plusieurs règles depuis cet extrait." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createRuleMutation = useMutation({
    mutationFn: async ({ excerptId, draft }: { excerptId: string; draft: NonNullable<typeof ruleDrafts[string]> }) => apiFetch(`/api/mairie/regulatory-calibration/excerpts/${excerptId}/rules`, {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        themeCode: draft.themeCode,
        ruleLabel: draft.ruleLabel,
        operator: draft.operator,
        valueNumeric: draft.valueNumeric,
        valueText: draft.valueText,
        unit: draft.unit,
        conditionText: draft.conditionText,
        interpretationNote: draft.interpretationNote,
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setRuleDrafts((current) => ({
        ...current,
        [variables.excerptId]: {
          themeCode: "",
          ruleLabel: "",
          operator: "",
          valueNumeric: "",
          valueText: "",
          unit: "",
          conditionText: "",
          interpretationNote: "",
        },
      }));
      toast({ title: "Règle créée", description: "La règle est enregistrée comme brouillon interne." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateRuleStatusMutation = useMutation({
    mutationFn: async ({ ruleId, status }: { ruleId: string; status: string }) => apiFetch(`/api/mairie/regulatory-calibration/rules/${ruleId}/status`, {
      method: "POST",
      body: JSON.stringify({ commune: currentCommune, status }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      toast({ title: "Statut mis à jour", description: `La règle est maintenant ${getStatusBadge(variables.status).label.toLowerCase()}.` });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const resegmentDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => apiFetch(`/api/mairie/documents/${documentId}/resegment?commune=${encodeURIComponent(currentCommune)}`, { method: "POST" }),
    onSuccess: () => {
      refreshCalibration();
      toast({ title: "Document re-segmenté" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => apiFetch(`/api/mairie/documents/${documentId}`, { method: "DELETE" }),
    onSuccess: () => {
      if (selectedDocumentId) setSelectedDocumentId(null);
      refreshCalibration();
      toast({ title: "Document supprimé" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocumentId) || null,
    [documents, selectedDocumentId],
  );
  const canEditCalibration = currentCommune !== "all";
  const calibrationLoadError = overviewError || zonesError || themesError || libraryError || publishedError || (selectedDocumentId ? workspaceError : null);
  const calibrationLoadErrorMessage = calibrationLoadError instanceof Error
    ? calibrationLoadError.message
    : calibrationLoadError
      ? "Le module de calibration n'a pas pu être chargé."
      : null;

  const activeRules = workspaceData?.excerpts.find((excerpt) => excerpt.id === activeExcerptId)?.rules || [];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="zones">Zones</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="calibration">PDF + Calibration</TabsTrigger>
        <TabsTrigger value="library">Bibliothèque</TabsTrigger>
        <TabsTrigger value="published">Back mairie</TabsTrigger>
      </TabsList>

      <Card className="border-primary/10 shadow-sm">
        <CardContent className="grid gap-3 p-4 md:grid-cols-4 xl:grid-cols-8">
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.documentCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zones</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.zoneCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Extraits</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.excerptCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Brouillons</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.draftRuleCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">En revue</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.inReviewRuleCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Validées</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.validatedRuleCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Publiées</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.publishedRuleCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conflits</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.openConflictCount ?? 0}</div>
          </div>
        </CardContent>
      </Card>

      {calibrationLoadErrorMessage && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Le module de calibration n&apos;est pas prêt.</p>
                <p className="mt-1 text-destructive/90">{calibrationLoadErrorMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <TabsContent value="zones" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Zones de la commune</CardTitle>
            <CardDescription>Définis la nomenclature des zones une fois, puis le calibrage vient s’y raccrocher proprement.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[320px,1fr]">
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <Input placeholder="Code zone (ex : N, UA, UDa)" value={zoneForm.zoneCode} onChange={(e) => setZoneForm((v) => ({ ...v, zoneCode: e.target.value }))} />
              <Input placeholder="Libellé optionnel" value={zoneForm.zoneLabel} onChange={(e) => setZoneForm((v) => ({ ...v, zoneLabel: e.target.value }))} />
              <Input placeholder="Zone mère optionnelle" value={zoneForm.parentZoneCode} onChange={(e) => setZoneForm((v) => ({ ...v, parentZoneCode: e.target.value }))} />
              <Textarea placeholder="Notes de guidage (pages, secteur, nuances utiles)" value={zoneForm.guidanceNotes} onChange={(e) => setZoneForm((v) => ({ ...v, guidanceNotes: e.target.value }))} />
              <Button
                className="w-full"
                disabled={!canEditCalibration || !!calibrationLoadErrorMessage || loadingZones || createZoneMutation.isPending || !zoneForm.zoneCode.trim()}
                onClick={() => createZoneMutation.mutate()}
              >
                {createZoneMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
                Ajouter la zone
              </Button>
              {!canEditCalibration && (
                <p className="text-sm text-muted-foreground">
                  Sélectionne d&apos;abord une commune précise pour créer ses zones de calibration.
                </p>
              )}
              {canEditCalibration && calibrationLoadErrorMessage && (
                <p className="text-sm text-destructive">
                  Corrige d&apos;abord le chargement du module avant de créer une zone.
                </p>
              )}
            </div>

            <div className="space-y-3">
              {loadingZones ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lecture des zones…</div>
              ) : (zonesData?.zones || []).length > 0 ? (
                zonesData!.zones.map((zone) => (
                  <div key={zone.id} className="rounded-xl border bg-background p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{zone.zoneCode}</Badge>
                          {zone.parentZoneCode && <Badge variant="secondary">hérite de {zone.parentZoneCode}</Badge>}
                        </div>
                        <p className="font-medium">{zone.zoneLabel || `Zone ${zone.zoneCode}`}</p>
                        {zone.guidanceNotes && <p className="text-sm text-muted-foreground">{zone.guidanceNotes}</p>}
                      </div>
                      <Button variant="outline" size="sm" className="border-destructive/20 text-destructive hover:bg-destructive/5" onClick={() => {
                        if (!window.confirm(`Supprimer la zone ${zone.zoneCode} ?`)) return;
                        deleteZoneMutation.mutate(zone.id);
                      }}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Aucune zone configurée pour cette commune.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="documents" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><UploadCloud className="w-4 h-4 text-primary" /> Documents réglementaires</CardTitle>
            <CardDescription>Les documents restent internes tant qu’aucune règle publiée n’en est issue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingDocuments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des documents…</div>
            ) : documents.length > 0 ? (
              documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">{doc.category} › {doc.subCategory} › {doc.documentType}</p>
                      <div className="flex flex-wrap gap-2">
                        {doc.textQualityLabel && <Badge variant="outline">{doc.textQualityLabel}</Badge>}
                        {doc.availabilityStatus && <Badge variant="secondary">{doc.availabilityStatus}</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedDocumentId(doc.id); setActiveTab("calibration"); }}>
                        <ScrollText className="mr-2 h-3.5 w-3.5" /> Calibrer
                      </Button>
                      <Button variant="outline" size="sm" disabled={resegmentDocumentMutation.isPending} onClick={() => resegmentDocumentMutation.mutate(doc.id)}>
                        {resegmentDocumentMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                        Re-segmenter
                      </Button>
                      <Button variant="outline" size="sm" className="border-destructive/20 text-destructive hover:bg-destructive/5" onClick={() => {
                        if (!window.confirm(`Supprimer ${doc.title} ?`)) return;
                        deleteDocumentMutation.mutate(doc.id);
                      }}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Aucun document importé pour cette commune.</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="calibration" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /> Visualiseur PDF + Calibration</CardTitle>
            <CardDescription>Sélectionne le texte extrait page par page, puis rattache-le à une zone, un article et une ou plusieurs règles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDocumentId ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Choisis un document depuis l’onglet Documents réglementaires pour lancer le calibrage.</div>
            ) : loadingWorkspace ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Ouverture du workspace…</div>
            ) : workspaceData ? (
              <>
                <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
                  <div className="rounded-xl border overflow-hidden bg-muted/20 min-h-[720px]">
                    {workspaceData.document.hasStoredFile ? (
                      <iframe
                        src={`/api/mairie/documents/${workspaceData.document.id}/view#toolbar=0`}
                        className="h-[720px] w-full border-none"
                        title={workspaceData.document.title}
                      />
                    ) : (
                      <div className="flex h-[720px] items-center justify-center p-6 text-sm text-muted-foreground">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {workspaceData.document.availabilityMessage || "Fichier source indisponible"}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{workspaceData.document.title}</p>
                          <p className="text-xs text-muted-foreground">{workspaceData.pages.length} page(s) texte sélectionnable(s)</p>
                        </div>
                        <Badge variant="outline">{workspaceData.document.documentType || "document"}</Badge>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-background p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Sélection courante</p>
                        <p className="text-xs text-muted-foreground">Sélectionne du texte dans les pages ci-dessous, puis crée un extrait calibré.</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm min-h-[120px]">
                        {pendingSelection ? pendingSelection.text : "Aucune sélection active"}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Select value={selectionZoneId} onValueChange={setSelectionZoneId}>
                          <SelectTrigger><SelectValue placeholder="Zone" /></SelectTrigger>
                          <SelectContent>
                            {workspaceData.zones.map((zone) => (
                              <SelectItem key={zone.id} value={zone.id}>{zone.zoneCode}{zone.zoneLabel ? ` · ${zone.zoneLabel}` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectionArticleCode} onValueChange={setSelectionArticleCode}>
                          <SelectTrigger><SelectValue placeholder="Article" /></SelectTrigger>
                          <SelectContent>
                            {(themesData?.articleReference || workspaceData.articleReference).map((article) => (
                              <SelectItem key={article.code} value={article.code}>{article.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input placeholder="Libellé d’extrait (optionnel)" value={selectionLabel} onChange={(e) => setSelectionLabel(e.target.value)} />
                      <Button
                        className="w-full"
                        disabled={createExcerptMutation.isPending || !pendingSelection || !selectionZoneId || !selectionArticleCode}
                        onClick={() => createExcerptMutation.mutate()}
                      >
                        {createExcerptMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Créer l’extrait calibré
                      </Button>
                    </div>

                    <div className="rounded-xl border bg-background p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">Assistance IA</p>
                        <Badge variant="secondary">Pré-classement uniquement</Badge>
                      </div>
                      <div className="mt-3 space-y-3">
                        {workspaceData.aiSuggestions.sections.slice(0, 3).map((section) => (
                          <div key={section.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
                            <p className="font-medium">{section.zoneCode} · {section.heading}</p>
                            <p className="text-xs text-muted-foreground">Pages {section.startPage ?? "?"}{section.endPage && section.endPage !== section.startPage ? ` à ${section.endPage}` : ""}</p>
                          </div>
                        ))}
                        {workspaceData.aiSuggestions.rules.slice(0, 3).map((rule) => (
                          <div key={rule.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
                            <p className="font-medium">{rule.zoneCode || "Zone ?"} · {rule.label}</p>
                            <p className="text-xs text-muted-foreground">Art. {rule.articleCode || "?"} · page {rule.sourcePage || "?"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr,420px]">
                  <div className="space-y-3 rounded-xl border bg-background p-4 max-h-[760px] overflow-auto">
                    <p className="text-sm font-semibold">Texte extrait sélectionnable</p>
                    {workspaceData.pages.map((page) => (
                      <div key={page.pageNumber} className="rounded-xl border bg-muted/10 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <Badge variant="outline">Page {page.pageNumber}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingSelection({ text: page.text, pageNumber: page.pageNumber })}
                          >
                            Sélectionner la page
                          </Button>
                        </div>
                        <pre
                          className="whitespace-pre-wrap text-xs leading-6 text-foreground/90 select-text"
                          onMouseUp={() => {
                            const text = window.getSelection?.()?.toString().trim();
                            if (text) {
                              setPendingSelection({ text, pageNumber: page.pageNumber });
                            }
                          }}
                        >
                          {page.text}
                        </pre>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border bg-background p-4">
                      <p className="text-sm font-semibold">Extraits calibrés</p>
                      <div className="mt-3 space-y-3">
                        {workspaceData.excerpts.length > 0 ? workspaceData.excerpts.map((excerpt) => (
                          <div key={excerpt.id} className={`rounded-xl border p-3 ${activeExcerptId === excerpt.id ? "border-primary bg-primary/5" : "bg-muted/10"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="font-medium">{excerpt.selectionLabel || `${excerpt.zone?.zoneCode || "Zone"} · Art. ${excerpt.articleCode || "?"}`}</p>
                                <p className="text-xs text-muted-foreground">Page {excerpt.sourcePage}{excerpt.sourcePageEnd && excerpt.sourcePageEnd !== excerpt.sourcePage ? ` à ${excerpt.sourcePageEnd}` : ""}</p>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => setActiveExcerptId(excerpt.id)}>Règles</Button>
                            </div>
                            <p className="mt-2 text-xs text-foreground/80 line-clamp-4">{excerpt.sourceText}</p>
                          </div>
                        )) : (
                          <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">Aucun extrait calibré pour ce document.</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border bg-background p-4">
                      <p className="text-sm font-semibold">Créer une règle depuis l’extrait</p>
                      {!activeExcerptId ? (
                        <p className="mt-2 text-sm text-muted-foreground">Choisis un extrait calibré pour créer une règle structurée.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <Select value={ruleDrafts[activeExcerptId]?.themeCode || ""} onValueChange={(value) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: {
                              themeCode: value,
                              ruleLabel: current[activeExcerptId]?.ruleLabel || "",
                              operator: current[activeExcerptId]?.operator || "",
                              valueNumeric: current[activeExcerptId]?.valueNumeric || "",
                              valueText: current[activeExcerptId]?.valueText || "",
                              unit: current[activeExcerptId]?.unit || "",
                              conditionText: current[activeExcerptId]?.conditionText || "",
                              interpretationNote: current[activeExcerptId]?.interpretationNote || "",
                            },
                          }))}>
                            <SelectTrigger><SelectValue placeholder="Thème métier" /></SelectTrigger>
                            <SelectContent>
                              {(themesData?.themes || workspaceData.themes).map((theme) => (
                                <SelectItem key={theme.code} value={theme.code}>{theme.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input placeholder="Libellé de règle" value={ruleDrafts[activeExcerptId]?.ruleLabel || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...current[activeExcerptId], themeCode: current[activeExcerptId]?.themeCode || "", ruleLabel: e.target.value, operator: current[activeExcerptId]?.operator || "", valueNumeric: current[activeExcerptId]?.valueNumeric || "", valueText: current[activeExcerptId]?.valueText || "", unit: current[activeExcerptId]?.unit || "", conditionText: current[activeExcerptId]?.conditionText || "", interpretationNote: current[activeExcerptId]?.interpretationNote || "" },
                          }))} />
                          <div className="grid gap-3 md:grid-cols-3">
                            <Input placeholder="Opérateur" value={ruleDrafts[activeExcerptId]?.operator || ""} onChange={(e) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...current[activeExcerptId], themeCode: current[activeExcerptId]?.themeCode || "", ruleLabel: current[activeExcerptId]?.ruleLabel || "", operator: e.target.value, valueNumeric: current[activeExcerptId]?.valueNumeric || "", valueText: current[activeExcerptId]?.valueText || "", unit: current[activeExcerptId]?.unit || "", conditionText: current[activeExcerptId]?.conditionText || "", interpretationNote: current[activeExcerptId]?.interpretationNote || "" },
                            }))} />
                            <Input placeholder="Valeur numérique" value={ruleDrafts[activeExcerptId]?.valueNumeric || ""} onChange={(e) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...current[activeExcerptId], themeCode: current[activeExcerptId]?.themeCode || "", ruleLabel: current[activeExcerptId]?.ruleLabel || "", operator: current[activeExcerptId]?.operator || "", valueNumeric: e.target.value, valueText: current[activeExcerptId]?.valueText || "", unit: current[activeExcerptId]?.unit || "", conditionText: current[activeExcerptId]?.conditionText || "", interpretationNote: current[activeExcerptId]?.interpretationNote || "" },
                            }))} />
                            <Input placeholder="Unité" value={ruleDrafts[activeExcerptId]?.unit || ""} onChange={(e) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...current[activeExcerptId], themeCode: current[activeExcerptId]?.themeCode || "", ruleLabel: current[activeExcerptId]?.ruleLabel || "", operator: current[activeExcerptId]?.operator || "", valueNumeric: current[activeExcerptId]?.valueNumeric || "", valueText: current[activeExcerptId]?.valueText || "", unit: e.target.value, conditionText: current[activeExcerptId]?.conditionText || "", interpretationNote: current[activeExcerptId]?.interpretationNote || "" },
                            }))} />
                          </div>
                          <Input placeholder="Valeur texte (si non numérique)" value={ruleDrafts[activeExcerptId]?.valueText || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...current[activeExcerptId], themeCode: current[activeExcerptId]?.themeCode || "", ruleLabel: current[activeExcerptId]?.ruleLabel || "", operator: current[activeExcerptId]?.operator || "", valueNumeric: current[activeExcerptId]?.valueNumeric || "", valueText: e.target.value, unit: current[activeExcerptId]?.unit || "", conditionText: current[activeExcerptId]?.conditionText || "", interpretationNote: current[activeExcerptId]?.interpretationNote || "" },
                          }))} />
                          <Textarea placeholder="Condition / exception" value={ruleDrafts[activeExcerptId]?.conditionText || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...current[activeExcerptId], themeCode: current[activeExcerptId]?.themeCode || "", ruleLabel: current[activeExcerptId]?.ruleLabel || "", operator: current[activeExcerptId]?.operator || "", valueNumeric: current[activeExcerptId]?.valueNumeric || "", valueText: current[activeExcerptId]?.valueText || "", unit: current[activeExcerptId]?.unit || "", conditionText: e.target.value, interpretationNote: current[activeExcerptId]?.interpretationNote || "" },
                          }))} />
                          <Textarea placeholder="Note d’interprétation" value={ruleDrafts[activeExcerptId]?.interpretationNote || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...current[activeExcerptId], themeCode: current[activeExcerptId]?.themeCode || "", ruleLabel: current[activeExcerptId]?.ruleLabel || "", operator: current[activeExcerptId]?.operator || "", valueNumeric: current[activeExcerptId]?.valueNumeric || "", valueText: current[activeExcerptId]?.valueText || "", unit: current[activeExcerptId]?.unit || "", conditionText: current[activeExcerptId]?.conditionText || "", interpretationNote: e.target.value },
                          }))} />
                          <Button
                            className="w-full"
                            disabled={createRuleMutation.isPending || !(ruleDrafts[activeExcerptId]?.themeCode) || !(ruleDrafts[activeExcerptId]?.ruleLabel)}
                            onClick={() => createRuleMutation.mutate({ excerptId: activeExcerptId, draft: ruleDrafts[activeExcerptId] })}
                          >
                            {createRuleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpen className="mr-2 h-4 w-4" />}
                            Créer la règle structurée
                          </Button>

                          {activeRules.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold">Règles déjà rattachées</p>
                              {activeRules.map((rule) => (
                                <div key={rule.id} className="rounded-lg border bg-muted/20 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium">{rule.ruleLabel}</p>
                                    <Badge variant="outline" className={getStatusBadge(rule.status).className}>{getStatusBadge(rule.status).label}</Badge>
                                  </div>
                                  <p className="mt-1 text-sm text-muted-foreground">{formatRuleValue(rule)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="library" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><LibraryBig className="w-4 h-4 text-primary" /> Bibliothèque des règles</CardTitle>
            <CardDescription>Le travail interne reste ici. Les brouillons n’alimentent pas le back mairie tant qu’ils ne sont pas publiés.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {libraryData?.rules.length ? libraryData.rules.map((rule) => (
              <div key={rule.id} className="rounded-xl border bg-background p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{rule.zoneCode || "Zone ?"}</Badge>
                      <Badge variant="secondary">{rule.themeLabel}</Badge>
                      <Badge variant="outline">Art. {rule.articleCode}</Badge>
                      <Badge variant="outline" className={getStatusBadge(rule.status).className}>{getStatusBadge(rule.status).label}</Badge>
                      {rule.conflictFlag && <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Conflit</Badge>}
                    </div>
                    <p className="font-medium">{rule.ruleLabel}</p>
                    <p className="text-sm text-muted-foreground">{formatRuleValue(rule)}</p>
                    <p className="text-xs text-muted-foreground">{rule.documentTitle} · page {rule.sourcePage}</p>
                    <div className="rounded-lg bg-muted/20 px-3 py-2 text-xs text-foreground/80">{rule.sourceText}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {STATUS_ORDER.map((status) => (
                      <Button
                        key={status}
                        variant={status === rule.status ? "default" : "outline"}
                        size="sm"
                        disabled={updateRuleStatusMutation.isPending}
                        onClick={() => updateRuleStatusMutation.mutate({ ruleId: rule.id, status })}
                      >
                        {status === "draft" ? "Brouillon" : status === "in_review" ? "En revue" : status === "validated" ? "Valider" : "Publier"}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Aucune règle calibrée pour l’instant.</div>
            )}

            {libraryData?.conflicts.length ? (
              <Card className="border-rose-200 bg-rose-50/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-600" /> Conflits réglementaires</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {libraryData.conflicts.map((conflict) => (
                    <div key={conflict.id} className="rounded-lg border border-rose-200 bg-background p-3 text-sm text-rose-900">{conflict.conflictSummary}</div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="published" className="space-y-4">
        <Card className="border-emerald-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Back mairie lecture seule</CardTitle>
            <CardDescription>Seules les règles publiées apparaissent ici. Les brouillons et validations en cours restent invisibles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishedData?.rules.length ? publishedData.rules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-background">{rule.zoneCode || "Zone ?"}</Badge>
                  <Badge variant="secondary">{rule.themeLabel}</Badge>
                  <Badge variant="outline">Art. {rule.articleCode}</Badge>
                </div>
                <p className="mt-2 font-medium">{rule.ruleLabel}</p>
                <p className="text-sm text-muted-foreground">{formatRuleValue(rule)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{rule.documentTitle} · page {rule.sourcePage}</p>
                <div className="mt-2 rounded-lg bg-background px-3 py-2 text-xs text-foreground/80">{rule.sourceText}</div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Aucune règle publiée pour le back mairie.</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
