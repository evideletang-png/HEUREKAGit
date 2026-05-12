import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGeocodeAddress } from "@workspace/api-client-react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  FileText,
  Layers3,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ZoneCalibrationWorkspace } from "@/components/mairie/ZoneCalibrationWorkspace";
import { NotebookImportPanel } from "@/components/reglement/NotebookImportPanel";
import { ZoneDetail } from "@/components/reglement/ZoneDetail";
import { analyzeParcelContext, type ParcelContextAnalysis } from "@/lib/location-intelligence/analyzeParcelContext";
import {
  buildDocumentSourceLink,
  buildRegulatoryOperationalSheet,
  buildZoneCards,
  classifyRegulationDocument,
  filterRegulationDocuments,
  getRegulationDocumentTypeLabel,
  listRegulationDocumentTypes,
  summarizeZoneRules,
} from "@/lib/regulation";

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
    visualCapture: {
      pageNumber: number;
      previewDataUrl: string;
      box?: { x: number; y: number; width: number; height: number };
    } | null;
    visualSupportNote: string | null;
  }>;
};

type CalibrationPermissionsResponse = {
  commune: string;
  communeId: string;
  currentPermissions: {
    communeId: string;
    mode: "legacy" | "controlled" | "admin";
    canEditCalibration: boolean;
    canPublishRules: boolean;
    canManagePermissions: boolean;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    permissions: {
      canEditCalibration: boolean;
      canPublishRules: boolean;
      canManagePermissions: boolean;
      inherited: boolean;
    };
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

function getQualityBadge(document: Pick<DocumentSummary, "textQualityLabel">) {
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

function getAddressCoordinates(address: any) {
  const raw = address?.coordinates || address?.geometry?.coordinates;
  if (Array.isArray(raw) && raw.length >= 2) return { lon: Number(raw[0]), lat: Number(raw[1]) };
  if (address?.lat || address?.lon || address?.lng) return { lat: Number(address.lat), lon: Number(address.lon ?? address.lng) };
  return undefined;
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
  const [activeTab, setActiveTab] = useState<"address" | "zones" | "documents">("address");
  const [addressSearch, setAddressSearch] = useState("");
  const [parcelSearch, setParcelSearch] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [parcelContext, setParcelContext] = useState<ParcelContextAnalysis | null>(null);
  const [parcelContextLoading, setParcelContextLoading] = useState(false);
  const [parcelContextError, setParcelContextError] = useState<string | null>(null);
  const [zoneSearch, setZoneSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
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
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, {
    canEditCalibration: boolean;
    canPublishRules: boolean;
    canManagePermissions: boolean;
  }>>({});
  const [showExpertTools, setShowExpertTools] = useState(false);
  const geocode = useGeocodeAddress({ q: addressSearch }, { query: { enabled: addressSearch.length > 5 && !selectedAddress } } as any);

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

  const { data: reglementSummaryData } = useQuery<any>({
    queryKey: ["reglement-summary", currentCommune],
    queryFn: () => apiFetch(`/api/reglement/summary?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const { data: reglementZonesData } = useQuery<any>({
    queryKey: ["reglement-zones", currentCommune],
    queryFn: () => apiFetch(`/api/reglement/zones?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const { data: detectedZonesData } = useQuery<DetectedZoneReviewData>({
    queryKey: ["reg-calibration-zone-reviews", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/plu-zone-reviews?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const { data: publishedData, isLoading: loadingPublished } = useQuery<PublishedLibraryResponse>({
    queryKey: ["reg-calibration-library", currentCommune, "published"],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/library?commune=${encodeURIComponent(currentCommune)}&visibility=published`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const {
    data: permissionData,
    isLoading: loadingPermissions,
    isFetched: permissionsFetched,
  } = useQuery<CalibrationPermissionsResponse>({
    queryKey: ["reg-calibration-permissions", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/permissions?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !activeZoneId,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-overview", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-zones", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-zone-reviews", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-library", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-permissions", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reglement-summary", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reglement-zones", currentCommune] });
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

  const savePermissionMutation = useMutation({
    mutationFn: async ({
      userId,
      draft,
    }: {
      userId: string;
      draft: {
        canEditCalibration: boolean;
        canPublishRules: boolean;
        canManagePermissions: boolean;
      };
    }) => apiFetch(`/api/mairie/regulatory-calibration/permissions/${userId}`, {
      method: "PUT",
      body: JSON.stringify({
        commune: currentCommune,
        ...draft,
      }),
    }),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Droits mis à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!permissionData?.users) return;
    setPermissionDrafts((current) => {
      const next = { ...current };
      for (const managedUser of permissionData.users) {
        next[managedUser.id] = {
          canEditCalibration: managedUser.permissions.canEditCalibration,
          canPublishRules: managedUser.permissions.canPublishRules,
          canManagePermissions: managedUser.permissions.canManagePermissions,
        };
      }
      return next;
    });
  }, [permissionData?.users]);

  useEffect(() => {
    if (activeZoneId) {
      setActiveTab("zones");
    }
  }, [activeZoneId]);

  const runAddressRegulationAnalysis = async () => {
    if (!selectedAddress && !addressSearch.trim() && !parcelSearch.trim()) {
      setParcelContextError("Saisissez une adresse ou une référence cadastrale.");
      return;
    }
    setParcelContextLoading(true);
    setParcelContextError(null);
    try {
      const coordinates = getAddressCoordinates(selectedAddress);
      const analysis = await analyzeParcelContext({
        address: selectedAddress?.label || addressSearch,
        parcelId: parcelSearch || selectedAddress?.parcelles?.[0],
        commune: selectedAddress?.city || currentCommune,
        codeInsee: selectedAddress?.citycode,
        banId: selectedAddress?.banId || selectedAddress?.id,
        banParcelles: selectedAddress?.parcelles,
        coordinates,
        dossierType: "DPC",
      });
      setParcelContext(analysis);
    } catch (error) {
      setParcelContextError(error instanceof Error ? error.message : "Analyse réglementaire indisponible.");
    } finally {
      setParcelContextLoading(false);
    }
  };

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

  const allPublishedRules = publishedData?.rules || [];
  const zoneCards = useMemo(() => {
    const rawZones = (reglementZonesData?.zones || activeZones) as any[];
    return buildZoneCards(rawZones, allPublishedRules);
  }, [activeZones, allPublishedRules, reglementZonesData?.zones]);
  const filteredZoneCards = useMemo(() => {
    const search = zoneSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!search) return zoneCards;
    return zoneCards.filter((zone: any) => [
      zone.zoneCode,
      zone.zoneLabel,
      zone.summary,
      ...(zone.themes || []),
    ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(search));
  }, [zoneCards, zoneSearch]);
  const documentTypes = useMemo(() => listRegulationDocumentTypes(documents), [documents]);
  const filteredDocuments = useMemo(() => filterRegulationDocuments(documents, {
    search: documentSearch,
    type: documentTypeFilter,
  }), [documentSearch, documentTypeFilter, documents]);
  const operationalSheet = useMemo(() => buildRegulatoryOperationalSheet({
    address: selectedAddress?.label || addressSearch,
    parcel: parcelSearch,
    analysis: parcelContext,
    rules: allPublishedRules,
    documents,
  }), [addressSearch, allPublishedRules, documents, parcelContext, parcelSearch, selectedAddress]);
  const operationalZoneRules = useMemo(
    () => summarizeZoneRules(parcelContext?.pluZone?.code || null, allPublishedRules),
    [allPublishedRules, parcelContext?.pluZone?.code],
  );

  const canManagePermissions = loadingPermissions
    ? false
    : !!permissionData?.currentPermissions.canManagePermissions;
  const canEditCalibration = loadingPermissions
    ? true
    : currentCommune === "all"
      ? false
      : !!permissionData?.currentPermissions.canEditCalibration;
  const showReadOnlyWarning = currentCommune !== "all" && permissionsFetched && !loadingPermissions && !canEditCalibration;

  if (activeZoneId) {
    return (
      <div className="space-y-6">
        <ZoneDetail zoneId={activeZoneId} />
        <ZoneCalibrationWorkspace currentCommune={currentCommune} zoneId={activeZoneId} />
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "address" | "zones" | "documents")} className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/10 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-primary">Réglementation opérationnelle</h2>
          <p className="text-sm text-muted-foreground">
            Cherchez une adresse, ouvrez une zone, ou consultez les documents sources sans parcourir toute la GED.
          </p>
        </div>
        <TabsList className="w-full justify-start rounded-xl bg-muted/40 p-1 lg:w-auto">
          <TabsTrigger value="address" className="min-w-fit whitespace-nowrap px-4">Vue par adresse</TabsTrigger>
          <TabsTrigger value="zones" className="min-w-fit whitespace-nowrap px-4">Vue par zone</TabsTrigger>
          <TabsTrigger value="documents" className="min-w-fit whitespace-nowrap px-4">Documents sources</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="address" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-primary" />
              Vue par adresse
            </CardTitle>
            <CardDescription>
              Saisissez une adresse ou une parcelle pour générer une fiche réglementaire opérationnelle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr),auto]">
              <div className="relative">
                <Input
                  value={addressSearch}
                  onChange={(event) => {
                    setAddressSearch(event.target.value);
                    setSelectedAddress(null);
                    setParcelContext(null);
                  }}
                  placeholder="Rechercher une adresse"
                  className="pl-10"
                  autoComplete="off"
                />
                <MapPin className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                {geocode.isLoading ? <Loader2 className="absolute right-3.5 top-3 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                {geocode.data?.results && addressSearch.length > 5 && !selectedAddress ? (
                  <div className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">
                    {geocode.data.results.map((result: any, index: number) => (
                      <button
                        key={`${result.id || result.label}-${index}`}
                        type="button"
                        className="block w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"
                        onClick={() => {
                          setSelectedAddress(result);
                          setAddressSearch(result.label);
                          setParcelSearch(result.parcelles?.[0] || parcelSearch);
                        }}
                      >
                        <span className="block text-sm font-semibold text-primary">{result.label}</span>
                        <span className="text-xs text-muted-foreground">{result.postcode} {result.city}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Input
                value={parcelSearch}
                onChange={(event) => {
                  setParcelSearch(event.target.value);
                  setParcelContext(null);
                }}
                placeholder="Parcelle cadastrale, ex. AB 123"
              />
              <Button onClick={runAddressRegulationAnalysis} disabled={parcelContextLoading || (!addressSearch.trim() && !parcelSearch.trim())}>
                {parcelContextLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Générer la fiche
              </Button>
            </div>

            {selectedAddress ? (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Adresse validée : {selectedAddress.city || currentCommune}
              </div>
            ) : null}
            {parcelContextError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{parcelContextError}</div>
            ) : null}

            {!parcelContext ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                Aucune fiche générée. La vue par adresse remplacera la navigation documentaire brute dès qu’une adresse ou une parcelle est analysée.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {[
                    ["Commune", operationalSheet.identification.commune],
                    ["Adresse", operationalSheet.identification.address],
                    ["Parcelle", operationalSheet.identification.parcel],
                    ["Surface cadastrale", operationalSheet.identification.surfaceM2 ? `${Math.round(operationalSheet.identification.surfaceM2)} m²` : "À confirmer"],
                    ["Zone PLU", operationalSheet.identification.pluZone],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border bg-background p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-1 font-semibold text-primary">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),360px]">
                  <Card className="border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-base">Règles d'urbanisme synthétiques</CardTitle>
                      <CardDescription>Lecture structurée des points utiles à l’instruction, avec renvoi source si disponible.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                      {operationalSheet.rules.map((rule) => (
                        <div key={rule.theme} className={`rounded-xl border p-3 ${rule.confidence === "missing" ? "bg-muted/20" : "bg-white"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-primary">{rule.theme}</p>
                            <Badge variant={rule.confidence === "missing" ? "secondary" : "outline"}>
                              {rule.confidence === "missing" ? "à confirmer" : "source"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{rule.summary}</p>
                          {rule.source ? <p className="mt-2 text-xs text-muted-foreground">{rule.source}{rule.page ? ` · page ${rule.page}` : ""}</p> : null}
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          Contraintes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {operationalSheet.constraints.map((constraint) => (
                          <Badge
                            key={constraint.key}
                            variant="outline"
                            className={constraint.detected
                              ? constraint.severity === "high"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-slate-50 text-slate-500"}
                          >
                            {constraint.detected ? "✓ " : "– "}{constraint.label}
                          </Badge>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-base">Instruction administrative</CardTitle>
                        <CardDescription>Niveau vigilance : {operationalSheet.instruction.vigilanceLevel}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div>
                          <p className="font-semibold text-primary">Services à consulter</p>
                          <p className="text-muted-foreground">
                            {operationalSheet.instruction.consultations.length
                              ? operationalSheet.instruction.consultations.map((consultation: any) => consultation.service).join(", ")
                              : "Aucune consultation obligatoire détectée à ce stade."}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-primary">Délais</p>
                          <p className="text-muted-foreground">
                            {operationalSheet.instruction.delayMonths ? `${operationalSheet.instruction.delayMonths} mois indicatifs` : "À confirmer selon le type de dossier."}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-primary">Pièces / vigilances</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                            {(operationalSheet.instruction.potentialPieces.length ? operationalSheet.instruction.potentialPieces : ["Aucune pièce complémentaire territoriale certaine."]).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base">Sources officielles liées</CardTitle>
                    <CardDescription>Documents exploitables pour contrôler la fiche et citer une source opposable.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {operationalSheet.sources.map((source) => <Badge key={source} variant="secondary">{source}</Badge>)}
                    {operationalSheet.unresolvedChecks.length > 0 ? <Badge variant="outline">Contrôles non confirmés : {operationalSheet.unresolvedChecks.length}</Badge> : null}
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="zones" className="space-y-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers3 className="h-4 w-4 text-primary" />
              Vue par zone
            </CardTitle>
            <CardDescription>Comprendre rapidement une zone PLU sans ouvrir les PDF.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={zoneSearch} onChange={(event) => setZoneSearch(event.target.value)} placeholder="Rechercher une zone, une règle, un thème..." className="pl-10" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredZoneCards.map((zone: any) => {
                const summaries = summarizeZoneRules(zone.zoneCode, allPublishedRules).slice(0, 4);
                return (
                  <button
                    key={zone.id}
                    type="button"
                    className="rounded-2xl border bg-background p-4 text-left transition hover:border-primary/50"
                    onClick={() => setLocation(`/portail-mairie/base-ia/zones/${zone.id}?commune=${encodeURIComponent(currentCommune)}`)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">{zone.zoneCode}</Badge>
                      {zone.parentZoneCode ? <Badge variant="secondary">secteur {zone.parentZoneCode}</Badge> : null}
                      <Badge variant="outline">{zone.ruleCount || 0} règle(s)</Badge>
                    </div>
                    <p className="mt-3 font-semibold text-primary">{zone.zoneLabel || `Zone ${zone.zoneCode}`}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{zone.summary}</p>
                    <div className="mt-3 grid gap-2">
                      {summaries.length > 0 ? summaries.map((summary) => (
                        <div key={summary.theme} className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                          <span className="font-semibold">{summary.theme}</span>
                          <span className="text-muted-foreground"> · {summary.rules[0]?.ruleLabel || "règle à relire"}</span>
                        </div>
                      )) : (
                        <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Synthèse de zone à consolider.</div>
                      )}
                    </div>
                  </button>
                );
              })}
              {filteredZoneCards.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                  Aucune zone ne correspond à cette recherche.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary">Outils experts</h3>
            <p className="text-sm text-muted-foreground">Calibration, droits et reconstruction restent disponibles sans encombrer la lecture opérationnelle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowExpertTools((current) => !current)}>
              <Sparkles className="h-4 w-4" />
              {showExpertTools ? "Masquer les outils experts" : "Afficher les outils experts"}
            </Button>
            <Button variant="outline" onClick={() => rebuildMutation.mutate()} disabled={!canEditCalibration || rebuildMutation.isPending}>
              {rebuildMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Réindexer
            </Button>
          </div>
        </div>

        {showReadOnlyWarning && (
          <Card className="border-amber-200 bg-amber-50 shadow-sm">
            <CardContent className="p-4 text-sm text-amber-900">
              Cette commune est actuellement en lecture seule pour ton profil. Tu peux consulter les zones et les règles, mais pas modifier la calibration.
            </CardContent>
          </Card>
        )}

        {(showExpertTools || activeZones.length === 0) && (
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-primary" />
              Ajouter une zone active (mode expert)
            </CardTitle>
            <CardDescription>
              Cet encart reste disponible pour recadrer manuellement une zone si la détection automatique n’est pas suffisante.
            </CardDescription>
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
              <Button className="w-full" disabled={!canEditCalibration || createZoneMutation.isPending || !zoneForm.zoneCode.trim()} onClick={() => createZoneMutation.mutate()}>
                {createZoneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Ajouter la zone
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        {canManagePermissions && showExpertTools && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Droits de calibration</CardTitle>
              <CardDescription>
                Les profils Administrateur+ peuvent distribuer les droits par commune. Tant qu’aucune règle spécifique n’est enregistrée, la commune reste en mode hérité.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Mode actuel : <span className="font-medium text-primary">{permissionData?.currentPermissions.mode === "legacy" ? "hérité" : permissionData?.currentPermissions.mode === "admin" ? "administrateur+" : "contrôlé"}</span>
              </div>
              <div className="space-y-3">
                {(permissionData?.users || []).map((managedUser) => {
                  const draft = permissionDrafts[managedUser.id] || {
                    canEditCalibration: managedUser.permissions.canEditCalibration,
                    canPublishRules: managedUser.permissions.canPublishRules,
                    canManagePermissions: managedUser.permissions.canManagePermissions,
                  };
                  const isAdminPlus = managedUser.role === "admin" || managedUser.role === "super_admin";
                  return (
                    <div key={managedUser.id} className="rounded-xl border bg-background p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="font-medium">{managedUser.name}</p>
                          <p className="text-sm text-muted-foreground">{managedUser.email} · {managedUser.role}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={draft.canEditCalibration}
                              disabled={isAdminPlus}
                              onCheckedChange={(checked) => setPermissionDrafts((current) => ({
                                ...current,
                                [managedUser.id]: { ...draft, canEditCalibration: checked === true },
                              }))}
                            />
                            Modifier
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={draft.canPublishRules}
                              disabled={isAdminPlus}
                              onCheckedChange={(checked) => setPermissionDrafts((current) => ({
                                ...current,
                                [managedUser.id]: { ...draft, canPublishRules: checked === true },
                              }))}
                            />
                            Publier
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={draft.canManagePermissions}
                              disabled={isAdminPlus}
                              onCheckedChange={(checked) => setPermissionDrafts((current) => ({
                                ...current,
                                [managedUser.id]: { ...draft, canManagePermissions: checked === true },
                              }))}
                            />
                            Gérer les droits
                          </label>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isAdminPlus || savePermissionMutation.isPending}
                            onClick={() => savePermissionMutation.mutate({ userId: managedUser.id, draft })}
                          >
                            Sauvegarder
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {showExpertTools ? <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Zones actives - administration</CardTitle>
            <CardDescription>
              La liste reste légère. Le workspace sert surtout à corriger, confirmer et publier ce que le moteur a déjà structuré.
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
                        Ouvrir le workspace
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!canEditCalibration}
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
                      <Button variant="outline" disabled={!canEditCalibration} onClick={() => deleteZoneMutation.mutate(zone.id)}>
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
                          <Button disabled={!canEditCalibration} onClick={() => updateZoneMutation.mutate({ zoneId: zone.id, draft })}>
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
        </Card> : null}
      </TabsContent>

      <TabsContent value="documents" className="space-y-4">
        <NotebookImportPanel commune={currentCommune} documents={documents} />
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Documents sources
            </CardTitle>
            <CardDescription>
              Bibliothèque réglementaire filtrable. Les documents restent disponibles, mais ne sont plus le point d’entrée principal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),260px]">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                <Input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Rechercher un document, une annexe, une source..." className="pl-10" />
              </div>
              <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}>
                <SelectTrigger>
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Type de document" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {documentTypes.map(([type, label]) => <SelectItem key={type} value={type}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3">
              {filteredDocuments.length > 0 ? filteredDocuments.map((document) => {
                const badge = getQualityBadge(document);
                const type = getRegulationDocumentTypeLabel(classifyRegulationDocument(document));
                return (
                  <div key={document.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{type}</Badge>
                          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                          <Badge variant={document.availabilityStatus === "stored" ? "default" : "secondary"}>
                            {document.availabilityStatus === "stored" ? "Actif" : "À vérifier"}
                          </Badge>
                        </div>
                        <p className="mt-3 font-semibold text-primary">{document.title || document.fileName || "Document réglementaire"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{document.fileName || "Fichier source"} · version active si non archivée</p>
                        {document.explanatoryNote ? <p className="mt-2 text-sm text-muted-foreground">{document.explanatoryNote}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => window.open(buildDocumentSourceLink(document), "_blank", "noopener,noreferrer")}>
                          <ExternalLink className="h-4 w-4" />
                          Ouvrir
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => window.open(buildDocumentSourceLink(document), "_blank", "noopener,noreferrer")}>
                          <Download className="h-4 w-4" />
                          Télécharger
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                  Aucun document ne correspond aux filtres.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
