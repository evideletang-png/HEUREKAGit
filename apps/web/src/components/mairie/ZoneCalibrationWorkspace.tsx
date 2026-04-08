import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  FolderSearch,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ZonePdfViewer } from "@/components/mairie/ZonePdfViewer";

type ThemeItem = {
  code: string;
  label: string;
  description: string | null;
  articleHint: string | null;
};

type DocumentOption = {
  id: string;
  title: string | null;
  fileName: string | null;
  documentType: string | null;
  availability: {
    hasStoredFile: boolean;
    availabilityStatus: string;
    availabilityMessage: string | null;
  };
};

type ZoneWorkspaceResponse = {
  commune: string;
  communeId: string;
  zone: {
    id: string;
    zoneCode: string;
    zoneLabel: string | null;
    parentZoneCode: string | null;
    guidanceNotes: string | null;
    searchKeywords: string[];
    referenceDocumentId: string | null;
    referenceStartPage: number | null;
    referenceEndPage: number | null;
  };
  referenceDocument: DocumentOption | null;
  availableDocuments: DocumentOption[];
  themes: ThemeItem[];
  articleReference: Array<{ code: string; label: string }>;
  pages: Array<{ pageNumber: number; text: string; startOffset: number; endOffset: number }>;
  articleAnchors: Array<{ articleCode: string; pageNumber: number; label: string; snippet: string }>;
  keywordMatches: Array<{ keyword: string; pageNumber: number; snippet: string; articleCode: string | null }>;
  detectedSections: Array<{
    id: string;
    zoneCode: string;
    heading: string;
    startPage: number | null;
    endPage: number | null;
    sourceText: string;
    reviewStatus: string;
    townHallDocumentId: string | null;
  }>;
  detectedRules: Array<{
    id: string;
    zoneCode: string | null;
    articleCode: string | null;
    themeCode: string;
    label: string;
    sourceText: string;
    sourcePage: number | null;
    confidenceScore: number | null;
  }>;
  excerpts: Array<{
    id: string;
    articleCode: string | null;
    selectionLabel: string | null;
    sourceText: string;
    sourcePage: number;
    sourcePageEnd: number | null;
    status: string;
    document: { id: string; title: string | null; fileName: string | null } | null;
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
      status: string;
      normativeEffect: string;
      proceduralEffect: string;
      sourcePage: number;
      conflictFlag: boolean;
      resolutionStatus: string;
    }>;
  }>;
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
    status: string;
    sourcePage: number;
    document: { id: string; title: string | null; fileName: string | null } | null;
    normativeEffect: string;
    proceduralEffect: string;
    conflictFlag: boolean;
    resolutionStatus: string;
  }>;
  conflicts: Array<{ id: string; conflictSummary: string; status: string }>;
  workspaceReady: boolean;
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

function normalizeQuickText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function detectQuickRuleOperator(input: string) {
  const normalized = normalizeQuickText(input);
  if (/(maximum|maximale|maximal|au plus|ne depasse pas|inferieur ou egal|<=)/.test(normalized)) return "<=";
  if (/(minimum|minimale|minimal|au moins|superieur ou egal|>=|obligatoire|minimum de)/.test(normalized)) return ">=";
  return "=";
}

