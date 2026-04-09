import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  FilePlus2,
  FolderSearch,
  Loader2,
  MapPin,
  PencilLine,
  RefreshCw,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { ZonePdfViewer } from "@/components/mairie/ZonePdfViewer";

type ThemeItem = {
  code: string;
  label: string;
  description: string | null;
  articleHint: string | null;
};

type VisualCaptureMetadata = {
  pageNumber: number;
  previewDataUrl: string;
  box: { x: number; y: number; width: number; height: number };
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
  segments: Array<{
    id: string;
    zoneId: string;
    overlayId: string | null;
    documentId: string;
    sourcePageStart: number;
    sourcePageEnd: number | null;
    anchorType: string;
    anchorLabel: string | null;
    articleCode: string | null;
    themeCode: string;
    themeLabel: string;
    sourceTextFull: string;
    previewText: string;
    status: string;
    derivedFromAi: boolean;
    visualAttachmentMeta?: {
      visualCapture?: VisualCaptureMetadata | null;
    } | null;
    document: { id: string; title: string | null; fileName: string | null } | null;
  }>;
  expertAnalysis: {
    analysisVersion: string;
    articleOrThemeBlocks: Array<{
      key: string;
      articleCode: string | null;
      themeCode: string;
      themeLabel: string;
      anchorType: string;
      anchorLabel: string | null;
      ruleResumee: string;
      detailUtile: string;
      exceptionsConditions: string | null;
      effetConcretConstructibilite: string;
      niveauVigilance: "faible" | "moyen" | "fort";
      qualification: string;
    }>;
    crossEffects: string[];
    professionalInterpretation: string;
    operationalConclusion: {
      zonePlutot: string;
      logiqueDominante: string;
      facteursLimitantsPrincipaux: string[];
      opportunitesPossibles: string[];
      pointsBloquantsPotentiels: string[];
      pointsAConfirmerSurPlanOuAnnexe: string[];
    };
  } | null;
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
    segmentId?: string | null;
    articleCode: string | null;
    selectionLabel: string | null;
    sourceText: string;
    sourcePage: number;
    sourcePageEnd: number | null;
    status: string;
    metadata?: {
      visualCapture?: VisualCaptureMetadata | null;
    } | null;
    document: { id: string; title: string | null; fileName: string | null } | null;
    rules: Array<{
      id: string;
      articleCode: string | null;
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
    segmentId?: string | null;
    articleCode: string | null;
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
    excerptSelectionLabel?: string | null;
    visualCapture?: VisualCaptureMetadata | null;
    visualSupportNote?: string | null;
  }>;
  conflicts: Array<{ id: string; conflictSummary: string; status: string }>;
  permissions: {
    communeId: string;
    mode: "legacy" | "controlled" | "admin";
    canEditCalibration: boolean;
    canPublishRules: boolean;
    canManagePermissions: boolean;
  };
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
  if (/(interdit|interdiction|prohibe|prohibee|prohibé|prohibée|non autorise|non autorisé|impossible)/.test(normalized)) return "interdit";
  if (/(autorise|autorisé|admise|admis|possible)/.test(normalized)) return "autorisé";
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

function matchThemeByArticleCode(articleCode: string | null | undefined, themes: ThemeItem[]) {
  const normalized = String(articleCode || "").trim();
  if (!normalized) return null;
  return themes.find((theme) => String(theme.articleHint || "").trim() === normalized) || null;
}

function buildQuickRuleDraft(input: string, themes: ThemeItem[], articleCode?: string | null) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const theme = matchQuickRuleTheme(trimmed, themes) || matchThemeByArticleCode(articleCode, themes);
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
    ruleLabel: theme?.label || trimmed.slice(0, 120),
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

function RuleFieldHelp({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={`Aide : ${label}`}
            >
              <CircleHelp className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line text-left leading-relaxed">
            {help}
          </TooltipContent>
        </Tooltip>
      </div>
      {children}
    </div>
  );
}

function parsePositiveInt(raw: string) {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getArticleSortKey(articleCode: string | null | undefined) {
  const normalized = String(articleCode || "").trim();
  const numeric = Number.parseInt(normalized.replace(/\D+/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
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
  const zoneRulesRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<{
    text: string;
    pageNumber: number;
    pageEndNumber: number | null;
    visualCapture?: VisualCaptureMetadata | null;
  } | null>(null);
  const [selectionArticleCode, setSelectionArticleCode] = useState("");
  const [selectionLabel, setSelectionLabel] = useState("");
  const [selectedExcerptId, setSelectedExcerptId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [detailRule, setDetailRule] = useState<ZoneWorkspaceResponse["rules"][number] | null>(null);
  const [editingRule, setEditingRule] = useState<ZoneWorkspaceResponse["rules"][number] | null>(null);
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
  const [visualSupportNote, setVisualSupportNote] = useState("");
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
  const [editingRuleDraft, setEditingRuleDraft] = useState({
    articleCode: "",
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

  const rerunZoneSearch = async () => {
    try {
      await saveZoneMutation.mutateAsync();
      await refetch();
    } catch {
      // the save mutation already surfaces the blocking error to the user
    }
  };

  const createExcerptMutation = useMutation({
    mutationFn: async (payload: {
      segmentId: string | null;
      sourceText: string;
      sourcePage: number;
      sourcePageEnd: number | null;
      articleCode: string;
      selectionLabel: string;
      metadata?: Record<string, unknown>;
    }) => apiFetch("/api/mairie/regulatory-calibration/excerpts", {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        zoneId,
        segmentId: payload.segmentId,
        documentId: data?.zone.referenceDocumentId || data?.referenceDocument?.id,
        articleCode: payload.articleCode || null,
        selectionLabel: payload.selectionLabel || null,
        sourceText: payload.sourceText,
        sourcePage: payload.sourcePage,
        sourcePageEnd: payload.sourcePageEnd,
        metadata: payload.metadata || {},
      }),
    }),
    onSuccess: (payload) => {
      refreshAll();
      setSelectedExcerptId(payload.excerpt.id);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createSegmentMutation = useMutation({
    mutationFn: async (payload: {
      sourceTextFull: string;
      sourcePageStart: number;
      sourcePageEnd: number | null;
      themeCode: string;
      anchorType: string;
      anchorLabel: string | null;
      visualAttachmentMeta?: Record<string, unknown>;
    }) => apiFetch(`/api/mairie/regulatory-calibration/zones/${zoneId}/segments`, {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        documentId: data?.zone.referenceDocumentId || data?.referenceDocument?.id,
        sourceTextFull: payload.sourceTextFull,
        sourcePageStart: payload.sourcePageStart,
        sourcePageEnd: payload.sourcePageEnd,
        themeCode: payload.themeCode,
        anchorType: payload.anchorType,
        anchorLabel: payload.anchorLabel,
        visualAttachmentMeta: payload.visualAttachmentMeta || {},
      }),
    }),
    onSuccess: (payload) => {
      refreshAll();
      setSelectedSegmentId(payload.segment.id);
      setManualArticleMode(false);
      setManualArticle({ articleCode: "", label: "", sourcePage: "", sourceText: "" });
      toast({
        title: "Segment enregistré",
        description: "Le bloc thématique source est maintenant stabilisé pour cette zone.",
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateSegmentMutation = useMutation({
    mutationFn: async (payload: {
      segmentId: string;
      sourceTextFull: string;
      sourcePageStart: number;
      sourcePageEnd: number | null;
      themeCode: string;
      anchorType: string;
      anchorLabel: string | null;
      visualAttachmentMeta?: Record<string, unknown>;
    }) => apiFetch(`/api/mairie/regulatory-calibration/segments/${payload.segmentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        sourceTextFull: payload.sourceTextFull,
        sourcePageStart: payload.sourcePageStart,
        sourcePageEnd: payload.sourcePageEnd,
        themeCode: payload.themeCode,
        anchorType: payload.anchorType,
        anchorLabel: payload.anchorLabel,
        visualAttachmentMeta: payload.visualAttachmentMeta || {},
      }),
    }),
    onSuccess: (payload) => {
      refreshAll();
      setSelectedSegmentId(payload.segment.id);
      toast({
        title: "Segment mis à jour",
        description: "Le bloc thématique a été recalé directement depuis le PDF.",
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteSegmentMutation = useMutation({
    mutationFn: async (segmentId: string) => apiFetch(`/api/mairie/regulatory-calibration/segments/${segmentId}?commune=${encodeURIComponent(currentCommune)}`, {
      method: "DELETE",
    }),
    onSuccess: (_payload, segmentId) => {
      refreshAll();
      if (selectedSegmentId === segmentId) {
        setSelectedSegmentId(null);
      }
      toast({
        title: "Segment supprimé",
        description: "Le bloc thématique n’alimente plus cette zone.",
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createRuleMutation = useMutation({
    mutationFn: async ({ excerptId }: { excerptId: string }) => {
      if (!excerptId) throw new Error("Choisis d’abord un segment source enregistré.");
      const interpretationParts = [
        ruleDraft.interpretationNote?.trim(),
        visualSupportNote.trim() ? `Repère visuel / croquis : ${visualSupportNote.trim()}` : "",
      ].filter(Boolean);
      const normalizedArticleCode = selectionArticleCode.trim() || null;
      const selectedSegment = selectedSegmentId
        ? data?.segments.find((segment) => segment.id === selectedSegmentId) || null
        : null;
      const normalizedAnchorLabel = normalizedArticleCode
        ? `Article ${normalizedArticleCode}`
        : (selectionLabel.trim() || selectedSegment?.anchorLabel || null);
      const normalizedAnchorType = normalizedArticleCode
        ? "article"
        : (selectedSegment?.anchorType || "free_text_block");
      return apiFetch(`/api/mairie/regulatory-calibration/excerpts/${excerptId}/rules`, {
        method: "POST",
        body: JSON.stringify({
          commune: currentCommune,
          articleCode: normalizedArticleCode,
          themeCode: ruleDraft.themeCode,
          ruleLabel: ruleDraft.ruleLabel,
          operator: ruleDraft.operator,
          valueNumeric: ruleDraft.valueNumeric || null,
          valueText: ruleDraft.valueText || null,
          unit: ruleDraft.unit || null,
          conditionText: ruleDraft.conditionText || null,
          interpretationNote: interpretationParts.join("\n\n") || null,
          normativeEffect: "primary",
          proceduralEffect: "none",
          applicabilityScope: "main_zone",
          ruleAnchorType: normalizedAnchorType,
          ruleAnchorLabel: normalizedAnchorLabel,
          conflictResolutionStatus: "none",
          rawSuggestion: {
            visualCapture: selection?.visualCapture || null,
            visualSupportNote: visualSupportNote.trim() || null,
          },
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
      setVisualSupportNote("");
      requestAnimationFrame(() => {
        zoneRulesRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      toast({
        title: "Règle créée",
        description: "La règle est enregistrée en brouillon dans 'Règles de la zone'. Publie-la pour la voir dans 'Règles effectives'.",
      });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ ruleId }: { ruleId: string }) => apiFetch(`/api/mairie/regulatory-calibration/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        articleCode: editingRuleDraft.articleCode || null,
        themeCode: editingRuleDraft.themeCode || null,
        ruleLabel: editingRuleDraft.ruleLabel,
        operator: editingRuleDraft.operator || null,
        valueNumeric: editingRuleDraft.valueNumeric || null,
        valueText: editingRuleDraft.valueText || null,
        unit: editingRuleDraft.unit || null,
        conditionText: editingRuleDraft.conditionText || null,
        interpretationNote: editingRuleDraft.interpretationNote || null,
      }),
    }),
    onSuccess: () => {
      refreshAll();
      setEditingRule(null);
      toast({ title: "Règle mise à jour" });
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

  const sortedZoneRules = useMemo(
    () => [...(data?.rules || [])].sort((left, right) => {
      const articleDelta = getArticleSortKey(left.articleCode) - getArticleSortKey(right.articleCode);
      if (articleDelta !== 0) return articleDelta;

      const pageDelta = (left.sourcePage || Number.POSITIVE_INFINITY) - (right.sourcePage || Number.POSITIVE_INFINITY);
      if (pageDelta !== 0) return pageDelta;

      return String(left.ruleLabel || "").localeCompare(String(right.ruleLabel || ""), "fr", { numeric: true, sensitivity: "base" });
    }),
    [data?.rules],
  );

  const applyQuickRuleInput = () => {
    if (!data) return;
    const inputSource = quickRuleInput.trim() || selection?.text?.trim() || "";
    const nextDraft = buildQuickRuleDraft(inputSource, data.themes, selectionArticleCode || null);
    if (!nextDraft) {
      toast({
        title: "Interprétation impossible",
        description: "Saisis une consigne rapide ou sélectionne un texte directement dans le PDF avant d’interpréter.",
        variant: "destructive",
      });
      return;
    }
    setRuleDraft((current) => ({
      ...current,
      ...nextDraft,
    }));
    if (!quickRuleInput.trim() && inputSource) {
      setQuickRuleInput(inputSource.slice(0, 160));
    }
    toast({
      title: "Interprétation appliquée",
      description: nextDraft.themeCode
        ? "Le thème et les principaux champs de la règle ont été préremplis."
        : "Une première interprétation a été injectée. Tu peux maintenant l’affiner.",
    });
  };

  const saveCurrentSegment = async () => {
    if (!selection?.text || !selection?.pageNumber) {
      throw new Error("Sélectionne d’abord un texte ou un bloc source dans le PDF.");
    }
    if (!ruleDraft.themeCode) {
      throw new Error("Choisis d’abord le thème métier du segment.");
    }

    const payload = {
      sourceTextFull: selection.text,
      sourcePageStart: selection.pageNumber,
      sourcePageEnd: selection.pageEndNumber,
      themeCode: ruleDraft.themeCode,
      anchorType: selectionArticleCode ? "article" : "free_text_block",
      anchorLabel: selectionArticleCode ? `Article ${selectionArticleCode}` : (selectionLabel.trim() || null),
      visualAttachmentMeta: selection.visualCapture ? { visualCapture: selection.visualCapture } : {},
    };

    if (selectedSegmentId && !selectedSegmentId.startsWith("generated-")) {
      await updateSegmentMutation.mutateAsync({
        segmentId: selectedSegmentId,
        ...payload,
      });
      return selectedSegmentId;
    }

    const created = await createSegmentMutation.mutateAsync(payload);
    return created.segment.id as string;
  };

  const saveCurrentExcerpt = async (segmentId: string) => {
    if (!selection?.text || !selection?.pageNumber) {
      throw new Error("Sélectionne d’abord un texte ou un bloc source dans le PDF.");
    }
    const payload = await createExcerptMutation.mutateAsync({
      segmentId,
      sourceText: selection.text,
      sourcePage: selection.pageNumber,
      sourcePageEnd: selection.pageEndNumber,
      articleCode: selectionArticleCode,
      selectionLabel,
      metadata: selection.visualCapture ? { visualCapture: selection.visualCapture, segmentId } : { segmentId },
    });
    return payload.excerpt.id as string;
  };

  const handleCreateRuleFromSelection = async () => {
    try {
      const segmentId = await saveCurrentSegment();
      const excerptId = selectedExcerptId || await saveCurrentExcerpt(segmentId);
      await createRuleMutation.mutateAsync({ excerptId });
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err?.message || "Impossible de créer la règle depuis cette sélection.",
        variant: "destructive",
      });
    }
  };

  const applySelectionCandidate = (candidate: {
    text: string;
    pageNumber: number;
    pageEndNumber?: number | null;
    articleCode?: string | null;
    label?: string | null;
  }) => {
    setSelection({
      text: candidate.text,
      pageNumber: candidate.pageNumber,
      pageEndNumber: candidate.pageEndNumber ?? null,
      visualCapture: null,
    });
    setSelectedSegmentId(null);
    setSelectedExcerptId(null);
    setSelectionArticleCode(candidate.articleCode || "");
    setSelectionLabel(candidate.label || candidate.text.slice(0, 80));
    requestAnimationFrame(() => {
      selectionEditorRef.current?.focus();
      selectionEditorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const applySegmentCandidate = (segment: ZoneWorkspaceResponse["segments"][number]) => {
    setSelectedSegmentId(segment.id);
    setSelectedExcerptId(null);
    setSelection({
      text: segment.sourceTextFull,
      pageNumber: segment.sourcePageStart,
      pageEndNumber: segment.sourcePageEnd,
      visualCapture: segment.visualAttachmentMeta?.visualCapture || null,
    });
    setSelectionArticleCode(segment.articleCode || "");
    setSelectionLabel(segment.anchorLabel || segment.previewText.slice(0, 80));
    setRuleDraft((current) => ({
      ...current,
      themeCode: segment.themeCode || current.themeCode,
    }));
    requestAnimationFrame(() => {
      selectionEditorRef.current?.focus();
      selectionEditorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const openRuleEditor = (rule: ZoneWorkspaceResponse["rules"][number]) => {
    setEditingRule(rule);
    setEditingRuleDraft({
      articleCode: rule.articleCode || "",
      themeCode: rule.themeCode || "",
      ruleLabel: rule.ruleLabel || "",
      operator: rule.operator || "",
      valueNumeric: typeof rule.valueNumeric === "number" ? String(rule.valueNumeric) : "",
      valueText: rule.valueText || "",
      unit: rule.unit || "",
      conditionText: rule.conditionText || "",
      interpretationNote: rule.interpretationNote || "",
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

  const selectedExcerpt = selectedExcerptId
    ? data.excerpts.find((excerpt) => excerpt.id === selectedExcerptId) || null
    : null;
  const selectedSegment = selectedSegmentId
    ? data.segments.find((segment) => segment.id === selectedSegmentId) || null
    : null;
  const activeVisualCapture =
    selection?.visualCapture
    || selectedSegment?.visualAttachmentMeta?.visualCapture
    || selectedExcerpt?.metadata?.visualCapture
    || null;

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
                <Button variant="outline" onClick={rerunZoneSearch} disabled={isFetching || saveZoneMutation.isPending}>
                  {isFetching || saveZoneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Relancer la recherche
                </Button>
              </div>
            </CardContent>
          </Card>

          <Accordion type="multiple" className="space-y-4">
            <AccordionItem value="themes" className="rounded-xl border bg-background shadow-sm">
              <AccordionTrigger className="px-5 text-sm font-semibold">
                Thèmes détectés dans la zone
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <div className="space-y-3">
                  {data.expertAnalysis?.articleOrThemeBlocks?.length ? data.expertAnalysis.articleOrThemeBlocks.map((block) => (
                    <div key={block.key} className="rounded-xl border bg-muted/10 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {block.articleCode ? <Badge variant="outline">Art. {block.articleCode}</Badge> : null}
                        <Badge variant="secondary">{block.themeLabel}</Badge>
                        <Badge variant="outline">{block.niveauVigilance}</Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium">{block.anchorLabel || block.themeLabel}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{block.ruleResumee}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{block.qualification}</p>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Aucun thème cohérent n’a encore été stabilisé dans cette plage.</p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="segments" className="rounded-xl border bg-background shadow-sm">
              <AccordionTrigger className="px-5 text-sm font-semibold">
                Segments source de la zone
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <div className="space-y-3">
                  {data.segments.length > 0 ? data.segments.map((segment) => (
                    <div key={segment.id} className={`rounded-xl border p-3 ${selectedSegmentId === segment.id ? "border-primary bg-primary/5" : "bg-muted/10"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {segment.articleCode ? <Badge variant="outline">Art. {segment.articleCode}</Badge> : null}
                        <Badge variant="secondary">{segment.themeLabel}</Badge>
                        <Badge variant="outline">
                          {segment.sourcePageEnd && segment.sourcePageEnd > segment.sourcePageStart
                            ? `pages ${segment.sourcePageStart} à ${segment.sourcePageEnd}`
                            : `page ${segment.sourcePageStart}`}
                        </Badge>
                        {segment.derivedFromAi ? <Badge variant="outline">IA</Badge> : <Badge variant="outline">manuel</Badge>}
                      </div>
                      <p className="mt-2 text-sm font-medium">{segment.anchorLabel || segment.themeLabel}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{segment.previewText}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => applySegmentCandidate(segment)}
                        >
                          Utiliser
                        </Button>
                        {data.permissions.canEditCalibration && !segment.id.startsWith("generated-") && (
                          <Button variant="outline" size="sm" onClick={() => deleteSegmentMutation.mutate(segment.id)} disabled={deleteSegmentMutation.isPending}>
                            Supprimer
                          </Button>
                        )}
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">Aucun segment thématique n’est encore enregistré pour cette zone.</p>
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
                              pageEndNumber: null,
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

          {data.expertAnalysis && (
            <Card className="border-primary/10 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Lecture experte de la zone</CardTitle>
                <CardDescription>
                  Synthèse continue, thème par thème, produite à partir des segments et des règles publiées de la zone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="leading-relaxed text-muted-foreground">{data.expertAnalysis.professionalInterpretation}</p>
                {data.expertAnalysis.crossEffects.length > 0 && (
                  <div className="space-y-2 rounded-xl border bg-muted/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Effets croisés</div>
                    {data.expertAnalysis.crossEffects.slice(0, 3).map((effect, index) => (
                      <p key={`${effect}-${index}`} className="text-sm text-muted-foreground">{effect}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
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
                  onTextSelected={({ text, pageNumber, pageEndNumber }) => {
                    setSelectedSegmentId(null);
                    setSelectedExcerptId(null);
                    setSelection({ text, pageNumber, pageEndNumber, visualCapture: null });
                    if (!selectionLabel) {
                      setSelectionLabel(text.slice(0, 80));
                    }
                  }}
                  onVisualSelected={({ pageNumber, previewDataUrl, box }) => {
                    setSelectedSegmentId(null);
                    setSelectedExcerptId(null);
                    setSelection({
                      text: selection?.text?.trim()
                        ? selection.text
                        : "Extrait visuel sélectionné. Décris ici le croquis, schéma ou repère graphique à retenir.",
                      pageNumber,
                      pageEndNumber: null,
                      visualCapture: {
                        pageNumber,
                        previewDataUrl,
                        box,
                      },
                    });
                    if (!selectionLabel) {
                      setSelectionLabel(`Pièce visuelle · page ${pageNumber}`);
                    }
                    requestAnimationFrame(() => {
                      selectionEditorRef.current?.focus();
                      selectionEditorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                    });
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
          <Card className="border-primary/10 bg-primary/[0.03] shadow-sm">
            <CardContent className="space-y-2 p-4 text-sm">
              <p className="font-medium text-primary">Flux de publication</p>
              <p className="text-muted-foreground">1. Ajuster la sélection et son interprétation</p>
              <p className="text-muted-foreground">2. Créer la règle directement depuis ce bloc</p>
              <p className="text-muted-foreground">3. Publier la règle dans le bloc `Règles de la zone`</p>
            </CardContent>
          </Card>

          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Sélection courante
              </CardTitle>
              <CardDescription>
                C’est ici que tu ajustes le segment source, son interprétation et la règle à créer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              {selection ? (
                <Textarea
                  ref={selectionEditorRef}
                  value={selection.text}
                  disabled={!data.permissions.canEditCalibration}
                  onChange={(event) => {
                    setSelectedExcerptId(null);
                    setSelection((current) => current ? { ...current, text: event.target.value } : current);
                    }}
                    rows={8}
                    placeholder="Le texte source du segment peut être corrigé, complété ou simplifié ici avant enregistrement."
                    className="min-h-[180px] resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  />
                ) : "Sélectionne directement un texte dans le PDF ou utilise un segment retrouvé à gauche."}
              </div>
              {activeVisualCapture ? (
                <div className="rounded-2xl border bg-muted/10 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">Pièce visuelle</Badge>
                    <span>page {activeVisualCapture.pageNumber}</span>
                  </div>
                  <img
                    src={activeVisualCapture.previewDataUrl}
                    alt={`Pièce visuelle page ${activeVisualCapture.pageNumber}`}
                    className="max-h-52 rounded-lg border bg-white object-contain"
                  />
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  value={selectionArticleCode || "__none__"}
                  disabled={!data.permissions.canEditCalibration}
                  onValueChange={(value) => {
                    setSelectedExcerptId(null);
                    setSelectionArticleCode(value === "__none__" ? "" : value);
                  }}
                >
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
                  disabled={!data.permissions.canEditCalibration}
                  onChange={(event) => {
                    setSelectedExcerptId(null);
                    setSelectionLabel(event.target.value);
                  }}
                  placeholder="Ancre ou libellé du segment"
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {selection?.pageNumber ? (
                  <span>
                    {selection.pageEndNumber && selection.pageEndNumber > selection.pageNumber
                      ? `pages ${selection.pageNumber} à ${selection.pageEndNumber}`
                      : `page ${selection.pageNumber}`}
                  </span>
                ) : null}
                {selectedSegmentId ? <span>segment source déjà enregistré</span> : <span>segment source non enregistré</span>}
              </div>
              <TooltipProvider delayDuration={120}>
                <div className="space-y-3 rounded-2xl border bg-muted/10 p-4">
                  <div className="text-sm font-medium">Interprétation et règle ferme</div>
                  <RuleFieldHelp
                    label="Saisie rapide"
                    help={`Parle naturellement au système pour préremplir la règle.\nExemples : "Hauteur 15 m", "Recul voie 5 m", "2 places par logement".`}
                  >
                    <div className="flex gap-2">
                      <Input
                        value={quickRuleInput}
                        disabled={!data.permissions.canEditCalibration}
                        onChange={(event) => setQuickRuleInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            applyQuickRuleInput();
                          }
                        }}
                        placeholder='Ex : "Hauteur 15 m" ou "Stationnement 2 places / logement"'
                      />
                      <Button type="button" variant="outline" onClick={applyQuickRuleInput} disabled={!data.permissions.canEditCalibration}>
                        <Sparkles className="h-4 w-4" />
                        Interpréter
                      </Button>
                    </div>
                  </RuleFieldHelp>
                  <RuleFieldHelp
                    label="Thème métier"
                    help={`Classe la règle dans la bonne famille pour l'analyse.\nExemples : hauteur, stationnement, emprise au sol, recul voie, aspect extérieur.`}
                  >
                    <Select value={ruleDraft.themeCode || "__none__"} disabled={!data.permissions.canEditCalibration} onValueChange={(value) => setRuleDraft((current) => ({ ...current, themeCode: value === "__none__" ? "" : value }))}>
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
                  </RuleFieldHelp>
                  <RuleFieldHelp
                    label="Libellé de la règle"
                    help={`Titre court et lisible de la règle.\nExemples : "Hauteur maximale", "Stationnement logements", "Occupations interdites".`}
                  >
                    <Input
                      value={ruleDraft.ruleLabel}
                      disabled={!data.permissions.canEditCalibration}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, ruleLabel: event.target.value }))}
                      placeholder="Libellé de la règle"
                    />
                  </RuleFieldHelp>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <RuleFieldHelp
                      label="Opérateur"
                      help={`Définit la logique de la règle.\nExemples : =, <=, >=, interdit, autorisé, soumis à condition.`}
                    >
                      <Input
                        value={ruleDraft.operator}
                        disabled={!data.permissions.canEditCalibration}
                        onChange={(event) => setRuleDraft((current) => ({ ...current, operator: event.target.value }))}
                        placeholder="Opérateur"
                      />
                    </RuleFieldHelp>
                    <RuleFieldHelp
                      label="Valeur numérique"
                      help={`À renseigner si la règle porte sur un chiffre.\nExemples : 15, 5, 2, 30.`}
                    >
                      <Input
                        value={ruleDraft.valueNumeric}
                        disabled={!data.permissions.canEditCalibration}
                        onChange={(event) => setRuleDraft((current) => ({ ...current, valueNumeric: event.target.value }))}
                        placeholder="Valeur numérique"
                      />
                    </RuleFieldHelp>
                    <RuleFieldHelp
                      label="Unité"
                      help={`Unité associée à la valeur numérique.\nExemples : m, m², %, place/logement, place/50 m².`}
                    >
                      <Input
                        value={ruleDraft.unit}
                        disabled={!data.permissions.canEditCalibration}
                        onChange={(event) => setRuleDraft((current) => ({ ...current, unit: event.target.value }))}
                        placeholder="Unité"
                      />
                    </RuleFieldHelp>
                  </div>
                  <RuleFieldHelp
                    label="Valeur textuelle"
                    help={`À utiliser quand la règle ne se résume pas à un chiffre.\nExemples : "2 places par logement", "Aucune place exigée", "Construction interdite".`}
                  >
                    <Textarea
                      value={ruleDraft.valueText}
                      disabled={!data.permissions.canEditCalibration}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, valueText: event.target.value }))}
                      placeholder="Valeur textuelle"
                      rows={2}
                    />
                  </RuleFieldHelp>
                  <RuleFieldHelp
                    label="Condition"
                    help={`À remplir si la règle ne s'applique que dans un cas particulier.\nExemples : "en cas de changement de destination", "pour les logements de deux pièces et plus".`}
                  >
                    <Textarea
                      value={ruleDraft.conditionText}
                      disabled={!data.permissions.canEditCalibration}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, conditionText: event.target.value }))}
                      placeholder="Condition"
                      rows={2}
                    />
                  </RuleFieldHelp>
                  <RuleFieldHelp
                    label="Interprétation réglementaire"
                    help={`Ta reformulation métier de la règle en français simple.\nElle sert à clarifier le sens de l'article pour les futures analyses.`}
                  >
                    <Textarea
                      value={ruleDraft.interpretationNote}
                      disabled={!data.permissions.canEditCalibration}
                      onChange={(event) => setRuleDraft((current) => ({ ...current, interpretationNote: event.target.value }))}
                      placeholder="Interprétation réglementaire"
                      rows={3}
                    />
                  </RuleFieldHelp>
                  <RuleFieldHelp
                    label="Pièce visuelle / croquis"
                    help={`Décris ici le schéma, croquis ou détail graphique utile à la règle.\nExemples : "croquis montrant une bande de recul", "profil de hauteur", "schéma d'implantation".`}
                  >
                    <Textarea
                      value={visualSupportNote}
                      disabled={!data.permissions.canEditCalibration}
                      onChange={(event) => setVisualSupportNote(event.target.value)}
                      placeholder="Pièce visuelle / croquis si besoin : décris ici l’élément graphique à prendre en compte"
                      rows={2}
                    />
                  </RuleFieldHelp>
                </div>
              </TooltipProvider>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!data.permissions.canEditCalibration || createSegmentMutation.isPending || updateSegmentMutation.isPending || !selection?.text || !selection?.pageNumber || !ruleDraft.themeCode}
                  onClick={() => {
                    void saveCurrentSegment();
                  }}
                >
                  {createSegmentMutation.isPending || updateSegmentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer le segment
                </Button>
                <Button
                  disabled={
                    !data.permissions.canEditCalibration
                    ||
                    createRuleMutation.isPending
                    || createExcerptMutation.isPending
                    || !selection?.text
                    || !selection?.pageNumber
                    || !ruleDraft.themeCode
                    || !ruleDraft.ruleLabel.trim()
                  }
                  onClick={() => {
                    void handleCreateRuleFromSelection();
                  }}
                >
                  {createRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Créer / mettre à jour la règle
                </Button>
                <Button variant="outline" disabled={!data.permissions.canEditCalibration} onClick={() => setManualArticleMode((current) => !current)}>
                  <FilePlus2 className="h-4 w-4" />
                  Ajouter un ancrage manquant
                </Button>
              </div>

              {!data.permissions.canEditCalibration && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Ce workspace est actuellement en lecture seule pour ton profil.
                </div>
              )}

              {manualArticleMode && (
                <div className="space-y-3 rounded-2xl border bg-muted/10 p-4">
                  <div className="text-sm font-medium">Ancrage manuel</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={manualArticle.articleCode}
                      disabled={!data.permissions.canEditCalibration}
                      onChange={(event) => setManualArticle((current) => ({ ...current, articleCode: event.target.value }))}
                      placeholder="Article ou ancre (ex : 12, Stationnement, OAP 1)"
                    />
                    <Input
                      value={manualArticle.sourcePage}
                      disabled={!data.permissions.canEditCalibration}
                      onChange={(event) => setManualArticle((current) => ({ ...current, sourcePage: event.target.value }))}
                      inputMode="numeric"
                      placeholder="Page source"
                    />
                  </div>
                  <Input
                    value={manualArticle.label}
                    disabled={!data.permissions.canEditCalibration}
                    onChange={(event) => setManualArticle((current) => ({ ...current, label: event.target.value }))}
                      placeholder="Libellé de l’ancre source"
                  />
                  <Textarea
                    value={manualArticle.sourceText}
                    disabled={!data.permissions.canEditCalibration}
                    onChange={(event) => setManualArticle((current) => ({ ...current, sourceText: event.target.value }))}
                    placeholder="Texte source"
                    rows={6}
                  />
                  <Button
                    disabled={!data.permissions.canEditCalibration || createSegmentMutation.isPending || !manualArticle.sourceText.trim() || !parsePositiveInt(manualArticle.sourcePage)}
                    onClick={() => {
                      const sourcePage = parsePositiveInt(manualArticle.sourcePage);
                      if (!sourcePage) return;
                      createSegmentMutation.mutate({
                        sourceTextFull: manualArticle.sourceText,
                        sourcePageStart: sourcePage,
                        sourcePageEnd: null,
                        themeCode: ruleDraft.themeCode || "conditions_particulieres",
                        anchorType: manualArticle.articleCode.trim() ? "article" : "free_text_block",
                        anchorLabel: manualArticle.label || (manualArticle.articleCode.trim() ? `Article ${manualArticle.articleCode.trim()}` : null),
                      });
                    }}
                  >
                    {createSegmentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Enregistrer le segment manuel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card ref={zoneRulesRef} className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                Règles de la zone
              </CardTitle>
              <CardDescription>
                Les règles créées arrivent ici en brouillon. Seules celles passées en `Publié` apparaissent dans `Règles effectives`.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[360px] pr-3">
                <div className="space-y-3">
                  {sortedZoneRules.length > 0 ? sortedZoneRules.map((rule) => {
                    const badge = getStatusBadge(rule.status);
                    return (
                      <div key={rule.id} className="overflow-hidden rounded-xl border bg-muted/10 p-3">
                        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{rule.articleCode ? `Art. ${rule.articleCode}` : "Ancre libre"}</Badge>
                            <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                          </div>
                          <div className="min-w-0 space-y-2">
                            <p className="text-sm font-semibold leading-snug text-primary break-words">
                              {rule.ruleLabel}
                            </p>
                            {rule.visualCapture ? (
                              <div className="space-y-2 rounded-xl border bg-background/70 p-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline">Preuve graphique</Badge>
                                  <span>page {rule.visualCapture.pageNumber}</span>
                                  {rule.excerptSelectionLabel ? <span>{rule.excerptSelectionLabel}</span> : null}
                                </div>
                                <img
                                  src={rule.visualCapture.previewDataUrl}
                                  alt={`Croquis indexé page ${rule.visualCapture.pageNumber}`}
                                  className="max-h-36 rounded-lg border bg-white object-contain"
                                />
                                {rule.visualSupportNote ? (
                                  <p className="text-xs leading-snug text-muted-foreground break-words whitespace-pre-wrap">
                                    {rule.visualSupportNote}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            <p className="text-sm font-medium leading-snug break-words whitespace-pre-wrap">
                              {formatRuleValue(rule)}
                            </p>
                            {rule.conditionText && (
                              <p className="text-xs leading-snug text-muted-foreground break-words whitespace-pre-wrap">
                                {rule.conditionText}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {rule.document?.title ? `${rule.document.title} · ` : ""}
                              page {rule.sourcePage}
                            </p>
                          </div>
                          <div className="flex md:justify-end">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => setDetailRule(rule)}>
                                Voir le détail
                              </Button>
                              {data.permissions.canEditCalibration && (
                                <Button size="sm" variant="outline" onClick={() => openRuleEditor(rule)}>
                                  <PencilLine className="h-4 w-4" />
                                  Modifier
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {data.permissions.canPublishRules && rule.status !== "validated" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateRuleStatusMutation.mutate({ ruleId: rule.id, status: "validated" })}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Valider
                            </Button>
                          )}
                          {data.permissions.canPublishRules && rule.status !== "published" && (
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

          <Dialog open={!!detailRule} onOpenChange={(open) => !open && setDetailRule(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Détail de la règle</DialogTitle>
                <DialogDescription>
                  Lecture complète de la règle sans étirer la zone de travail.
                </DialogDescription>
              </DialogHeader>
              {detailRule && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{detailRule.articleCode ? `Art. ${detailRule.articleCode}` : "Ancre libre"}</Badge>
                    <Badge variant="outline" className={getStatusBadge(detailRule.status).className}>
                      {getStatusBadge(detailRule.status).label}
                    </Badge>
                  </div>
                  <div className="space-y-2 rounded-xl border bg-muted/10 p-4">
                    {detailRule.visualCapture ? (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preuve graphique</div>
                        <div className="mt-2 space-y-2 rounded-xl border bg-background/70 p-3">
                          <div className="text-xs text-muted-foreground">
                            page {detailRule.visualCapture.pageNumber}
                            {detailRule.excerptSelectionLabel ? ` · ${detailRule.excerptSelectionLabel}` : ""}
                          </div>
                          <img
                            src={detailRule.visualCapture.previewDataUrl}
                            alt={`Croquis indexé page ${detailRule.visualCapture.pageNumber}`}
                            className="max-h-72 rounded-lg border bg-white object-contain"
                          />
                          {detailRule.visualSupportNote ? (
                            <p className="text-sm leading-snug break-words whitespace-pre-wrap">
                              {detailRule.visualSupportNote}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Libellé</div>
                      <p className="mt-1 text-sm font-medium leading-snug break-words whitespace-pre-wrap">{detailRule.ruleLabel}</p>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valeur interprétée</div>
                      <p className="mt-1 text-sm leading-snug break-words whitespace-pre-wrap">{formatRuleValue(detailRule)}</p>
                    </div>
                    {detailRule.conditionText && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condition</div>
                        <p className="mt-1 text-sm leading-snug break-words whitespace-pre-wrap">{detailRule.conditionText}</p>
                      </div>
                    )}
                    {detailRule.interpretationNote && (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interprétation</div>
                        <p className="mt-1 text-sm leading-snug break-words whitespace-pre-wrap">{detailRule.interpretationNote}</p>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {detailRule.document?.title ? `${detailRule.document.title} · ` : ""}
                        page {detailRule.sourcePage}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Modifier la règle</DialogTitle>
                  <DialogDescription>
                  Ajuste le contenu structuré de la règle sans recréer le segment source.
                  </DialogDescription>
              </DialogHeader>
              {editingRule && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={editingRuleDraft.articleCode}
                      onChange={(event) => setEditingRuleDraft((current) => ({ ...current, articleCode: event.target.value }))}
                      placeholder="Article"
                    />
                    <Select
                      value={editingRuleDraft.themeCode || "__none__"}
                      onValueChange={(value) => setEditingRuleDraft((current) => ({ ...current, themeCode: value === "__none__" ? "" : value }))}
                    >
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
                  </div>
                  <Input
                    value={editingRuleDraft.ruleLabel}
                    onChange={(event) => setEditingRuleDraft((current) => ({ ...current, ruleLabel: event.target.value }))}
                    placeholder="Libellé"
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input value={editingRuleDraft.operator} onChange={(event) => setEditingRuleDraft((current) => ({ ...current, operator: event.target.value }))} placeholder="Opérateur" />
                    <Input value={editingRuleDraft.valueNumeric} onChange={(event) => setEditingRuleDraft((current) => ({ ...current, valueNumeric: event.target.value }))} placeholder="Valeur numérique" />
                    <Input value={editingRuleDraft.unit} onChange={(event) => setEditingRuleDraft((current) => ({ ...current, unit: event.target.value }))} placeholder="Unité" />
                  </div>
                  <Textarea value={editingRuleDraft.valueText} onChange={(event) => setEditingRuleDraft((current) => ({ ...current, valueText: event.target.value }))} placeholder="Valeur textuelle" rows={2} />
                  <Textarea value={editingRuleDraft.conditionText} onChange={(event) => setEditingRuleDraft((current) => ({ ...current, conditionText: event.target.value }))} placeholder="Condition" rows={2} />
                  <Textarea value={editingRuleDraft.interpretationNote} onChange={(event) => setEditingRuleDraft((current) => ({ ...current, interpretationNote: event.target.value }))} placeholder="Interprétation réglementaire" rows={4} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditingRule(null)}>
                      Annuler
                    </Button>
                    <Button
                      disabled={updateRuleMutation.isPending || !editingRuleDraft.ruleLabel.trim() || !editingRuleDraft.themeCode}
                      onClick={() => updateRuleMutation.mutate({ ruleId: editingRule.id })}
                    >
                      {updateRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer les modifications
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
