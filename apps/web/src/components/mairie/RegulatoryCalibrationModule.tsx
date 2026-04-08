import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, ChevronRight, Eye, FilePenLine, Layers3, LibraryBig, Loader2, MapPin, ScrollText, Search, Send, Sparkles, Trash2, UploadCloud } from "lucide-react";
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
  searchKeywords: string[];
  referenceStartPage: number | null;
  referenceEndPage: number | null;
  displayOrder: number;
  isActive: boolean;
};

type OverlayItem = {
  id: string;
  communeId: string;
  overlayCode: string;
  overlayLabel: string | null;
  overlayType: string;
  geometryRef: string | null;
  guidanceNotes: string | null;
  priority: number;
  status: string;
  isActive: boolean;
};

type OverlayBindingItem = {
  id: string;
  communeId: string;
  overlayId: string;
  documentId: string;
  role: string;
  structureMode: string;
  sourcePriority: number;
  isPrimary: boolean;
};

type ThemeItem = {
  code: string;
  label: string;
  description: string | null;
  articleHint: string | null;
};

type CalibrationThemePayload = {
  themes: ThemeItem[];
  articleReference: Array<{ code: string; label: string }>;
  overlayTypes: string[];
  normativeEffects: string[];
  proceduralEffects: string[];
  relationTypes: string[];
  relationResolutionStatuses: string[];
  structureModes: string[];
  ruleAnchorTypes: string[];
};