function matchQuickRuleTheme(input: string, themes: ThemeItem[]) {
  const normalized = normalizeQuickText(input);
  const definitions = [
    { patterns: ["hauteur", "faitage", "egout"], candidates: ["hauteur"] },
    { patterns: ["stationnement", "parking", "velo", "place"], candidates: ["stationnement"] },
    { patterns: ["emprise", "ces"], candidates: ["emprise_sol"] },
    { patterns: ["recul", "voie", "alignement"], candidates: ["recul_voie"] },
    { patterns: ["limite separative", "limites separatives", "fond"], candidates: ["recul_limite", "distance_entre_batiments"] },
    { patterns: ["pleine terre", "espace vert", "plantation", "biotope"], candidates: ["pleine_terre", "espaces_verts", "coefficient_biotope", "plantations"] },
    { patterns: ["materiau", "facade", "toiture", "cloture", "aspect"], candidates: ["materiaux", "aspect_exterieur", "toiture", "facades", "clotures"] },
    { patterns: ["acces", "voirie", "pompiers"], candidates: ["acces_voirie", "acces_pompiers"] },
    { patterns: ["destination", "interdit", "condition"], candidates: ["destination", "interdictions", "conditions_particulieres"] },
  ];

  for (const definition of definitions) {
    if (!definition.patterns.some((pattern) => normalized.includes(pattern))) continue;
    const found = themes.find((theme) => definition.candidates.includes(theme.code));
    if (found) return found;
  }

  return themes.find((theme) => {
    const code = normalizeQuickText(theme.code.replaceAll("_", " "));
    const label = normalizeQuickText(theme.label);
    return normalized.includes(code) || normalized.includes(label);
  }) || null;
}

function buildQuickRuleDraft(input: string, themes: ThemeItem[]) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const theme = matchQuickRuleTheme(trimmed, themes);
  const numericPerUnitMatch = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(place(?:s)?|emplacement(?:s)?|m²|m2|m|%)(?:\s*(?:par|\/)\s*([A-Za-zÀ-ÿ0-9 m²m2]+))?/i);
  const numericMatch = trimmed.match(/(\d+(?:[.,]\d+)?)/);
  const numericValue = numericPerUnitMatch?.[1] || numericMatch?.[1] || "";
  const numeric = numericValue ? Number.parseFloat(numericValue.replace(",", ".")) : null;
  const unitBase = numericPerUnitMatch?.[2]?.toLowerCase() || "";
  const perUnit = numericPerUnitMatch?.[3]?.trim() || "";
  const unit = unitBase
    ? `${unitBase.replace("m2", "m²").replace("places", "place").replace("emplacements", "emplacement")}${perUnit ? ` / ${perUnit}` : ""}`
    : "";
  const conditionMatch = trimmed.match(/(?:en cas de|si|sous reserve de|a condition de|conformement a)(.*)$/i);

  return {
    themeCode: theme?.code || "",
    ruleLabel: theme?.label || trimmed,
    operator: detectQuickRuleOperator(trimmed),
    valueNumeric: numeric !== null && Number.isFinite(numeric) ? String(numeric) : "",
    valueText: numeric === null ? trimmed : "",
    unit,
    conditionText: conditionMatch?.[0]?.trim() || "",
    interpretationNote: trimmed,
  };
}

function formatRuleValue(rule: ZoneWorkspaceResponse["rules"][number] | ZoneWorkspaceResponse["excerpts"][number]["rules"][number]) {
  const numeric = typeof rule.valueNumeric === "number"
    ? `${rule.operator || ""} ${rule.valueNumeric}${rule.unit ? ` ${rule.unit}` : ""}`.trim()
    : null;
  return numeric || rule.valueText || "Valeur non structurée";
}

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

