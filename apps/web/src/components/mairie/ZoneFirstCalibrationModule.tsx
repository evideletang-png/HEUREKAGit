import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  FolderCog,
  Loader2,
  MapPin,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ZoneCalibrationWorkspace } from "@/components/mairie/ZoneCalibrationWorkspace";

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
  searchKeywords: string[];
  referenceDocumentId?: string | null;
  referenceStartPage: number | null;
  referenceEndPage: number | null;
  displayOrder: number;
  isActive: boolean;
  referenceDocument?: {
    id: string;
    title: string | null;
    fileName: string | null;
    documentType: string | null;
  } | null;
};

type OverviewResponse = {
  commune: string;
  communeId: string;
  summary: {
    documentCount: number;
    zoneCount: number;
    overlayCount: number;
    overlayBindingCount: number;
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

type DetectedZoneReviewData = {
  commune: string;
  municipalityId: string;
  summary: {
    zoneSectionCount: number;
    validatedZoneCount: number;
    pendingZoneCount: number;
    readyStatus: "missing" | "ready" | "partial" | "needs_review";
  };
  sections: Array<{
    id: string;
    zoneCode: string;
    parentZoneCode: string | null;
    heading: string;
    startPage: number | null;
    endPage: number | null;
    sourceText: string | null;
    reviewStatus: "auto" | "validated" | "to_review" | "rejected";
    reviewNotes: string | null;
    document: {
      id: string;
      title: string;
      documentType: string | null;
      textQualityLabel: string | null;
      textQualityScore: number | null;
      isOpposable: boolean | null;
    } | null;
  }>;
};

type PublishedLibraryResponse = {
  rules: Array<{
    id: string;
    zoneCode: string | null;
    zoneLabel: string | null;
    overlayId: string | null;
    overlayCode: string | null;
    overlayType: string | null;
    articleCode: string;
    themeLabel: string;
    ruleLabel: string;
    valueNumeric: number | null;
    valueText: string | null;
    unit: string | null;
    operator: string | null;
    conditionText: string | null;
    sourcePage: number;
    documentTitle: string | null;
    normativeEffect: string;
    proceduralEffect: string;
    requiresCrossDocumentResolution: boolean;
    resolutionStatus: string;
  }>;
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

function parsePositiveInt(raw: string) {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getQualityBadge(document: DocumentSummary) {
  switch (document.textQualityLabel) {
    case "excellent":
      return { label: "Texte excellent", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "usable":
      return { label: "Texte exploitable", className: "bg-sky-50 text-sky-700 border-sky-200" };
    case "partial":
      return { label: "Texte partiel", className: "bg-amber-50 text-amber-700 border-amber-200" };
    default:
      return { label: "Texte à confirmer", className: "bg-muted text-muted-foreground border-border" };
  }
}

export function ZoneFirstCalibrationModule({
  currentCommune,
  documents,
}: {
  currentCommune: string;
  documents: DocumentSummary[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const zoneRouteMatch = location.match(/^\/portail-mairie\/base-ia\/zones\/([^/?#]+)/);
  const activeZoneId = zoneRouteMatch ? decodeURIComponent(zoneRouteMatch[1]) : null;
  const [activeTab, setActiveTab] = useState<"documents" | "zones" | "effective">("zones");
  const [zoneForm, setZoneForm] = useState({
    zoneCode: "",
    zoneLabel: "",
    parentZoneCode: "",
    guidanceNotes: "",
    searchKeywordsText: "",
    referenceDocumentId: "",
    referenceStartPage: "",
    referenceEndPage: "",
  });
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneDrafts, setZoneDrafts] = useState<Record<string, typeof zoneForm>>({});
  const [detectedDrafts, setDetectedDrafts] = useState<Record<string, {
    reviewedZoneCode: string;
    reviewedStartPage: string;
    reviewedEndPage: string;
  }>>({});

  const { data: overviewData } = useQuery<OverviewResponse>({
    queryKey: ["reg-calibration-overview", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/overview?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const { data: zonesData, isLoading: loadingZones } = useQuery<{ commune: string; communeId: string; zones: ZoneItem[] }>({
    queryKey: ["reg-calibration-zones", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/zones?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all",
  });

  const { data: detectedZonesData, isLoading: loadingDetectedZones } = useQuery<DetectedZoneReviewData>({
    queryKey: ["reg-calibration-zone-reviews", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/plu-zone-reviews?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const { data: publishedData, isLoading: loadingPublished } = useQuery<PublishedLibraryResponse>({
    queryKey: ["reg-calibration-library", currentCommune, "published"],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/library?commune=${encodeURIComponent(currentCommune)}&visibility=published`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-overview", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-zones", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-zone-reviews", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-library", currentCommune] });
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
        searchKeywords: zoneForm.searchKeywordsText,
        referenceDocumentId: zoneForm.referenceDocumentId || null,
        referenceStartPage: parsePositiveInt(zoneForm.referenceStartPage),
        referenceEndPage: parsePositiveInt(zoneForm.referenceEndPage),
      }),
    }),
    onSuccess: () => {
      setZoneForm({
        zoneCode: "",
        zoneLabel: "",
        parentZoneCode: "",
        guidanceNotes: "",
        searchKeywordsText: "",
        referenceDocumentId: "",
        referenceStartPage: "",
        referenceEndPage: "",
      });
      refreshAll();
      toast({ title: "Zone ajoutée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({ zoneId, draft }: { zoneId: string; draft: typeof zoneForm }) => apiFetch(`/api/mairie/regulatory-calibration/zones/${zoneId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        zoneCode: draft.zoneCode,
        zoneLabel: draft.zoneLabel,
        parentZoneCode: draft.parentZoneCode,
        guidanceNotes: draft.guidanceNotes,
        searchKeywords: draft.searchKeywordsText,
        referenceDocumentId: draft.referenceDocumentId || null,
        referenceStartPage: parsePositiveInt(draft.referenceStartPage),
        referenceEndPage: parsePositiveInt(draft.referenceEndPage),
      }),
    }),
    onSuccess: () => {
      refreshAll();
      setEditingZoneId(null);
      toast({ title: "Zone mise à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => apiFetch(`/api/mairie/regulatory-calibration/zones/${zoneId}?commune=${encodeURIComponent(currentCommune)}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Zone supprimée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const reviewDetectedZoneMutation = useMutation({
    mutationFn: async ({
      id,
      reviewStatus,
      reviewedZoneCode,
      reviewedStartPage,
      reviewedEndPage,
    }: {
      id: string;
      reviewStatus: "validated" | "to_review" | "rejected";
      reviewedZoneCode?: string;
      reviewedStartPage?: number | null;
      reviewedEndPage?: number | null;
    }) => apiFetch(`/api/mairie/plu-zone-reviews/${id}/review?commune=${encodeURIComponent(currentCommune)}`, {
      method: "POST",
      body: JSON.stringify({ reviewStatus, reviewedZoneCode, reviewedStartPage, reviewedEndPage }),
    }),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Détection mise à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const rebuildMutation = useMutation({
    mutationFn: async () => apiFetch("/api/mairie/regulatory-calibration/rebuild", {
      method: "POST",
      body: JSON.stringify({ commune: currentCommune }),
    }),
    onSuccess: (payload) => {
      refreshAll();
      toast({
        title: "Workspace reconstruit",
        description: `${payload.processedDocumentCount} document(s) relus, ${payload.zoneCount} zone(s) actives.`,
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (activeZoneId) {
      setActiveTab("zones");
    }
  }, [activeZoneId]);

  const activeZones = useMemo(
    () => (zonesData?.zones || [])
      .filter((zone) => zone.isActive !== false)
      .slice()
      .sort((left, right) => {
        const orderDelta = (left.displayOrder || 0) - (right.displayOrder || 0);
        if (orderDelta !== 0) return orderDelta;
        return left.zoneCode.localeCompare(right.zoneCode, "fr");
      }),
    [zonesData?.zones],
  );

  const pendingDetections = useMemo(
    () => (detectedZonesData?.sections || []).filter((section) => section.reviewStatus !== "validated" && section.reviewStatus !== "rejected"),
    [detectedZonesData?.sections],
  );

  const publishedRuleGroups = useMemo(() => {
    const groups = new Map<string, {
      zoneCode: string;
      zoneLabel: string | null;
      main: PublishedLibraryResponse["rules"];
      overlays: PublishedLibraryResponse["rules"];
      procedural: PublishedLibraryResponse["rules"];
    }>();

    for (const rule of publishedData?.rules || []) {
      const key = rule.zoneCode || "hors-zone";
      if (!groups.has(key)) {
        groups.set(key, {
          zoneCode: rule.zoneCode || "Hors zone",
          zoneLabel: rule.zoneLabel || null,
          main: [],
          overlays: [],
          procedural: [],
        });
      }
      const target = groups.get(key)!;
      if (rule.proceduralEffect !== "none") target.procedural.push(rule);
      else if (rule.overlayId || rule.normativeEffect !== "primary") target.overlays.push(rule);
      else target.main.push(rule);
    }

    return Array.from(groups.values()).sort((left, right) => left.zoneCode.localeCompare(right.zoneCode, "fr"));
  }, [publishedData?.rules]);

  if (activeZoneId) {
    return <ZoneCalibrationWorkspace currentCommune={currentCommune} zoneId={activeZoneId} />;
  }

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "documents" | "zones" | "effective")} className="space-y-6">
      <TabsList className="w-full justify-start rounded-2xl bg-muted/40 p-1">
        <TabsTrigger value="documents" className="min-w-fit whitespace-nowrap px-4">Documents</TabsTrigger>
        <TabsTrigger value="zones" className="min-w-fit whitespace-nowrap px-4">Zones & calibration</TabsTrigger>
        <TabsTrigger value="effective" className="min-w-fit whitespace-nowrap px-4">Règles effectives</TabsTrigger>
      </TabsList>

      <Card className="border-primary/10 shadow-sm">
        <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-6">
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.documentCount ?? documents.length}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zones actives</div>
            <div className="mt-1 text-2xl font-bold">{activeZones.length}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Détections</div>
            <div className="mt-1 text-2xl font-bold">{detectedZonesData?.summary.pendingZoneCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Brouillons</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.draftRuleCount ?? 0}</div>
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

      <TabsContent value="documents" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Documents réglementaires
            </CardTitle>
            <CardDescription>
              Dépose les sources, puis attache-les ensuite à une zone active lors de l’administration de zone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {documents.length > 0 ? documents.map((document) => {
              const badge = getQualityBadge(document);
              return (
                <div key={document.id} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{document.title || document.fileName || "Document"}</p>
                      <p className="text-sm text-muted-foreground">
                        {document.documentType || "Document"} · {document.fileName || "sans fichier"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                      {document.availabilityStatus === "stored" && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          Stocké durablement
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                Aucun document n’est encore présent pour cette commune.
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="zones" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary">Zones & calibration</h3>
            <p className="text-sm text-muted-foreground">Valide d’abord les zones utiles, puis administre chaque zone dans son propre workspace.</p>
          </div>
          <Button variant="outline" onClick={() => rebuildMutation.mutate()} disabled={rebuildMutation.isPending}>
            {rebuildMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Rebuild zone workspace
          </Button>
        </div>

        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-primary" />
              Ajouter une zone active
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
            <div className="space-y-3">
              <Input placeholder="Code zone (ex : UA, N, UDa, 1AU)" value={zoneForm.zoneCode} onChange={(event) => setZoneForm((current) => ({ ...current, zoneCode: event.target.value }))} />
              <Input placeholder="Libellé" value={zoneForm.zoneLabel} onChange={(event) => setZoneForm((current) => ({ ...current, zoneLabel: event.target.value }))} />
              <Input placeholder="Zone mère" value={zoneForm.parentZoneCode} onChange={(event) => setZoneForm((current) => ({ ...current, parentZoneCode: event.target.value }))} />
              <Select value={zoneForm.referenceDocumentId || "__none__"} onValueChange={(value) => setZoneForm((current) => ({ ...current, referenceDocumentId: value === "__none__" ? "" : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Document de référence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun document</SelectItem>
                  {documents.map((document) => (
                    <SelectItem key={document.id} value={document.id}>
                      {document.title || document.fileName || "Document"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Page début" value={zoneForm.referenceStartPage} onChange={(event) => setZoneForm((current) => ({ ...current, referenceStartPage: event.target.value }))} />
                <Input placeholder="Page fin" value={zoneForm.referenceEndPage} onChange={(event) => setZoneForm((current) => ({ ...current, referenceEndPage: event.target.value }))} />
              </div>
              <Textarea placeholder="Notes de guidage" value={zoneForm.guidanceNotes} onChange={(event) => setZoneForm((current) => ({ ...current, guidanceNotes: event.target.value }))} rows={3} />
              <Textarea placeholder="Mots-clés de recherche" value={zoneForm.searchKeywordsText} onChange={(event) => setZoneForm((current) => ({ ...current, searchKeywordsText: event.target.value }))} rows={3} />
              <Button className="w-full" disabled={createZoneMutation.isPending || !zoneForm.zoneCode.trim()} onClick={() => createZoneMutation.mutate()}>
                {createZoneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Ajouter la zone
              </Button>
            </div>
          </CardContent>
        </Card>

        {pendingDetections.length > 0 && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderCog className="h-4 w-4 text-primary" />
                Détections en attente
              </CardTitle>
              <CardDescription>
                Les zones auto-détectées servent uniquement de premier cadrage. Valide-les pour les faire basculer dans la liste des zones actives.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingDetectedZones ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Lecture des détections…
                </div>
              ) : pendingDetections.map((section) => (
                <div key={section.id} className="rounded-xl border bg-background p-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),280px]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{section.zoneCode}</Badge>
                        <Badge variant="secondary">
                          pages {section.startPage ?? "?"}{section.endPage && section.endPage !== section.startPage ? ` à ${section.endPage}` : ""}
                        </Badge>
                        {section.document?.title && <Badge variant="outline">{section.document.title}</Badge>}
                      </div>
                      <p className="font-medium">{section.heading}</p>
                      {section.sourceText && <p className="text-sm text-muted-foreground line-clamp-3">{section.sourceText}</p>}
                    </div>
                    <div className="space-y-3 rounded-xl border bg-muted/10 p-3">
                      <Input
                        placeholder="Code zone validé"
                        value={detectedDrafts[section.id]?.reviewedZoneCode ?? section.zoneCode}
                        onChange={(event) => setDetectedDrafts((current) => ({
                          ...current,
                          [section.id]: {
                            reviewedZoneCode: event.target.value,
                            reviewedStartPage: current[section.id]?.reviewedStartPage ?? String(section.startPage ?? ""),
                            reviewedEndPage: current[section.id]?.reviewedEndPage ?? String(section.endPage ?? ""),
                          },
                        }))}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          placeholder="Page début"
                          value={detectedDrafts[section.id]?.reviewedStartPage ?? String(section.startPage ?? "")}
                          onChange={(event) => setDetectedDrafts((current) => ({
                            ...current,
                            [section.id]: {
                              reviewedZoneCode: current[section.id]?.reviewedZoneCode ?? section.zoneCode,
                              reviewedStartPage: event.target.value,
                              reviewedEndPage: current[section.id]?.reviewedEndPage ?? String(section.endPage ?? ""),
                            },
                          }))}
                        />
                        <Input
                          placeholder="Page fin"
                          value={detectedDrafts[section.id]?.reviewedEndPage ?? String(section.endPage ?? "")}
                          onChange={(event) => setDetectedDrafts((current) => ({
                            ...current,
                            [section.id]: {
                              reviewedZoneCode: current[section.id]?.reviewedZoneCode ?? section.zoneCode,
                              reviewedStartPage: current[section.id]?.reviewedStartPage ?? String(section.startPage ?? ""),
                              reviewedEndPage: event.target.value,
                            },
                          }))}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => reviewDetectedZoneMutation.mutate({
                            id: section.id,
                            reviewStatus: "validated",
                            reviewedZoneCode: detectedDrafts[section.id]?.reviewedZoneCode ?? section.zoneCode,
                            reviewedStartPage: parsePositiveInt(detectedDrafts[section.id]?.reviewedStartPage ?? String(section.startPage ?? "")),
                            reviewedEndPage: parsePositiveInt(detectedDrafts[section.id]?.reviewedEndPage ?? String(section.endPage ?? "")),
                          })}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Activer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reviewDetectedZoneMutation.mutate({ id: section.id, reviewStatus: "to_review" })}
                        >
                          <Eye className="h-4 w-4" />
                          À revoir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reviewDetectedZoneMutation.mutate({ id: section.id, reviewStatus: "rejected" })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Écarter
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Zones actives</CardTitle>
            <CardDescription>
              La liste reste légère. Toute l’administration détaillée d’une zone se fait dans la page dédiée.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingZones ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lecture des zones…
              </div>
            ) : activeZones.length > 0 ? activeZones.map((zone) => {
              const draft = zoneDrafts[zone.id] || {
                zoneCode: zone.zoneCode || "",
                zoneLabel: zone.zoneLabel || "",
                parentZoneCode: zone.parentZoneCode || "",
                guidanceNotes: zone.guidanceNotes || "",
                searchKeywordsText: (zone.searchKeywords || []).join(", "),
                referenceDocumentId: zone.referenceDocumentId || "",
                referenceStartPage: zone.referenceStartPage ? String(zone.referenceStartPage) : "",
                referenceEndPage: zone.referenceEndPage ? String(zone.referenceEndPage) : "",
              };

              return (
                <div key={zone.id} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{zone.zoneCode}</Badge>
                        {zone.parentZoneCode && <Badge variant="secondary">hérite de {zone.parentZoneCode}</Badge>}
                        {(zone.referenceStartPage || zone.referenceEndPage) && (
                          <Badge variant="outline">
                            pages {zone.referenceStartPage ?? "?"}{zone.referenceEndPage && zone.referenceEndPage !== zone.referenceStartPage ? ` à ${zone.referenceEndPage}` : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium">{zone.zoneLabel || `Zone ${zone.zoneCode}`}</p>
                      {zone.referenceDocument && (
                        <p className="text-sm text-muted-foreground">
                          Document de référence : {zone.referenceDocument.title || zone.referenceDocument.fileName || "Document"}
                        </p>
                      )}
                      {zone.searchKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {zone.searchKeywords.map((keyword) => (
                            <Badge key={`${zone.id}-${keyword}`} variant="outline" className="text-[11px]">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setLocation(`/portail-mairie/base-ia/zones/${zone.id}?commune=${encodeURIComponent(currentCommune)}`)}
                      >
                        <ArrowRight className="h-4 w-4" />
                        Administrer
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (editingZoneId === zone.id) {
                            setEditingZoneId(null);
                            return;
                          }
                          setZoneDrafts((current) => ({ ...current, [zone.id]: draft }));
                          setEditingZoneId(zone.id);
                        }}
                      >
                        Modifier
                      </Button>
                      <Button variant="outline" onClick={() => deleteZoneMutation.mutate(zone.id)}>
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </Button>
                    </div>
                  </div>

                  {editingZoneId === zone.id && (
                    <div className="mt-4 grid gap-3 rounded-xl border bg-muted/10 p-4 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
                      <div className="space-y-3">
                        <Input value={draft.zoneCode} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: { ...draft, zoneCode: event.target.value } }))} placeholder="Code zone" />
                        <Input value={draft.zoneLabel} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: { ...draft, zoneLabel: event.target.value } }))} placeholder="Libellé" />
                        <Input value={draft.parentZoneCode} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: { ...draft, parentZoneCode: event.target.value } }))} placeholder="Zone mère" />
                        <Select value={draft.referenceDocumentId || "__none__"} onValueChange={(value) => setZoneDrafts((current) => ({
                          ...current,
                          [zone.id]: { ...draft, referenceDocumentId: value === "__none__" ? "" : value },
                        }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Document de référence" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Aucun document</SelectItem>
                            {documents.map((document) => (
                              <SelectItem key={document.id} value={document.id}>
                                {document.title || document.fileName || "Document"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input value={draft.referenceStartPage} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: { ...draft, referenceStartPage: event.target.value } }))} placeholder="Page début" />
                          <Input value={draft.referenceEndPage} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: { ...draft, referenceEndPage: event.target.value } }))} placeholder="Page fin" />
                        </div>
                        <Textarea value={draft.guidanceNotes} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: { ...draft, guidanceNotes: event.target.value } }))} placeholder="Notes de guidage" rows={3} />
                        <Textarea value={draft.searchKeywordsText} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: { ...draft, searchKeywordsText: event.target.value } }))} placeholder="Mots-clés de recherche" rows={3} />
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => updateZoneMutation.mutate({ zoneId: zone.id, draft })}>
                            <CheckCircle2 className="h-4 w-4" />
                            Enregistrer
                          </Button>
                          <Button variant="outline" onClick={() => setEditingZoneId(null)}>
                            Annuler
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                Aucune zone active pour cette commune pour l’instant.
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="effective" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              Règles effectives par zone
            </CardTitle>
            <CardDescription>
              Cette vue lecture seule ne montre que les règles publiées, prêtes à alimenter l’analyse et le back mairie.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPublished ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lecture des règles publiées…
              </div>
            ) : publishedRuleGroups.length > 0 ? publishedRuleGroups.map((group) => (
              <div key={group.zoneCode} className="rounded-2xl border bg-background p-4">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{group.zoneCode}</Badge>
                  <span className="font-medium">{group.zoneLabel || `Zone ${group.zoneCode}`}</span>
                </div>

                {[
                  { title: "Règles principales", items: group.main },
                  { title: "Contraintes superposées", items: group.overlays },
                  { title: "Effets procéduraux", items: group.procedural },
                ].filter((section) => section.items.length > 0).map((section) => (
                  <div key={section.title} className="mb-4 last:mb-0">
                    <p className="mb-2 text-sm font-semibold text-primary">{section.title}</p>
                    <div className="space-y-2">
                      {section.items.map((rule) => (
                        <div key={rule.id} className="rounded-xl border bg-muted/10 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Art. {rule.articleCode}</Badge>
                            <Badge variant="secondary">{rule.themeLabel}</Badge>
                            {rule.overlayCode && <Badge variant="outline">{rule.overlayCode} · {rule.overlayType}</Badge>}
                          </div>
                          <p className="mt-2 font-medium">{rule.ruleLabel}</p>
                          <p className="mt-1 text-sm">
                            {typeof rule.valueNumeric === "number"
                              ? `${rule.operator || ""} ${rule.valueNumeric}${rule.unit ? ` ${rule.unit}` : ""}`.trim()
                              : rule.valueText || "Valeur non structurée"}
                          </p>
                          {rule.conditionText && <p className="mt-1 text-xs text-muted-foreground">{rule.conditionText}</p>}
                          <p className="mt-2 text-xs text-muted-foreground">
                            {rule.documentTitle ? `${rule.documentTitle} · ` : ""}
                            page {rule.sourcePage}
                            {rule.requiresCrossDocumentResolution ? ` · ${rule.resolutionStatus}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                Aucune règle publiée pour cette commune pour l’instant.
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