type RuleRelationItem = {
  id: string;
  sourceRuleId: string;
  targetRuleId: string | null;
  sourceDocumentId: string;
  targetDocumentId: string | null;
  relationType: string;
  relationScope: string;
  conditionText: string | null;
  priorityNote: string | null;
  sourceRuleLabel: string;
  sourceRuleStatus: string | null;
  sourceResolutionStatus: string | null;
  targetRuleLabel: string | null;
  targetRuleStatus: string | null;
  targetRuleTarget: string | null;
  sourceDocumentLabel: string | null;
  targetDocumentLabel: string | null;
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
  overlays: OverlayItem[];
  bindings: OverlayBindingItem[];
  themes: ThemeItem[];
  articleReference: Array<{ code: string; label: string }>;
  pages: Array<{ pageNumber: number; text: string; startOffset: number; endOffset: number }>;
  excerpts: Array<{
    id: string;
    zoneId: string | null;
    overlayId: string | null;
    articleCode: string | null;
    selectionLabel: string | null;
    sourceText: string;
    sourcePage: number;
    sourcePageEnd: number | null;
    status: string;
    aiSuggested: boolean;
    zone: ZoneItem | null;
    overlay: OverlayItem | null;
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
      overlayId: string | null;
      overlayType: string | null;
      normativeEffect: string;
      proceduralEffect: string;
      applicabilityScope: string;
      ruleAnchorType: string;
      ruleAnchorLabel: string | null;
      conflictResolutionStatus: string;
      sourceText: string;
      sourcePage: number;
      confidenceScore: number | null;
      conflictFlag: boolean;
      status: string;
      isRelationalRule: boolean;
      requiresCrossDocumentResolution: boolean;
      resolutionStatus: string;
      linkedRuleCount: number;
    }>;
    relationSignals: Array<{
      relationType: string;
      label: string;
      matchedText: string;
      conditionText: string;
    }>;
  }>;
  relations: RuleRelationItem[];
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
    relationCount: number;
    historyCount: number;
  };
  rules: Array<{
    id: string;
    zoneId: string | null;
    zoneCode: string | null;
    zoneLabel: string | null;
    overlayId: string | null;
    overlayCode: string | null;
    overlayLabel: string | null;
    overlayType: string | null;
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
    sourcePageEnd: number | null;
    confidenceScore: number | null;
    conflictFlag: boolean;
    status: string;
    publishedAt: string | null;
    normativeEffect: string;
    proceduralEffect: string;
    applicabilityScope: string;
    ruleAnchorType: string;
    ruleAnchorLabel: string | null;
    conflictResolutionStatus: string;
    isRelationalRule: boolean;
    requiresCrossDocumentResolution: boolean;
    resolutionStatus: string;
    linkedRuleCount: number;
    documentTitle: string | null;
  }>;
  relations: RuleRelationItem[];
  conflicts: Array<{ id: string; conflictSummary: string; status: string }>;
  history: Array<{ id: string; entityType: string; action: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
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

function getNormativeEffectLabel(effect: string | null | undefined) {
  switch (effect) {
    case "substitutive":
      return "Substitutive";
    case "additive":
      return "Complémentaire";
    case "restrictive":
      return "Restrictive";
    case "informative":
      return "Informative";
    default:
      return "Principale";
  }
}

function getProceduralEffectLabel(effect: string | null | undefined) {
  switch (effect) {
    case "abf_required":
      return "Avis ABF requis";
    case "manual_review_required":
      return "Revue manuelle";
    case "special_authorization_possible":
      return "Autorisation spéciale";
    case "delay_extension_watch":
      return "Délais à surveiller";
    default:
      return "Sans effet procédural";
  }
}

function getRelationTypeLabel(type: string | null | undefined) {
  switch (type) {
    case "depends_on":
      return "Depend de";
    case "complements":
      return "Complete";
    case "restricts":
      return "Restreint";
    case "substitutes":
      return "Se substitue a";
    case "procedural_dependency":
      return "Dependance procedurale";
    case "cross_checks_with":
      return "A croiser avec";
    case "exception_to":
      return "Exception a";
    case "derived_from":
      return "Derive de";
    default:
      return "Reference";
  }
}

function getRelationResolutionLabel(status: string | null | undefined) {
  switch (status) {
    case "complete":
      return "Complet";
    case "partial":
      return "Partiel";
    case "unresolved":
      return "Non resolu";
    default:
      return "Autonome";
  }
}

function detectRelationSignalsFromText(text: string) {
  const patterns = [
    { relationType: "depends_on", label: "Sous reserve de", pattern: /\bsous réserve de\b/i },
    { relationType: "depends_on", label: "A condition de respecter", pattern: /\bà condition de respecter\b/i },
    { relationType: "references", label: "Conformement a", pattern: /\bconformément à\b/i },
    { relationType: "restricts", label: "Sauf dispositions de", pattern: /\bsauf dispositions de\b/i },
    { relationType: "procedural_dependency", label: "En application de", pattern: /\ben application de\b/i },
  ];

  return patterns.flatMap((entry) => entry.pattern.test(text) ? [{ relationType: entry.relationType, label: entry.label }] : []);
}

function getRuleTargetLabel(rule: Pick<LibraryResponse["rules"][number], "zoneCode" | "overlayCode" | "overlayType">) {
  if (rule.zoneCode && rule.overlayCode) return `${rule.zoneCode} + ${rule.overlayCode}`;
  if (rule.zoneCode) return rule.zoneCode;
  if (rule.overlayCode) return `${rule.overlayType || "Overlay"} · ${rule.overlayCode}`;
  return "Cible non définie";
}

function formatRuleValue(rule: LibraryResponse["rules"][number] | WorkspaceData["excerpts"][number]["rules"][number]) {
  const numeric = typeof rule.valueNumeric === "number" ? `${rule.operator || ""} ${rule.valueNumeric}${rule.unit ? ` ${rule.unit}` : ""}`.trim() : null;
  return numeric || rule.valueText || "Valeur non structurée";
}

function buildRuleEditorDraft(rule: LibraryResponse["rules"][number]) {
  return {
    zoneId: rule.zoneId || "",
    overlayId: rule.overlayId || "",
    articleCode: rule.articleCode || "",
    themeCode: rule.themeCode || "",
    ruleLabel: rule.ruleLabel || "",
    operator: rule.operator || "",
    valueNumeric: typeof rule.valueNumeric === "number" ? String(rule.valueNumeric) : "",
    valueText: rule.valueText || "",
    unit: rule.unit || "",
    conditionText: rule.conditionText || "",
    interpretationNote: rule.interpretationNote || "",
    normativeEffect: rule.normativeEffect || "primary",
    proceduralEffect: rule.proceduralEffect || "none",
    applicabilityScope: rule.applicabilityScope || "main_zone",
    ruleAnchorType: rule.ruleAnchorType || "article",
    ruleAnchorLabel: rule.ruleAnchorLabel || "",
    conflictResolutionStatus: rule.conflictResolutionStatus || "none",
  };
}

function buildZoneEditorDraft(zone: ZoneItem) {
  return {
    zoneCode: zone.zoneCode || "",
    zoneLabel: zone.zoneLabel || "",
    parentZoneCode: zone.parentZoneCode || "",
    guidanceNotes: zone.guidanceNotes || "",
    searchKeywordsText: (zone.searchKeywords || []).join(", "),
    referenceStartPage: zone.referenceStartPage ? String(zone.referenceStartPage) : "",
    referenceEndPage: zone.referenceEndPage ? String(zone.referenceEndPage) : "",
  };
}

function buildOverlayEditorDraft(overlay: OverlayItem) {
  return {
    overlayCode: overlay.overlayCode || "",
    overlayLabel: overlay.overlayLabel || "",
    overlayType: overlay.overlayType || "SPR",
    guidanceNotes: overlay.guidanceNotes || "",
    geometryRef: overlay.geometryRef || "",
    priority: String(overlay.priority ?? 0),
    status: overlay.status || "draft",
  };
}

function buildEmptyRuleDraft() {
  return {
    themeCode: "",
    ruleLabel: "",
    operator: "",
    valueNumeric: "",
    valueText: "",
    unit: "",
    conditionText: "",
    interpretationNote: "",
    normativeEffect: "primary",
    proceduralEffect: "none",
    applicabilityScope: "main_zone",
    ruleAnchorType: "article",
    ruleAnchorLabel: "",
    conflictResolutionStatus: "none",
  };
}

function buildEmptyRelationDraft() {
  return {
    targetRuleId: "",
    targetDocumentId: "",
    relationType: "references",
    relationScope: "rule",
    conditionText: "",
    priorityNote: "",
  };
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
    { patterns: ["hauteur", "faitage", "egout"], candidates: ["hauteur", "height"] },
    { patterns: ["stationnement", "parking", "velo", "place"], candidates: ["stationnement", "parking"] },
    { patterns: ["emprise", "ces"], candidates: ["emprise_sol", "footprint"] },
    { patterns: ["recul", "voie", "alignement"], candidates: ["recul_voie", "setback_public"] },
    { patterns: ["limite separative", "limites separatives", "fond de parcelle", "distance entre batiments"], candidates: ["recul_limite", "setback_side", "setback_rear", "distance_entre_batiments"] },
    { patterns: ["pleine terre", "espaces verts", "plantation", "biotope"], candidates: ["pleine_terre", "espaces_verts", "green_space", "coefficient_biotope", "plantations"] },
    { patterns: ["materiau", "facade", "toiture", "cloture", "aspect exterieur"], candidates: ["materiaux", "aspect_exterieur", "facades", "toiture", "clotures"] },
    { patterns: ["risque", "ppri", "pprt", "spr", "servitude", "abf"], candidates: ["risques", "servitudes"] },
    { patterns: ["assainissement", "eaux usees"], candidates: ["assainissement", "reseaux"] },
    { patterns: ["eaux pluviales"], candidates: ["eaux_pluviales", "reseaux"] },
    { patterns: ["acces", "voirie", "pompiers"], candidates: ["acces_voirie", "acces_pompiers"] },
    { patterns: ["destination", "usage", "interdit", "condition"], candidates: ["destination", "interdictions", "conditions_particulieres"] },
  ];

  for (const definition of definitions) {
    if (!definition.patterns.some((pattern) => normalized.includes(pattern))) continue;
    const matchedTheme = themes.find((theme) => {
      const themeCode = normalizeQuickText(theme.code);
      const themeLabel = normalizeQuickText(theme.label);
      return definition.candidates.some((candidate) => themeCode.includes(candidate) || themeLabel.includes(candidate));
    });
    if (matchedTheme) return matchedTheme;
  }

  return themes.find((theme) => {
    const themeCode = normalizeQuickText(theme.code.replaceAll("_", " "));
    const themeLabel = normalizeQuickText(theme.label);
    return normalized.includes(themeCode) || normalized.includes(themeLabel);
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
    ...buildEmptyRuleDraft(),
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

function parseOptionalPositiveInteger(raw: string) {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeSearchText(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferArticleCodeFromText(raw: string) {
  const articleMatch = raw.match(/\b(?:[A-Z0-9-]+\s*-\s*)?ARTICLE\s*(\d{1,2})\b/i) || raw.match(/\bART\.?\s*(\d{1,2})\b/i);
  return articleMatch?.[1] || null;
}

function buildZoneKeywordMatchSnippet(lines: string[], index: number) {
  const window = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2));
  return window.join(" ").replace(/\s+/g, " ").trim();
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
  const [zoneForm, setZoneForm] = useState({
    zoneCode: "",
    zoneLabel: "",
    parentZoneCode: "",
    guidanceNotes: "",
    searchKeywordsText: "",
    referenceStartPage: "",
    referenceEndPage: "",
  });
  const [overlayForm, setOverlayForm] = useState({
    overlayCode: "",
    overlayLabel: "",
    overlayType: "SPR",
    guidanceNotes: "",
    geometryRef: "",
    priority: "0",
    status: "draft",
  });
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneEditorDrafts, setZoneEditorDrafts] = useState<Record<string, ReturnType<typeof buildZoneEditorDraft>>>({});
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [overlayEditorDrafts, setOverlayEditorDrafts] = useState<Record<string, ReturnType<typeof buildOverlayEditorDraft>>>({});
  const [selectionZoneId, setSelectionZoneId] = useState("");
  const [selectionOverlayId, setSelectionOverlayId] = useState("");
  const [selectionArticleCode, setSelectionArticleCode] = useState("");
  const [selectionLabel, setSelectionLabel] = useState("");
  const [pendingSelection, setPendingSelection] = useState<{ text: string; pageNumber: number } | null>(null);
  const [activeExcerptId, setActiveExcerptId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleEditorDrafts, setRuleEditorDrafts] = useState<Record<string, ReturnType<typeof buildRuleEditorDraft>>>({});
  const [editingRelationId, setEditingRelationId] = useState<string | null>(null);
  const [relationDrafts, setRelationDrafts] = useState<Record<string, ReturnType<typeof buildEmptyRelationDraft>>>({});
  const [documentOverlayDrafts, setDocumentOverlayDrafts] = useState<Record<string, {
    overlayId: string;
    role: string;
    structureMode: string;
    sourcePriority: string;
    isPrimary: boolean;
  }>>({});
  const [libraryOverlayFilter, setLibraryOverlayFilter] = useState("all");
  const [libraryNormativeFilter, setLibraryNormativeFilter] = useState("all");
  const [libraryProceduralFilter, setLibraryProceduralFilter] = useState("all");
  const [quickRuleInputs, setQuickRuleInputs] = useState<Record<string, string>>({});
  const [expandedGuidanceZoneIds, setExpandedGuidanceZoneIds] = useState<string[]>([]);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, {
    themeCode: string;
    ruleLabel: string;
    operator: string;
    valueNumeric: string;
    valueText: string;
    unit: string;
    conditionText: string;
    interpretationNote: string;
    normativeEffect: string;
    proceduralEffect: string;
    applicabilityScope: string;
    ruleAnchorType: string;
    ruleAnchorLabel: string;
    conflictResolutionStatus: string;
  }>>({});

  const { data: themesData, error: themesError } = useQuery<CalibrationThemePayload>({
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

  const { data: overlaysData, isLoading: loadingOverlays, error: overlaysError } = useQuery<{ commune: string; communeId: string; overlays: OverlayItem[] }>({
    queryKey: ["reg-calibration-overlays", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/overlays?commune=${encodeURIComponent(currentCommune)}`),
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
    queryClient.invalidateQueries({ queryKey: ["reg-calibration-overlays", currentCommune] });
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
        searchKeywords: zoneForm.searchKeywordsText,
        referenceStartPage: parseOptionalPositiveInteger(zoneForm.referenceStartPage),
        referenceEndPage: parseOptionalPositiveInteger(zoneForm.referenceEndPage),
      }),
    }),
    onSuccess: () => {
      setZoneForm({
        zoneCode: "",
        zoneLabel: "",
        parentZoneCode: "",
        guidanceNotes: "",
        searchKeywordsText: "",
        referenceStartPage: "",
        referenceEndPage: "",
      });
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

  const createOverlayMutation = useMutation({
    mutationFn: async () => apiFetch("/api/mairie/regulatory-calibration/overlays", {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        overlayCode: overlayForm.overlayCode,
        overlayLabel: overlayForm.overlayLabel,
        overlayType: overlayForm.overlayType,
        guidanceNotes: overlayForm.guidanceNotes,
        geometryRef: overlayForm.geometryRef,
        priority: overlayForm.priority,
        status: overlayForm.status,
      }),
    }),
    onSuccess: () => {
      setOverlayForm({
        overlayCode: "",
        overlayLabel: "",
        overlayType: themesData?.overlayTypes?.[0] || "SPR",
        guidanceNotes: "",
        geometryRef: "",
        priority: "0",
        status: "draft",
      });
      refreshCalibration();
      toast({ title: "Couche créée", description: "La couche réglementaire est disponible pour le calibrage." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateOverlayMutation = useMutation({
    mutationFn: async ({ overlayId, draft }: { overlayId: string; draft: ReturnType<typeof buildOverlayEditorDraft> }) => apiFetch(`/api/mairie/regulatory-calibration/overlays/${overlayId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        overlayCode: draft.overlayCode,
        overlayLabel: draft.overlayLabel,
        overlayType: draft.overlayType,
        guidanceNotes: draft.guidanceNotes,
        geometryRef: draft.geometryRef,
        priority: draft.priority,
        status: draft.status,
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setEditingOverlayId((current) => (current === variables.overlayId ? null : current));
      toast({ title: "Couche modifiée", description: "La couche réglementaire a été mise à jour." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteOverlayMutation = useMutation({
    mutationFn: async (overlayId: string) => apiFetch(`/api/mairie/regulatory-calibration/overlays/${overlayId}?commune=${encodeURIComponent(currentCommune)}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      refreshCalibration();
      toast({ title: "Couche supprimée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({ zoneId, draft }: { zoneId: string; draft: ReturnType<typeof buildZoneEditorDraft> }) => apiFetch(`/api/mairie/regulatory-calibration/zones/${zoneId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        zoneCode: draft.zoneCode,
        zoneLabel: draft.zoneLabel,
        parentZoneCode: draft.parentZoneCode,
        guidanceNotes: draft.guidanceNotes,
        searchKeywords: draft.searchKeywordsText,
        referenceStartPage: parseOptionalPositiveInteger(draft.referenceStartPage),
        referenceEndPage: parseOptionalPositiveInteger(draft.referenceEndPage),
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setEditingZoneId((current) => (current === variables.zoneId ? null : current));
      toast({ title: "Zone modifiée", description: "La zone a été mise à jour." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createExcerptMutation = useMutation({
    mutationFn: async () => apiFetch("/api/mairie/regulatory-calibration/excerpts", {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        zoneId: selectionZoneId || null,
        overlayId: selectionOverlayId || null,
        documentId: selectedDocumentId,
        articleCode: selectionArticleCode || null,
        selectionLabel,
        sourceText: pendingSelection?.text,
        sourcePage: pendingSelection?.pageNumber,
      }),
    }),
    onSuccess: (payload) => {
      refreshCalibration();
      setActiveExcerptId(payload.excerpt.id);
      setSelectionLabel("");
      setSelectionArticleCode("");
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
        normativeEffect: draft.normativeEffect,
        proceduralEffect: draft.proceduralEffect,
        applicabilityScope: draft.applicabilityScope,
        ruleAnchorType: draft.ruleAnchorType,
        ruleAnchorLabel: draft.ruleAnchorLabel,
        conflictResolutionStatus: draft.conflictResolutionStatus,
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setRuleDrafts((current) => ({
        ...current,
        [variables.excerptId]: buildEmptyRuleDraft(),
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

  const updateRuleMutation = useMutation({
    mutationFn: async ({ ruleId, draft }: { ruleId: string; draft: ReturnType<typeof buildRuleEditorDraft> }) => apiFetch(`/api/mairie/regulatory-calibration/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        zoneId: draft.zoneId,
        overlayId: draft.overlayId,
        articleCode: draft.articleCode,
        themeCode: draft.themeCode,
        ruleLabel: draft.ruleLabel,
        operator: draft.operator,
        valueNumeric: draft.valueNumeric,
        valueText: draft.valueText,
        unit: draft.unit,
        conditionText: draft.conditionText,
        interpretationNote: draft.interpretationNote,
        normativeEffect: draft.normativeEffect,
        proceduralEffect: draft.proceduralEffect,
        applicabilityScope: draft.applicabilityScope,
        ruleAnchorType: draft.ruleAnchorType,
        ruleAnchorLabel: draft.ruleAnchorLabel,
        conflictResolutionStatus: draft.conflictResolutionStatus,
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setEditingRuleId((current) => (current === variables.ruleId ? null : current));
      toast({ title: "Règle modifiée", description: "La règle a été mise à jour dans la bibliothèque." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => apiFetch(`/api/mairie/regulatory-calibration/rules/${ruleId}?commune=${encodeURIComponent(currentCommune)}`, {
      method: "DELETE",
    }),
    onSuccess: (_payload, ruleId) => {
      refreshCalibration();
      setEditingRuleId((current) => (current === ruleId ? null : current));
      toast({ title: "Règle supprimée", description: "La règle a été retirée de la bibliothèque." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const createRelationMutation = useMutation({
    mutationFn: async ({ ruleId, draft }: { ruleId: string; draft: ReturnType<typeof buildEmptyRelationDraft> }) => apiFetch(`/api/mairie/regulatory-calibration/rules/${ruleId}/relations`, {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        targetRuleId: draft.targetRuleId || null,
        targetDocumentId: draft.targetDocumentId || null,
        relationType: draft.relationType,
        relationScope: draft.relationScope,
        conditionText: draft.conditionText,
        priorityNote: draft.priorityNote,
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setRelationDrafts((current) => ({
        ...current,
        [variables.ruleId]: buildEmptyRelationDraft(),
      }));
      toast({ title: "Lien cree", description: "La relation entre regles est maintenant tracee." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const updateRelationMutation = useMutation({
    mutationFn: async ({ relationId, draft }: { relationId: string; draft: ReturnType<typeof buildEmptyRelationDraft> }) => apiFetch(`/api/mairie/regulatory-calibration/rule-relations/${relationId}`, {
      method: "PATCH",
      body: JSON.stringify({
        commune: currentCommune,
        targetRuleId: draft.targetRuleId || null,
        targetDocumentId: draft.targetDocumentId || null,
        relationType: draft.relationType,
        relationScope: draft.relationScope,
        conditionText: draft.conditionText,
        priorityNote: draft.priorityNote,
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setEditingRelationId((current) => (current === variables.relationId ? null : current));
      toast({ title: "Lien modifie", description: "La relation a ete mise a jour." });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const deleteRelationMutation = useMutation({
    mutationFn: async (relationId: string) => apiFetch(`/api/mairie/regulatory-calibration/rule-relations/${relationId}?commune=${encodeURIComponent(currentCommune)}`, {
      method: "DELETE",
    }),
    onSuccess: (_payload, relationId) => {
      refreshCalibration();
      setEditingRelationId((current) => (current === relationId ? null : current));
      toast({ title: "Lien supprime", description: "La relation a ete retiree du graphe reglementaire." });
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

  const bindDocumentOverlayMutation = useMutation({
    mutationFn: async ({ documentId, draft }: { documentId: string; draft: NonNullable<typeof documentOverlayDrafts[string]> }) => apiFetch(`/api/mairie/regulatory-calibration/documents/${documentId}/overlay-bindings`, {
      method: "POST",
      body: JSON.stringify({
        commune: currentCommune,
        overlayId: draft.overlayId,
        role: draft.role,
        structureMode: draft.structureMode,
        sourcePriority: draft.sourcePriority,
        isPrimary: draft.isPrimary,
      }),
    }),
    onSuccess: (_payload, variables) => {
      refreshCalibration();
      setDocumentOverlayDrafts((current) => ({
        ...current,
        [variables.documentId]: {
          overlayId: "",
          role: "supporting",
          structureMode: themesData?.structureModes?.[0] || "mixed",
          sourcePriority: "0",
          isPrimary: false,
        },
      }));
      toast({ title: "Document lié", description: "Le document est désormais rattaché à cette couche réglementaire." });
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

  const canEditCalibration = currentCommune !== "all";
  const calibrationLoadError = overviewError || zonesError || overlaysError || themesError || libraryError || publishedError || (selectedDocumentId ? workspaceError : null);
  const calibrationLoadErrorMessage = calibrationLoadError instanceof Error
    ? calibrationLoadError.message
    : calibrationLoadError
      ? "Le module de calibration n'a pas pu être chargé."
      : null;

  const activeExcerpt = workspaceData?.excerpts.find((excerpt) => excerpt.id === activeExcerptId) || null;
  const activeRules = activeExcerpt?.rules || [];
  const workspaceRelationsBySource = useMemo(() => {
    const map = new Map<string, RuleRelationItem[]>();
    for (const relation of workspaceData?.relations || []) {
      const existing = map.get(relation.sourceRuleId) || [];
      existing.push(relation);
      map.set(relation.sourceRuleId, existing);
    }
    return map;
  }, [workspaceData?.relations]);
  const libraryRelationsBySource = useMemo(() => {
    const map = new Map<string, RuleRelationItem[]>();
    for (const relation of libraryData?.relations || []) {
      const existing = map.get(relation.sourceRuleId) || [];
      existing.push(relation);
      map.set(relation.sourceRuleId, existing);
    }
    return map;
  }, [libraryData?.relations]);
  const filteredLibraryRules = useMemo(() => {
    const rules = libraryData?.rules || [];
    return rules.filter((rule) => {
      if (libraryOverlayFilter !== "all" && (rule.overlayId || "") !== libraryOverlayFilter) return false;
      if (libraryNormativeFilter !== "all" && rule.normativeEffect !== libraryNormativeFilter) return false;
      if (libraryProceduralFilter !== "all" && rule.proceduralEffect !== libraryProceduralFilter) return false;
      return true;
    });
  }, [libraryData?.rules, libraryNormativeFilter, libraryOverlayFilter, libraryProceduralFilter]);
  const relationRuleCandidates = useMemo(() => {
    const rules = libraryData?.rules || [];
    return rules
      .slice()
      .sort((left, right) => left.ruleLabel.localeCompare(right.ruleLabel, "fr"));
  }, [libraryData?.rules]);

  const publishedRuleGroups = useMemo(() => {
    const rules = publishedData?.rules || [];
    return {
      main: rules.filter((rule) => !rule.overlayId && rule.normativeEffect === "primary"),
      overlays: rules.filter((rule) => !!rule.overlayId || rule.normativeEffect !== "primary"),
      procedural: rules.filter((rule) => rule.proceduralEffect !== "none"),
    };
  }, [publishedData?.rules]);

  const configuredZones = useMemo(() => {
    const zones = zonesData?.zones || workspaceData?.zones || [];
    return zones
      .filter((zone) => zone.isActive !== false)
      .slice()
      .sort((left, right) => {
        const orderDelta = (left.displayOrder || 0) - (right.displayOrder || 0);
        if (orderDelta !== 0) return orderDelta;
        return `${left.zoneCode} ${left.zoneLabel || ""}`.localeCompare(`${right.zoneCode} ${right.zoneLabel || ""}`, "fr");
      });
  }, [workspaceData?.zones, zonesData?.zones]);

  const zoneGuidanceCards = useMemo(() => {
    if (!workspaceData) return [];

    return configuredZones.map((zone) => {
      const pageStart = zone.referenceStartPage || 1;
      const pageEnd = zone.referenceEndPage || workspaceData.pages.at(-1)?.pageNumber || pageStart;
      const pagesInRange = workspaceData.pages.filter((page) => page.pageNumber >= pageStart && page.pageNumber <= pageEnd);
      const normalizedKeywords = (zone.searchKeywords || [])
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0);

      const articleAnchors = pagesInRange.flatMap((page) => {
        return page.text
          .split(/\n+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .flatMap((line) => {
            const articleCode = inferArticleCodeFromText(line);
            if (!articleCode) return [];
            return [{
              articleCode,
              pageNumber: page.pageNumber,
              label: line.replace(/\s+/g, " ").trim(),
            }];
          });
      }).filter((anchor, index, all) => all.findIndex((candidate) => candidate.articleCode === anchor.articleCode && candidate.pageNumber === anchor.pageNumber) === index);

      const keywordMatches = normalizedKeywords.flatMap((keyword) => {
        const normalizedKeyword = normalizeSearchText(keyword);
        return pagesInRange.flatMap((page) => {
          const lines = page.text
            .split(/\n+/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

          return lines.flatMap((line, index) => {
            if (!normalizeSearchText(line).includes(normalizedKeyword)) return [];
            const snippet = buildZoneKeywordMatchSnippet(lines, index);
            return [{
              keyword,
              pageNumber: page.pageNumber,
              snippet,
              articleCode: inferArticleCodeFromText(snippet),
            }];
          });
        });
      }).filter((match, index, all) => all.findIndex((candidate) => candidate.keyword === match.keyword && candidate.pageNumber === match.pageNumber && candidate.snippet === match.snippet) === index);

      return {
        zone,
        pageStart,
        pageEnd,
        pagesInRangeCount: pagesInRange.length,
        articleAnchors,
        keywordMatches,
      };
    });
  }, [configuredZones, workspaceData]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="w-full justify-start rounded-2xl bg-muted/40 p-1">
        <TabsTrigger value="zones" className="min-w-fit whitespace-nowrap px-4">Zones</TabsTrigger>
        <TabsTrigger value="documents" className="min-w-fit whitespace-nowrap px-4">Documents</TabsTrigger>
        <TabsTrigger value="calibration" className="min-w-fit whitespace-nowrap px-4">PDF + Calibration</TabsTrigger>
        <TabsTrigger value="library" className="min-w-fit whitespace-nowrap px-4">Bibliothèque</TabsTrigger>
        <TabsTrigger value="published" className="min-w-fit whitespace-nowrap px-4">Back mairie</TabsTrigger>
      </TabsList>

      <Card className="border-primary/10 shadow-sm">
        <CardContent className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.documentCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zones</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.zoneCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Overlays</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.overlayCount ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Liaisons</div>
            <div className="mt-1 text-2xl font-bold">{overviewData?.summary.overlayBindingCount ?? 0}</div>
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
          <CardContent className="grid gap-4 xl:grid-cols-[320px,minmax(0,1fr)]">
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <Input placeholder="Code zone (ex : N, UA, UDa, 1AU)" value={zoneForm.zoneCode} onChange={(e) => setZoneForm((v) => ({ ...v, zoneCode: e.target.value }))} />
              <Input placeholder="Libellé optionnel" value={zoneForm.zoneLabel} onChange={(e) => setZoneForm((v) => ({ ...v, zoneLabel: e.target.value }))} />
              <Input placeholder="Zone mère optionnelle" value={zoneForm.parentZoneCode} onChange={(e) => setZoneForm((v) => ({ ...v, parentZoneCode: e.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Page début (ex : 12)" inputMode="numeric" value={zoneForm.referenceStartPage} onChange={(e) => setZoneForm((v) => ({ ...v, referenceStartPage: e.target.value }))} />
                <Input placeholder="Page fin (ex : 18)" inputMode="numeric" value={zoneForm.referenceEndPage} onChange={(e) => setZoneForm((v) => ({ ...v, referenceEndPage: e.target.value }))} />
              </div>
              <Textarea placeholder="Notes de guidage (pages, secteur, nuances utiles)" value={zoneForm.guidanceNotes} onChange={(e) => setZoneForm((v) => ({ ...v, guidanceNotes: e.target.value }))} />
              <Textarea placeholder="Mots-clés de recherche (stationnement, changement de destination, article 12...)" value={zoneForm.searchKeywordsText} onChange={(e) => setZoneForm((v) => ({ ...v, searchKeywordsText: e.target.value }))} />
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

            <div className="min-w-0 space-y-3">
              {loadingZones ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lecture des zones…</div>
              ) : (zonesData?.zones || []).length > 0 ? (
                zonesData!.zones.map((zone) => (
                  <div key={zone.id} className="rounded-xl border bg-background p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{zone.zoneCode}</Badge>
                          {zone.parentZoneCode && <Badge variant="secondary">hérite de {zone.parentZoneCode}</Badge>}
                          {(zone.referenceStartPage || zone.referenceEndPage) && (
                            <Badge variant="outline">
                              Pages {zone.referenceStartPage || "?"}{zone.referenceEndPage && zone.referenceEndPage !== zone.referenceStartPage ? ` à ${zone.referenceEndPage}` : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium break-words">{zone.zoneLabel || `Zone ${zone.zoneCode}`}</p>
                        {zone.guidanceNotes && <p className="text-sm text-muted-foreground break-words">{zone.guidanceNotes}</p>}
                        {zone.searchKeywords?.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {zone.searchKeywords.map((keyword) => (
                              <Badge key={`${zone.id}-${keyword}`} variant="outline" className="text-[11px]">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {editingZoneId === zone.id && (
                          <div className="mt-3 space-y-3 rounded-xl border bg-muted/10 p-3">
                            <Input
                              placeholder="Code zone"
                              value={zoneEditorDrafts[zone.id]?.zoneCode || ""}
                              onChange={(e) => setZoneEditorDrafts((current) => ({
                                ...current,
                                [zone.id]: { ...buildZoneEditorDraft(zone), ...(current[zone.id] || {}), zoneCode: e.target.value },
                              }))}
                            />
                            <Input
                              placeholder="Libellé"
                              value={zoneEditorDrafts[zone.id]?.zoneLabel || ""}
                              onChange={(e) => setZoneEditorDrafts((current) => ({
                                ...current,
                                [zone.id]: { ...buildZoneEditorDraft(zone), ...(current[zone.id] || {}), zoneLabel: e.target.value },
                              }))}
                            />
                            <Input
                              placeholder="Zone mère"
                              value={zoneEditorDrafts[zone.id]?.parentZoneCode || ""}
                              onChange={(e) => setZoneEditorDrafts((current) => ({
                                ...current,
                                [zone.id]: { ...buildZoneEditorDraft(zone), ...(current[zone.id] || {}), parentZoneCode: e.target.value },
                              }))}
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                placeholder="Page début"
                                inputMode="numeric"
                                value={zoneEditorDrafts[zone.id]?.referenceStartPage || ""}
                                onChange={(e) => setZoneEditorDrafts((current) => ({
                                  ...current,
                                  [zone.id]: { ...buildZoneEditorDraft(zone), ...(current[zone.id] || {}), referenceStartPage: e.target.value },
                                }))}
                              />
                              <Input
                                placeholder="Page fin"
                                inputMode="numeric"
                                value={zoneEditorDrafts[zone.id]?.referenceEndPage || ""}
                                onChange={(e) => setZoneEditorDrafts((current) => ({
                                  ...current,
                                  [zone.id]: { ...buildZoneEditorDraft(zone), ...(current[zone.id] || {}), referenceEndPage: e.target.value },
                                }))}
                              />
                            </div>
                            <Textarea
                              placeholder="Notes de guidage"
                              value={zoneEditorDrafts[zone.id]?.guidanceNotes || ""}
                              onChange={(e) => setZoneEditorDrafts((current) => ({
                                ...current,
                                [zone.id]: { ...buildZoneEditorDraft(zone), ...(current[zone.id] || {}), guidanceNotes: e.target.value },
                              }))}
                            />
                            <Textarea
                              placeholder="Mots-clés de recherche"
                              value={zoneEditorDrafts[zone.id]?.searchKeywordsText || ""}
                              onChange={(e) => setZoneEditorDrafts((current) => ({
                                ...current,
                                [zone.id]: { ...buildZoneEditorDraft(zone), ...(current[zone.id] || {}), searchKeywordsText: e.target.value },
                              }))}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={updateZoneMutation.isPending || !(zoneEditorDrafts[zone.id]?.zoneCode || "").trim()}
                                onClick={() => updateZoneMutation.mutate({ zoneId: zone.id, draft: zoneEditorDrafts[zone.id] || buildZoneEditorDraft(zone) })}
                              >
                                {updateZoneMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                                Enregistrer
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingZoneId(null);
                                  setZoneEditorDrafts((current) => {
                                    const next = { ...current };
                                    delete next[zone.id];
                                    return next;
                                  });
                                }}
                              >
                                Annuler
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 lg:max-w-[260px] lg:justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateZoneMutation.isPending || deleteZoneMutation.isPending}
                          onClick={() => {
                            if (editingZoneId === zone.id) {
                              setEditingZoneId(null);
                              return;
                            }
                            setZoneEditorDrafts((current) => ({ ...current, [zone.id]: buildZoneEditorDraft(zone) }));
                            setEditingZoneId(zone.id);
                          }}
                        >
                          <FilePenLine className="mr-2 h-3.5 w-3.5" />
                          {editingZoneId === zone.id ? "Fermer" : "Modifier"}
                        </Button>
                        <Button variant="outline" size="sm" className="border-destructive/20 text-destructive hover:bg-destructive/5" onClick={() => {
                          if (!window.confirm(`Supprimer la zone ${zone.zoneCode} ?`)) return;
                          deleteZoneMutation.mutate(zone.id);
                        }}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Aucune zone configurée pour cette commune.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Layers3 className="w-4 h-4 text-primary" /> Couches réglementaires</CardTitle>
            <CardDescription>Les SPR, PSMV, PVAP, PPRI, PPRT, ABF et servitudes se calibrent ici comme des overlays superposés au socle de zone.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[340px,minmax(0,1fr)]">
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <Input placeholder="Code overlay (ex : SPR-Centre, PPRI-R1)" value={overlayForm.overlayCode} onChange={(e) => setOverlayForm((v) => ({ ...v, overlayCode: e.target.value }))} />
              <Input placeholder="Libellé optionnel" value={overlayForm.overlayLabel} onChange={(e) => setOverlayForm((v) => ({ ...v, overlayLabel: e.target.value }))} />
              <Select value={overlayForm.overlayType} onValueChange={(value) => setOverlayForm((v) => ({ ...v, overlayType: value }))}>
                <SelectTrigger><SelectValue placeholder="Type de couche" /></SelectTrigger>
                <SelectContent>
                  {(themesData?.overlayTypes || []).map((overlayType) => (
                    <SelectItem key={overlayType} value={overlayType}>{overlayType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Référence géométrique / périmètre" value={overlayForm.geometryRef} onChange={(e) => setOverlayForm((v) => ({ ...v, geometryRef: e.target.value }))} />
              <div className="grid gap-3 lg:grid-cols-2">
                <Input placeholder="Priorité" value={overlayForm.priority} onChange={(e) => setOverlayForm((v) => ({ ...v, priority: e.target.value }))} />
                <Input placeholder="Statut (draft, validated...)" value={overlayForm.status} onChange={(e) => setOverlayForm((v) => ({ ...v, status: e.target.value }))} />
              </div>
              <Textarea placeholder="Notes de guidage (périmètre, effet, pièces utiles)" value={overlayForm.guidanceNotes} onChange={(e) => setOverlayForm((v) => ({ ...v, guidanceNotes: e.target.value }))} />
              <Button
                className="w-full"
                disabled={!canEditCalibration || !!calibrationLoadErrorMessage || loadingOverlays || createOverlayMutation.isPending || !overlayForm.overlayCode.trim()}
                onClick={() => createOverlayMutation.mutate()}
              >
                {createOverlayMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers3 className="mr-2 h-4 w-4" />}
                Ajouter la couche
              </Button>
            </div>

            <div className="space-y-3">
              {loadingOverlays ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lecture des couches…</div>
              ) : (overlaysData?.overlays || []).length > 0 ? (
                overlaysData!.overlays.map((overlay) => (
                  <div key={overlay.id} className="rounded-xl border bg-background p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{overlay.overlayCode}</Badge>
                          <Badge variant="secondary">{overlay.overlayType}</Badge>
                          <Badge variant="outline" className={getStatusBadge(overlay.status).className}>{getStatusBadge(overlay.status).label}</Badge>
                        </div>
                        <p className="font-medium">{overlay.overlayLabel || overlay.overlayCode}</p>
                        {overlay.geometryRef && <p className="text-sm text-muted-foreground">Périmètre : {overlay.geometryRef}</p>}
                        {overlay.guidanceNotes && <p className="text-sm text-muted-foreground">{overlay.guidanceNotes}</p>}
                        {editingOverlayId === overlay.id && (
                          <div className="mt-3 space-y-3 rounded-xl border bg-muted/10 p-3">
                            <Input
                              placeholder="Code overlay"
                              value={overlayEditorDrafts[overlay.id]?.overlayCode || ""}
                              onChange={(e) => setOverlayEditorDrafts((current) => ({
                                ...current,
                                [overlay.id]: { ...buildOverlayEditorDraft(overlay), ...(current[overlay.id] || {}), overlayCode: e.target.value },
                              }))}
                            />
                            <Input
                              placeholder="Libellé"
                              value={overlayEditorDrafts[overlay.id]?.overlayLabel || ""}
                              onChange={(e) => setOverlayEditorDrafts((current) => ({
                                ...current,
                                [overlay.id]: { ...buildOverlayEditorDraft(overlay), ...(current[overlay.id] || {}), overlayLabel: e.target.value },
                              }))}
                            />
                            <Select
                              value={overlayEditorDrafts[overlay.id]?.overlayType || overlay.overlayType}
                              onValueChange={(value) => setOverlayEditorDrafts((current) => ({
                                ...current,
                                [overlay.id]: { ...buildOverlayEditorDraft(overlay), ...(current[overlay.id] || {}), overlayType: value },
                              }))}
                            >
                              <SelectTrigger><SelectValue placeholder="Type de couche" /></SelectTrigger>
                              <SelectContent>
                                {(themesData?.overlayTypes || []).map((overlayType) => (
                                  <SelectItem key={overlayType} value={overlayType}>{overlayType}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Référence géométrique"
                              value={overlayEditorDrafts[overlay.id]?.geometryRef || ""}
                              onChange={(e) => setOverlayEditorDrafts((current) => ({
                                ...current,
                                [overlay.id]: { ...buildOverlayEditorDraft(overlay), ...(current[overlay.id] || {}), geometryRef: e.target.value },
                              }))}
                            />
                            <div className="grid gap-3 lg:grid-cols-2">
                              <Input
                                placeholder="Priorité"
                                value={overlayEditorDrafts[overlay.id]?.priority || ""}
                                onChange={(e) => setOverlayEditorDrafts((current) => ({
                                  ...current,
                                  [overlay.id]: { ...buildOverlayEditorDraft(overlay), ...(current[overlay.id] || {}), priority: e.target.value },
                                }))}
                              />
                              <Input
                                placeholder="Statut"
                                value={overlayEditorDrafts[overlay.id]?.status || ""}
                                onChange={(e) => setOverlayEditorDrafts((current) => ({
                                  ...current,
                                  [overlay.id]: { ...buildOverlayEditorDraft(overlay), ...(current[overlay.id] || {}), status: e.target.value },
                                }))}
                              />
                            </div>
                            <Textarea
                              placeholder="Notes de guidage"
                              value={overlayEditorDrafts[overlay.id]?.guidanceNotes || ""}
                              onChange={(e) => setOverlayEditorDrafts((current) => ({
                                ...current,
                                [overlay.id]: { ...buildOverlayEditorDraft(overlay), ...(current[overlay.id] || {}), guidanceNotes: e.target.value },
                              }))}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={updateOverlayMutation.isPending || !(overlayEditorDrafts[overlay.id]?.overlayCode || "").trim()}
                                onClick={() => updateOverlayMutation.mutate({ overlayId: overlay.id, draft: overlayEditorDrafts[overlay.id] || buildOverlayEditorDraft(overlay) })}
                              >
                                {updateOverlayMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                                Enregistrer
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingOverlayId(null);
                                  setOverlayEditorDrafts((current) => {
                                    const next = { ...current };
                                    delete next[overlay.id];
                                    return next;
                                  });
                                }}
                              >
                                Annuler
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateOverlayMutation.isPending || deleteOverlayMutation.isPending}
                          onClick={() => {
                            if (editingOverlayId === overlay.id) {
                              setEditingOverlayId(null);
                              return;
                            }
                            setOverlayEditorDrafts((current) => ({ ...current, [overlay.id]: buildOverlayEditorDraft(overlay) }));
                            setEditingOverlayId(overlay.id);
                          }}
                        >
                          <FilePenLine className="mr-2 h-3.5 w-3.5" />
                          {editingOverlayId === overlay.id ? "Fermer" : "Modifier"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive/20 text-destructive hover:bg-destructive/5"
                          disabled={deleteOverlayMutation.isPending}
                          onClick={() => {
                            if (!window.confirm(`Supprimer la couche ${overlay.overlayCode} ?`)) return;
                            deleteOverlayMutation.mutate(overlay.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Aucune couche réglementaire configurée pour cette commune.</div>
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
                  <div className="flex flex-col gap-4">
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
                        <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => { setSelectedDocumentId(doc.id); setActiveTab("calibration"); }}>
                          <ScrollText className="mr-2 h-3.5 w-3.5" /> Calibrer
                        </Button>
                        <Button variant="outline" size="sm" className="w-full sm:w-auto" disabled={resegmentDocumentMutation.isPending} onClick={() => resegmentDocumentMutation.mutate(doc.id)}>
                          {resegmentDocumentMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                          Re-segmenter
                        </Button>
                        <Button variant="outline" size="sm" className="w-full border-destructive/20 text-destructive hover:bg-destructive/5 sm:w-auto" onClick={() => {
                          if (!window.confirm(`Supprimer ${doc.title} ?`)) return;
                          deleteDocumentMutation.mutate(doc.id);
                        }}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-muted/10 p-3">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Layers3 className="h-4 w-4 text-primary" />
                        Rattacher ce document à une couche réglementaire
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Select
                          value={documentOverlayDrafts[doc.id]?.overlayId || ""}
                          onValueChange={(value) => setDocumentOverlayDrafts((current) => ({
                            ...current,
                            [doc.id]: {
                              overlayId: value,
                              role: current[doc.id]?.role || "supporting",
                              structureMode: current[doc.id]?.structureMode || themesData?.structureModes?.[0] || "mixed",
                              sourcePriority: current[doc.id]?.sourcePriority || "0",
                              isPrimary: current[doc.id]?.isPrimary || false,
                            },
                          }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Choisir une couche" /></SelectTrigger>
                          <SelectContent>
                            {(overlaysData?.overlays || []).map((overlay) => (
                              <SelectItem key={overlay.id} value={overlay.id}>{overlay.overlayCode} · {overlay.overlayType}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Rôle (primary, supporting...)"
                          value={documentOverlayDrafts[doc.id]?.role || "supporting"}
                          onChange={(e) => setDocumentOverlayDrafts((current) => ({
                            ...current,
                            [doc.id]: {
                              overlayId: current[doc.id]?.overlayId || "",
                              role: e.target.value,
                              structureMode: current[doc.id]?.structureMode || themesData?.structureModes?.[0] || "mixed",
                              sourcePriority: current[doc.id]?.sourcePriority || "0",
                              isPrimary: current[doc.id]?.isPrimary || false,
                            },
                          }))}
                        />
                        <Select
                          value={documentOverlayDrafts[doc.id]?.structureMode || themesData?.structureModes?.[0] || "mixed"}
                          onValueChange={(value) => setDocumentOverlayDrafts((current) => ({
                            ...current,
                            [doc.id]: {
                              overlayId: current[doc.id]?.overlayId || "",
                              role: current[doc.id]?.role || "supporting",
                              structureMode: value,
                              sourcePriority: current[doc.id]?.sourcePriority || "0",
                              isPrimary: current[doc.id]?.isPrimary || false,
                            },
                          }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Structure documentaire" /></SelectTrigger>
                          <SelectContent>
                            {(themesData?.structureModes || []).map((mode) => (
                              <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          disabled={bindDocumentOverlayMutation.isPending || !(documentOverlayDrafts[doc.id]?.overlayId)}
                          onClick={() => bindDocumentOverlayMutation.mutate({
                            documentId: doc.id,
                            draft: documentOverlayDrafts[doc.id] || {
                              overlayId: "",
                              role: "supporting",
                              structureMode: themesData?.structureModes?.[0] || "mixed",
                              sourcePriority: "0",
                              isPrimary: false,
                            },
                          })}
                        >
                          {bindDocumentOverlayMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Layers3 className="mr-2 h-3.5 w-3.5" />}
                          Lier au document
                        </Button>
                      </div>
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
          <CardContent className="space-y-4 px-3 py-4 sm:px-6">
            {!selectedDocumentId ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Choisis un document depuis l’onglet Documents réglementaires pour lancer le calibrage.</div>
            ) : loadingWorkspace ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Ouverture du workspace…</div>
            ) : workspaceData ? (
              <>
                <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
                  <div className="order-2 overflow-hidden rounded-xl border bg-muted/20 min-h-[320px] sm:min-h-[420px] lg:min-h-[560px] xl:order-1 xl:min-h-[680px]">
                    {workspaceData.document.hasStoredFile ? (
                      <iframe
                        src={`/api/mairie/documents/${workspaceData.document.id}/view#toolbar=0`}
                        className="h-[320px] w-full border-none sm:h-[420px] lg:h-[560px] xl:h-[680px]"
                        title={workspaceData.document.title}
                      />
                    ) : (
                      <div className="flex h-[320px] items-center justify-center p-6 text-sm text-muted-foreground sm:h-[420px] lg:h-[560px] xl:h-[680px]">
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {workspaceData.document.availabilityMessage || "Fichier source indisponible"}
                      </div>
                    )}
                  </div>

                  <div className="order-1 space-y-4 xl:order-2">
                    <div className="rounded-xl border bg-background p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium">{workspaceData.document.title}</p>
                          <p className="text-xs text-muted-foreground">{workspaceData.pages.length} page(s) texte sélectionnable(s)</p>
                        </div>
                        <Badge variant="outline" className="w-fit">{workspaceData.document.documentType || "document"}</Badge>
                      </div>
                      <div className="mt-3 space-y-2 rounded-xl border bg-muted/10 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Layers3 className="h-4 w-4 text-primary" />
                          Couches liées au document
                        </div>
                        {workspaceData.bindings.length > 0 ? workspaceData.bindings.map((binding) => {
                          const overlay = workspaceData.overlays.find((item) => item.id === binding.overlayId);
                          return (
                            <div key={binding.id} className="rounded-lg border bg-background px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{overlay?.overlayCode || "Couche"}</Badge>
                                <Badge variant="secondary">{overlay?.overlayType || "Overlay"}</Badge>
                                <Badge variant="outline">{binding.structureMode}</Badge>
                                {binding.isPrimary && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Primaire</Badge>}
                              </div>
                            </div>
                          );
                        }) : (
                          <p className="text-xs text-muted-foreground">Aucune couche encore rattachée à ce document.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border bg-background p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Sélection courante</p>
                        <p className="text-xs text-muted-foreground">Sélectionne du texte dans les pages ci-dessous, puis rattache-le à une zone du référentiel `Zones`, une couche réglementaire ou les deux.</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3 text-sm min-h-[120px]">
                        {pendingSelection ? pendingSelection.text : "Aucune sélection active"}
                      </div>
                      {pendingSelection && detectRelationSignalsFromText(pendingSelection.text).length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Renvois détectés</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {detectRelationSignalsFromText(pendingSelection.text).map((signal, index) => (
                              <Badge key={`${signal.relationType}-${index}`} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                {getRelationTypeLabel(signal.relationType)} · {signal.label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid gap-3 lg:grid-cols-3">
                        <Select value={selectionZoneId || "__none_zone__"} onValueChange={(value) => setSelectionZoneId(value === "__none_zone__" ? "" : value)}>
                          <SelectTrigger><SelectValue placeholder="Zone PLU (optionnelle)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none_zone__">Aucune zone</SelectItem>
                            {configuredZones.map((zone) => (
                              <SelectItem key={zone.id} value={zone.id}>{zone.zoneCode}{zone.zoneLabel ? ` · ${zone.zoneLabel}` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectionOverlayId || "__none_overlay__"} onValueChange={(value) => setSelectionOverlayId(value === "__none_overlay__" ? "" : value)}>
                          <SelectTrigger><SelectValue placeholder="Overlay (optionnel)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none_overlay__">Aucun overlay</SelectItem>
                            {workspaceData.overlays.map((overlay) => (
                              <SelectItem key={overlay.id} value={overlay.id}>{overlay.overlayCode} · {overlay.overlayType}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectionArticleCode || "__none_article__"} onValueChange={(value) => setSelectionArticleCode(value === "__none_article__" ? "" : value)}>
                          <SelectTrigger><SelectValue placeholder="Article PLU (optionnel)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none_article__">Aucun article</SelectItem>
                            {(themesData?.articleReference || workspaceData.articleReference).map((article) => (
                              <SelectItem key={article.code} value={article.code}>{article.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input placeholder="Libellé d’extrait (optionnel)" value={selectionLabel} onChange={(e) => setSelectionLabel(e.target.value)} />
                      <Button
                        className="w-full"
                        disabled={createExcerptMutation.isPending || !pendingSelection || !(selectionZoneId && selectionZoneId !== "__none_zone__") && !(selectionOverlayId && selectionOverlayId !== "__none_overlay__")}
                        onClick={() => createExcerptMutation.mutate()}
                      >
                        {createExcerptMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Créer l’extrait calibré
                      </Button>
                    </div>

                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">Guidage par zone</p>
                      <p className="text-xs text-muted-foreground">Le calibrage s’appuie ici uniquement sur les zones configurées dans l’onglet `Zones`, leurs pages de référence et leurs mots-clés.</p>
                    </div>
                    <Badge variant="outline" className="w-fit">
                      {configuredZones.length} zone(s) configurée(s)
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-3">
                    {zoneGuidanceCards.length > 0 ? zoneGuidanceCards.map(({ zone, pageStart, pageEnd, pagesInRangeCount, articleAnchors, keywordMatches }) => {
                      const isExpanded = expandedGuidanceZoneIds.includes(zone.id);
                      return (
                        <div key={zone.id} className="rounded-xl border bg-muted/10 p-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{zone.zoneCode}</Badge>
                                <Badge variant="outline">
                                  Pages {zone.referenceStartPage || "?"}{zone.referenceEndPage && zone.referenceEndPage !== zone.referenceStartPage ? ` à ${zone.referenceEndPage}` : zone.referenceEndPage ? "" : " à ?"}
                                </Badge>
                                {zone.parentZoneCode && <Badge variant="secondary">hérite de {zone.parentZoneCode}</Badge>}
                                <Badge variant="outline">{pagesInRangeCount} page(s) analysée(s)</Badge>
                              </div>
                              <p className="font-medium">{zone.zoneLabel || `Zone ${zone.zoneCode}`}</p>
                              {zone.searchKeywords.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {zone.searchKeywords.map((keyword) => (
                                    <Badge key={`${zone.id}-${keyword}`} variant="outline" className="text-[11px]">
                                      <Search className="mr-1 h-3 w-3" />
                                      {keyword}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-amber-700">Ajoute des mots-clés pour guider la recherche dans les pages {pageStart} à {pageEnd}.</p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExpandedGuidanceZoneIds((current) => (
                                current.includes(zone.id)
                                  ? current.filter((id) => id !== zone.id)
                                  : [...current, zone.id]
                              ))}
                            >
                              {isExpanded ? <ChevronDown className="mr-2 h-3.5 w-3.5" /> : <ChevronRight className="mr-2 h-3.5 w-3.5" />}
                              {isExpanded ? "Replier" : "Déployer la zone"}
                            </Button>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                              <div className="space-y-3 rounded-xl border bg-background p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Articles repérés dans la plage</p>
                                {articleAnchors.length > 0 ? (
                                  <div className="space-y-2">
                                    {articleAnchors.map((anchor) => (
                                      <div key={`${zone.id}-${anchor.articleCode}-${anchor.pageNumber}-${anchor.label}`} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge variant="outline">Art. {anchor.articleCode}</Badge>
                                          <Badge variant="secondary">Page {anchor.pageNumber}</Badge>
                                        </div>
                                        <p className="mt-2 text-foreground/85">{anchor.label}</p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Aucun article clairement repéré dans cette plage pour le moment.</p>
                                )}
                              </div>

                              <div className="space-y-3 rounded-xl border bg-background p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Textes retrouvés via les mots-clés</p>
                                {keywordMatches.length > 0 ? (
                                  <div className="space-y-2">
                                    {keywordMatches.map((match) => (
                                      <div key={`${zone.id}-${match.keyword}-${match.pageNumber}-${match.snippet}`} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge variant="outline">{match.keyword}</Badge>
                                          <Badge variant="secondary">Page {match.pageNumber}</Badge>
                                          {match.articleCode && <Badge variant="outline">Art. {match.articleCode}</Badge>}
                                        </div>
                                        <p className="mt-2 text-foreground/90">{match.snippet}</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              setPendingSelection({ text: match.snippet, pageNumber: match.pageNumber });
                                              setSelectionZoneId(zone.id);
                                              if (match.articleCode) setSelectionArticleCode(match.articleCode);
                                            }}
                                          >
                                            Utiliser cet extrait
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Aucun texte retrouvé à partir des mots-clés dans la plage sélectionnée.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }) : (
                      <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                        Configure d’abord des zones dans l’onglet `Zones`, puis calibre leurs pages et leurs mots-clés pour guider l’analyse.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),minmax(0,420px)]">
                  <div className="space-y-3 rounded-xl border bg-background p-4 max-h-[420px] overflow-auto sm:max-h-[520px] xl:max-h-[760px]">
                    <p className="text-sm font-semibold">Texte extrait sélectionnable</p>
                    {workspaceData.pages.map((page) => (
                      <div key={page.pageNumber} className="rounded-xl border bg-muted/10 p-4">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <Badge variant="outline">Page {page.pageNumber}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full sm:w-auto"
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
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-medium">{excerpt.selectionLabel || `${excerpt.zone?.zoneCode || "Zone"} · Art. ${excerpt.articleCode || "?"}`}</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {excerpt.zone && <Badge variant="outline">{excerpt.zone.zoneCode}</Badge>}
                                  {excerpt.overlay && <Badge variant="secondary">{excerpt.overlay.overlayCode} · {excerpt.overlay.overlayType}</Badge>}
                                  {excerpt.relationSignals.length > 0 && (
                                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                      {excerpt.relationSignals.length} renvoi(s) detecte(s)
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">Page {excerpt.sourcePage}{excerpt.sourcePageEnd && excerpt.sourcePageEnd !== excerpt.sourcePage ? ` à ${excerpt.sourcePageEnd}` : ""}</p>
                              </div>
                              <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setActiveExcerptId(excerpt.id)}>Règles</Button>
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
                            <div className="rounded-xl border bg-muted/10 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">Saisie rapide</p>
                                  <p className="text-xs text-muted-foreground">Écris simplement une règle comme “Hauteur 15 m” ou “Stationnement 2 places / logement”.</p>
                                </div>
                                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                              </div>
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <Input
                                  placeholder="Ex : Hauteur 15 m"
                                  value={quickRuleInputs[activeExcerptId] || ""}
                                  onChange={(e) => setQuickRuleInputs((current) => ({ ...current, [activeExcerptId]: e.target.value }))}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="sm:w-auto"
                                  onClick={() => {
                                    const parsed = buildQuickRuleDraft(
                                      quickRuleInputs[activeExcerptId] || "",
                                      themesData?.themes || workspaceData.themes,
                                    );
                                    if (!parsed) {
                                      toast({ title: "Saisie vide", description: "Ajoute d’abord un texte court à interpréter.", variant: "destructive" });
                                      return;
                                    }
                                    setRuleDrafts((current) => ({
                                      ...current,
                                      [activeExcerptId]: {
                                        ...buildEmptyRuleDraft(),
                                        ...(current[activeExcerptId] || {}),
                                        ...parsed,
                                      },
                                    }));
                                    toast({ title: "Formulaire pré-rempli", description: "Tu peux maintenant ajuster la règle structurée avant de l’enregistrer." });
                                  }}
                                >
                                  <Sparkles className="mr-2 h-4 w-4" />
                                  Pré-remplir
                                </Button>
                              </div>
                            </div>
                            <Select value={ruleDrafts[activeExcerptId]?.themeCode || ""} onValueChange={(value) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: {
                                ...buildEmptyRuleDraft(),
                                ...(current[activeExcerptId] || {}),
                                themeCode: value,
                              },
                            }))}>
                            <SelectTrigger><SelectValue placeholder="Thème métier" /></SelectTrigger>
                            <SelectContent>
                              {(themesData?.themes || workspaceData.themes).map((theme) => (
                                <SelectItem key={theme.code} value={theme.code}>{theme.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="grid gap-3 xl:grid-cols-2">
                            <Select value={ruleDrafts[activeExcerptId]?.normativeEffect || "primary"} onValueChange={(value) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), normativeEffect: value },
                            }))}>
                              <SelectTrigger><SelectValue placeholder="Effet normatif" /></SelectTrigger>
                              <SelectContent>
                                {(themesData?.normativeEffects || []).map((effect) => (
                                  <SelectItem key={effect} value={effect}>{getNormativeEffectLabel(effect)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={ruleDrafts[activeExcerptId]?.proceduralEffect || "none"} onValueChange={(value) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), proceduralEffect: value },
                            }))}>
                              <SelectTrigger><SelectValue placeholder="Effet procédural" /></SelectTrigger>
                              <SelectContent>
                                {(themesData?.proceduralEffects || []).map((effect) => (
                                  <SelectItem key={effect} value={effect}>{getProceduralEffectLabel(effect)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-3 xl:grid-cols-2">
                            <Input placeholder="Portée (main_zone, overlay...)" value={ruleDrafts[activeExcerptId]?.applicabilityScope || "main_zone"} onChange={(e) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), applicabilityScope: e.target.value },
                            }))} />
                            <Select value={ruleDrafts[activeExcerptId]?.ruleAnchorType || "article"} onValueChange={(value) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), ruleAnchorType: value },
                            }))}>
                              <SelectTrigger><SelectValue placeholder="Type d’ancre" /></SelectTrigger>
                              <SelectContent>
                                {(themesData?.ruleAnchorTypes || []).map((anchorType) => (
                                  <SelectItem key={anchorType} value={anchorType}>{anchorType}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Input placeholder="Ancre réglementaire (chapitre, prescription, légende...)" value={ruleDrafts[activeExcerptId]?.ruleAnchorLabel || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), ruleAnchorLabel: e.target.value },
                          }))} />
                          <Input placeholder="Statut de résolution de conflit (none, pending...)" value={ruleDrafts[activeExcerptId]?.conflictResolutionStatus || "none"} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), conflictResolutionStatus: e.target.value },
                          }))} />
                          <Input placeholder="Libellé de règle" value={ruleDrafts[activeExcerptId]?.ruleLabel || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), ruleLabel: e.target.value },
                          }))} />
                          <div className="grid gap-3 xl:grid-cols-3">
                            <Input placeholder="Opérateur" value={ruleDrafts[activeExcerptId]?.operator || ""} onChange={(e) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), operator: e.target.value },
                            }))} />
                            <Input placeholder="Valeur numérique" value={ruleDrafts[activeExcerptId]?.valueNumeric || ""} onChange={(e) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), valueNumeric: e.target.value },
                            }))} />
                            <Input placeholder="Unité" value={ruleDrafts[activeExcerptId]?.unit || ""} onChange={(e) => setRuleDrafts((current) => ({
                              ...current,
                              [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), unit: e.target.value },
                            }))} />
                          </div>
                          <Input placeholder="Valeur texte (si non numérique)" value={ruleDrafts[activeExcerptId]?.valueText || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), valueText: e.target.value },
                          }))} />
                          <Textarea placeholder="Condition / exception" value={ruleDrafts[activeExcerptId]?.conditionText || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), conditionText: e.target.value },
                          }))} />
                          <Textarea placeholder="Note d’interprétation" value={ruleDrafts[activeExcerptId]?.interpretationNote || ""} onChange={(e) => setRuleDrafts((current) => ({
                            ...current,
                            [activeExcerptId]: { ...buildEmptyRuleDraft(), ...(current[activeExcerptId] || {}), interpretationNote: e.target.value },
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
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <Badge variant="secondary">{getNormativeEffectLabel(rule.normativeEffect)}</Badge>
                                    {rule.proceduralEffect !== "none" && <Badge variant="outline">{getProceduralEffectLabel(rule.proceduralEffect)}</Badge>}
                                    {rule.ruleAnchorLabel && <Badge variant="outline">{rule.ruleAnchorType} · {rule.ruleAnchorLabel}</Badge>}
                                    {rule.isRelationalRule && (
                                      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">
                                        {getRelationResolutionLabel(rule.resolutionStatus)} · {rule.linkedRuleCount} lien(s)
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm text-muted-foreground">{formatRuleValue(rule)}</p>
                                  {activeExcerpt?.relationSignals.length ? (
                                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Indices de renvoi dans l’extrait</p>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {activeExcerpt.relationSignals.map((signal, index) => (
                                          <Badge key={`${signal.relationType}-${index}`} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                            {getRelationTypeLabel(signal.relationType)}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                  {(workspaceRelationsBySource.get(rule.id) || []).length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Liens existants</p>
                                      {(workspaceRelationsBySource.get(rule.id) || []).map((relation) => (
                                        <div key={relation.id} className="rounded-lg border bg-background px-3 py-2 text-xs">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{getRelationTypeLabel(relation.relationType)}</Badge>
                                            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">
                                              {getRelationResolutionLabel(relation.sourceResolutionStatus)}
                                            </Badge>
                                            {relation.targetRuleTarget && <Badge variant="secondary">{relation.targetRuleTarget}</Badge>}
                                          </div>
                                          <p className="mt-2 text-foreground/90">
                                            {relation.targetRuleLabel || relation.targetDocumentLabel || "Cible a preciser"}
                                          </p>
                                          {(relation.conditionText || relation.priorityNote) && (
                                            <p className="mt-1 text-muted-foreground">
                                              {[relation.conditionText, relation.priorityNote].filter(Boolean).join(" · ")}
                                            </p>
                                          )}
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                if (editingRelationId === relation.id) {
                                                  setEditingRelationId(null);
                                                  return;
                                                }
                                                setRelationDrafts((current) => ({
                                                  ...current,
                                                  [relation.id]: {
                                                    targetRuleId: relation.targetRuleId || "",
                                                    targetDocumentId: relation.targetDocumentId || "",
                                                    relationType: relation.relationType,
                                                    relationScope: relation.relationScope,
                                                    conditionText: relation.conditionText || "",
                                                    priorityNote: relation.priorityNote || "",
                                                  },
                                                }));
                                                setEditingRelationId(relation.id);
                                              }}
                                            >
                                              <FilePenLine className="mr-2 h-3.5 w-3.5" />
                                              {editingRelationId === relation.id ? "Fermer" : "Modifier"}
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="border-destructive/20 text-destructive hover:bg-destructive/5"
                                              onClick={() => {
                                                if (!window.confirm("Supprimer ce lien reglementaire ?")) return;
                                                deleteRelationMutation.mutate(relation.id);
                                              }}
                                            >
                                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                                              Supprimer
                                            </Button>
                                          </div>
                                          {editingRelationId === relation.id && (
                                            <div className="mt-3 grid gap-3 rounded-lg border bg-muted/10 p-3">
                                              <Select
                                                value={relationDrafts[relation.id]?.relationType || relation.relationType}
                                                onValueChange={(value) => setRelationDrafts((current) => ({
                                                  ...current,
                                                  [relation.id]: { ...buildEmptyRelationDraft(), ...(current[relation.id] || {}), relationType: value, targetRuleId: relation.targetRuleId || "", targetDocumentId: relation.targetDocumentId || "" },
                                                }))}
                                              >
                                                <SelectTrigger><SelectValue placeholder="Type de lien" /></SelectTrigger>
                                                <SelectContent>
                                                  {(themesData?.relationTypes || []).map((relationType) => (
                                                    <SelectItem key={relationType} value={relationType}>{getRelationTypeLabel(relationType)}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              <Select
                                                value={relationDrafts[relation.id]?.targetRuleId || "__none_target_rule__"}
                                                onValueChange={(value) => setRelationDrafts((current) => ({
                                                  ...current,
                                                  [relation.id]: { ...buildEmptyRelationDraft(), ...(current[relation.id] || {}), targetRuleId: value === "__none_target_rule__" ? "" : value },
                                                }))}
                                              >
                                                <SelectTrigger><SelectValue placeholder="Règle cible" /></SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none_target_rule__">Aucune règle cible</SelectItem>
                                                  {relationRuleCandidates.filter((candidate) => candidate.id !== rule.id).map((candidate) => (
                                                    <SelectItem key={candidate.id} value={candidate.id}>
                                                      {getRuleTargetLabel(candidate)} · {candidate.ruleLabel}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              <Select
                                                value={relationDrafts[relation.id]?.targetDocumentId || "__none_target_doc__"}
                                                onValueChange={(value) => setRelationDrafts((current) => ({
                                                  ...current,
                                                  [relation.id]: { ...buildEmptyRelationDraft(), ...(current[relation.id] || {}), targetDocumentId: value === "__none_target_doc__" ? "" : value },
                                                }))}
                                              >
                                                <SelectTrigger><SelectValue placeholder="Document cible" /></SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none_target_doc__">Aucun document cible</SelectItem>
                                                  {documents.map((document) => (
                                                    <SelectItem key={document.id} value={document.id}>{document.title}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              <Input
                                                placeholder="Portee du lien"
                                                value={relationDrafts[relation.id]?.relationScope || relation.relationScope}
                                                onChange={(e) => setRelationDrafts((current) => ({
                                                  ...current,
                                                  [relation.id]: { ...buildEmptyRelationDraft(), ...(current[relation.id] || {}), relationScope: e.target.value },
                                                }))}
                                              />
                                              <Textarea
                                                placeholder="Condition du lien"
                                                value={relationDrafts[relation.id]?.conditionText || ""}
                                                onChange={(e) => setRelationDrafts((current) => ({
                                                  ...current,
                                                  [relation.id]: { ...buildEmptyRelationDraft(), ...(current[relation.id] || {}), conditionText: e.target.value },
                                                }))}
                                              />
                                              <Textarea
                                                placeholder="Note de priorite"
                                                value={relationDrafts[relation.id]?.priorityNote || ""}
                                                onChange={(e) => setRelationDrafts((current) => ({
                                                  ...current,
                                                  [relation.id]: { ...buildEmptyRelationDraft(), ...(current[relation.id] || {}), priorityNote: e.target.value },
                                                }))}
                                              />
                                              <Button
                                                size="sm"
                                                disabled={updateRelationMutation.isPending}
                                                onClick={() => updateRelationMutation.mutate({
                                                  relationId: relation.id,
                                                  draft: relationDrafts[relation.id] || buildEmptyRelationDraft(),
                                                })}
                                              >
                                                {updateRelationMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                                                Enregistrer le lien
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="mt-3 grid gap-3 rounded-lg border bg-background p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ajouter un lien a cette règle</p>
                                    <Select
                                      value={relationDrafts[rule.id]?.relationType || "references"}
                                      onValueChange={(value) => setRelationDrafts((current) => ({
                                        ...current,
                                        [rule.id]: { ...buildEmptyRelationDraft(), ...(current[rule.id] || {}), relationType: value },
                                      }))}
                                    >
                                      <SelectTrigger><SelectValue placeholder="Type de lien" /></SelectTrigger>
                                      <SelectContent>
                                        {(themesData?.relationTypes || []).map((relationType) => (
                                          <SelectItem key={relationType} value={relationType}>{getRelationTypeLabel(relationType)}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={relationDrafts[rule.id]?.targetRuleId || "__none_target_rule__"}
                                      onValueChange={(value) => setRelationDrafts((current) => ({
                                        ...current,
                                        [rule.id]: { ...buildEmptyRelationDraft(), ...(current[rule.id] || {}), targetRuleId: value === "__none_target_rule__" ? "" : value },
                                      }))}
                                    >
                                      <SelectTrigger><SelectValue placeholder="Lier a une autre regle" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none_target_rule__">Aucune règle cible</SelectItem>
                                        {relationRuleCandidates.filter((candidate) => candidate.id !== rule.id).map((candidate) => (
                                          <SelectItem key={candidate.id} value={candidate.id}>
                                            {getRuleTargetLabel(candidate)} · {candidate.ruleLabel}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={relationDrafts[rule.id]?.targetDocumentId || "__none_target_doc__"}
                                      onValueChange={(value) => setRelationDrafts((current) => ({
                                        ...current,
                                        [rule.id]: { ...buildEmptyRelationDraft(), ...(current[rule.id] || {}), targetDocumentId: value === "__none_target_doc__" ? "" : value },
                                      }))}
                                    >
                                      <SelectTrigger><SelectValue placeholder="Ou a un document cible" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none_target_doc__">Aucun document cible</SelectItem>
                                        {documents.map((document) => (
                                          <SelectItem key={document.id} value={document.id}>{document.title}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      placeholder="Portee du lien"
                                      value={relationDrafts[rule.id]?.relationScope || "rule"}
                                      onChange={(e) => setRelationDrafts((current) => ({
                                        ...current,
                                        [rule.id]: { ...buildEmptyRelationDraft(), ...(current[rule.id] || {}), relationScope: e.target.value },
                                      }))}
                                    />
                                    <Textarea
                                      placeholder="Condition du lien"
                                      value={relationDrafts[rule.id]?.conditionText || ""}
                                      onChange={(e) => setRelationDrafts((current) => ({
                                        ...current,
                                        [rule.id]: { ...buildEmptyRelationDraft(), ...(current[rule.id] || {}), conditionText: e.target.value },
                                      }))}
                                    />
                                    <Textarea
                                      placeholder="Note de priorite"
                                      value={relationDrafts[rule.id]?.priorityNote || ""}
                                      onChange={(e) => setRelationDrafts((current) => ({
                                        ...current,
                                        [rule.id]: { ...buildEmptyRelationDraft(), ...(current[rule.id] || {}), priorityNote: e.target.value },
                                      }))}
                                    />
                                    <Button
                                      size="sm"
                                      disabled={createRelationMutation.isPending || (!(relationDrafts[rule.id]?.targetRuleId) && !(relationDrafts[rule.id]?.targetDocumentId))}
                                      onClick={() => createRelationMutation.mutate({
                                        ruleId: rule.id,
                                        draft: relationDrafts[rule.id] || buildEmptyRelationDraft(),
                                      })}
                                    >
                                      {createRelationMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                                      Creer le lien
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Assistance IA</p>
                      <p className="text-xs text-muted-foreground">Suggestions à consulter après la lecture manuelle du texte source.</p>
                    </div>
                    <Badge variant="secondary">Pré-classement uniquement</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
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
            <div className="grid gap-3 lg:grid-cols-3">
              <Select value={libraryOverlayFilter} onValueChange={setLibraryOverlayFilter}>
                <SelectTrigger><SelectValue placeholder="Filtrer par couche" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les couches</SelectItem>
                  {(overlaysData?.overlays || []).map((overlay) => (
                    <SelectItem key={overlay.id} value={overlay.id}>{overlay.overlayCode} · {overlay.overlayType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={libraryNormativeFilter} onValueChange={setLibraryNormativeFilter}>
                <SelectTrigger><SelectValue placeholder="Effet normatif" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les effets normatifs</SelectItem>
                  {(themesData?.normativeEffects || []).map((effect) => (
                    <SelectItem key={effect} value={effect}>{getNormativeEffectLabel(effect)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={libraryProceduralFilter} onValueChange={setLibraryProceduralFilter}>
                <SelectTrigger><SelectValue placeholder="Effet procédural" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les effets procéduraux</SelectItem>
                  {(themesData?.proceduralEffects || []).map((effect) => (
                    <SelectItem key={effect} value={effect}>{getProceduralEffectLabel(effect)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredLibraryRules.length ? filteredLibraryRules.map((rule) => (
              <div key={rule.id} className="rounded-xl border bg-background p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{getRuleTargetLabel(rule)}</Badge>
                      {rule.overlayType && <Badge variant="outline">{rule.overlayType}</Badge>}
                      <Badge variant="secondary">{rule.themeLabel}</Badge>
                      {rule.articleCode && rule.articleCode !== "manual" && <Badge variant="outline">Art. {rule.articleCode}</Badge>}
                      {rule.ruleAnchorLabel && <Badge variant="outline">{rule.ruleAnchorType} · {rule.ruleAnchorLabel}</Badge>}
                      <Badge variant="outline">{getNormativeEffectLabel(rule.normativeEffect)}</Badge>
                      {rule.proceduralEffect !== "none" && <Badge variant="outline">{getProceduralEffectLabel(rule.proceduralEffect)}</Badge>}
                      <Badge variant="outline" className={getStatusBadge(rule.status).className}>{getStatusBadge(rule.status).label}</Badge>
                      {rule.isRelationalRule && (
                        <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">
                          {getRelationResolutionLabel(rule.resolutionStatus)} · {rule.linkedRuleCount} lien(s)
                        </Badge>
                      )}
                      {rule.conflictFlag && <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Conflit</Badge>}
                    </div>
                    <p className="font-medium">{rule.ruleLabel}</p>
                    <p className="text-sm text-muted-foreground">{formatRuleValue(rule)}</p>
                    <p className="text-xs text-muted-foreground">
                      {rule.documentTitle} · page {rule.sourcePage}{rule.sourcePageEnd && rule.sourcePageEnd !== rule.sourcePage ? ` à ${rule.sourcePageEnd}` : ""}
                    </p>
                    <div className="rounded-lg bg-muted/20 px-3 py-2 text-xs text-foreground/80">{rule.sourceText}</div>
                    {(libraryRelationsBySource.get(rule.id) || []).length > 0 && (
                      <div className="space-y-2 rounded-xl border bg-muted/10 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relations tracees</p>
                        {(libraryRelationsBySource.get(rule.id) || []).map((relation) => (
                          <div key={relation.id} className="rounded-lg border bg-background px-3 py-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{getRelationTypeLabel(relation.relationType)}</Badge>
                              <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">
                                {getRelationResolutionLabel(rule.resolutionStatus)}
                              </Badge>
                              {relation.targetRuleTarget && <Badge variant="secondary">{relation.targetRuleTarget}</Badge>}
                            </div>
                            <p className="mt-2 text-foreground/90">{relation.targetRuleLabel || relation.targetDocumentLabel || "Cible a preciser"}</p>
                            {(relation.conditionText || relation.priorityNote) && (
                              <p className="mt-1 text-muted-foreground">{[relation.conditionText, relation.priorityNote].filter(Boolean).join(" · ")}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {editingRuleId === rule.id && (
                      <div className="space-y-3 rounded-xl border bg-muted/10 p-3">
                        <div className="grid gap-3 xl:grid-cols-2">
                          <Select
                            value={ruleEditorDrafts[rule.id]?.zoneId || "__none_zone__"}
                            onValueChange={(value) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), zoneId: value === "__none_zone__" ? "" : value },
                            }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Zone" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none_zone__">Aucune zone</SelectItem>
                              {(zonesData?.zones || []).map((zone) => (
                                <SelectItem key={zone.id} value={zone.id}>{zone.zoneCode}{zone.zoneLabel ? ` · ${zone.zoneLabel}` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={ruleEditorDrafts[rule.id]?.overlayId || "__none_overlay__"}
                            onValueChange={(value) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), overlayId: value === "__none_overlay__" ? "" : value },
                            }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Couche réglementaire" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none_overlay__">Aucune couche</SelectItem>
                              {(overlaysData?.overlays || []).map((overlay) => (
                                <SelectItem key={overlay.id} value={overlay.id}>{overlay.overlayCode} · {overlay.overlayType}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-3">
                          <Select
                            value={ruleEditorDrafts[rule.id]?.themeCode || ""}
                            onValueChange={(value) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), themeCode: value },
                            }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Thème métier" /></SelectTrigger>
                            <SelectContent>
                              {(themesData?.themes || []).map((theme) => (
                                <SelectItem key={theme.code} value={theme.code}>{theme.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={ruleEditorDrafts[rule.id]?.articleCode || ""}
                            onValueChange={(value) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), articleCode: value },
                            }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Article" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manual">Pas d’article PLU</SelectItem>
                              {(themesData?.articleReference || []).map((article) => (
                                <SelectItem key={article.code} value={article.code}>{article.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-2">
                          <Select
                            value={ruleEditorDrafts[rule.id]?.normativeEffect || "primary"}
                            onValueChange={(value) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), normativeEffect: value },
                            }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Effet normatif" /></SelectTrigger>
                            <SelectContent>
                              {(themesData?.normativeEffects || []).map((effect) => (
                                <SelectItem key={effect} value={effect}>{getNormativeEffectLabel(effect)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={ruleEditorDrafts[rule.id]?.proceduralEffect || "none"}
                            onValueChange={(value) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), proceduralEffect: value },
                            }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Effet procédural" /></SelectTrigger>
                            <SelectContent>
                              {(themesData?.proceduralEffects || []).map((effect) => (
                                <SelectItem key={effect} value={effect}>{getProceduralEffectLabel(effect)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-3">
                          <Input
                            placeholder="Portée"
                            value={ruleEditorDrafts[rule.id]?.applicabilityScope || ""}
                            onChange={(e) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), applicabilityScope: e.target.value },
                            }))}
                          />
                          <Select
                            value={ruleEditorDrafts[rule.id]?.ruleAnchorType || "article"}
                            onValueChange={(value) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), ruleAnchorType: value },
                            }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Type d’ancre" /></SelectTrigger>
                            <SelectContent>
                              {(themesData?.ruleAnchorTypes || []).map((anchorType) => (
                                <SelectItem key={anchorType} value={anchorType}>{anchorType}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Ancre réglementaire"
                            value={ruleEditorDrafts[rule.id]?.ruleAnchorLabel || ""}
                            onChange={(e) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), ruleAnchorLabel: e.target.value },
                            }))}
                          />
                          <Input
                            placeholder="Statut résolution conflit"
                            value={ruleEditorDrafts[rule.id]?.conflictResolutionStatus || ""}
                            onChange={(e) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), conflictResolutionStatus: e.target.value },
                            }))}
                          />
                        </div>
                        <Input
                          placeholder="Libellé de règle"
                          value={ruleEditorDrafts[rule.id]?.ruleLabel || ""}
                          onChange={(e) => setRuleEditorDrafts((current) => ({
                            ...current,
                            [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), ruleLabel: e.target.value },
                          }))}
                        />
                        <div className="grid gap-3 xl:grid-cols-4">
                          <Input
                            placeholder="Opérateur"
                            value={ruleEditorDrafts[rule.id]?.operator || ""}
                            onChange={(e) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), operator: e.target.value },
                            }))}
                          />
                          <Input
                            placeholder="Valeur numérique"
                            value={ruleEditorDrafts[rule.id]?.valueNumeric || ""}
                            onChange={(e) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), valueNumeric: e.target.value },
                            }))}
                          />
                          <Input
                            placeholder="Valeur texte"
                            value={ruleEditorDrafts[rule.id]?.valueText || ""}
                            onChange={(e) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), valueText: e.target.value },
                            }))}
                          />
                          <Input
                            placeholder="Unité"
                            value={ruleEditorDrafts[rule.id]?.unit || ""}
                            onChange={(e) => setRuleEditorDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), unit: e.target.value },
                            }))}
                          />
                        </div>
                        <Textarea
                          placeholder="Condition / exception"
                          value={ruleEditorDrafts[rule.id]?.conditionText || ""}
                          onChange={(e) => setRuleEditorDrafts((current) => ({
                            ...current,
                            [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), conditionText: e.target.value },
                          }))}
                        />
                        <Textarea
                          placeholder="Note d’interprétation"
                          value={ruleEditorDrafts[rule.id]?.interpretationNote || ""}
                          onChange={(e) => setRuleEditorDrafts((current) => ({
                            ...current,
                            [rule.id]: { ...buildRuleEditorDraft(rule), ...(current[rule.id] || {}), interpretationNote: e.target.value },
                          }))}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={
                              updateRuleMutation.isPending
                              || !((ruleEditorDrafts[rule.id]?.zoneId || "").trim() || (ruleEditorDrafts[rule.id]?.overlayId || "").trim())
                              || !(ruleEditorDrafts[rule.id]?.themeCode)
                              || !(
                                ((ruleEditorDrafts[rule.id]?.articleCode || "").trim() && (ruleEditorDrafts[rule.id]?.articleCode || "").trim() !== "manual")
                                || (ruleEditorDrafts[rule.id]?.ruleAnchorLabel || "").trim()
                              )
                              || !(ruleEditorDrafts[rule.id]?.ruleLabel?.trim())
                            }
                            onClick={() => updateRuleMutation.mutate({ ruleId: rule.id, draft: ruleEditorDrafts[rule.id] || buildRuleEditorDraft(rule) })}
                          >
                            {updateRuleMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                            Enregistrer
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingRuleId(null);
                              setRuleEditorDrafts((current) => {
                                const next = { ...current };
                                delete next[rule.id];
                                return next;
                              });
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:max-w-[320px] lg:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updateRuleMutation.isPending || deleteRuleMutation.isPending}
                      onClick={() => {
                        if (editingRuleId === rule.id) {
                          setEditingRuleId(null);
                          return;
                        }
                        setRuleEditorDrafts((current) => ({ ...current, [rule.id]: buildRuleEditorDraft(rule) }));
                        setEditingRuleId(rule.id);
                      }}
                    >
                      <FilePenLine className="mr-2 h-3.5 w-3.5" />
                      {editingRuleId === rule.id ? "Fermer" : "Modifier"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/20 text-destructive hover:bg-destructive/5"
                      disabled={deleteRuleMutation.isPending}
                      onClick={() => {
                        if (!window.confirm(`Supprimer la règle "${rule.ruleLabel}" ?`)) return;
                        deleteRuleMutation.mutate(rule.id);
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Supprimer
                    </Button>
                    {STATUS_ORDER.map((status) => (
                      <Button
                        key={status}
                        variant={status === rule.status ? "default" : "outline"}
                        size="sm"
                        disabled={updateRuleStatusMutation.isPending || deleteRuleMutation.isPending}
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
            <CardDescription>Seules les règles publiées apparaissent ici, séparées entre socle de zone, couches superposées et effets procéduraux.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {publishedData?.rules.length ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <MapPin className="h-4 w-4" />
                    Socle réglementaire principal
                  </div>
                  {publishedRuleGroups.main.length ? publishedRuleGroups.main.map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-background">{rule.zoneCode || "Zone ?"}</Badge>
                        <Badge variant="secondary">{rule.themeLabel}</Badge>
                        {rule.articleCode && rule.articleCode !== "manual" && <Badge variant="outline">Art. {rule.articleCode}</Badge>}
                        {rule.isRelationalRule && <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">{getRelationResolutionLabel(rule.resolutionStatus)}</Badge>}
                      </div>
                      <p className="mt-2 font-medium">{rule.ruleLabel}</p>
                      <p className="text-sm text-muted-foreground">{formatRuleValue(rule)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{rule.documentTitle} · page {rule.sourcePage}</p>
                      <div className="mt-2 rounded-lg bg-background px-3 py-2 text-xs text-foreground/80">{rule.sourceText}</div>
                      {(publishedData?.relations || []).filter((relation) => relation.sourceRuleId === rule.id).length > 0 && (
                        <div className="mt-3 space-y-2">
                          {(publishedData?.relations || []).filter((relation) => relation.sourceRuleId === rule.id).map((relation) => (
                            <div key={relation.id} className="rounded-lg border bg-background px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{getRelationTypeLabel(relation.relationType)}</Badge>
                                <Badge variant="secondary">{relation.targetRuleLabel || relation.targetDocumentLabel || "Cible a preciser"}</Badge>
                              </div>
                              {(relation.conditionText || relation.priorityNote) && <p className="mt-1 text-muted-foreground">{[relation.conditionText, relation.priorityNote].filter(Boolean).join(" · ")}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">Aucune règle principale publiée.</div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Layers3 className="h-4 w-4" />
                    Contraintes superposées
                  </div>
                  {publishedRuleGroups.overlays.length ? publishedRuleGroups.overlays.map((rule) => (
                    <div key={rule.id} className="rounded-xl border bg-background p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{getRuleTargetLabel(rule)}</Badge>
                        {rule.overlayType && <Badge variant="secondary">{rule.overlayType}</Badge>}
                        <Badge variant="outline">{getNormativeEffectLabel(rule.normativeEffect)}</Badge>
                        {rule.isRelationalRule && <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">{getRelationResolutionLabel(rule.resolutionStatus)}</Badge>}
                        {rule.articleCode && rule.articleCode !== "manual" && <Badge variant="outline">Art. {rule.articleCode}</Badge>}
                        {rule.ruleAnchorLabel && <Badge variant="outline">{rule.ruleAnchorType} · {rule.ruleAnchorLabel}</Badge>}
                      </div>
                      <p className="mt-2 font-medium">{rule.ruleLabel}</p>
                      <p className="text-sm text-muted-foreground">{formatRuleValue(rule)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{rule.documentTitle} · page {rule.sourcePage}</p>
                      <div className="mt-2 rounded-lg bg-muted/20 px-3 py-2 text-xs text-foreground/80">{rule.sourceText}</div>
                      {(publishedData?.relations || []).filter((relation) => relation.sourceRuleId === rule.id).length > 0 && (
                        <div className="mt-3 space-y-2">
                          {(publishedData?.relations || []).filter((relation) => relation.sourceRuleId === rule.id).map((relation) => (
                            <div key={relation.id} className="rounded-lg border bg-background px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{getRelationTypeLabel(relation.relationType)}</Badge>
                                <Badge variant="secondary">{relation.targetRuleLabel || relation.targetDocumentLabel || "Cible a preciser"}</Badge>
                              </div>
                              {(relation.conditionText || relation.priorityNote) && <p className="mt-1 text-muted-foreground">{[relation.conditionText, relation.priorityNote].filter(Boolean).join(" · ")}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">Aucune couche superposée publiée.</div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                    Effets procéduraux
                  </div>
                  {publishedRuleGroups.procedural.length ? publishedRuleGroups.procedural.map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{getRuleTargetLabel(rule)}</Badge>
                        <Badge variant="outline">{getProceduralEffectLabel(rule.proceduralEffect)}</Badge>
                        {rule.overlayType && <Badge variant="secondary">{rule.overlayType}</Badge>}
                        {rule.isRelationalRule && <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">{getRelationResolutionLabel(rule.resolutionStatus)}</Badge>}
                      </div>
                      <p className="mt-2 font-medium">{rule.ruleLabel}</p>
                      <p className="text-sm text-muted-foreground">{rule.interpretationNote || rule.valueText || "Prescription procédurale publiée."}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{rule.documentTitle} · page {rule.sourcePage}</p>
                      {(publishedData?.relations || []).filter((relation) => relation.sourceRuleId === rule.id).length > 0 && (
                        <div className="mt-3 space-y-2">
                          {(publishedData?.relations || []).filter((relation) => relation.sourceRuleId === rule.id).map((relation) => (
                            <div key={relation.id} className="rounded-lg border bg-background px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{getRelationTypeLabel(relation.relationType)}</Badge>
                                <Badge variant="secondary">{relation.targetRuleLabel || relation.targetDocumentLabel || "Cible a preciser"}</Badge>
                              </div>
                              {(relation.conditionText || relation.priorityNote) && <p className="mt-1 text-muted-foreground">{[relation.conditionText, relation.priorityNote].filter(Boolean).join(" · ")}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">Aucun effet procédural publié.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">Aucune règle publiée pour le back mairie.</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