function parsePositiveInt(raw: string) {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function ZoneCalibrationWorkspace({
  currentCommune,
  zoneId,
}: {
  currentCommune: string;
  zoneId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const selectionEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [selection, setSelection] = useState<{ text: string; pageNumber: number } | null>(null);
  const [selectionArticleCode, setSelectionArticleCode] = useState("");
  const [selectionLabel, setSelectionLabel] = useState("");
  const [selectedExcerptId, setSelectedExcerptId] = useState<string | null>(null);
  const [manualArticleMode, setManualArticleMode] = useState(false);
  const [manualArticle, setManualArticle] = useState({
    articleCode: "",
    label: "",
    sourcePage: "",
    sourceText: "",
  });
  const [zoneDraft, setZoneDraft] = useState({
    zoneCode: "",
    zoneLabel: "",
    parentZoneCode: "",
    guidanceNotes: "",
    searchKeywordsText: "",
    referenceDocumentId: "",
    referenceStartPage: "",
    referenceEndPage: "",
  });
  const [quickRuleInput, setQuickRuleInput] = useState("");
  const [ruleDraft, setRuleDraft] = useState({
    themeCode: "",
    ruleLabel: "",
    operator: "",
    valueNumeric: "",
    valueText: "",
    unit: "",
    conditionText: "",
    interpretationNote: "",
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery<ZoneWorkspaceResponse>({
    queryKey: ["reg-zone-workspace", currentCommune, zoneId],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/zones/${zoneId}/workspace?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all" && !!zoneId,
  });

  useEffect(() => {
    if (!data) return;
    setZoneDraft({
      zoneCode: data.zone.zoneCode || "",
      zoneLabel: data.zone.zoneLabel || "",
      parentZoneCode: data.zone.parentZoneCode || "",
      guidanceNotes: data.zone.guidanceNotes || "",
      searchKeywordsText: (data.zone.searchKeywords || []).join(", "),
      referenceDocumentId: data.zone.referenceDocumentId || "",
      referenceStartPage: data.zone.referenceStartPage ? String(data.zone.referenceStartPage) : "",
      referenceEndPage: data.zone.referenceEndPage ? String(data.zone.referenceEndPage) : "",
    });
  }, [data]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-overview", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-zones", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-library", currentCommune] });
    queryClient.invalidateQueries({ queryKey: ["reg-zone-workspace", currentCommune, zoneId] });
  };

  const saveZoneMutation = useMutation({
    mutationFn: async () => apiFetch(`/api/mairie/regulatory-calibration/zones/${zoneId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        zoneCode: zoneDraft.zoneCode,
        zoneLabel: zoneDraft.zoneLabel,
        parentZoneCode: zoneDraft.parentZoneCode,
        guidanceNotes: zoneDraft.guidanceNotes,
        searchKeywords: zoneDraft.searchKeywordsText,
        referenceDocumentId: zoneDraft.referenceDocumentId || null,
        referenceStartPage: parsePositiveInt(zoneDraft.referenceStartPage),
        referenceEndPage: parsePositiveInt(zoneDraft.referenceEndPage),
      }),
    }),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Zone mise à jour", description: "Le workspace est recalé sur cette zone." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createExcerptMutation = useMutation({
    mutationFn: async (payload: { sourceText: string; sourcePage: number; articleCode: string; selectionLabel: string }) => apiFetch("/api/mairie/regulatory-calibration/excerpts", {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        zoneId,
        documentId: data?.zone.referenceDocumentId || data?.referenceDocument?.id,
        articleCode: payload.articleCode || null,
        selectionLabel: payload.selectionLabel || null,
        sourceText: payload.sourceText,
        sourcePage: payload.sourcePage,
      }),
    }),
    onSuccess: (payload) => {
      refreshAll();
      setSelectedExcerptId(payload.excerpt.id);
      setManualArticleMode(false);
      setManualArticle({ articleCode: "", label: "", sourcePage: "", sourceText: "" });
      toast({ title: "Article enregistré", description: "L’extrait calibré est maintenant disponible pour créer la règle." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedExcerptId) throw new Error("Choisis d’abord un extrait calibré.");
      return apiFetch(`/api/mairie/regulatory-calibration/excerpts/${selectedExcerptId}/rules`, {
        method: "POST",
        body: JSON.stringify({
          commune: currentCommune,
          themeCode: ruleDraft.themeCode,
          ruleLabel: ruleDraft.ruleLabel,
          operator: ruleDraft.operator,
          valueNumeric: ruleDraft.valueNumeric || null,
          valueText: ruleDraft.valueText || null,
          unit: ruleDraft.unit || null,
          conditionText: ruleDraft.conditionText || null,
          interpretationNote: ruleDraft.interpretationNote || null,
          normativeEffect: "primary",
          proceduralEffect: "none",
          applicabilityScope: "main_zone",
          ruleAnchorType: "article",
          ruleAnchorLabel: selectionArticleCode || null,
          conflictResolutionStatus: "none",
        }),
      });
    },
    onSuccess: () => {
      refreshAll();
      setRuleDraft({
        themeCode: "",
        ruleLabel: "",
        operator: "",
        valueNumeric: "",
        valueText: "",
        unit: "",
        conditionText: "",
        interpretationNote: "",
      });
      setQuickRuleInput("");
      toast({ title: "Règle créée", description: "La règle est prête pour validation ou publication." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateRuleStatusMutation = useMutation({
    mutationFn: async ({ ruleId, status }: { ruleId: string; status: string }) => apiFetch(`/api/mairie/regulatory-calibration/rules/${ruleId}/status`, {
      method: "POST",
      body: JSON.stringify({ commune: currentCommune, status }),
    }),
    onSuccess: () => {
      refreshAll();
      toast({ title: "Statut mis à jour" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const pageNumbers = useMemo(
    () => (data?.pages || []).map((page) => page.pageNumber),
    [data?.pages],
  );

  const excerptChoices = useMemo(
    () => data?.excerpts.slice().sort((left, right) => left.sourcePage - right.sourcePage) || [],
    [data?.excerpts],
  );

  useEffect(() => {
    if (!selectedExcerptId && excerptChoices[0]) {
      setSelectedExcerptId(excerptChoices[0].id);
    }
  }, [excerptChoices, selectedExcerptId]);

  const applyQuickRuleInput = () => {
    if (!data) return;
    const nextDraft = buildQuickRuleDraft(quickRuleInput, data.themes);
    if (!nextDraft) return;
    setRuleDraft((current) => ({
      ...current,
      ...nextDraft,
    }));
  };

  const applySelectionCandidate = (candidate: {
    text: string;
    pageNumber: number;
    articleCode?: string | null;
    label?: string | null;
  }) => {
    setSelection({ text: candidate.text, pageNumber: candidate.pageNumber });
    setSelectionArticleCode(candidate.articleCode || "");
    setSelectionLabel(candidate.label || candidate.text.slice(0, 80));
    requestAnimationFrame(() => {
      selectionEditorRef.current?.focus();
      selectionEditorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  if (isLoading) {
    return (
      <Card className="border-primary/10 shadow-sm">
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ouverture du workspace de zone…
        </CardContent>
      </Card>
    );
  }

  if (error instanceof Error || !data) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
        <CardContent className="flex items-start gap-3 p-6 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Impossible d’ouvrir cette zone.</p>
            <p>{error instanceof Error ? error.message : "Workspace indisponible."}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          onClick={() => setLocation(`/portail-mairie?commune=${encodeURIComponent(currentCommune)}`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux zones
        </Button>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
            {data.zone.zoneCode}
          </Badge>
          {data.zone.parentZoneCode && <Badge variant="secondary">hérite de {data.zone.parentZoneCode}</Badge>}
          {data.zone.referenceStartPage && (
            <Badge variant="outline">
              pages {data.zone.referenceStartPage} à {data.zone.referenceEndPage || data.zone.referenceStartPage}
            </Badge>
          )}
          <Badge variant="outline" className="bg-muted/40">
            {data.rules.filter((rule) => rule.status === "published").length} règle(s) publiée(s)
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr),360px]">
        <div className="space-y-4">
          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-primary" />
                Référence de zone
              </CardTitle>
              <CardDescription>
                Cette zone devient la source de vérité : document, pages et guidage de recherche.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={zoneDraft.zoneCode}
                onChange={(event) => setZoneDraft((current) => ({ ...current, zoneCode: event.target.value }))}
                placeholder="Code zone"
              />
              <Input
                value={zoneDraft.zoneLabel}
                onChange={(event) => setZoneDraft((current) => ({ ...current, zoneLabel: event.target.value }))}
                placeholder="Libellé"
              />
              <Input
                value={zoneDraft.parentZoneCode}
                onChange={(event) => setZoneDraft((current) => ({ ...current, parentZoneCode: event.target.value }))}
                placeholder="Zone mère"
              />
              <Select
                value={zoneDraft.referenceDocumentId || "__none__"}
                onValueChange={(value) => setZoneDraft((current) => ({
                  ...current,
                  referenceDocumentId: value === "__none__" ? "" : value,
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Document de référence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun document</SelectItem>
                  {data.availableDocuments.map((document) => (
                    <SelectItem key={document.id} value={document.id}>
                      {(document.title || document.fileName || "Document")} {document.documentType ? `· ${document.documentType}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={zoneDraft.referenceStartPage}
                  onChange={(event) => setZoneDraft((current) => ({ ...current, referenceStartPage: event.target.value }))}
                  inputMode="numeric"
                  placeholder="Page début"
                />
                <Input
                  value={zoneDraft.referenceEndPage}
                  onChange={(event) => setZoneDraft((current) => ({ ...current, referenceEndPage: event.target.value }))}
                  inputMode="numeric"
                  placeholder="Page fin"
                />
              </div>
              <Textarea
                value={zoneDraft.guidanceNotes}
                onChange={(event) => setZoneDraft((current) => ({ ...current, guidanceNotes: event.target.value }))}
                placeholder="Notes de guidage"
                rows={4}
              />
              <Textarea
                value={zoneDraft.searchKeywordsText}
                onChange={(event) => setZoneDraft((current) => ({ ...current, searchKeywordsText: event.target.value }))}
                placeholder="Mots-clés de zone"
                rows={4}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveZoneMutation.mutate()} disabled={saveZoneMutation.isPending}>
                  {saveZoneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer la zone
                </Button>
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Relancer la recherche
                </Button>
              </div>
            </CardContent>
          </Card>

          <Accordion type="multiple" className="space-y-4">
            <AccordionItem value="articles" className="rounded-xl border bg-background shadow-sm">
              <AccordionTrigger className="px-5 text-sm font-semibold">
                Articles identifiés
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <div className="space-y-3">
                  {data.articleAnchors.length > 0 ? data.articleAnchors.map((anchor, index) => (
                    <div key={`${anchor.articleCode}-${anchor.pageNumber}-${index}`} className="rounded-xl border bg-muted/10 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Art. {anchor.articleCode}</Badge>
                        <Badge variant="secondary">page {anchor.pageNumber}</Badge>
                      </div>
                      <p className="mt-2 text-sm">{anchor.label}</p>
                      {anchor.snippet && (
                        <p className="mt-2 text-sm text-muted-foreground">{anchor.snippet}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            applySelectionCandidate({
                              text: anchor.snippet || anchor.label,
                              pageNumber: anchor.pageNumber,
                              articleCode: anchor.articleCode,
                              label: anchor.label,
                            });
                          }}
                        >
                          Utiliser
                        </Button>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Aucun article détecté automatiquement dans cette plage pour l’instant.</p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="keywords" className="rounded-xl border bg-background shadow-sm">
              <AccordionTrigger className="px-5 text-sm font-semibold">
                Textes retrouvés via les mots-clés
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <div className="space-y-3">
                  {data.keywordMatches.length > 0 ? data.keywordMatches.map((match, index) => (
                    <div key={`${match.keyword}-${match.pageNumber}-${index}`} className="rounded-xl border bg-muted/10 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{match.keyword}</Badge>
                        <Badge variant="secondary">page {match.pageNumber}</Badge>
                        {match.articleCode && <Badge variant="outline">Art. {match.articleCode}</Badge>}
                      </div>
                      <p className="mt-2 text-sm">{match.snippet}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            applySelectionCandidate({
                              text: match.snippet,
                              pageNumber: match.pageNumber,
                              articleCode: match.articleCode || "",
                              label: match.keyword,
                            });
                          }}
                        >
                          Utiliser
                        </Button>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Aucun extrait ne correspond encore aux mots-clés de cette zone.</p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="space-y-4">
          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderSearch className="h-4 w-4 text-primary" />
                PDF de la zone
              </CardTitle>
              <CardDescription>
                Seules les pages de la zone sont affichées. La sélection directe dans le PDF devient la source officielle du calibrage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.referenceDocument?.id && pageNumbers.length > 0 ? (
                <ZonePdfViewer
                  documentId={data.referenceDocument.id}
                  documentTitle={data.referenceDocument.title || data.referenceDocument.fileName || "Document"}
                  pageNumbers={pageNumbers}
                  fallbackPages={data.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text }))}
                  onTextSelected={({ text, pageNumber }) => {
                    setSelection({ text, pageNumber });
                    if (!selectionLabel) {
                      setSelectionLabel(text.slice(0, 80));
                    }
                  }}
                />
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-sm text-muted-foreground">
                  Aucun document de référence ou aucune page utile n’est encore définie pour cette zone.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Sélection courante
              </CardTitle>
              <CardDescription>
                Ajuste l’article, le libellé et le texte avant d’enregistrer l’extrait calibré.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                {selection ? (
                  <Textarea
                    ref={selectionEditorRef}
                    value={selection.text}
                    onChange={(event) => setSelection((current) => current ? { ...current, text: event.target.value } : current)}
                    rows={8}
                    placeholder="Le texte de l’extrait peut être corrigé, complété ou simplifié ici avant enregistrement."
                    className="min-h-[180px] resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  />
                ) : "Sélectionne directement un extrait dans le PDF ou utilise un texte retrouvé à gauche."}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={selectionArticleCode || "__none__"} onValueChange={(value) => setSelectionArticleCode(value === "__none__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Article" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucun article</SelectItem>
                    {data.articleReference.map((article) => (
                      <SelectItem key={article.code} value={article.code}>
                        {article.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={selectionLabel}
                  onChange={(event) => setSelectionLabel(event.target.value)}
                  placeholder="Libellé de l’extrait"
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {selection?.pageNumber ? <span>page {selection.pageNumber}</span> : null}
                {selectedExcerptId ? <span>extrait actif sélectionné</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={createExcerptMutation.isPending || !selection?.text || !selection?.pageNumber}
                  onClick={() => {
                    if (!selection) return;
                    createExcerptMutation.mutate({
                      sourceText: selection.text,
                      sourcePage: selection.pageNumber,
                      articleCode: selectionArticleCode,
                      selectionLabel,
                    });
                  }}
                >
                  {createExcerptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer l’extrait
                </Button>
                <Button variant="outline" onClick={() => setManualArticleMode((current) => !current)}>
                  <FilePlus2 className="h-4 w-4" />
                  Ajouter un article manquant
                </Button>
              </div>

              {manualArticleMode && (
                <div className="space-y-3 rounded-2xl border bg-muted/10 p-4">
                  <div className="text-sm font-medium">Article manuel</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={manualArticle.articleCode}
                      onChange={(event) => setManualArticle((current) => ({ ...current, articleCode: event.target.value }))}
                      placeholder="Article (ex : 12)"
                    />
                    <Input
                      value={manualArticle.sourcePage}
                      onChange={(event) => setManualArticle((current) => ({ ...current, sourcePage: event.target.value }))}
                      inputMode="numeric"
                      placeholder="Page source"
                    />
                  </div>
                  <Input
                    value={manualArticle.label}
                    onChange={(event) => setManualArticle((current) => ({ ...current, label: event.target.value }))}
                    placeholder="Libellé de l’article"
                  />
                  <Textarea
                    value={manualArticle.sourceText}
                    onChange={(event) => setManualArticle((current) => ({ ...current, sourceText: event.target.value }))}
                    placeholder="Texte source"
                    rows={6}
                  />
                  <Button
                    disabled={createExcerptMutation.isPending || !manualArticle.sourceText.trim() || !parsePositiveInt(manualArticle.sourcePage)}
                    onClick={() => {
                      const sourcePage = parsePositiveInt(manualArticle.sourcePage);
                      if (!sourcePage) return;
                      createExcerptMutation.mutate({
                        sourceText: manualArticle.sourceText,
                        sourcePage,
                        articleCode: manualArticle.articleCode,
                        selectionLabel: manualArticle.label,
                      });
                    }}
                  >
                    {createExcerptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Créer l’article
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-primary" />
                Règle issue de l’extrait
              </CardTitle>
              <CardDescription>
                Tu peux parler naturellement au système, puis affiner si besoin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={quickRuleInput}
                  onChange={(event) => setQuickRuleInput(event.target.value)}
                  placeholder='Ex : "Hauteur 15 m" ou "Stationnement 2 places / logement"'
                />
                <Button variant="outline" onClick={applyQuickRuleInput}>
                  <Sparkles className="h-4 w-4" />
                  Interpréter
                </Button>
              </div>
              <Select value={selectedExcerptId || "__none__"} onValueChange={(value) => setSelectedExcerptId(value === "__none__" ? null : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Extrait calibré" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choisir un extrait</SelectItem>
                  {excerptChoices.map((excerpt) => (
                    <SelectItem key={excerpt.id} value={excerpt.id}>
                      {excerpt.articleCode ? `Art. ${excerpt.articleCode}` : "Sans article"} · page {excerpt.sourcePage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ruleDraft.themeCode || "__none__"} onValueChange={(value) => setRuleDraft((current) => ({ ...current, themeCode: value === "__none__" ? "" : value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Thème métier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun thème</SelectItem>
                  {data.themes.map((theme) => (
                    <SelectItem key={theme.code} value={theme.code}>
                      {theme.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={ruleDraft.ruleLabel}
                onChange={(event) => setRuleDraft((current) => ({ ...current, ruleLabel: event.target.value }))}
                placeholder="Libellé de la règle"
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  value={ruleDraft.operator}
                  onChange={(event) => setRuleDraft((current) => ({ ...current, operator: event.target.value }))}
                  placeholder="Opérateur"
                />
                <Input
                  value={ruleDraft.valueNumeric}
                  onChange={(event) => setRuleDraft((current) => ({ ...current, valueNumeric: event.target.value }))}
                  placeholder="Valeur numérique"
                />
                <Input
                  value={ruleDraft.unit}
                  onChange={(event) => setRuleDraft((current) => ({ ...current, unit: event.target.value }))}
                  placeholder="Unité"
                />
              </div>
              <Textarea
                value={ruleDraft.valueText}
                onChange={(event) => setRuleDraft((current) => ({ ...current, valueText: event.target.value }))}
                placeholder="Valeur textuelle"
                rows={2}
              />
              <Textarea
                value={ruleDraft.conditionText}
                onChange={(event) => setRuleDraft((current) => ({ ...current, conditionText: event.target.value }))}
                placeholder="Condition"
                rows={2}
              />
              <Textarea
                value={ruleDraft.interpretationNote}
                onChange={(event) => setRuleDraft((current) => ({ ...current, interpretationNote: event.target.value }))}
                placeholder="Note d’interprétation"
                rows={3}
              />
              <Button
                disabled={createRuleMutation.isPending || !selectedExcerptId || !ruleDraft.themeCode || !ruleDraft.ruleLabel.trim()}
                onClick={() => createRuleMutation.mutate()}
              >
                {createRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Créer la règle
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                Règles de la zone
              </CardTitle>
              <CardDescription>
                Les règles restent ici tant qu’elles ne sont pas publiées.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[360px] pr-3">
                <div className="space-y-3">
                  {data.rules.length > 0 ? data.rules.map((rule) => {
                    const badge = getStatusBadge(rule.status);
                    return (
                      <div key={rule.id} className="rounded-xl border bg-muted/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Art. {rule.articleCode}</Badge>
                          <Badge variant="secondary">{rule.ruleLabel}</Badge>
                          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                        </div>
                        <p className="mt-2 text-sm font-medium">{formatRuleValue(rule)}</p>
                        {rule.conditionText && <p className="mt-1 text-xs text-muted-foreground">{rule.conditionText}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {rule.document?.title ? `${rule.document.title} · ` : ""}
                          page {rule.sourcePage}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {rule.status !== "validated" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateRuleStatusMutation.mutate({ ruleId: rule.id, status: "validated" })}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Valider
                            </Button>
                          )}
                          {rule.status !== "published" && (
                            <Button
                              size="sm"
                              onClick={() => updateRuleStatusMutation.mutate({ ruleId: rule.id, status: "published" })}
                            >
                              <Send className="h-4 w-4" />
                              Publier
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                      Aucune règle n’est encore enregistrée pour cette zone.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
