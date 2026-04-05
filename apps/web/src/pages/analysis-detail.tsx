import { useRef, useState, useEffect, useMemo } from "react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useGetAnalysis, useRunAnalysis } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { 
  Loader2, 
  Map as MapIcon, 
  BookOpen, 
  Calculator, 
  FileText, 
  Activity, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Layers, 
  Navigation, 
  Mountain, 
  Building2, 
  Users, 
  Home,
  MessageSquare, 
  Pencil, 
  Info, 
  Lock,
  Zap,
  Gavel,
  ScrollText,
  Settings,
  MapPin,
  Ruler,
  Maximize2,
  Clock,
  ArrowLeft,
  Download,
  Share2,
  ExternalLink,
  AlertCircle,
  LayoutList,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  FileCheck,
  MoreVertical,
  ChevronRight,
  History,
  Sparkles
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { MapContainer, TileLayer, Polygon, Tooltip as LeafletTooltip, Rectangle } from "react-leaflet";
import { AnalysisChat } from "@/components/analysis/AnalysisChat";
import { SketchPlanner } from "@/components/analysis/SketchPlanner";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import { AIConfidence, TraceabilityReference } from "@workspace/ai-core";
import { TraceabilityViewer } from "@/components/analysis/traceability-viewer";
import { MissingInfoAlert } from "@/components/analysis/missing-info-alert";

interface RuleArticle {
  id: string;
  articleNumber: string;
  title: string;
  summary: string;
  impactText?: string;
  vigilanceText?: string;
  sourceText: string;
  confidence: AIConfidence | string;
  sources?: TraceabilityReference[];
  impact_level?: "blocking" | "major" | "minor";
}

type ReliabilityLevel = "validated" | "calculated" | "estimated" | "to_confirm";

const RELIABILITY_LABELS: Record<ReliabilityLevel, { label: string; className: string }> = {
  validated: {
    label: "Validé",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  calculated: {
    label: "Calculé",
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  estimated: {
    label: "Estimé",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  to_confirm: {
    label: "À confirmer",
    className: "border-border bg-muted/40 text-muted-foreground",
  },
};

function ReliabilityBadge({ level }: { level: ReliabilityLevel }) {
  const meta = RELIABILITY_LABELS[level];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

function hasMeaningfulRegulatoryText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 25) return false;

  const placeholders = [
    "regle standard de la zone.",
    "règle standard de la zone.",
    "non identifie",
    "non identifiée",
    "digest partiel disponible",
    "article 1",
    "article 2",
    "article 3",
    "article 4",
    "article 5",
    "article 6",
    "article 7",
    "article 8",
    "article 9",
    "article 10",
    "article 11",
    "article 12",
    "article 13",
  ];

  const lower = normalized.toLowerCase();
  return !placeholders.includes(lower);
}

export default function AnalysisDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error } = useGetAnalysis(id, { query: { refetchInterval: 5000 } as any }); // Poll every 5s for updates
  const { user } = useAuth();
  const runMutation = useRunAnalysis();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reportIframeRef = useRef<HTMLIFrameElement>(null);


  const [simCost, setSimCost] = useState("");
  const [simTARate, setSimTARate] = useState("");
  const [activeTab, setActiveTab] = useState("parcel");

  // Initialize from existing analysis data if available
  useEffect(() => {
    const analysis = (data as any)?.analysis;
    const gcJson = analysis?.geoContextJson;
    const gc = typeof gcJson === "string" ? JSON.parse(gcJson || "{}") : gcJson;
    const fa = gc?.financial_analysis;
    
    if (fa && !simCost) {
       const initialCost = fa?.economics?.estimated_costs / ( ( (data as any)?.buildability?.remainingFootprintM2 || 1) ) || 0;
       if (initialCost > 0) setSimCost(Math.round(initialCost).toString());
    }
  }, [data]);
  const simulatedBilan = useMemo(() => {
    // Safely extract data from query result
    const d = data as any;
    const buildability = d?.buildability;
    const analysis = d?.analysis;
    const gcJson = analysis?.geoContextJson;
    const city = analysis?.city || "";

    const gc = (() => {
      try {
        if (!gcJson) return null;
        return typeof gcJson === "string" ? JSON.parse(gcJson) : gcJson;
      } catch (e) {
        console.error("Failed to parse geoContextJson in simulator", e);
        return null;
      }
    })();
    const md = gc?.market_data;
    const fa = gc?.financial_analysis;

    const surface = buildability?.remainingFootprintM2 || 0;
    const avgPrice = md?.average_price_m2 || 4500;
    
    // Valeur forfaitaire 2024
    const isIDF = city.toLowerCase().includes("saint-cyr") || true; 
    const valForf = isIDF ? 1170 : 1038;
    const tauxDept = 0.025;
    const tauxRap = 0.004;

    const isMairieLocked = !!fa?.isMairieLocked;
    
    // If locked, we don't use simTARate state, we use the values from the backend
    const rateNum = isMairieLocked 
      ? ((fa?.taxes?.taxe_amenagement || 0) / (surface * valForf || 1) - tauxDept) 
      : (parseFloat(simTARate) / 100 || 0);
    const hasRate = (isMairieLocked && (fa?.taxes?.taxe_amenagement || 0) > 0) || simTARate !== "";
    
    const costValue = parseFloat(simCost) || 0;
    const hasCost = costValue > 0;

    const ta = hasRate ? (surface * valForf * (rateNum + tauxDept)) : 0;
    const rap = surface * valForf * tauxRap;
    const totalTaxes = ta + rap;

    const ca = surface * avgPrice;
    const totalCosts = costValue > 0 ? surface * costValue : 0;
    const margin = (hasCost && hasRate) ? (ca - totalCosts - totalTaxes) : 0;
    const marginPct = ca > 0 ? (margin / ca) * 100 : 0;

    return {
      totalTaxes,
      ta,
      rap,
      ca,
      totalCosts,
      margin,
      marginPct,
      hasCost,
      hasRate,
      isMairieLocked,
      appliedRate: rateNum,
      appliedCost: costValue
    };
  }, [simCost, simTARate, data?.buildability, data?.analysis]);

  const handlePrintReport = () => {
    const iframeWin = reportIframeRef.current?.contentWindow;
    if (iframeWin) {
      iframeWin.focus();
      iframeWin.print();
    }
  };

  const handleRun = () => {
    runMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/analyses/${id}`] });
        toast({ title: "Pipeline relancé", description: "L'analyse est en cours de traitement." });
      }
    });
  };

  if (isLoading && !data) {
    return (
      <ProtectedLayout>
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground font-medium animate-pulse">Chargement du dossier...</p>
        </div>
      </ProtectedLayout>
    );
  }

  if (error || !data) {
    return (
      <ProtectedLayout>
        <div className="text-center py-20 text-destructive">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Erreur de chargement</h2>
          <p>Impossible de charger cette analyse. Elle n'existe peut-être plus.</p>
        </div>
      </ProtectedLayout>
    );
  }

  const { analysis, parcel, zoneAnalysis, buildability, logs } = data;

  // Parse JSON strings from DB
  const parsedGeometry = parcel?.geometryJson
    ? (typeof parcel.geometryJson === "string" ? JSON.parse(parcel.geometryJson as string) : parcel.geometryJson)
    : null;

  const parsedCalcVars = (zoneAnalysis as any)?.extractedRulesJson
    ? (typeof (zoneAnalysis as any).extractedRulesJson === "string" ? JSON.parse((zoneAnalysis as any).extractedRulesJson as string) : (zoneAnalysis as any).extractedRulesJson)
    : null;

  const parsedAssumptions: string[] = (() => {
    try {
      if (!buildability?.assumptionsJson) return [];
      const raw = typeof buildability.assumptionsJson === "string"
        ? JSON.parse(buildability.assumptionsJson as string)
        : buildability.assumptionsJson;
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  })();

  const parcelMetadata = (() => {
    try {
      if (!parcel?.metadataJson) return null;
      return typeof parcel.metadataJson === "string"
        ? JSON.parse(parcel.metadataJson as string)
        : parcel.metadataJson;
    } catch {
      return null;
    }
  })();

  const groupedParcelRefs = Array.isArray(parcelMetadata?.parcelRefs)
    ? (parcelMetadata.parcelRefs as string[]).filter(Boolean)
    : [];
  const displayParcelRef = analysis.parcelRef
    || (groupedParcelRefs.length > 0
      ? groupedParcelRefs.join(" + ")
      : (parcel?.cadastralSection && parcel?.parcelNumber ? `${parcel.cadastralSection} ${parcel.parcelNumber}` : null));

  // Parse GeoContext JSON
  const gc = (analysis as any).geoContextJson
    ? (() => { try { return typeof (analysis as any).geoContextJson === "string" ? JSON.parse((analysis as any).geoContextJson as string) : (analysis as any).geoContextJson; } catch { return null; } })()
    : null;
  const zoneIssues = (() => {
    try {
      if (!(zoneAnalysis as any)?.issuesJson) return [];
      return typeof (zoneAnalysis as any).issuesJson === "string"
        ? JSON.parse((zoneAnalysis as any).issuesJson)
        : (zoneAnalysis as any).issuesJson;
    } catch {
      return [];
    }
  })();

  const pm = gc?.parcel_metrics ?? {};
  const pb = gc?.parcel_boundaries ?? {};
  const bop = gc?.buildings_on_parcel ?? {};
  const nc = gc?.neighbour_context ?? {};
  const rd = gc?.roads ?? {};
  const gcplu = gc?.plu ?? {};
  const tp = gc?.topography ?? {};
  const bld = gc?.buildable ?? {};
  const md = gc?.market_data ?? null;
  const ag = gc?.admin_guide ?? null;
  const fa = gc?.financial_analysis ?? null;
  const sourceLock = gc?.source_lock ?? null;
  const dataQuality = gc?.data_quality ?? {};
  const missingRequirements = gc?.missing_requirements ?? {};
  const missingPluIssue = zoneIssues.find((issue: any) => issue?.type === "NO_PLU_DATA" || issue?.code === "NO_PLU_DATA")
    || (missingRequirements?.plu_source ? { message: missingRequirements.plu_source } : null);
  const parsedDigest = (() => {
    try {
      if (!(zoneAnalysis as any)?.structuredJson) return null;
      return typeof (zoneAnalysis as any).structuredJson === "string"
        ? JSON.parse((zoneAnalysis as any).structuredJson)
        : (zoneAnalysis as any).structuredJson;
    } catch {
      return null;
    }
  })();

  const regulationControls = Array.isArray((analysis as any).metadata?.pluAnalysis?.controles)
    ? (analysis as any).metadata.pluAnalysis.controles.filter((control: any) =>
        hasMeaningfulRegulatoryText(control?.message) || hasMeaningfulRegulatoryText(control?.article) || hasMeaningfulRegulatoryText(control?.categorie)
      )
    : [];

  const meaningfulArticles = Array.isArray((zoneAnalysis as any)?.articles)
    ? (zoneAnalysis as any).articles.filter((article: any) =>
        hasMeaningfulRegulatoryText(article?.sourceText)
        || hasMeaningfulRegulatoryText(article?.summary)
        || hasMeaningfulRegulatoryText(article?.impactText)
        || hasMeaningfulRegulatoryText(article?.vigilanceText)
      )
    : [];

  const digestHighlights = [
    parsedDigest?.dimensions?.maxFootprint ? `Emprise: ${parsedDigest.dimensions.maxFootprint}` : null,
    parsedDigest?.dimensions?.maxHeight ? `Hauteur: ${parsedDigest.dimensions.maxHeight}` : null,
    parsedDigest?.dimensions?.minSetbacks ? `Reculs: ${parsedDigest.dimensions.minSetbacks}` : null,
    parsedDigest?.dimensions?.greenSpace ? `Espaces libres: ${parsedDigest.dimensions.greenSpace}` : null,
    ...(Array.isArray(parsedDigest?.restrictions) ? parsedDigest.restrictions.slice(0, 2) : []),
    ...(Array.isArray(parsedDigest?.conditions) ? parsedDigest.conditions.slice(0, 2) : []),
  ].filter((value): value is string => hasMeaningfulRegulatoryText(value));

  const hasDigestSubstance = !!(
    hasMeaningfulRegulatoryText(parsedDigest?.summary)
    || digestHighlights.length > 0
  );
  const hasRegulatoryMatter = meaningfulArticles.length > 0 || regulationControls.length > 0 || hasDigestSubstance || !!missingPluIssue;

  const reliabilitySummary: { label: string; level: ReliabilityLevel }[] = [
    { label: "Adresse & parcelle", level: (dataQuality.address_and_parcel || (sourceLock?.lat && displayParcelRef ? "validated" : parcel ? "calculated" : "to_confirm")) as ReliabilityLevel },
    { label: "Zone PLU", level: (dataQuality.zoning || (analysis.zoneCode ? "validated" : "to_confirm")) as ReliabilityLevel },
    { label: "Constructibilité", level: (dataQuality.buildability || (buildability ? "calculated" : "to_confirm")) as ReliabilityLevel },
    { label: "Contexte urbain", level: (dataQuality.neighbour_context || (nc?.buildings?.length ? "estimated" : "to_confirm")) as ReliabilityLevel },
  ];

  // confidence score is stored as 0-1, display as percentage
  const confidencePct = analysis.confidenceScore != null ? Math.round(analysis.confidenceScore * 100) : null;
  const buildabilityConfidencePct = buildability?.confidenceScore != null ? Math.round(buildability.confidenceScore * 100) : null;

  // Formatting polygon data for Leaflet — handles both Polygon and MultiPolygon
  function extractFirstRing(geom: { type?: string; coordinates?: unknown }): number[][] | null {
    if (!geom?.coordinates) return null;
    if (geom.type === "MultiPolygon") return (geom.coordinates as number[][][][])[0]?.[0] ?? null;
    if (geom.type === "Polygon") return (geom.coordinates as number[][][])[0] ?? null;
    // Fallback: try coordinates[0] as ring
    const c0 = (geom.coordinates as unknown[])[0];
    if (Array.isArray(c0) && Array.isArray(c0[0]) && typeof c0[0][0] === "number") return c0 as number[][];
    if (Array.isArray(c0)) return (c0 as number[][][])[0] ?? null;
    return null;
  }
  let parcelPositions: [number, number][] = [];
  const geomSrc = parsedGeometry?.geometry ?? parsedGeometry;
  const firstRing = geomSrc ? extractFirstRing(geomSrc) : null;
  if (firstRing) {
    parcelPositions = firstRing.map((c: number[]) => [c[1], c[0]] as [number, number]);
  }

  const mapCenter: [number, number] = parcel?.centroidLat && parcel?.centroidLng 
    ? [parcel.centroidLat, parcel.centroidLng] 
    : [48.8566, 2.3522]; // Default Paris

  // Radar chart data prep
  const rawGreenSpaceRatio = parsedCalcVars?.greenSpaceRatio ?? 0;
  const greenSpaceRatio = rawGreenSpaceRatio > 1 ? rawGreenSpaceRatio / 100 : rawGreenSpaceRatio;
  const radarData = buildability ? [
    { subject: "Emprise", A: Math.max(0, (buildability.maxFootprintM2 || 0) / (parcel?.parcelSurfaceM2 || 1) * 100), fullMark: 100 },
    { subject: "Pleine Terre", A: greenSpaceRatio * 100, fullMark: 100 },
    { subject: "Hauteur", A: Math.min((buildability.maxHeightM || 0) * 10, 100), fullMark: 100 },
  ] : [];
  
  // simulatedBilan moved to top

  return (
    <ProtectedLayout>
      {/* Header */}
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-border mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">{analysis.title || analysis.address}</h1>
            <p className="text-muted-foreground flex items-center gap-2 text-lg">
              <MapIcon className="w-5 h-5" />
              {analysis.address} {analysis.city && `- ${analysis.city}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusBadge status={analysis.status} className="text-sm px-4 py-1.5" />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRun} 
              disabled={runMutation.isPending || analysis.status === 'calculating' || analysis.status === 'extracting_rules'}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${runMutation.isPending ? 'animate-spin' : ''}`} />
              Relancer l'analyse
            </Button>

            {/* ADMIN DEBUG BUTTON */}
            {(user?.role === "admin" || user?.role === "mairie") && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground border-dashed border-muted-foreground/30 hover:border-primary hover:text-primary transition-all">
                    <Activity className="w-4 h-4 mr-2" />
                    Debug Retrieval Trace
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                       <Activity className="w-5 h-5 text-primary" />
                       Internal Retrieval Debug Trace (Admin Only)
                    </DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="flex-1 mt-4 rounded-md border p-4 bg-muted/30">
                    <div className="space-y-6">
                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                         <h4 className="text-sm font-bold text-primary flex items-center gap-2 mb-2">
                            <Layers className="w-4 h-4" />
                            Resolved Jurisdiction Context
                         </h4>
                         <pre className="text-xs font-mono overflow-auto">
                            {JSON.stringify({
                               name: analysis.city,
                               insee: (analysis as any).metadata?.insee,
                               jurisdiction: (analysis as any).metadata?.jurisdiction_id,
                               active_pools: (analysis as any).metadata?.retrievalTrace === "COMPACT: Auto-approved high confidence" ? "COMPACT" : "FULL TRACE PERSISTED"
                            }, null, 2)}
                         </pre>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-bold flex items-center gap-2">
                           <Activity className="w-4 h-4" />
                           Ranking Decisions per Comparison Field
                        </h4>
                        {(analysis as any).metadata?.retrievalTrace && Array.isArray((analysis as any).metadata.retrievalTrace) ? (
                          (analysis as any).metadata.retrievalTrace.map((t: any, i: number) => (
                            <div key={i} className="p-4 bg-card rounded-xl border shadow-sm">
                               <h5 className="font-bold text-sm mb-3 border-b pb-2 flex justify-between items-center">
                                  <span>🚀 Topic: {t.field}</span>
                                  <Badge variant="outline">{t.chunks?.length || 0} chunks</Badge>
                               </h5>
                               <div className="space-y-3">
                                  {t.chunks?.map((c: any, ci: number) => (
                                    <div key={ci} className="text-xs p-3 bg-muted rounded-lg border-l-4 border-primary">
                                       <div className="flex justify-between items-start mb-2">
                                          <span className="font-mono text-[10px] opacity-60">ID: {c.id}</span>
                                          <div className="flex gap-2">
                                             <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Final: {c.trace?.final_rank_score?.toFixed(4)}</Badge>
                                             {c.trace?.was_boosted && <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Article Boost</Badge>}
                                          </div>
                                       </div>
                                       <div className="grid grid-cols-3 gap-2 mb-2 p-2 bg-background/50 rounded border">
                                          <div>
                                             <p className="opacity-60 text-[9px]">SEMANTIC / Sim</p>
                                             <p className="font-bold">{c.trace?.semantic_score?.toFixed(4)}</p>
                                          </div>
                                          <div>
                                             <p className="opacity-60 text-[9px]">AUTHORITY / Wgt</p>
                                             <p className="font-bold">{c.trace?.authority_score?.toFixed(2)}</p>
                                          </div>
                                          <div>
                                             <p className="opacity-60 text-[9px]">LEXICAL / Match</p>
                                             <p className="font-bold">+{c.trace?.lexical_score?.toFixed(1)}</p>
                                          </div>
                                       </div>
                                       {c.trace?.exclusion_reason && (
                                         <p className="text-destructive font-semibold mb-1 italic">⚠️ Excluded: {c.trace.exclusion_reason}</p>
                                       )}
                                    </div>
                                  ))}
                               </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-muted-foreground italic border-dashed border-2 rounded-xl">
                             No retrieval trace found. { (analysis as any).metadata?.retrievalTrace}
                             <p className="text-xs mt-2">Full traces are only stored for low-confidence or non-compliant analyses.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-border mt-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Réf. Cadastrale</p>
            <p className="font-semibold">
              {displayParcelRef || "En recherche..."}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Surface Parcelle</p>
            <p className="font-semibold">{parcel?.parcelSurfaceM2 ? `${parcel.parcelSurfaceM2} m²` : "En recherche..."}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Zone PLU</p>
            <p className="font-semibold text-primary">{analysis.zoneCode ? `Zone ${analysis.zoneCode}` : "En recherche..."}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Score IA Global</p>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{confidencePct != null ? `${confidencePct}%` : "-"}</span>
              <div className="h-2 w-24 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full ${confidencePct != null && confidencePct > 70 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                  style={{ width: `${confidencePct || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4 border-t border-border mt-4">
          <div className="flex flex-wrap items-center gap-3">
            {sourceLock && (
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 flex items-center gap-1.5 py-1.5 px-3">
                <Lock className="w-3.5 h-3.5" />
                Contexte verrouillé avant analyse
              </Badge>
            )}
            {reliabilitySummary.map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <ReliabilityBadge level={item.level} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            `Validé` = donnée issue d'une sélection ou d'une source identifiée. `Calculé` = résultat dérivé de règles ou de géométrie. `Estimé` = contexte indicatif. `À confirmer` = source incomplète.
          </p>
        </div>
      </div>

      {/* ── Analysis progress stepper ── */}
      {(['collecting_data', 'parsing_documents', 'extracting_rules', 'calculating'] as const).includes(analysis.status as any) && (() => {
        const STEPS: { key: string; label: string }[] = [
          { key: 'collecting_data',    label: 'Contexte & géocodage' },
          { key: 'parsing_documents',  label: 'Lecture des pièces' },
          { key: 'extracting_rules',   label: 'Extraction des règles' },
          { key: 'calculating',        label: 'Calcul de constructibilité' },
        ];
        const currentIdx = STEPS.findIndex(s => s.key === analysis.status);
        return (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="font-medium text-primary text-sm">Analyse en cours…</span>
            </div>
            <ol className="flex flex-col sm:flex-row gap-2 sm:gap-0">
              {STEPS.map((step, idx) => {
                const isDone    = idx < currentIdx;
                const isActive  = idx === currentIdx;
                const isPending = idx > currentIdx;
                return (
                  <li key={step.key} className="flex items-center flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        isDone   ? 'bg-emerald-500 text-white' :
                        isActive ? 'bg-primary text-white' :
                                   'bg-muted text-muted-foreground'
                      }`}>
                        {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                      </span>
                      <span className={`text-xs truncate ${isActive ? 'text-primary font-semibold' : isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < STEPS.length - 1 && (
                      <ChevronRight className="flex-shrink-0 w-4 h-4 text-muted-foreground mx-1 hidden sm:block" />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })()}

      {/* ── Failure banner ── */}
      {analysis.status === 'failed' && (() => {
        const failedLog = [...(logs ?? [])].reverse().find(l => l.status === 'failed');
        return (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-destructive mb-1">Analyse échouée</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  {failedLog?.message ?? "Une erreur s'est produite lors de l'analyse. Veuillez relancer pour réessayer."}
                </p>
                {failedLog && (
                  <p className="text-xs text-muted-foreground/70 font-mono">
                    Étape : {failedLog.step} · {new Date(failedLog.createdAt).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
              <Button
                onClick={handleRun}
                disabled={runMutation.isPending}
                className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${runMutation.isPending ? 'animate-spin' : ''}`} />
                {runMutation.isPending ? 'Relance en cours…' : 'Relancer l\'analyse'}
              </Button>
            </div>
          </div>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start h-auto p-1 bg-muted/50 rounded-xl mb-6 overflow-x-auto flex flex-nowrap scrollbar-hide">
          <TabsTrigger value="parcel" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-primary/20"><MapIcon className="w-4 h-4 mr-2"/> Parcelle</TabsTrigger>
          <TabsTrigger value="marche" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm font-bold border-2 border-transparent data-[state=active]:border-primary bg-primary/5 text-primary"><Activity className="w-4 h-4 mr-2"/> Calcul des Taxes 🏛️</TabsTrigger>
          <TabsTrigger value="geocontext" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm" disabled={!gc}><Layers className="w-4 h-4 mr-2"/> Géo-contexte</TabsTrigger>
          <TabsTrigger value="urbanisme" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm" disabled={!zoneAnalysis}><BookOpen className="w-4 h-4 mr-2"/> Règles & preuves</TabsTrigger>
          <TabsTrigger value="calcul" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm" disabled={!buildability && !missingPluIssue}><Calculator className="w-4 h-4 mr-2"/> Constructibilité</TabsTrigger>
          <TabsTrigger value="rapport" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm" disabled={!data.report}><FileText className="w-4 h-4 mr-2"/> Rapport</TabsTrigger>
          <TabsTrigger value="implantation" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm" disabled={!gc}><Pencil className="w-4 h-4 mr-2"/> Implantation</TabsTrigger>
          <TabsTrigger value="chat" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm font-bold border border-transparent data-[state=active]:border-primary/20 bg-primary/5 text-primary"><MessageSquare className="w-4 h-4 mr-2"/> Assistant IA</TabsTrigger>
          <TabsTrigger value="logs" className="py-2.5 px-5 rounded-lg text-sm data-[state=active]:shadow-sm"><Activity className="w-4 h-4 mr-2"/> Logs</TabsTrigger>
        </TabsList>

        {/* TAB 1: PARCELLE */}
        <TabsContent value="parcel" className="space-y-6 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Données Cadastrales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Section</span>
                    <span className="font-medium">{parcel?.cadastralSection || "-"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Numéro</span>
                    <span className="font-medium">{parcel?.parcelNumber || "-"}</span>
                  </div>
                  {groupedParcelRefs.length > 1 && (
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Groupement foncier</span>
                      <span className="font-medium text-right">{groupedParcelRefs.join(" + ")}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Surface géométrique</span>
                    <span className="font-medium text-primary">{parcel?.parcelSurfaceM2 ? `${parcel.parcelSurfaceM2} m²` : "-"}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Linéaire voie (est.)</span>
                    <span className="font-medium">{parcel?.roadFrontageLengthM ? `${parcel.roadFrontageLengthM} m` : "-"}</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Bâti existant</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.buildings && data.buildings.length > 0 ? (
                    <div className="space-y-3">
                      {data.buildings.map((b, i) => (
                        <div key={b.id} className="bg-muted/50 p-3 rounded-lg border border-border flex justify-between items-center">
                          <span className="font-medium text-sm">Bâtiment {i+1}</span>
                          <span className="text-sm font-semibold">{b.footprintM2} m² (R+{b.avgFloors})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Aucun bâti détecté sur la parcelle.</p>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <div className="lg:col-span-2 h-[500px] rounded-xl overflow-hidden shadow-md border border-border relative z-0">
               {parcel?.centroidLat ? (
                  <MapContainer center={mapCenter} zoom={19} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      attribution='&copy; <a href="https://carto.com/">Carto</a>'
                    />
                    {parcelPositions.length > 0 && (
                      <Polygon positions={parcelPositions} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.18, weight: 3 }}>
                        <LeafletTooltip permanent direction="center" className="bg-transparent border-0 shadow-none font-bold text-base text-red-600">
                          {parcel?.parcelSurfaceM2} m²
                        </LeafletTooltip>
                    </Polygon>
                    )}
                  </MapContainer>
               ) : (
                 <div className="w-full h-full bg-muted flex items-center justify-center">
                   <p className="text-muted-foreground">Carte indisponible - Géométrie en attente</p>
                 </div>
               )}
            </div>
          </div>
        </TabsContent>

        {/* TAB GEO-CONTEXTE */}
        <TabsContent value="geocontext" className="space-y-6 focus-visible:outline-none">
          {!gc ? (
            <div className="text-center py-20 text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Le géo-contexte sera disponible après la complétion de l'analyse.</p>
            </div>
          ) : (
            <>
              {/* METRICS RAPIDES */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Périmètre", val: pm.perimeter_m ? `${Math.round(pm.perimeter_m)} m` : "N/D", sub: "Calculé" },
                  { label: "Profondeur", val: pm.depth_m ? `${Math.round(pm.depth_m)} m` : "N/D", sub: "Estimée" },
                  { label: "Façade voirie", val: pb.road_length_m ? `${Math.round(pb.road_length_m)} m` : "N/D", sub: pb.front_road_name ?? "" },
                  { label: "Parcelle d'angle", val: pm.is_corner_plot ? "Oui" : "Non", sub: pm.is_corner_plot ? "Double façade" : "Façade unique" },
                ].map(s => (
                  <Card key={s.label}>
                    <CardContent className="pt-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{s.label}</p>
                      <p className="text-2xl font-bold text-primary">{s.val}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* BÂTIMENTS EXISTANTS */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="flex items-center gap-2"><Building2 className="w-4 h-4" /> Bâti existant sur la parcelle</CardTitle>
                      <ReliabilityBadge level={(dataQuality.address_and_parcel || "to_confirm") as ReliabilityLevel} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {bop.count === 0 ? (
                      <p className="text-muted-foreground text-sm">Aucun bâtiment identifié (BD TOPO).</p>
                    ) : (
                      <>
                        {[
                          ["Nombre de bâtiments", bop.count],
                          ["Emprise bâtie totale", bop.footprint_m2 ? `${Math.round(bop.footprint_m2)} m²` : "N/D"],
                          ["Taux de couverture existant", bop.coverage_ratio != null ? `${Math.round(bop.coverage_ratio * 100)} %` : "N/D"],
                          ["Hauteur moyenne", bop.avg_height_m != null ? `${bop.avg_height_m.toFixed(1)} m` : "N/D"],
                          ["Niveaux moyens", bop.avg_floors != null ? `R+${Math.round(bop.avg_floors) - 1}` : "N/D"],
                          ["Surface plancher estimée", bop.estimated_floor_area_m2 ? `${Math.round(bop.estimated_floor_area_m2)} m²` : "N/D"],
                        ].map(([k, v]) => (
                          <div key={String(k)} className="flex justify-between py-1.5 border-b border-border/40 last:border-0">
                            <span className="text-muted-foreground text-sm">{k}</span>
                            <span className="font-medium text-sm">{String(v ?? "N/D")}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* VOIRIE */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="flex items-center gap-2"><Navigation className="w-4 h-4" /> Voirie et accès</CardTitle>
                      <ReliabilityBadge level={(dataQuality.roads || "to_confirm") as ReliabilityLevel} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      ["Voie principale", rd.nearest_road_name ?? pb.front_road_name ?? "N/D"],
                      ["Distance à la voie", rd.distance_to_road_m != null ? `${rd.distance_to_road_m} m` : "N/D"],
                      ["Largeur chaussée", rd.road_width_m != null ? `${rd.road_width_m} m` : "N/D"],
                      ["Accès véhicule", rd.access_possible ? "✓ Possible" : "À vérifier"],
                      ["Longueur façade sur voie", pb.road_length_m ? `${Math.round(pb.road_length_m)} m` : "N/D"],
                      ["Longueur limites séparatives", pb.side_length_m ? `${Math.round(pb.side_length_m)} m` : "N/D"],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between py-1.5 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground text-sm">{k}</span>
                        <span className="font-medium text-sm">{String(v ?? "N/D")}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* VOISINAGE */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="flex items-center gap-2"><Users className="w-4 h-4" /> Contexte voisinage</CardTitle>
                      <ReliabilityBadge level={(dataQuality.neighbour_context || "to_confirm") as ReliabilityLevel} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      ["Bâtiments voisins analysés", nc.buildings?.length ?? "N/D"],
                      ["Hauteur moyenne voisinage", nc.avg_neighbour_height_m != null ? `${nc.avg_neighbour_height_m.toFixed(1)} m` : "N/D"],
                      ["Typologie urbaine estimée", nc.urban_typology?.replace(/_/g, " ") ?? "N/D"],
                      ["Alignement dominant", nc.dominant_alignment?.replace(/_/g, " ") ?? "N/D"],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between py-1.5 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground text-sm">{k}</span>
                        <span className="font-medium text-sm">{String(v ?? "N/D")}</span>
                      </div>
                    ))}
                    {nc.urban_typology && (
                      <Badge variant="outline" className="mt-2 capitalize">{nc.urban_typology.replace(/_/g, " ")}</Badge>
                    )}
                  </CardContent>
                </Card>

                {/* TOPOGRAPHIE */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2"><Mountain className="w-4 h-4" /> Topographie</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      ["Altitude min (sol NGF)", tp.elevation_min != null ? `${tp.elevation_min.toFixed(1)} m` : "N/D"],
                      ["Altitude max (toit NGF)", tp.elevation_max != null ? `${tp.elevation_max.toFixed(1)} m` : "N/D"],
                      ["Pente estimée", tp.slope_percent != null ? `${tp.slope_percent.toFixed(1)} %` : "N/D"],
                      ["Terrain plat", tp.is_flat != null ? (tp.is_flat ? "Oui" : "Non — pente à étudier") : "N/D"],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between py-1.5 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground text-sm">{k}</span>
                        <span className="font-medium text-sm">{String(v ?? "N/D")}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

              </div>

              {/* ENVELOPPE CONSTRUCTIBLE */}
              {bld.remaining_footprint_m2 != null && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-primary"><Calculator className="w-4 h-4" /> Enveloppe constructible (GeoContext)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Emprise max autorisée", val: `${Math.round(bld.max_footprint_allowed_m2 ?? 0)} m²` },
                        { label: "Emprise restante", val: `${Math.round(bld.remaining_footprint_m2)} m²` },
                        { label: "Hauteur max", val: bld.max_height_m != null ? `${bld.max_height_m} m` : "N/D" },
                        { label: "Volume potentiel", val: bld.volume_potential_m3 != null ? `${Math.round(bld.volume_potential_m3)} m³` : "N/D" },
                      ].map(s => (
                        <div key={s.label} className="text-center">
                          <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                          <p className="text-xl font-bold text-primary">{s.val}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* TAB 2: URBANISME */}
        <TabsContent value="urbanisme" className="space-y-6 focus-visible:outline-none">
           <Card>
             <CardHeader className="bg-primary/5 pb-4">
               <div className="flex justify-between items-start">
                 <div>
                   <CardTitle className="text-2xl text-primary mb-1">Règles & preuves - Zone {zoneAnalysis?.zoneCode}</CardTitle>
                   <p className="text-muted-foreground">{zoneAnalysis?.zoneLabel || "Lecture réglementaire de la zone identifiée"}</p>
                 </div>
                 <div className="flex items-center gap-2">
                   <ConfidenceBadge confidence="Donnée récupérée" type="data" />
                   <ReliabilityBadge level={(dataQuality.zoning || "to_confirm") as ReliabilityLevel} />
                 </div>
               </div>
             </CardHeader>
             <CardContent className="pt-6">
               <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-sky-50/50">
                 <CardContent className="p-5">
                   <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_0.9fr] gap-5">
                     <div className="space-y-3">
                       <div className="flex items-center gap-2 text-primary">
                         <ShieldCheck className="w-4 h-4" />
                         <h3 className="font-semibold">Ce que l'analyse sait vraiment</h3>
                       </div>
                       <ul className="space-y-2 text-sm text-foreground">
                         <li className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                           Zone retenue: <span className="font-semibold">{analysis.zoneCode ? `Zone ${analysis.zoneCode}` : "Non déterminée"}</span>
                         </li>
                         <li className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                           Documents exploitables: <span className="font-semibold">{meaningfulArticles.length > 0 || hasDigestSubstance || regulationControls.length > 0 ? "oui, partiellement" : "pas de règles exploitables détectées"}</span>
                         </li>
                         <li className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                           Constructibilité: <span className="font-semibold">{buildability ? "calcul disponible" : "reste à confirmer"}</span>
                         </li>
                       </ul>
                     </div>
                     <div className="space-y-3">
                       <div className="flex items-center gap-2 text-primary">
                         <ScrollText className="w-4 h-4" />
                         <h3 className="font-semibold">Lecture recommandée</h3>
                       </div>
                       <div className="rounded-xl border border-border/60 bg-background/80 p-4 text-sm text-muted-foreground leading-relaxed">
                         {meaningfulArticles.length > 0
                           ? "Les règles ci-dessous sont les éléments les plus exploitables retrouvés dans la base réglementaire. Elles sont plus fiables que les numéros d'articles seuls."
                           : hasRegulatoryMatter
                             ? "Le système a retrouvé des indices réglementaires, mais pas assez de matière pour reconstituer article par article un règlement propre. Lis d'abord les preuves ci-dessous, puis utilise l'assistant pour questionner un point précis."
                             : "Aucune règle exploitable n'a été reconstituée. L'assistant IA sera plus utile pour croiser les documents disponibles, expliquer les limites et orienter la prochaine action."}
                       </div>
                     </div>
                     <div className="rounded-xl border border-primary/20 bg-primary text-primary-foreground p-4 flex flex-col justify-between gap-4">
                       <div>
                         <div className="flex items-center gap-2 mb-2">
                           <Sparkles className="w-4 h-4 text-accent" />
                           <p className="font-semibold">Assistant HEUREKA</p>
                         </div>
                         <p className="text-sm text-primary-foreground/85 leading-relaxed">
                           Le meilleur point d'entrée pour creuser un article, confronter une hypothèse ou demander une lecture plus discutionnelle du projet.
                         </p>
                       </div>
                       <div className="space-y-2">
                         <Button variant="secondary" className="w-full justify-start" onClick={() => setActiveTab("chat")}>
                           <MessageSquare className="w-4 h-4" />
                           Ouvrir l'assistant IA
                         </Button>
                         <p className="text-[11px] text-primary-foreground/75">
                           Exemples: "Quels extraits justifient la hauteur max ?" ou "Pourquoi la constructibilité reste partielle ?"
                         </p>
                       </div>
                     </div>
                   </div>
                 </CardContent>
               </Card>

               {missingPluIssue && (
                 <div className="flex flex-col items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800 mb-6">
                   <div className="flex items-center gap-2 font-semibold">
                     <AlertTriangle className="w-4 h-4" />
                     Base PLU indisponible pour cette zone
                   </div>
                   <p className="text-sm">{missingPluIssue.message}</p>
                   <p className="text-xs text-amber-700">
                     Tant qu'aucun document PLU opposable n'est indexé pour la commune, l'interprétation détaillée des articles et la constructibilité restent volontairement incomplètes.
                   </p>
                 </div>
               )}

               {/* NOUVEL AFFICHAGE DES ARTICLES (TUNNEL STEP 3) */}
               {regulationControls.length > 0 && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                   {regulationControls.map((c: any, i: number) => (
                     <Card key={i} className="border-border/60 hover:border-primary/40 transition-colors">
                       <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                         <CardTitle className="text-sm font-bold text-primary">{c.article || c.categorie || "Point réglementaire"}</CardTitle>
                         <Badge className={`${c.statut === 'CONFORME' ? 'bg-emerald-500' : 'bg-amber-500'} text-white border-0 text-[10px]`}>
                           {c.statut}
                         </Badge>
                       </CardHeader>
                       <CardContent>
                         <p className="text-xs text-muted-foreground leading-relaxed">{c.message}</p>
                       </CardContent>
                     </Card>
                   ))}
                 </div>
               )}

                {/* NEW: ZONE DIGEST (TRIAGE SUMMARY) */}
                {hasDigestSubstance && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <Card className="md:col-span-4 border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
                      <CardHeader className="py-3 px-6 bg-primary/10 border-b border-primary/10">
                        <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary">
                          <Sparkles className="w-4 h-4" /> Synthèse réglementaire exploitable
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        {hasMeaningfulRegulatoryText(parsedDigest?.summary) && (
                          <p className="text-sm text-foreground leading-relaxed italic mb-4">"{parsedDigest.summary}"</p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div>
                            <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-2 flex items-center gap-1">
                              <Maximize2 className="w-3 h-3" /> Dimensions clés
                            </h5>
                            <ul className="text-xs space-y-1.5 font-medium">
                              {parsedDigest?.dimensions?.maxFootprint && <li>Emprise: {parsedDigest.dimensions.maxFootprint}</li>}
                              {parsedDigest?.dimensions?.maxHeight && <li>Hauteur: {parsedDigest.dimensions.maxHeight}</li>}
                              {parsedDigest?.dimensions?.minSetbacks && <li>Recul: {parsedDigest.dimensions.minSetbacks}</li>}
                              {parsedDigest?.dimensions?.greenSpace && <li>Espaces: {parsedDigest.dimensions.greenSpace}</li>}
                              {!parsedDigest?.dimensions?.maxFootprint && !parsedDigest?.dimensions?.maxHeight && !parsedDigest?.dimensions?.minSetbacks && !parsedDigest?.dimensions?.greenSpace && (
                                <li className="text-muted-foreground">Aucune valeur dimensionnelle stabilisée.</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-2 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3 text-amber-600" /> Restrictions
                            </h5>
                            <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
                              {(parsedDigest?.restrictions || []).slice(0, 4).map((r: string, i: number) => <li key={i}>{r}</li>)}
                              {(!parsedDigest?.restrictions || parsedDigest.restrictions.length === 0) && <li>Aucune restriction clairement extraite.</li>}
                            </ul>
                          </div>
                          <div>
                            <h5 className="text-[10px] font-black uppercase text-muted-foreground mb-2 flex items-center gap-1">
                              <FileCheck className="w-3 h-3 text-emerald-600" /> Conditions
                            </h5>
                            <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
                              {(parsedDigest?.conditions || []).slice(0, 4).map((c: string, i: number) => <li key={i}>{c}</li>)}
                              {(!parsedDigest?.conditions || parsedDigest.conditions.length === 0) && <li>Aucune condition claire isolée.</li>}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {(!meaningfulArticles.length && !hasDigestSubstance && !regulationControls.length) && (
                  <div className="flex flex-col items-center justify-center py-12 text-center bg-amber-50/60 rounded-xl border border-amber-200/60 mb-4">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
                    <h4 className="font-semibold text-amber-800 mb-1">Aucune règle exploitable n'a été reconstituée</h4>
                    <p className="text-sm text-amber-700 max-w-sm">
                      {missingPluIssue?.message || "La zone est identifiée, mais les documents indexés ne permettent pas encore de produire une lecture article par article suffisamment fiable."}
                    </p>
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab("chat")}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Demander une lecture guidée à l'assistant
                    </Button>
                  </div>
                )}

                {meaningfulArticles.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  {meaningfulArticles.map((article: any) => {
                    const extra = JSON.parse(article.structuredJson || "{}");
                    const isHighlyRelevant = extra.relevanceScore >= 80;
                    
                    return (
                    <AccordionItem key={article.id} value={article.id} className={`border-border rounded-lg mb-2 overflow-hidden ${isHighlyRelevant ? 'border-primary/30 bg-primary/5' : ''}`}>
                      <AccordionTrigger className="hover:no-underline hover:bg-muted/50 px-4 rounded-lg transition-colors py-4">
                        <div className="flex items-center gap-4 text-left w-full mr-4">
                          <span className={`w-8 h-8 rounded-full font-bold flex items-center justify-center shrink-0 ${isHighlyRelevant ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                            {article.articleNumber}
                          </span>
                          <div className="flex-grow">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-base">{article.title}</span>
                              {isHighlyRelevant && <Badge className="bg-primary text-[9px] h-4 py-0 uppercase">Prioritaire</Badge>}
                            </div>
                            {extra.relevanceReason && (
                              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{extra.relevanceReason}</p>
                            )}
                          </div>
                          
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <ConfidenceBadge confidence={article.confidence} type="ai" />
                            {extra.relevanceScore && (
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${extra.relevanceScore}%` }} />
                                </div>
                                <span className="text-[9px] font-bold text-muted-foreground">{extra.relevanceScore}% match</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                     <AccordionContent className="px-4 pt-4 pb-6">
                       {/* NOUVEL AFFICHAGE CALCUL TUNNEL (STEP 6) */}
                       {(analysis as any).metadata?.pluAnalysis?.calculationTunnel && (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                           <Card className="bg-emerald-50/20 border-emerald-100 shadow-sm">
                             <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Droit à bâtir (Art. 9 PLU)</CardTitle></CardHeader>
                             <CardContent className="space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-muted-foreground">Surface Parcelle</span>
                                  <span className="font-bold">{parcel?.parcelSurfaceM2 || 0} m²</span>
                                </div>
                                <div className="flex justify-between items-center bg-primary text-primary-foreground p-3 rounded-lg font-bold">
                                  <span>Emprise Autorisée</span>
                                  <span>{((analysis as any).metadata.pluAnalysis.calculationTunnel.footprint?.authorized || 0).toLocaleString()} m²</span>
                                </div>
                             </CardContent>
                           </Card>

                           <Card className="bg-amber-50/20 border-amber-100 shadow-sm">
                             <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">Potentiel Résiduel</CardTitle></CardHeader>
                             <CardContent className="space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-muted-foreground">Existant Détecté</span>
                                  <span className="font-bold text-amber-700">{((analysis as any).metadata.pluAnalysis.calculationTunnel.footprint?.existing || 0).toLocaleString()} m²</span>
                                </div>
                                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-lg border-2 border-emerald-500/30">
                                  <p className="text-2xl font-black text-emerald-700">
                                    {((analysis as any).metadata.pluAnalysis.calculationTunnel.footprint?.remaining || 0).toLocaleString()} m²
                                  </p>
                                  <TrendingUp className="w-8 h-8 text-emerald-500 opacity-20" />
                                </div>
                             </CardContent>
                           </Card>
                         </div>
                       )}

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-4">
                           <div>
                             <h4 className="font-bold text-sm text-primary mb-2 uppercase tracking-wider">Résumé IA</h4>
                             <div className="text-foreground leading-relaxed p-4 bg-muted/30 rounded-lg border border-border/50 text-sm">
                               <p>{article.summary}</p>
                               
                               {/* Uncertainty UX Path */}
                               {typeof article.confidence === 'object' && article.confidence.review_status === 'manual_required' && (
                                 <MissingInfoAlert 
                                   type="expert" 
                                   missingFields={article.confidence.missing_critical_data}
                                   reason={article.confidence.reason}
                                   className="mt-3"
                                 />
                               )}
                             </div>
                           </div>
                           {article.impactText && (
                             <div>
                               <h4 className="font-bold text-sm text-emerald-700 mb-2 uppercase tracking-wider">Impact Projet</h4>
                               <p className="text-foreground leading-relaxed p-4 bg-emerald-50 rounded-lg border border-emerald-100 text-sm">
                                 {article.impactText}
                               </p>
                             </div>
                           )}
                           {article.vigilanceText && (
                             <div>
                               <h4 className="font-bold text-sm text-amber-700 mb-2 uppercase tracking-wider">Point de vigilance</h4>
                               <p className="text-foreground leading-relaxed p-4 bg-amber-50 rounded-lg border border-amber-100 text-sm">
                                 {article.vigilanceText}
                               </p>
                             </div>
                           )}
                           
                           {/* Traceability Section */}
                           {article.sources && article.sources.length > 0 && (
                             <div className="pt-2">
                               <TraceabilityViewer sources={article.sources} />
                             </div>
                           )}
                         </div>
                         <div>
                           <h4 className="font-bold text-sm text-muted-foreground mb-2 uppercase tracking-wider">Texte Source (Extrait)</h4>
                           <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg h-full max-h-96 overflow-y-auto font-mono text-xs text-gray-600">
                             {article.sourceText}
                           </div>
                         </div>
                       </div>
                      </AccordionContent>
                    </AccordionItem>
                  )})}
                </Accordion>
                )}
              </CardContent>
            </Card>
         </TabsContent>

        {/* TAB 3: CALCUL */}
        <TabsContent value="calcul" className="space-y-6 focus-visible:outline-none">
          {!buildability && missingPluIssue && (
            <Card className="border-amber-200 bg-amber-50/80">
              <CardHeader>
                <CardTitle className="text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Constructibilité indisponible faute de base PLU
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-800 space-y-2">
                <p>{missingPluIssue.message}</p>
                <p>
                  Le système ne calcule plus de constructibilité théorique quand aucun document PLU opposable n'est disponible pour la commune ou la zone identifiée.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="border-b border-border/50 bg-muted/20">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <CardTitle>Potentiel Constructible Théorique</CardTitle>
                      <ReliabilityBadge level={(dataQuality.buildability || "to_confirm") as ReliabilityLevel} />
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Score de confiance</p>
                      <span className={`text-2xl font-bold ${buildabilityConfidencePct != null && buildabilityConfidencePct > 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {buildabilityConfidencePct != null ? `${buildabilityConfidencePct}%` : "-"}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    <div className="p-6 flex flex-col items-center text-center">
                      <p className="text-sm text-muted-foreground mb-2">Emprise Max.</p>
                      <p className="text-3xl font-bold text-primary">{buildability?.maxFootprintM2 ? `${buildability.maxFootprintM2} m²` : '-'}</p>
                    </div>
                    <div className="p-6 flex flex-col items-center text-center">
                      <p className="text-sm text-muted-foreground mb-2">Droit à bâtir restant</p>
                      <p className="text-3xl font-bold text-emerald-600">{buildability?.remainingFootprintM2 ? `${buildability.remainingFootprintM2} m²` : '-'}</p>
                    </div>
                    <div className="p-6 flex flex-col items-center text-center">
                      <p className="text-sm text-muted-foreground mb-2">Hauteur Max.</p>
                      <p className="text-3xl font-bold text-primary">{buildability?.maxHeightM ? `${buildability.maxHeightM} m` : '-'}</p>
                    </div>
                    <div className="p-6 flex flex-col items-center text-center">
                      <p className="text-sm text-muted-foreground mb-2">Pleine Terre</p>
                      <p className="text-3xl font-bold text-primary">{buildability?.greenSpaceRequirement || '-'}</p>
                    </div>
                  </div>
                  
                  <div className="p-6 bg-muted/30 border-t border-border">
                    <h4 className="font-bold text-sm mb-4 uppercase tracking-wider text-muted-foreground">Règles d'implantation</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-background p-4 rounded-lg border border-border shadow-sm">
                        <span className="block text-sm text-muted-foreground mb-1">Recul voie publique (Art. 6)</span>
                        <span className="font-semibold text-lg">{buildability?.setbackRoadM ? `${buildability.setbackRoadM} m minimum` : 'Non contraint'}</span>
                      </div>
                      <div className="bg-background p-4 rounded-lg border border-border shadow-sm">
                        <span className="block text-sm text-muted-foreground mb-1">Recul limites séparatives (Art. 7)</span>
                        <span className="font-semibold text-lg">{buildability?.setbackBoundaryM ? `${buildability.setbackBoundaryM} m minimum` : 'Non contraint'}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Hypothèses prises par l'IA</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {parsedAssumptions.map((assum, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span className="text-muted-foreground">{assum}</span>
                      </li>
                    ))}
                    {parsedAssumptions.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">Aucune hypothèse particulière n'a été nécessaire.</p>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1 space-y-6">
              <Card className="h-[350px]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm uppercase tracking-wider text-center text-muted-foreground">Profil de densité</CardTitle>
                </CardHeader>
                <CardContent className="h-full pb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                      <Radar name="Parcelle" dataKey="A" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              
              <Card className="bg-primary text-primary-foreground border-none">
                <CardContent className="p-6">
                  <h4 className="font-bold mb-2 flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-accent" />
                    Bilan de l'étude
                  </h4>
                  <p className="text-primary-foreground/80 text-sm leading-relaxed">
                    {buildability?.resultSummary || (parcel?.parcelSurfaceM2
                      ? `Parcelle de ${parcel.parcelSurfaceM2}m² identifiee. Importez les documents PLU de la commune dans la Base IA pour obtenir les regles d'emprise et de hauteur.`
                      : "Relancez l'analyse pour calculer le potentiel constructible.")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: RAPPORT */}
        <TabsContent value="rapport" className="focus-visible:outline-none">
          {data.report?.htmlContent ? (
            <div className="rounded-xl shadow-lg border border-border overflow-hidden">
              <div className="flex justify-end items-center gap-3 bg-card px-6 py-3 border-b border-border">
                <span className="text-sm text-muted-foreground flex-1">Rapport d'analyse foncière</span>
                <Button size="sm" onClick={handlePrintReport}>
                  <FileText className="w-4 h-4 mr-2" />
                  Télécharger le PDF
                </Button>
              </div>
              <iframe
                ref={reportIframeRef}
                srcDoc={data.report.htmlContent}
                className="w-full border-0"
                style={{ height: "calc(100vh - 220px)", minHeight: "700px" }}
                title="Rapport foncier"
                sandbox="allow-same-origin allow-scripts allow-modals"
              />
            </div>
          ) : (
            <div className="bg-card p-12 text-center rounded-xl border border-border">
              <p className="text-muted-foreground">Le rapport n'a pas encore été généré.</p>
            </div>
          )}
        </TabsContent>

        {/* TAB: CALCUL DES TAXES */}
        <TabsContent value="marche" className="space-y-6 focus-visible:outline-none">
          {/* Tax summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-border/60 overflow-hidden relative shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Calculator className="w-12 h-12" /></div>
              <CardHeader className="pb-2 px-6 pt-6">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Taxe d'Aménagement (TA)</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <p className="text-3xl font-black text-primary">{Math.round(simulatedBilan.ta).toLocaleString()} €</p>
                <p className="text-[10px] text-muted-foreground mt-2 font-bold uppercase tracking-tight">
                  {simulatedBilan.hasRate ? `Taux: ${(simulatedBilan.appliedRate * 100).toFixed(1)}% commune + 2.5% dépt` : "Renseignez le taux ci-dessous"}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/60 overflow-hidden relative shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-10"><RefreshCw className="w-12 h-12" /></div>
              <CardHeader className="pb-2 px-6 pt-6">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground tracking-widest">RAP (Redevance Archéo)</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <p className="text-3xl font-black text-primary">{Math.round(simulatedBilan.rap).toLocaleString()} €</p>
                <p className="text-[10px] text-muted-foreground mt-2 font-bold uppercase tracking-tight">Taux national 0.4%</p>
              </CardContent>
            </Card>

            <Card className="border-border/60 overflow-hidden relative shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Home className="w-12 h-12" /></div>
              <CardHeader className="pb-2 px-6 pt-6">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Total Taxes</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <p className="text-3xl font-black text-primary">{Math.round(simulatedBilan.totalTaxes).toLocaleString()} €</p>
                <p className="text-[10px] text-muted-foreground mt-2 font-bold uppercase tracking-tight">Surface: {buildability?.remainingFootprintM2 || 0} m²</p>
              </CardContent>
            </Card>
          </div>

          {/* Simulator inputs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" /> Simulateur de Taxes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Taux TA Commune (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 5.0"
                    value={simTARate}
                    onChange={e => setSimTARate(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Coût de Construction (€/m²)</label>
                  <input
                    type="number"
                    step="100"
                    placeholder="Ex: 2000"
                    value={simCost}
                    onChange={e => setSimCost(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {simulatedBilan.hasCost && simulatedBilan.hasRate && (
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">CA Estimé</p>
                    <p className="text-xl font-black text-emerald-600">{Math.round(simulatedBilan.ca / 1000)}k€</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Coûts Totaux</p>
                    <p className="text-xl font-black text-destructive">{Math.round((simulatedBilan.totalCosts + simulatedBilan.totalTaxes) / 1000)}k€</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase font-bold">Marge</p>
                    <p className={`text-xl font-black ${simulatedBilan.margin >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      {simulatedBilan.marginPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Market data & CERFA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {md?.last_transactions && md.last_transactions.length > 0 && (
              <Card>
                <CardHeader className="pb-3 px-6 pt-6">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" /> Dernières Transactions (DVF)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="space-y-2">
                    {md.last_transactions.map((t: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-xs p-2 rounded bg-muted/20">
                        <span>{t.type} · {t.surface}m²</span>
                        <span className="font-bold">{(t.price / 1000).toFixed(0)}k€</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {ag && (
              <Card>
                <CardHeader className="pb-3 px-6 pt-6">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-500" /> Dossier CERFA {ag?.cerfa_number}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">Délai: {ag?.deadlines}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3">
                  <p className="text-xs text-muted-foreground">{ag?.procedure_name}</p>
                  {ag?.cerfa_url && (
                    <a href={ag.cerfa_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" className="w-full text-[10px] h-8">Télécharger le formulaire</Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>



        {/* TAB IMPLANTATION */}
        <TabsContent value="implantation" className="focus-visible:outline-none">
          <SketchPlanner
            parcelGeometryJson={parcel?.geometryJson as any}
            parcelSurfaceM2={parcel?.parcelSurfaceM2 ?? null}
            centroidLat={parcel?.centroidLat ?? null}
            centroidLng={parcel?.centroidLng ?? null}
            plu={(gcplu && Object.keys(gcplu).length > 0 ? gcplu : null) as any}
          />
        </TabsContent>

        {/* TAB ASSISTANT IA */}
        <TabsContent value="chat" className="focus-visible:outline-none">
          <div className="space-y-4">
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-sky-50/60">
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                      <Sparkles className="w-4 h-4" />
                      <p className="font-semibold">Analyse conversationnelle recommandée</p>
                    </div>
                    <p className="text-sm text-muted-foreground max-w-3xl">
                      Utilise l'assistant pour demander une lecture plus concrète du projet: il peut expliquer une contrainte, citer les éléments factuels retrouvés et pointer ce qui manque encore dans la base réglementaire.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-lg border border-border bg-background px-3 py-2">"Quels extraits justifient la hauteur max ?"</div>
                    <div className="rounded-lg border border-border bg-background px-3 py-2">"Pourquoi la constructibilité reste partielle ?"</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <AnalysisChat analysisId={id} analysisStatus={analysis.status} />
          </div>
        </TabsContent>

        {/* TAB 5: LOGS */}
        <TabsContent value="logs" className="focus-visible:outline-none">
          <Card>
            <CardHeader>
              <CardTitle>Journal d'exécution (Pipeline)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {logs?.map((log: any, index: number) => (
                  <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-muted shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                      {log.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {log.status === 'failed' && <XCircle className="w-4 h-4 text-destructive" />}
                      {log.status === 'started' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                      {log.status === 'skipped' && <Activity className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-card shadow-sm">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="font-bold text-sm text-primary uppercase tracking-wide">{log.step}</h4>
                        <span className="text-xs text-muted-foreground font-mono">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{log.message}</p>
                    </div>
                  </div>
                ))}
                {(!logs || logs.length === 0) && (
                  <p className="text-center text-muted-foreground">Aucun log disponible.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </ProtectedLayout>
  );
}
