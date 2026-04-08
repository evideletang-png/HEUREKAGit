import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Building, FileText, CheckCircle2, AlertTriangle, XCircle, Eye, ArrowLeft, MapPin, User, Calendar, ClipboardCheck, ChevronRight, MessageSquare, Send, Shield, Building2, UploadCloud, Trash2, Settings, Save, Clock, RefreshCw, BrainCircuit, RotateCcw, ChevronDown, Gavel, Zap, Folder, HardDrive, Network, BookOpen, ScrollText, Activity, BarChart3, ShieldCheck, TrendingUp, Play, Scale, Quote, Calculator, Plus } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { RegulatoryCalibrationModule } from "@/components/mairie/RegulatoryCalibrationModule";

type Dossier = {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  status: string;
  analysisId: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userEmail: string | null;
  analysisAddress: string | null;
  analysisCity: string | null;
  analysisZoneCode: string | null;
  analysisZoningLabel: string | null;
  commune: string | null;
  address: string | null;
  parcelRef: string | null;
  zoneCode: string | null;
  zoneLabel: string | null;
  documentCount?: number;
  anomalyCount?: number;
  criticalityScore?: number;
  metadata?: {
    pluAnalysis?: {
      zone: string;
      controles: { categorie: string; statut: string; message: string; article: string }[];
      conclusion: string;
    };
    financialAnalysis?: {
      resultats: Record<string, number | string>;
      detail_calculs: Array<{nom: string; formule: string; valeurs: Record<string, number>; resultat: number | string}>;
      parametres_utilises: any;
      hypotheses: string[];
      niveau_confiance: string;
    };
    preControl?: {
      completude: string;
      pieces_manquantes: any[];
      pieces_incorrectes: any[];
    };
    [key: string]: any;
  } | null;
};

type PluZoneReviewSection = {
  id: string;
  zoneCode: string;
  parentZoneCode: string | null;
  heading: string;
  startPage: number | null;
  endPage: number | null;
  isSubZone: boolean;
  documentType: string | null;
  sourceAuthority: number;
  reviewStatus: "auto" | "validated" | "to_review" | "rejected";
  reviewNotes: string | null;
  reviewedAt: string | null;
  document: {
    id: string;
    title: string;
    documentType: string | null;
    textQualityLabel: string | null;
    textQualityScore: number | null;
    isOpposable: boolean | null;
  } | null;
};

type PluZoneReviewData = {
  commune: string;
  municipalityId: string;
  summary: {
    writtenRegulationCount: number;
    opposableDocumentCount: number;
    zoneSectionCount: number;
    validatedZoneCount: number;
    pendingZoneCount: number;
    readyStatus: "missing" | "ready" | "partial" | "needs_review";
  };
  sections: PluZoneReviewSection[];
};

type PluRuleReview = {
  id: string;
  zoneCode: string | null;
  themeKey: string;
  themeLabel: string;
  title: string;
  articleNumber: number | null;
  sourceText: string;
  confidence: string;
  reviewStatus: "auto" | "validated" | "to_review" | "rejected";
  reviewNotes: string | null;
  reviewedAt: string | null;
  startPage: number | null;
  endPage: number | null;
  valueHint?: string | null;
  requiresManualValidation?: boolean;
  conflictFlag?: boolean;
  sourceExcerpt?: string | null;
  document: {
    id: string;
    title: string;
    documentType: string | null;
    textQualityLabel: string | null;
    textQualityScore: number | null;
    isOpposable: boolean | null;
  } | null;
};

type PluRuleReviewData = {
  commune: string;
  municipalityId: string;
  summary: {
    ruleCount: number;
    validatedRuleCount: number;
    pendingRuleCount: number;
    readyStatus: "missing" | "ready" | "partial" | "needs_review";
  };
  rules: PluRuleReview[];
};

type PluKnowledgeSummary = {
  commune: string;
  municipalityId: string;
  summary: {
    documentCount: number;
    structuredDocumentCount: number;
    zoneCount: number;
    ruleCount: number;
    conflictCount: number;
    manualReviewCount: number;
  };
  documents: Array<{
    id: string;
    title: string;
    fileName: string | null;
    documentType: string | null;
    opposable: boolean;
    availabilityStatus: string;
    availabilityMessage: string;
    textQualityLabel: string | null;
    textQualityScore: number | null;
    profile: {
      id: string;
      status: string;
      extractionMode: string;
      extractionReliability: number | null;
      manualReviewRequired: boolean;
      detectedZonesCount: number;
      structuredTopicsCount: number;
    } | null;
    extractedRuleCount: number;
  }>;
  conflicts: Array<{
    id: string;
    zoneCode: string | null;
    ruleFamily: string;
    ruleTopic: string;
    conflictType: string;
    conflictSummary: string;
    status: string;
    requiresManualValidation: boolean;
  }>;
};

function getTextQualityBadgeMeta(label?: string) {
  switch (label) {
    case "excellent":
      return { text: "Texte excellent", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "usable":
      return { text: "Texte exploitable", className: "bg-sky-50 text-sky-700 border-sky-200" };
    case "partial":
      return { text: "Texte partiel", className: "bg-amber-50 text-amber-700 border-amber-200" };
    case "poor":
      return { text: "Texte faible", className: "bg-orange-50 text-orange-700 border-orange-200" };
    default:
      return { text: "Texte absent", className: "bg-muted text-muted-foreground border-border" };
  }
}

function getZoneReviewStatusMeta(status?: string) {
  switch (status) {
    case "validated":
      return { text: "Validé", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
    case "to_review":
      return { text: "À revoir", className: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle };
    case "rejected":
      return { text: "Écarté", className: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle };
    default:
      return { text: "Auto-détecté", className: "bg-sky-50 text-sky-700 border-sky-200", icon: BrainCircuit };
  }
}

function getZoneReadyMeta(status?: string) {
  switch (status) {
    case "ready":
      return { text: "PLU prêt", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "partial":
      return { text: "Prêt partiellement", className: "bg-sky-50 text-sky-700 border-sky-200" };
    case "needs_review":
      return { text: "Revue ciblée utile", className: "bg-amber-50 text-amber-700 border-amber-200" };
    default:
      return { text: "Corpus incomplet", className: "bg-muted text-muted-foreground border-border" };
  }
}

type DossierDetail = Dossier & {
  dossierId: string | null;
  rawText: string | null;
  extractedDataJson: string | null;
  comparisonResultJson: string | null;
  analysisConfidenceScore: number | null;
  timelineStep: string | null;
  messages?: DossierMsg[];
  documents: {
    id: string;
    title: string;
    fileName: string | null;
    documentType: string;
    pieceCode?: string;
    pieceStatus?: string;
    isRequested?: boolean;
    status: string;
    failureReason?: string;
    comparisonResultJson?: string | null;
    documentNature: string | null;
    expertiseNotes: string | null;
    createdAt: string;
  }[];
};

type MairieSettings = {
  taRateCommunal?: number;
  taRateDept?: number;
  taxeFonciereRate?: number;
  teomRate?: number;
  rapRate?: number;
  valeurForfaitaireTA?: number;
  valeurForfaitairePiscine?: number;
  valeurForfaitaireStationnement?: number;
  prixM2Maison?: number;
  prixM2Collectif?: number;
  yieldMaison?: number;
  yieldCollectif?: number;
  abattementRP?: number;
  surfaceAbattement?: number;
  formulas?: Record<string, string>;
};

type ComparisonResult = {
  conformites: { point: string; article?: string; explication: string; citation?: string }[];
  inconsistencies: { point: string; article?: string; explication: string; severite: string; citation?: string }[];
  points_attention: { point: string; explication: string }[];
  summary: string;
  recommendations: string[];
  score?: number;
  global_status?: string;
  formalDecision?: any;
  simulation?: any;
  cross_document_issues?: { target: string; issue: string; severity: string }[];
  regulatory_checks?: { rule: string; compliance: string; source: string; analysis: string }[];
};

type DossierMsg = {
  id: number;
  dossierId: string;
  fromUserId: string;
  fromRole: string;
  content: string;
  createdAt: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  permis_de_construire: "Permis de construire",
  declaration_prealable: "Déclaration préalable",
  permis_amenager: "Permis d'aménager",
  certificat_urbanisme: "Certificat d'urbanisme",
  autre: "Autre document",
};

function AICorrectionModal({ 
  commune, 
  category, 
  originalRule, 
  onSuccess 
}: { 
  commune: string; 
  category: string; 
  originalRule: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [correction, setCorrection] = useState("");
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/learnings/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commune,
          category,
          originalRule,
          humanCorrection: correction,
          reason
        })
      });
      if (!r.ok) throw new Error("Erreur lors de la sauvegarde");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Apprentissage activé", description: "L'IA prendra en compte cette règle pour les futurs dossiers." });
      setOpen(false);
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'enregistrer la correction.", variant: "destructive" });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary hover:bg-primary/10">
          <BrainCircuit className="w-3 h-3" />
          Corriger l'IA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            Entraînement Local (Human-in-the-Loop)
          </DialogTitle>
          <DialogDescription>
            Cette correction sera enregistrée comme règle prioritaire pour la commune de <strong>{commune}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Point analysé</label>
            <div className="p-3 bg-muted/30 rounded border text-xs font-medium text-foreground">
              {category}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Version de l'IA (Erroneé)</label>
            <div className="p-3 bg-red-50 text-red-700 rounded border border-red-100 text-xs italic">
              {originalRule}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Correction Humaine (Règle réelle)</label>
            <Textarea 
              placeholder="Exemple: 'La hauteur max en zone UA est de 12m et non 9m car [raison].'"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              className="text-sm h-24"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Justification / Source</label>
            <Input 
              placeholder="Exemple: Modification PLU du 12/01/2024"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button 
            className="gap-2" 
            onClick={() => mutation.mutate()} 
            disabled={mutation.isPending || !correction.trim()}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer pour cette commune
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  completed: { label: "Analysé", variant: "default", icon: CheckCircle2 },
  processing: { label: "En cours", variant: "secondary", icon: Loader2 },
  pending: { label: "En attente", variant: "outline", icon: ClipboardCheck },
  failed: { label: "Échec", variant: "destructive", icon: XCircle },
};

const SEVERITE_CONFIG: Record<string, { label: string; color: string }> = {
  mineure: { label: "Observation", color: "bg-yellow-50 text-yellow-700 border-yellow-100" },
  majeure: { label: "Alerte Majeure", color: "bg-orange-50 text-orange-700 border-orange-100" },
  bloquante: { label: "Non-Conformité Bloquante", color: "bg-red-50 text-red-700 border-red-100" },
  critical: { label: "Bloquante", color: "bg-red-50 text-red-700 border-red-100" },
  warning: { label: "Alerte", color: "bg-orange-50 text-orange-700 border-orange-100" },
  ok: { label: "Conforme", color: "bg-green-50 text-green-700 border-green-100" },
  info: { label: "Information", color: "bg-blue-50 text-blue-700 border-blue-100" },
};

const PieceChecklist = ({ checklist }: { checklist: any }) => {
  if (!checklist) return null;

  const { pieces_obligatoires, pieces_conditionnelles, pieces_manquantes, niveau_completude, justification_reglementaire } = checklist;

  return (
    <Card className={`border-none ${niveau_completude === 'OK' ? 'bg-green-50/20' : 'bg-amber-50/20'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            Checklist des Pièces Justificatives
          </CardTitle>
          <Badge className={niveau_completude === 'OK' ? 'bg-green-600' : 'bg-amber-600'}>
            {niveau_completude === 'OK' ? 'DOSSIER COMPLET' : 'PIÈCES MANQUANTES'}
          </Badge>
        </div>
        {justification_reglementaire && (
          <p className="text-[10px] text-muted-foreground mt-1 italic">{justification_reglementaire}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase px-1">Pièces Obligatoires</h4>
            {pieces_obligatoires?.map((code: string) => (
              <div key={code} className="flex items-center justify-between p-2 bg-white rounded border border-border/50">
                <span className="text-xs font-mono font-bold text-primary">{code}</span>
                {pieces_manquantes?.includes(code) ? (
                  <Badge variant="destructive" className="h-5 text-[9px]">MANQUANT</Badge>
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
              </div>
            ))}
          </div>
          
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase px-1">Pièces Sous Condition</h4>
            {pieces_conditionnelles && Object.entries(pieces_conditionnelles).map(([code, justification]: [string, any]) => (
              <div key={code} className="flex flex-col p-2 bg-white rounded border border-border/50 gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-indigo-600">{code}</span>
                  {pieces_manquantes?.includes(code) ? (
                    <Badge variant="destructive" className="h-5 text-[9px]">MANQUANT</Badge>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground leading-tight italic">{justification}</p>
              </div>
            ))}
            {(!pieces_conditionnelles || Object.keys(pieces_conditionnelles).length === 0) && (
              <p className="text-[10px] text-muted-foreground italic px-2">Aucune pièce conditionnelle identifiée.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

async function apiFetch(path: string, options: any = {}) {
  const r = await fetch(path, { credentials: "include", ...options });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function PLUAnalysisPanel({ analysis }: { analysis: any }) {
  if (!analysis) return null;
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
        <Gavel className="w-4 h-4" /> Conclusion Réglementaire (IA)
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {analysis.controles?.map((c: any, i: number) => (
          <div key={i} className={`p-3 rounded-lg border flex flex-col gap-1 ${c.statut === 'NON_CONFORME' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">{c.categorie}</span>
              <Badge variant={c.statut === 'NON_CONFORME' ? 'destructive' : 'default'} className="text-[9px] h-4">
                {c.statut === 'NON_CONFORME' ? 'X' : 'OK'}
              </Badge>
            </div>
            <p className={`text-xs font-semibold ${c.statut === 'NON_CONFORME' ? 'text-red-700' : 'text-green-700'}`}>{c.message}</p>
            {c.article && <p className="text-[9px] opacity-60 italic">Article : {c.article}</p>}
          </div>
        ))}
      </div>
      <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
        <p className="text-xs font-bold uppercase text-primary mb-1">Avis de l'Expert Urbain :</p>
        <p className="text-sm font-medium leading-relaxed">{analysis.conclusion}</p>
      </div>
    </div>
  );
}

function TraceabilityPoint({ data }: { data: any }) {
  if (!data) return null;
  const isOk = data.severity === 'ok' || !data.severite || data.severite === 'ok';
  
  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className={`px-4 py-2 flex items-center justify-between border-b ${isOk ? 'bg-green-50/50' : 'bg-red-50/50'}`}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] bg-white text-primary border-primary/20 italic">
            {data.article || "Article n.c."}
          </Badge>
          <span className="text-xs font-bold uppercase tracking-tight text-slate-700">{data.point}</span>
        </div>
        <Badge variant={isOk ? 'secondary' : 'destructive'} className="text-[9px] font-black h-5">
          {isOk ? 'CONFORME' : 'NON CONFORME'}
        </Badge>
      </div>
      
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase text-muted-foreground/70">Valeur Projet</p>
            <p className="text-sm font-bold text-slate-800">{data.valeur || "Non renseigné"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase text-muted-foreground/70">Règle PLU</p>
            <p className="text-sm font-bold text-indigo-700">{data.regle || "Règle non extraite"}</p>
          </div>
        </div>

        {data.texte_source && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100 relative group">
            <div className="absolute top-0 right-0 p-1">
              <Scale className="w-3 h-3 text-slate-300 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1">
              <Quote className="w-2.5 h-2.5" /> Texte Source (Règlement)
            </p>
            <p className="text-[11px] leading-relaxed text-slate-600 italic select-all cursor-text">
              "{data.texte_source}"
            </p>
          </div>
        )}

        {data.interpretation && (
          <div className="p-3 bg-primary/[0.02] rounded-lg border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/60 mb-1">Interprétation de l'instructeur</p>
            <p className="text-xs font-semibold leading-relaxed text-slate-900">
              {data.interpretation}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-dashed">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {data.explication || data.expiration}
          </p>
        </div>
      </div>
    </div>
  );
}

function FinancialAnalysisPanel({ analysis, dossierId }: { analysis: any; dossierId: string }) {
  const [valeurProjet, setValeurProjet] = useState(analysis?.marketAnalysis?.valeur_projet || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (val: number) => {
      const r = await fetch(`/api/mairie/dossiers/${dossierId}/metadata`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { valeur_projet: val } }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Valeur mise à jour", description: "Recalcul du bilan en cours..." });
      // Chain with re-analysis
      reAnalyzeMutation.mutate();
    }
  });

  const reAnalyzeMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/mairie/dossiers/${dossierId}/re-analyze`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Analyse lancée", description: "Le moteur financier recalcule les indicateurs." });
      queryClient.invalidateQueries({ queryKey: ["mairie-dossier", dossierId] });
    }
  });

  if (!analysis) {
    return (
      <div className="p-8 text-center bg-primary/5 rounded-2xl border-2 border-dashed border-primary/20 mt-4">
        <TrendingUp className="w-12 h-12 mx-auto mb-4 text-primary/20" />
        <h4 className="text-lg font-bold mb-2">Expertise Financière requise</h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Les indicateurs fiscaux et de marché n'ont pas encore été calculés pour ce dossier. 
          Lancez l'expertise pour obtenir le bilan complet et les données DVF.
        </p>
        <Button 
          onClick={() => reAnalyzeMutation.mutate()} 
          disabled={reAnalyzeMutation.isPending}
          className="gap-2 font-black uppercase tracking-widest text-[10px]"
        >
          {reAnalyzeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {reAnalyzeMutation.isPending ? "Analyse en cours..." : "Lancer l'Expertise Financière"}
        </Button>
      </div>
    );
  }
  const market = analysis.marketAnalysis;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Bilan Fiscal & Marché (Module 12)
        </h4>
        {market && (
          <Badge variant={market.positionnement === "aligné" ? "outline" : market.positionnement === "supérieur" ? "destructive" : "secondary"} className="text-[10px] font-bold uppercase">
             {market.positionnement} au marché ({market.ecart_pourcentage > 0 ? "+" : ""}{market.ecart_pourcentage}%)
          </Badge>
        )}
      </div>

      {/* Saisie Valeur Projet */}
      <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex flex-col gap-3">
        <label className="text-[10px] font-black uppercase text-primary/70">Valeur Projet (Hypothèse Utilisateur)</label>
        <div className="flex gap-2">
          <Input 
            type="number" 
            placeholder="Ex: 450000" 
            defaultValue={valeurProjet}
            onBlur={(e) => {
              const val = Number(e.target.value);
              if (val > 0) updateMutation.mutate(val);
            }}
            className="bg-white font-bold h-10"
          />
          <div className="bg-white px-3 flex items-center rounded-md border text-sm font-bold text-muted-foreground mr-1">€</div>
        </div>
        <p className="text-[10px] text-muted-foreground italic">Cette valeur est utilisée comme base pour tous les calculs de rendement et de rentabilité.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(analysis.resultats || {}).map(([key, val]: [string, any]) => (
          <div key={key} className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-between min-h-[90px]">
            <p className="text-[10px] text-muted-foreground uppercase font-black truncate">{key.replace(/_/g, ' ')}</p>
            <div className="flex items-baseline gap-1">
               <span className="text-xl font-bold text-slate-900">{typeof val === 'number' ? val.toLocaleString() : val}</span>
               <span className="text-xs font-bold text-muted-foreground">€</span>
            </div>
          </div>
        ))}
      </div>

      {/* Analyse DVF */}
      {market && (
        <div className="space-y-3">
          <h5 className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
             <MapPin className="w-3 h-3" /> Références Marché (DVF Réel)
          </h5>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left text-[9px] uppercase text-muted-foreground font-black">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Surface</th>
                  <th className="px-3 py-2 text-right">Prix m²</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {market.transactions_reference?.map((t: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.type}</td>
                    <td className="px-3 py-2 text-right">{t.surface} m²</td>
                    <td className="px-3 py-2 text-right font-bold text-primary">{t.prixM2.toLocaleString()} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center text-[10px] p-2 bg-muted/30 rounded border border-dashed">
            <span className="text-muted-foreground">Moyenne locale : <b>{market.stats_marche.moyen.toLocaleString()} €/m²</b></span>
            <span className="text-primary font-bold">Médiane locale : {market.stats_marche.median.toLocaleString()} €/m²</span>
          </div>
        </div>
      )}

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="trace" className="border-none">
          <AccordionTrigger className="text-[10px] font-bold uppercase py-2 text-muted-foreground hover:no-underline">
            Afficher le détail de la traçabilité des calculs
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 mt-2">
              {analysis.detail_calculs?.map((calc: any, i: number) => (
                <div key={i} className="p-3 bg-muted/30 rounded-lg border border-dashed flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-primary">{calc.nom}</span>
                    <Badge variant="outline" className="text-[9px]">{calc.resultat} €</Badge>
                  </div>
                  <code className="text-[10px] bg-white p-1.5 rounded border border-primary/10 text-primary/80 font-mono">
                    {calc.formule}
                  </code>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function MessagerieSection({ dossierId, currentRole, documentId }: { dossierId: string; currentRole: string; documentId?: string }) {
  const [content, setContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ messages: DossierMsg[] }>({
    queryKey: ["dossier-messages", dossierId, documentId],
    queryFn: () => apiFetch(`/api/mairie/messages/${dossierId}${documentId ? `?documentId=${documentId}` : ""}`),
    refetchInterval: 15000,
  });

  const messages = data?.messages ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch(`/api/dossiers/${dossierId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, documentId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["dossier-messages", dossierId] });
      queryClient.invalidateQueries({ queryKey: ["mairie-dossier", dossierId] });
      queryClient.invalidateQueries({ queryKey: ["mairie-dossiers"] });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'envoyer le message.", variant: "destructive" });
    },
  });

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Messagerie — {documentId ? "Commentaires sur ce document" : "Suivi du dossier"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Échanges entre l'administration et le service mairie. Les messages sont conservés dans le dossier.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thread */}
        <div
          ref={scrollRef}
          className="min-h-[160px] max-h-[360px] overflow-y-auto space-y-3 pr-1"
        >
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
              <MessageSquare className="w-8 h-8 opacity-20" />
              <p className="text-sm">Aucun message pour l'instant.</p>
              <p className="text-xs opacity-70">Démarrez l'échange en envoyant un message ci-dessous.</p>
            </div>
          )}
          {messages.map((msg) => {
            const isAdmin = msg.fromRole === "admin";
            const isMine = (currentRole === "admin" && isAdmin) || (currentRole === "mairie" && !isAdmin);
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isAdmin ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                </div>
                <div className={`max-w-[75%] space-y-1 ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${isMine ? "flex-row-reverse" : ""}`}>
                    <span className="font-semibold">{isAdmin ? "Administration" : "Service Mairie"}</span>
                    <span>·</span>
                    <span>{format(new Date(msg.createdAt), "d MMM, HH:mm", { locale: fr })}</span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      isMine
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none"
                    }`}
                  >
                    {msg.content.split(/(@[A-Z0-9]+)/g).map((part, i) => 
                      part.startsWith('@') ? (
                        <span key={i} className="font-bold underline decoration-2 underline-offset-2 opacity-90">{part}</span>
                      ) : part
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Composer */}
        <div className="border-t border-border pt-4 space-y-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rédigez votre message… (Ctrl+Entrée pour envoyer)"
            className="min-h-[80px] resize-none text-sm"
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{content.length}/2000</span>
            <Button
              size="sm"
              className="gap-2"
              onClick={handleSend}
              disabled={!content.trim() || sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Envoyer
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineManager({ dossierId, currentStep }: { dossierId: string; currentStep: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (step: string) => {
      const r = await fetch(`/api/documents/${dossierId}/timeline`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timelineStep: step }),
      });
      if (!r.ok) throw new Error("Erreur de mise à jour");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Statut mis à jour", description: "Le citoyen a été notifié du changement d'étape." });
      queryClient.invalidateQueries({ queryKey: ["mairie-dossier", dossierId] });
      queryClient.invalidateQueries({ queryKey: ["mairie-dossiers"] });
    }
  });

  const steps = [
    { id: "depot", label: "Dépôt" },
    { id: "analyse", label: "Analyse" },
    { id: "instruction", label: "Instruction" },
    { id: "pieces", label: "Compléments" },
    { id: "decision", label: "Décision" },
  ];

  return (
    <Card className="border-primary/10 shadow-sm border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Gestion de l'Avancement (Visible par l'administré)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {steps.map((s) => (
          <Button
            key={s.id}
            variant={currentStep === s.id ? "default" : "outline"}
            size="sm"
            className={`h-8 text-[11px] font-bold uppercase tracking-wider ${currentStep === s.id ? "shadow-md" : "hover:bg-muted text-muted-foreground"}`}
            onClick={() => mutation.mutate(s.id)}
            disabled={mutation.isPending}
          >
            {s.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

const KB_STRUCTURE = {
  REGULATORY: {
    label: "Réglementaire",
    icon: ScrollText,
    color: "text-blue-600",
    subCategories: {
      PLU: {
        label: "PLU / RNU",
        subLabel: "Règlement écrit, OAP, PADD",
        types: ["Written regulation", "OAP", "PADD", "Administrative Act"]
      }
    }
  },
  ZONING: {
    label: "Documents Graphiques",
    icon: MapPin,
    color: "text-emerald-600",
    subCategories: {
      PLANS: {
        label: "Plans de Zonage",
        subLabel: "Zonage général, périmètres",
        types: ["Zoning map", "Zoning sectors", "Graphic Document"]
      }
    }
  },
  ANNEXES: {
    label: "Annexes & Servitudes",
    icon: BookOpen,
    color: "text-purple-600",
    subCategories: {
      RISKS: {
        label: "Risques & Nuisances",
        subLabel: "PPRN, PPRT, Zone inondable, Bruit",
        types: ["PPRN", "PPRT", "Risk Map", "Noise Exposure Plan"]
      },
      HERITAGE: {
        label: "Patrimoine & Environnement",
        subLabel: "ABF, Monuments, Sites classés",
        types: ["ABF perimeter", "Monuments historiques", "Site classé", "ZPPAUP/AVAP"]
      },
      MISC: {
        label: "Divers",
        subLabel: "Documents non classes automatiquement",
        types: ["Other"]
      }
    }
  },
  INFRASTRUCTURE: {
    label: "Infrastructures & Réseaux",
    icon: Network,
    color: "text-orange-600",
    subCategories: {
      NETWORKS: {
        label: "Réseaux Publics",
        subLabel: "Eau (AEP), Assainissement (EU/EP), Gaz",
        types: ["Water & AEP", "Sanitation (EU/EP)", "Energy/Gaz", "Waste management"]
      }
    }
  }
};

type ResumableTownHallUpload = {
  sessionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  commune: string;
  category?: string;
  subCategory?: string;
  docType?: string;
  title?: string;
  zone?: string;
  receivedBytes: number;
  totalBytes: number;
  chunkSize: number;
  status: "uploading" | "uploaded" | "processing" | "completed" | "failed";
  errorMessage?: string | null;
  documentId?: string | null;
  updatedAt: string;
};

const TOWN_HALL_UPLOADS_STORAGE_KEY = "town-hall-base-ia-uploads-v1";
const TOWN_HALL_UPLOADS_DB_NAME = "heureka-town-hall-uploads";
const TOWN_HALL_UPLOADS_STORE = "files";
const DEFAULT_TOWN_HALL_CHUNK_SIZE = 5 * 1024 * 1024;

function readPersistedTownHallUploads(): ResumableTownHallUpload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TOWN_HALL_UPLOADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePersistedTownHallUploads(items: ResumableTownHallUpload[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOWN_HALL_UPLOADS_STORAGE_KEY, JSON.stringify(items));
}

function upsertPersistedTownHallUpload(item: ResumableTownHallUpload) {
  const next = readPersistedTownHallUploads();
  const idx = next.findIndex((entry) => entry.sessionId === item.sessionId);
  if (idx >= 0) next[idx] = item;
  else next.push(item);
  writePersistedTownHallUploads(next);
}

function removePersistedTownHallUpload(sessionId: string) {
  writePersistedTownHallUploads(readPersistedTownHallUploads().filter((item) => item.sessionId !== sessionId));
}

function openTownHallUploadsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(TOWN_HALL_UPLOADS_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TOWN_HALL_UPLOADS_STORE)) {
        db.createObjectStore(TOWN_HALL_UPLOADS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
  });
}

async function saveTownHallUploadBlob(sessionId: string, file: Blob) {
  const db = await openTownHallUploadsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TOWN_HALL_UPLOADS_STORE, "readwrite");
    tx.objectStore(TOWN_HALL_UPLOADS_STORE).put(file, sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Blob storage failed"));
  });
  db.close();
}

async function loadTownHallUploadBlob(sessionId: string): Promise<Blob | null> {
  const db = await openTownHallUploadsDb();
  const result = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(TOWN_HALL_UPLOADS_STORE, "readonly");
    const request = tx.objectStore(TOWN_HALL_UPLOADS_STORE).get(sessionId);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error || new Error("Blob read failed"));
  });
  db.close();
  return result;
}

async function removeTownHallUploadBlob(sessionId: string) {
  const db = await openTownHallUploadsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TOWN_HALL_UPLOADS_STORE, "readwrite");
    tx.objectStore(TOWN_HALL_UPLOADS_STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Blob cleanup failed"));
  });
  db.close();
}

function formatUploadBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${bytes} o`;
}

function BaseIASection({ currentCommune }: { currentCommune: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>({});
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [activeUploads, setActiveUploads] = useState<ResumableTownHallUpload[]>([]);
  const runningUploadIdsRef = useRef<Set<string>>(new Set());

  const { data: pluDocsData, isLoading: loadingPluDocs } = useQuery<{ documents: any[] }>({
    queryKey: ["mairie-documents", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/documents${currentCommune !== "all" ? `?commune=${encodeURIComponent(currentCommune)}` : ""}`),
  });

  const { data: zoneReviewsData, isLoading: loadingZoneReviews } = useQuery<PluZoneReviewData>({
    queryKey: ["mairie-plu-zone-reviews", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/plu-zone-reviews?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all",
  });

  const { data: ruleReviewsData, isLoading: loadingRuleReviews } = useQuery<PluRuleReviewData>({
    queryKey: ["mairie-plu-rule-reviews", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/plu-rule-reviews?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all",
  });

  const { data: knowledgeSummaryData, isLoading: loadingKnowledgeSummary } = useQuery<PluKnowledgeSummary>({
    queryKey: ["mairie-plu-knowledge-summary", currentCommune],
    queryFn: () => apiFetch(`/api/mairie/plu-knowledge-summary?commune=${encodeURIComponent(currentCommune)}`),
    enabled: currentCommune !== "all",
  });

  const scheduleDocumentsRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
    queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary"] });
    queryClient.invalidateQueries({ queryKey: ["mairie-plu-zone-reviews"] });
    queryClient.invalidateQueries({ queryKey: ["mairie-plu-rule-reviews"] });
    [1500, 4000, 9000].forEach((delayMs) => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
        queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary"] });
        queryClient.invalidateQueries({ queryKey: ["mairie-plu-zone-reviews"] });
        queryClient.invalidateQueries({ queryKey: ["mairie-plu-rule-reviews"] });
      }, delayMs);
    });
  };

  const syncUploadState = (item: ResumableTownHallUpload) => {
    upsertPersistedTownHallUpload(item);
    setActiveUploads(readPersistedTownHallUploads());
  };

  const clearUploadState = async (sessionId: string) => {
    removePersistedTownHallUpload(sessionId);
    runningUploadIdsRef.current.delete(sessionId);
    setActiveUploads(readPersistedTownHallUploads());
    await removeTownHallUploadBlob(sessionId).catch(() => undefined);
  };

  const fetchServerUploadState = async (sessionId: string): Promise<ResumableTownHallUpload | null> => {
    const response = await fetch(`/api/mairie/documents/uploads/${sessionId}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return {
      sessionId: data.sessionId,
      fileName: data.fileName,
      fileSize: data.totalBytes,
      mimeType: data.mimeType || "application/pdf",
      commune: data.commune,
      category: data.category || undefined,
      subCategory: data.subCategory || undefined,
      docType: data.documentType || undefined,
      title: data.title || data.fileName,
      zone: data.zone || undefined,
      receivedBytes: data.receivedBytes || 0,
      totalBytes: data.totalBytes || 0,
      chunkSize: DEFAULT_TOWN_HALL_CHUNK_SIZE,
      status: data.status || "uploading",
      errorMessage: data.errorMessage || null,
      documentId: data.documentId || null,
      updatedAt: new Date().toISOString(),
    };
  };

  const resumeUpload = async (session: ResumableTownHallUpload, sourceBlob?: Blob | null) => {
    if (runningUploadIdsRef.current.has(session.sessionId)) return;
    runningUploadIdsRef.current.add(session.sessionId);

    try {
      const serverSession = await fetchServerUploadState(session.sessionId);
      let currentSession = serverSession || session;
      syncUploadState(currentSession);

      if (currentSession.status === "processing" || currentSession.status === "completed") {
        await clearUploadState(currentSession.sessionId);
        scheduleDocumentsRefresh();
        return;
      }

      const fileBlob = sourceBlob || await loadTownHallUploadBlob(currentSession.sessionId);
      if (!fileBlob) {
        currentSession = {
          ...currentSession,
          status: "failed",
          errorMessage: "Le navigateur n'a plus le fichier local. Reimportez-le pour reprendre l'upload.",
          updatedAt: new Date().toISOString(),
        };
        syncUploadState(currentSession);
        return;
      }

      while (currentSession.receivedBytes < currentSession.totalBytes) {
        const nextChunk = fileBlob.slice(
          currentSession.receivedBytes,
          currentSession.receivedBytes + (currentSession.chunkSize || DEFAULT_TOWN_HALL_CHUNK_SIZE),
        );
        const formData = new FormData();
        formData.append("chunk", new File([nextChunk], currentSession.fileName, { type: currentSession.mimeType }));
        formData.append("start", String(currentSession.receivedBytes));

        const response = await fetch(`/api/mairie/documents/uploads/${currentSession.sessionId}/chunk`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (data.error === "OFFSET_MISMATCH") {
            const reconciledSession = await fetchServerUploadState(currentSession.sessionId);
            if (!reconciledSession) throw new Error("Impossible de resynchroniser l'upload.");
            currentSession = reconciledSession;
            syncUploadState(currentSession);
            continue;
          }
          throw new Error(data.message || "Erreur lors de l'envoi d'un fragment.");
        }

        currentSession = {
          ...currentSession,
          receivedBytes: data.receivedBytes || currentSession.receivedBytes,
          totalBytes: data.totalBytes || currentSession.totalBytes,
          status: data.status || currentSession.status,
          updatedAt: new Date().toISOString(),
        };
        syncUploadState(currentSession);
      }

      const completeResponse = await fetch(`/api/mairie/documents/uploads/${currentSession.sessionId}/complete`, {
        method: "POST",
      });
      const completeData = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) {
        throw new Error(completeData.message || "Erreur lors de la finalisation de l'upload.");
      }

      toast({
        title: "Document recu",
        description: `${currentSession.fileName} est maintenant cote serveur. L'indexation continue meme si vous quittez cette page.`,
      });
      await clearUploadState(currentSession.sessionId);
      scheduleDocumentsRefresh();
    } catch (err: any) {
      const failedSession: ResumableTownHallUpload = {
        ...session,
        status: "failed",
        errorMessage: err?.message || "Upload interrompu.",
        updatedAt: new Date().toISOString(),
      };
      syncUploadState(failedSession);
      toast({ title: "Upload interrompu", description: failedSession.errorMessage || "Une erreur est survenue.", variant: "destructive" });
    } finally {
      runningUploadIdsRef.current.delete(session.sessionId);
    }
  };

  const startUpload = async ({ files, category, subCategory, docType }: { files: File[], category?: string, subCategory?: string, docType?: string }) => {
    for (const file of files) {
      const initResponse = await fetch("/api/mairie/documents/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/pdf",
          category,
          subCategory,
          documentType: docType,
          commune: currentCommune !== "all" ? currentCommune : undefined,
        }),
      });
      const initData = await initResponse.json().catch(() => ({}));
      if (!initResponse.ok) {
        throw new Error(initData.message || "Impossible d'initialiser l'upload.");
      }

      const uploadSession: ResumableTownHallUpload = {
        sessionId: initData.sessionId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/pdf",
        commune: initData.targetCommune || currentCommune,
        category,
        subCategory,
        docType,
        title: file.name,
        receivedBytes: initData.receivedBytes || 0,
        totalBytes: initData.totalBytes || file.size,
        chunkSize: initData.chunkSize || DEFAULT_TOWN_HALL_CHUNK_SIZE,
        status: initData.status || "uploading",
        updatedAt: new Date().toISOString(),
      };

      await saveTownHallUploadBlob(uploadSession.sessionId, file);
      syncUploadState(uploadSession);
      await resumeUpload(uploadSession, file);
    }
  };

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string, note: string }) => {
      const r = await fetch(`/api/mairie/documents/${id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explanatoryNote: note })
      });
      if (!r.ok) throw new Error("Update failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
      toast({ title: "Note sauvegardée" });
    }
  });

  const reviewZoneMutation = useMutation({
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
    }) => {
      return apiFetch(`/api/mairie/plu-zone-reviews/${id}/review?commune=${encodeURIComponent(currentCommune)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus, reviewedZoneCode, reviewedStartPage, reviewedEndPage }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-zone-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary", currentCommune] });
      toast({ title: "Revue mise à jour" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message || "Impossible de mettre à jour la revue.", variant: "destructive" });
    }
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/mairie/plu-zone-reviews/${id}?commune=${encodeURIComponent(currentCommune)}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_payload, deletedId) => {
      queryClient.setQueryData<PluZoneReviewData | undefined>(["mairie-plu-zone-reviews", currentCommune], (current) => {
        if (!current) return current;
        const nextSections = current.sections.filter((section) => section.id !== deletedId);
        const validatedZoneCount = nextSections.filter((section) => section.reviewStatus === "validated").length;
        const pendingZoneCount = nextSections.filter((section) => section.reviewStatus === "to_review" || section.reviewStatus === "auto").length;
        const readyStatus = (() => {
          if (nextSections.length === 0) return "missing" as const;
          const criticalZonesCount = new Set(nextSections.map((section) => section.zoneCode)).size;
          if (validatedZoneCount >= Math.max(1, criticalZonesCount)) return "ready" as const;
          if (validatedZoneCount > 0) return "partial" as const;
          return "needs_review" as const;
        })();

        return {
          ...current,
          summary: {
            ...current.summary,
            zoneSectionCount: nextSections.length,
            validatedZoneCount,
            pendingZoneCount,
            readyStatus,
          },
          sections: nextSections,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-zone-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-rule-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary", currentCommune] });
      toast({ title: "Zone supprimée", description: "La zone détectée et ses règles dérivées ont été retirées de cette base." });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message || "Impossible de supprimer cette zone détectée.", variant: "destructive" });
    }
  });

  const resegmentDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/mairie/documents/${id}/resegment?commune=${encodeURIComponent(currentCommune)}`, {
        method: "POST",
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-zone-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-rule-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
      toast({
        title: "Document re-segmenté",
        description: `${result?.sectionCount ?? 0} zone(s) et ${result?.ruleCount ?? 0} règle(s) ont été recalculées.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message || "Impossible de re-segmenter ce document.", variant: "destructive" });
    }
  });

  const reviewRuleMutation = useMutation({
    mutationFn: async ({
      id,
      reviewStatus,
      reviewedZoneCode,
    }: {
      id: string;
      reviewStatus: "validated" | "to_review" | "rejected";
      reviewedZoneCode?: string;
    }) => {
      return apiFetch(`/api/mairie/plu-rule-reviews/${id}/review?commune=${encodeURIComponent(currentCommune)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus, reviewedZoneCode }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-rule-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary", currentCommune] });
      toast({ title: "Règle mise à jour" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.message || "Impossible de mettre à jour la règle.", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/mairie/documents/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-zone-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-rule-reviews", currentCommune] });
      toast({ title: "Supprimé", description: "Document retiré de la base." });
    }
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/mairie/documents?commune=${encodeURIComponent(currentCommune)}`, { method: "DELETE" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || "Suppression globale impossible");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
      queryClient.invalidateQueries({ queryKey: ["base-ia-coverage", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-knowledge-summary", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-zone-reviews", currentCommune] });
      queryClient.invalidateQueries({ queryKey: ["mairie-plu-rule-reviews", currentCommune] });
      toast({ title: "Base IA nettoyée", description: `${data.deletedDocuments || 0} document(s) supprimé(s).` });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, category: string, subCategory: string, docType: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingSlots(prev => ({ ...prev, [`${category}-${subCategory}-${docType}`]: true }));
    void startUpload({ files: Array.from(files), category, subCategory, docType })
      .catch((err) => {
        toast({ title: "Erreur", description: err.message, variant: "destructive" });
      })
      .finally(() => {
        setUploadingSlots(prev => ({ ...prev, [`${category}-${subCategory}-${docType}`]: false }));
      });
    e.currentTarget.value = "";
  };

  const groupedDocs = useMemo(() => {
    const map: Record<string, any[]> = {};
    pluDocsData?.documents?.forEach(doc => {
      const key = `${doc.category}-${doc.subCategory}-${doc.documentType}`;
      if (!map[key]) map[key] = [];
      map[key].push(doc);
    });
    return map;
  }, [pluDocsData]);

  const totalDocuments = pluDocsData?.documents?.length ?? 0;
  const allDocs = pluDocsData?.documents ?? [];
  const knowledgeConflicts = knowledgeSummaryData?.conflicts ?? [];
  const zoneReviewSections = zoneReviewsData?.sections ?? [];
  const zoneReadyMeta = getZoneReadyMeta(zoneReviewsData?.summary?.readyStatus);
  const ruleReviewItems = ruleReviewsData?.rules ?? [];
  const ruleReadyMeta = getZoneReadyMeta(ruleReviewsData?.summary?.readyStatus);

  const categorySummaries = useMemo(() => {
    return Object.entries(KB_STRUCTURE).map(([catKey, cat], idx) => {
      const count = Object.entries(cat.subCategories).reduce((sum, [, sub]) => {
        return sum + sub.types.reduce((typeSum, type) => {
          return typeSum + (groupedDocs[`${catKey}-${Object.keys(cat.subCategories).find((key) => cat.subCategories[key as keyof typeof cat.subCategories] === sub)}-${type}`] || []).length;
        }, 0);
      }, 0);

      return {
        value: `item-${idx}`,
        key: catKey,
        label: cat.label,
        count,
      };
    });
  }, [groupedDocs]);

  useEffect(() => {
    const withDocs = categorySummaries.filter((item) => item.count > 0).map((item) => item.value);
    setOpenItems(withDocs.length > 0 ? withDocs : ["item-0", "item-1"]);
  }, [categorySummaries]);

  useEffect(() => {
    setActiveUploads(readPersistedTownHallUploads());
  }, []);

  useEffect(() => {
    setActiveUploads(readPersistedTownHallUploads());
  }, [currentCommune]);

  useEffect(() => {
    const pendingUploads = readPersistedTownHallUploads().filter((item) => {
      if (currentCommune === "all") return true;
      return item.commune?.toLowerCase() === currentCommune.toLowerCase();
    });

    pendingUploads.forEach((item) => {
      if (item.status === "uploading" || item.status === "uploaded") {
        void resumeUpload(item);
      }
      if (item.status === "processing" || item.status === "completed") {
        void clearUploadState(item.sessionId);
      }
    });
  }, [currentCommune]);

  const visibleUploads = activeUploads.filter((item) => currentCommune === "all" || item.commune?.toLowerCase() === currentCommune.toLowerCase());
  const hasRunningUploads = visibleUploads.some((item) => ["uploading", "uploaded", "processing"].includes(item.status));
  const useRegulatoryCalibrationModule = true;

  return (
    <div className="w-full space-y-6">
      <input
        id="batch-upload"
        type="file"
        className="hidden"
        multiple
        accept=".pdf"
        onChange={(e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          void startUpload({ files: Array.from(files) }).catch((err) => {
            toast({ title: "Erreur", description: err.message, variant: "destructive" });
          });
          e.currentTarget.value = "";
        }}
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-primary" />
            Base de Connaissances Urbanisme
          </h2>
          <p className="text-muted-foreground">
            Structurez les documents réglementaires pour {currentCommune === "all" ? "tous les territoires" : `la commune de ${currentCommune}`}.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="gap-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 h-10 px-4"
            onClick={() => document.getElementById('batch-upload')?.click()}
            disabled={hasRunningUploads || currentCommune === "all"}
          >
            <UploadCloud className="w-4 h-4 text-primary" />
            Importer des documents
          </Button>

          <Button
            variant="outline"
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/5 h-10 px-4"
            disabled={clearAllMutation.isPending || currentCommune === "all"}
            onClick={() => {
              if (currentCommune === "all") return;
              if (!confirm(`Supprimer tous les documents Base IA de ${currentCommune} ? Cette action est irréversible.`)) return;
              clearAllMutation.mutate();
            }}
          >
            {clearAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Tout supprimer
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-primary" />
            Onboarding Base IA
          </CardTitle>
          <CardDescription>
            Le flux automatique GPU a ete retire. La source officielle de la base PLU est maintenant l'import manuel des documents souhaites pendant l'onboarding mairie.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Badge variant="secondary" className="mt-0.5">1</Badge>
              <span>Selectionnez la commune puis importez les reglements, plans de zonage, annexes et servitudes utiles.</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="secondary" className="mt-0.5">2</Badge>
              <span>Chaque document importe est indexe automatiquement pour alimenter l'analyse et l'assistant IA.</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="secondary" className="mt-0.5">3</Badge>
              <span>{currentCommune === "all" ? "Choisissez d'abord une commune pour importer un corpus cible." : totalDocuments > 0 ? `${totalDocuments} document(s) deja presents dans cette base.` : "Aucun document indexe pour cette commune pour le moment."}</span>
            </div>
          </div>

          <Button
            className="gap-2 h-10 px-4"
            onClick={() => document.getElementById("batch-upload")?.click()}
            disabled={hasRunningUploads || currentCommune === "all"}
          >
            {hasRunningUploads ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Importer mes documents PLU
          </Button>
        </CardContent>
      </Card>

      {useRegulatoryCalibrationModule && currentCommune !== "all" && (
        <RegulatoryCalibrationModule
          currentCommune={currentCommune}
          documents={allDocs}
          loadingDocuments={loadingPluDocs}
        />
      )}

      {!useRegulatoryCalibrationModule && currentCommune !== "all" && (
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Santé documentaire réglementaire
                </CardTitle>
                <CardDescription>
                  Cette vue montre ce que le moteur a réellement structuré : documents profilés, zones détectées, règles canoniques et conflits à arbitrer.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingKnowledgeSummary ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lecture de la base réglementaire structurée...
              </div>
            ) : knowledgeSummaryData ? (
              <>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</div>
                    <div className="mt-1 text-2xl font-bold">{knowledgeSummaryData.summary.documentCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profils structurés</div>
                    <div className="mt-1 text-2xl font-bold">{knowledgeSummaryData.summary.structuredDocumentCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zones</div>
                    <div className="mt-1 text-2xl font-bold">{knowledgeSummaryData.summary.zoneCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Règles canoniques</div>
                    <div className="mt-1 text-2xl font-bold">{knowledgeSummaryData.summary.ruleCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conflits</div>
                    <div className="mt-1 text-2xl font-bold">{knowledgeSummaryData.summary.conflictCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Revue manuelle</div>
                    <div className="mt-1 text-2xl font-bold">{knowledgeSummaryData.summary.manualReviewCount}</div>
                  </div>
                </div>

                {knowledgeSummaryData.documents.length > 0 && (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {knowledgeSummaryData.documents.slice(0, 4).map((doc) => (
                      <div key={doc.id} className="rounded-xl border bg-background p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                            {doc.documentType || "Document"}
                          </Badge>
                          {doc.textQualityLabel && (
                            <Badge variant="outline" className={getTextQualityBadgeMeta(doc.textQualityLabel).className}>
                              {getTextQualityBadgeMeta(doc.textQualityLabel).text}
                            </Badge>
                          )}
                          {doc.profile?.manualReviewRequired && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              Revue utile
                            </Badge>
                          )}
                        </div>
                        <p className="mt-3 text-sm font-semibold">{doc.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{doc.availabilityMessage}</p>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-lg bg-muted/20 p-2">
                            <div className="uppercase tracking-wide text-muted-foreground">Zones</div>
                            <div className="mt-1 font-semibold">{doc.profile?.detectedZonesCount ?? 0}</div>
                          </div>
                          <div className="rounded-lg bg-muted/20 p-2">
                            <div className="uppercase tracking-wide text-muted-foreground">Thèmes</div>
                            <div className="mt-1 font-semibold">{doc.profile?.structuredTopicsCount ?? 0}</div>
                          </div>
                          <div className="rounded-lg bg-muted/20 p-2">
                            <div className="uppercase tracking-wide text-muted-foreground">Règles</div>
                            <div className="mt-1 font-semibold">{doc.extractedRuleCount}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-xl border bg-muted/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Conflits documentaires détectés</p>
                      <p className="text-xs text-muted-foreground">
                        Le moteur ne tranche pas silencieusement : si deux règles se contredisent, elles remontent ici pour arbitrage.
                      </p>
                    </div>
                    <Badge variant="outline" className={knowledgeConflicts.length > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                      {knowledgeConflicts.length > 0 ? `${knowledgeConflicts.length} conflit(s)` : "Aucun conflit ouvert"}
                    </Badge>
                  </div>

                  {knowledgeConflicts.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {knowledgeConflicts.map((conflict) => (
                        <div key={conflict.id} className="rounded-lg border bg-background px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {conflict.zoneCode && (
                              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                Zone {conflict.zoneCode}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[10px]">
                              {conflict.ruleTopic}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm">{conflict.conflictSummary}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Sélectionne une commune pour lire la base documentaire structurée.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {currentCommune !== "all" && (
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-primary" />
                  Zones PLU détectées
                </CardTitle>
                <CardDescription>
                  Le système propose les plages de pages et l’héritage des zones. L’idée est de confirmer vite les points sensibles, pas de reconfigurer tout le PLU.
                </CardDescription>
              </div>
              <Badge variant="outline" className={zoneReadyMeta.className}>
                {zoneReadyMeta.text}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingZoneReviews ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lecture des zones détectées...
              </div>
            ) : zoneReviewsData ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Règlements écrits</div>
                    <div className="mt-1 text-2xl font-bold">{zoneReviewsData.summary.writtenRegulationCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documents opposables</div>
                    <div className="mt-1 text-2xl font-bold">{zoneReviewsData.summary.opposableDocumentCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zones détectées</div>
                    <div className="mt-1 text-2xl font-bold">{zoneReviewsData.summary.zoneSectionCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zones validées</div>
                    <div className="mt-1 text-2xl font-bold">{zoneReviewsData.summary.validatedZoneCount}</div>
                  </div>
                </div>

                {zoneReviewSections.length > 0 ? (
                  <div className="space-y-3">
                    {zoneReviewSections.map((section) => {
                      const statusMeta = getZoneReviewStatusMeta(section.reviewStatus);
                      const StatusIcon = statusMeta.icon;
                      const linkedDoc = section.document?.id ? allDocs.find((doc) => doc.id === section.document?.id) : null;
                      return (
                        <div key={section.id} className="rounded-xl border bg-background p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                  Zone {section.zoneCode}
                                </Badge>
                                {section.parentZoneCode && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Hérite de {section.parentZoneCode}
                                  </Badge>
                                )}
                                {section.isSubZone && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Sous-zone
                                  </Badge>
                                )}
                                <Badge variant="outline" className={statusMeta.className}>
                                  <StatusIcon className="mr-1 h-3 w-3" />
                                  {statusMeta.text}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-sm font-semibold">{section.heading}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Pages {section.startPage ?? "?"}{section.endPage && section.endPage !== section.startPage ? ` à ${section.endPage}` : ""}
                                  {section.document?.title ? ` · ${section.document.title}` : ""}
                                </p>
                              </div>
                              {section.document && (
                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                  {section.document.textQualityLabel && (
                                    <Badge variant="outline" className={getTextQualityBadgeMeta(section.document.textQualityLabel).className}>
                                      {getTextQualityBadgeMeta(section.document.textQualityLabel).text}
                                      {typeof section.document.textQualityScore === "number" ? ` · ${section.document.textQualityScore}%` : ""}
                                    </Badge>
                                  )}
                                  {section.document.isOpposable && (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                      Opposable
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {section.reviewNotes && (
                                <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
                                  {section.reviewNotes}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              {linkedDoc && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedDoc(linkedDoc)}
                                  >
                                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                                    Ouvrir
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-primary/20 text-primary hover:bg-primary/5"
                                    disabled={resegmentDocumentMutation.isPending}
                                    onClick={() => resegmentDocumentMutation.mutate(linkedDoc.id)}
                                  >
                                    {resegmentDocumentMutation.isPending ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    Re-segmenter
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-primary/20 text-primary hover:bg-primary/5"
                                disabled={reviewZoneMutation.isPending}
                                onClick={() => {
                                  const reviewedZoneCode = window.prompt("Zone correcte pour cette section", section.zoneCode || "");
                                  if (reviewedZoneCode == null) return;
                                  const reviewedStartPageInput = window.prompt(
                                    "Page de début correcte",
                                    section.startPage != null ? String(section.startPage) : "",
                                  );
                                  if (reviewedStartPageInput == null) return;
                                  const reviewedEndPageInput = window.prompt(
                                    "Page de fin correcte",
                                    section.endPage != null ? String(section.endPage) : reviewedStartPageInput,
                                  );
                                  if (reviewedEndPageInput == null) return;
                                  const reviewedStartPage = reviewedStartPageInput.trim().length > 0
                                    ? Number.parseInt(reviewedStartPageInput, 10)
                                    : null;
                                  const reviewedEndPage = reviewedEndPageInput.trim().length > 0
                                    ? Number.parseInt(reviewedEndPageInput, 10)
                                    : null;
                                  reviewZoneMutation.mutate({
                                    id: section.id,
                                    reviewStatus: "to_review",
                                    reviewedZoneCode,
                                    reviewedStartPage: Number.isFinite(reviewedStartPage) ? reviewedStartPage : null,
                                    reviewedEndPage: Number.isFinite(reviewedEndPage) ? reviewedEndPage : null,
                                  });
                                }}
                              >
                                <MapPin className="mr-1.5 h-3.5 w-3.5" />
                                Corriger zone
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                disabled={reviewZoneMutation.isPending}
                                onClick={() => reviewZoneMutation.mutate({ id: section.id, reviewStatus: "validated" })}
                              >
                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                Valider
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                                disabled={reviewZoneMutation.isPending}
                                onClick={() => reviewZoneMutation.mutate({ id: section.id, reviewStatus: "to_review" })}
                              >
                                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                                À revoir
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                                disabled={reviewZoneMutation.isPending}
                                onClick={() => reviewZoneMutation.mutate({ id: section.id, reviewStatus: "rejected" })}
                              >
                                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                Écarter
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-destructive/20 text-destructive hover:bg-destructive/5"
                                disabled={deleteZoneMutation.isPending}
                                onClick={() => {
                                  const confirmed = window.confirm(`Supprimer définitivement la zone ${section.zoneCode} détectée dans ce document ?`);
                                  if (!confirmed) return;
                                  deleteZoneMutation.mutate(section.id);
                                }}
                              >
                                {deleteZoneMutation.isPending ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Supprimer
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    Aucune zone PLU n’a encore été détectée dans ce corpus. Réimporte le règlement écrit ou laisse l’ingestion le resegmenter.
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Sélectionne une commune pour lire les zones PLU détectées.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!useRegulatoryCalibrationModule && currentCommune !== "all" && (
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale className="w-4 h-4 text-primary" />
                  Règles critiques proposées
                </CardTitle>
                <CardDescription>
                  Le système isole les règles utiles pour la constructibilité. Tu confirmes seulement les extraits vraiment décisifs.
                </CardDescription>
              </div>
              <Badge variant="outline" className={ruleReadyMeta.className}>
                {ruleReadyMeta.text}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingRuleReviews ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lecture des règles critiques...
              </div>
            ) : ruleReviewsData ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Règles proposées</div>
                    <div className="mt-1 text-2xl font-bold">{ruleReviewsData.summary.ruleCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Règles validées</div>
                    <div className="mt-1 text-2xl font-bold">{ruleReviewsData.summary.validatedRuleCount}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Règles à confirmer</div>
                    <div className="mt-1 text-2xl font-bold">{ruleReviewsData.summary.pendingRuleCount}</div>
                  </div>
                </div>

                {ruleReviewItems.length > 0 ? (
                  <div className="space-y-3">
                    {ruleReviewItems.map((rule) => {
                      const statusMeta = getZoneReviewStatusMeta(rule.reviewStatus);
                      const StatusIcon = statusMeta.icon;
                      const linkedDoc = rule.document?.id ? allDocs.find((doc) => doc.id === rule.document?.id) : null;
                      return (
                        <div key={rule.id} className="rounded-xl border bg-background p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                  {rule.zoneCode ? `Zone ${rule.zoneCode}` : "Zone globale"}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                  {rule.themeLabel}
                                </Badge>
                                {typeof rule.articleNumber === "number" && rule.articleNumber > 0 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Art. {rule.articleNumber}
                                  </Badge>
                                )}
                                <Badge variant="outline" className={statusMeta.className}>
                                  <StatusIcon className="mr-1 h-3 w-3" />
                                  {statusMeta.text}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-sm font-semibold">{rule.title}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {rule.document?.title ? `${rule.document.title} · ` : ""}
                                  Pages {rule.startPage ?? "?"}{rule.endPage && rule.endPage !== rule.startPage ? ` à ${rule.endPage}` : ""}
                                </p>
                              </div>
                              <div className="rounded-lg bg-muted/20 px-3 py-2 text-sm text-foreground/90">
                                {rule.sourceText}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                <Badge variant="outline">
                                  Confiance {rule.confidence || "low"}
                                </Badge>
                                {rule.valueHint && (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Valeur {rule.valueHint}
                                  </Badge>
                                )}
                                {rule.conflictFlag && (
                                  <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                                    Conflit détecté
                                  </Badge>
                                )}
                                {rule.requiresManualValidation && (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                    Validation recommandée
                                  </Badge>
                                )}
                                {rule.document?.textQualityLabel && (
                                  <Badge variant="outline" className={getTextQualityBadgeMeta(rule.document.textQualityLabel).className}>
                                    {getTextQualityBadgeMeta(rule.document.textQualityLabel).text}
                                  </Badge>
                                )}
                              </div>
                              {rule.sourceExcerpt && rule.sourceExcerpt !== rule.sourceText && (
                                <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
                                  Extrait source : {rule.sourceExcerpt}
                                </p>
                              )}
                              {rule.reviewNotes && (
                                <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
                                  {rule.reviewNotes}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              {linkedDoc && (
                                <Button variant="outline" size="sm" onClick={() => setSelectedDoc(linkedDoc)}>
                                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                                  Ouvrir
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-primary/20 text-primary hover:bg-primary/5"
                                disabled={reviewRuleMutation.isPending}
                                onClick={() => {
                                  const reviewedZoneCode = window.prompt("Zone correcte pour cette règle", rule.zoneCode || "");
                                  if (reviewedZoneCode == null) return;
                                  reviewRuleMutation.mutate({
                                    id: rule.id,
                                    reviewStatus: "to_review",
                                    reviewedZoneCode,
                                  });
                                }}
                              >
                                <MapPin className="mr-1.5 h-3.5 w-3.5" />
                                Corriger zone
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                disabled={reviewRuleMutation.isPending}
                                onClick={() => reviewRuleMutation.mutate({ id: rule.id, reviewStatus: "validated" })}
                              >
                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                Valider
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                                disabled={reviewRuleMutation.isPending}
                                onClick={() => reviewRuleMutation.mutate({ id: rule.id, reviewStatus: "to_review" })}
                              >
                                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                                À revoir
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                                disabled={reviewRuleMutation.isPending}
                                onClick={() => reviewRuleMutation.mutate({ id: rule.id, reviewStatus: "rejected" })}
                              >
                                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                                Écarter
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    Aucune règle critique n’a encore été stabilisée. L’ingestion continuera à en proposer dès que les unités réglementaires seront assez propres.
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Sélectionne une commune pour lire les règles critiques proposées.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {visibleUploads.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Uploads en cours ou reprenables ({visibleUploads.length})
            </CardTitle>
            <CardDescription>
              Une fois le fichier entierement recu par le serveur, l'indexation continue cote API. Si tu reviens sur cette page apres un refresh, l'upload reprend automatiquement depuis le dernier chunk valide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleUploads.map((upload) => {
              const progress = upload.totalBytes > 0 ? Math.min(100, Math.round((upload.receivedBytes / upload.totalBytes) * 100)) : 0;
              const isRecoverable = upload.status === "failed" || upload.status === "uploading" || upload.status === "uploaded";
              return (
                <div key={upload.sessionId} className="rounded-xl border bg-background p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{upload.fileName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {upload.commune} · {formatUploadBytes(upload.receivedBytes)} / {formatUploadBytes(upload.totalBytes)}
                      </p>
                    </div>
                    <Badge variant={upload.status === "failed" ? "destructive" : "secondary"} className="shrink-0">
                      {upload.status === "failed" ? "Interrompu" : upload.status === "processing" ? "Indexation" : `${progress}%`}
                    </Badge>
                  </div>
                  <Progress value={upload.status === "processing" ? 100 : progress} className="h-2" />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">
                      {upload.errorMessage || (upload.status === "processing"
                        ? "Le fichier est cote serveur. L'indexation peut continuer meme si tu quittes la page."
                        : "Le navigateur memorise le fichier pour reprendre l'envoi apres refresh.")}
                    </p>
                    {isRecoverable && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void resumeUpload(upload)}
                        disabled={runningUploadIdsRef.current.has(upload.sessionId)}
                      >
                        Reprendre
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!useRegulatoryCalibrationModule && allDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Documents indexes ({allDocs.length})
            </CardTitle>
            <CardDescription>
              Chaque document compte dans le total ci-dessus et reste ouvrable ici, meme s'il est range dans une categorie repliee.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {allDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setSelectedDoc(doc)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {doc.category} / {doc.subCategory} / {doc.documentType}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.textQualityLabel && (
                    <Badge variant="outline" className={`text-[10px] ${getTextQualityBadgeMeta(doc.textQualityLabel).className}`}>
                      {getTextQualityBadgeMeta(doc.textQualityLabel).text}
                    </Badge>
                  )}
                  {doc.availabilityStatus !== "indexed" && (
                    <Badge variant="outline" className="text-[10px]">
                      {doc.availabilityStatus}
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}>
                    Voir
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Accordion type="multiple" value={openItems} onValueChange={setOpenItems} className="space-y-4">
        {Object.entries(KB_STRUCTURE).map(([catKey, cat], idx) => (
          <AccordionItem key={catKey} value={`item-${idx}`} className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/50 transition-colors border-b">
              <div className="flex items-center gap-4 text-left">
                <div className={`p-2 rounded-lg bg-muted ${cat.color}`}>
                  <cat.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-base flex items-center gap-2">
                    {cat.label}
                    {categorySummaries[idx]?.count > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{categorySummaries[idx].count}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-normal">Classification IA activée</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 pt-4">
              <div className="space-y-8">
                {Object.entries(cat.subCategories).map(([subKey, sub]) => (
                  <div key={subKey} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-primary/60" />
                      <span className="font-bold text-sm uppercase tracking-wide text-foreground/80">{sub.label}</span>
                      {sub.subLabel && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-2">{sub.subLabel}</span>}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                      {sub.types.map(type => {
                        const docs = groupedDocs[`${catKey}-${subKey}-${type}`] || [];
                        const isUploading = uploadingSlots[`${catKey}-${subKey}-${type}`];
                        
                        return (
                          <div key={type} className="flex flex-col gap-2 p-4 border rounded-xl bg-muted/20 hover:border-primary/20 transition-all group relative">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter">{type}</span>
                              <div className="relative">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 gap-1.5 text-primary bg-primary/5 hover:bg-primary/10 transition-all rounded-full"
                                  disabled={isUploading}
                                >
                                  {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                                  <span className="text-[10px] font-black uppercase">Dépôt</span>
                                  <input 
                                    type="file" 
                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                    multiple
                                    accept=".pdf,image/*" 
                                    onChange={(e) => handleFileUpload(e, catKey, subKey, type)}
                                    disabled={isUploading}
                                  />
                                </Button>
                              </div>
                            </div>

                            {docs.length > 0 ? (
                              <div className="space-y-2">
                                {docs.map(doc => (
                                  <div 
                                    key={doc.id} 
                                    className="flex items-center justify-between bg-background p-2.5 rounded-lg border shadow-sm hover:shadow-md cursor-pointer group/doc border-l-4 border-l-blue-500/30 hover:border-l-blue-500 transition-all"
                                    onClick={() => setSelectedDoc(doc)}
                                  >
                                    <div className="flex items-center gap-2.5 overflow-hidden">
                                      <div className="p-1.5 bg-blue-50 rounded text-blue-600">
                                        <FileText className="w-4 h-4 shrink-0" />
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-[11px] truncate font-bold text-foreground/90">{doc.title}</span>
                                        {doc.explanatoryNote && (
                                          <p className="text-[9px] text-muted-foreground truncate italic">{doc.explanatoryNote}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7 opacity-0 group-hover/doc:opacity-100 transition-opacity"
                                        onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}
                                      >
                                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7 opacity-0 group-hover/doc:opacity-100 transition-opacity text-destructive hover:bg-destructive/5"
                                        onClick={(e) => { e.stopPropagation(); if(confirm("Supprimer ?")) deleteMutation.mutate(doc.id); }}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[9px] text-muted-foreground/40 font-bold uppercase flex items-center gap-2 py-4 justify-center border border-dashed rounded-lg bg-background/30">
                                <Clock className="w-3 h-3" />
                                Vide
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* MODAL DE DÉTAILS ET PRÉVISUALISATION PDF */}
      {!useRegulatoryCalibrationModule && (
      <Sheet open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <SheetContent side="right" className="sm:max-w-[80vw] p-0 overflow-hidden flex flex-col">
          <SheetHeader className="p-6 border-b bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-lg font-bold">{selectedDoc?.title}</SheetTitle>
                  <SheetDescription className="text-xs">
                    {selectedDoc?.category} › {selectedDoc?.subCategory} › {selectedDoc?.documentType}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => window.open(`/api/mairie/documents/${selectedDoc?.id}/view`, '_blank')}
                  disabled={selectedDoc?.hasStoredFile === false}
                >
                  <Zap className="w-3.5 h-3.5" /> Ouvrir plein écran
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => selectedDoc?.id && resegmentDocumentMutation.mutate(selectedDoc.id)}
                  disabled={!selectedDoc?.id || resegmentDocumentMutation.isPending}
                >
                  {resegmentDocumentMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Re-segmenter
                </Button>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 flex overflow-hidden">
            {/* GAUCHE: PDF PREVIEW */}
            <div className="flex-1 bg-muted/30 relative">
              {selectedDoc?.hasStoredFile === false ? (
                <div className="absolute inset-0 overflow-auto p-8">
                  <div className="mx-auto flex h-full max-w-4xl flex-col gap-6">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm">
                      <AlertTriangle className="w-8 h-8 mb-3 text-amber-600" />
                      <h4 className="font-semibold mb-2">Fichier source indisponible</h4>
                      <p className="text-sm leading-relaxed">
                        {selectedDoc?.availabilityMessage || "Le PDF n'est plus present sur le disque. Reimporte ce document pour retrouver la previsualisation et son contenu source."}
                      </p>
                    </div>

                    {selectedDoc?.rawTextPreview ? (
                      <div className="rounded-2xl border bg-background shadow-sm">
                        <div className="border-b px-5 py-3">
                          <p className="text-sm font-semibold">Texte indexé disponible</p>
                          <p className="text-xs text-muted-foreground">
                            La prévisualisation PDF est absente, mais voici un extrait du texte réellement exploité par le moteur.
                          </p>
                        </div>
                        <div className="max-h-[70vh] overflow-auto px-5 py-4">
                          <pre className="whitespace-pre-wrap text-xs leading-6 text-foreground/90">
                            {selectedDoc.rawTextPreview}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed bg-background/80 p-6 text-sm text-muted-foreground">
                        Aucun extrait texte n'est disponible pour ce document. Une réimportation du fichier est recommandée.
                      </div>
                    )}
                  </div>
                </div>
              ) : selectedDoc ? (
                <iframe 
                  src={`/api/mairie/documents/${selectedDoc.id}/view#toolbar=0`} 
                  className="w-full h-full border-none"
                  title="PDF Preview"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* DROITE: MÉTADONNÉES & IA */}
            <div className="w-[350px] border-l bg-background p-6 space-y-6 overflow-y-auto">
              <div className="space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2 border-b pb-2">
                  <BrainCircuit className="w-4 h-4 text-primary" />
                  Analyse IA du Document
                </h4>
                
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Note Explicative (Synthèse)</label>
                    <Textarea 
                      className="text-xs min-h-[120px] bg-muted/10 italic leading-relaxed"
                      placeholder="L'IA génère ici une note synthétique du contenu..."
                      defaultValue={selectedDoc?.explanatoryNote}
                      onBlur={(e) => {
                        if (e.target.value !== selectedDoc?.explanatoryNote) {
                          updateNoteMutation.mutate({ id: selectedDoc.id, note: e.target.value });
                        }
                      }}
                    />
                    <p className="text-[9px] text-muted-foreground italic">
                      Cette note sera affichée dans la liste des documents pour faciliter la navigation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-bold flex items-center gap-2 border-b pb-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Métadonnées Réglementaires
                </h4>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Classification</label>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="p-2 bg-muted/30 rounded border text-[10px] font-bold">
                        ORIGINE : {selectedDoc?.category} / {selectedDoc?.documentType}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedDoc?.textQualityLabel && (
                          <Badge variant="outline" className={getTextQualityBadgeMeta(selectedDoc.textQualityLabel).className}>
                            {getTextQualityBadgeMeta(selectedDoc.textQualityLabel).text}
                            {typeof selectedDoc?.textQualityScore === "number" ? ` · ${selectedDoc.textQualityScore}%` : ""}
                          </Badge>
                        )}
                        {selectedDoc?.hasVisualRegulatoryAnalysis && (
                          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                            OCR / vision renforcée
                          </Badge>
                        )}
                        {selectedDoc?.extractionHint === "written_regulation" && (
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                            Règlement écrit prioritaire
                          </Badge>
                        )}
                      </div>
                      {selectedDoc?.textQualityMessage && (
                        <div className="p-2 bg-muted/20 rounded border text-[11px] text-muted-foreground leading-relaxed">
                          {selectedDoc.textQualityMessage}
                        </div>
                      )}
                      {selectedDoc?.textQualityLabel === "poor" && (
                        <div className="p-2 rounded border border-amber-200 bg-amber-50 text-[11px] text-amber-800 leading-relaxed">
                          Ce document est probablement scanné ou mal extrait. Réuploade-le ou relance une analyse vision pour améliorer les règles récupérées.
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Date d'Indexation</label>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      {selectedDoc && format(new Date(selectedDoc.createdAt), "dd/MM/yyyy HH:mm")}
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button 
                      variant="destructive" 
                      className="w-full gap-2 h-9 text-xs"
                      onClick={() => {
                        if(confirm("Supprimer définitivement ce document de la base de connaissances ?")) {
                          deleteMutation.mutate(selectedDoc.id);
                          setSelectedDoc(null);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" /> Supprimer du corpus
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      )}
    </div>
  );
}

export default function PortailMairiePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDossierTab, setActiveDossierTab] = useState<string>("summary");
  const [activeTab, setActiveTab] = useState("dossiers");

  // Reset sub-tab when switching dossier
  useEffect(() => {
    setActiveDossierTab("summary");
  }, [selectedId]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<string>("all");
  const [customPrompt, setCustomPrompt] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = (user?.role as string) === "admin";

  const { data: globalPrompts, refetch: refetchGlobalPrompts } = useQuery<any[]>({
    queryKey: ["global-prompts"],
    queryFn: async () => {
      const r = await fetch("/api/admin/prompts", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch global prompts");
      return r.json();
    },
    enabled: isAdmin && activeTab === "config"
  });

  const assignedCommunes = useMemo(() => {
    const raw = (user as any)?.communes;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      if (raw.startsWith("[")) {
        try { return JSON.parse(raw); } catch { return []; }
      }
      return raw.split(",").map(c => c.trim()).filter(Boolean);
    }
    return [];
  }, [user]);

  const { data: allCommunes = [] } = useQuery<string[]>({
    queryKey: ["admin-communes"],
    queryFn: () => apiFetch("/api/admin/communes"),
    enabled: !!isAuthenticated && (user?.role as string) === "admin",
  });

  const communes = useMemo(() => {
    if ((user?.role as string) === "admin") {
      const set = new Set([...assignedCommunes, ...allCommunes]);
      return Array.from(set).sort();
    }
    return assignedCommunes;
  }, [assignedCommunes, allCommunes, user]);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) { setLocation("/login"); return; }
      if ((user?.role as string) !== "mairie" && user?.role !== "admin") { setLocation("/dashboard"); }
      
      // Default to first commune if it's a mairie user
      if ((user?.role as string) === "mairie" && assignedCommunes.length > 0) {
        setSelectedCommune(assignedCommunes[0]);
      }
    }
  }, [isLoading, isAuthenticated, user, assignedCommunes]);

  const { data: dossiersData, isLoading: loadingDossiers } = useQuery<{ dossiers: Dossier[] }>({
    queryKey: ["mairie-dossiers", selectedCommune],
    queryFn: () => apiFetch(`/api/mairie/dossiers${selectedCommune !== "all" ? `?commune=${encodeURIComponent(selectedCommune)}` : ""}`),
    enabled: !!isAuthenticated && ((user?.role as string) === "mairie" || (user?.role as string) === "admin"),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery<DossierDetail>({
    queryKey: ["mairie-dossier", selectedId],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${selectedId}`),
    enabled: !!selectedId,
  });

  const { data: globalSummary, isLoading: loadingSummary } = useQuery<{ summary: string; global_status: string; recommendations: string[] }>({
    queryKey: ["mairie-dossier-summary", selectedId],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${selectedId}/summary`),
    enabled: !!selectedId && activeDossierTab === "summary",
  });

  const { data: pluDocsData, isLoading: loadingPluDocs } = useQuery<{ documents: any[] }>({
    queryKey: ["mairie-documents", selectedCommune],
    queryFn: () => apiFetch(`/api/mairie/documents${selectedCommune !== "all" ? `?commune=${encodeURIComponent(selectedCommune)}` : ""}`),
    enabled: !!isAuthenticated && activeTab === "plu",
  });

  const { data: promptData } = useQuery<{ prompt: string }>({
    queryKey: ["mairie-prompt", selectedCommune],
    queryFn: () => apiFetch(`/api/mairie/prompts/${encodeURIComponent(selectedCommune)}`),
    enabled: !!isAuthenticated && activeTab === "config" && selectedCommune !== "all",
  });

  useEffect(() => {
    if (promptData?.prompt) {
      setCustomPrompt((promptData.prompt as any).content || "");
    } else {
      setCustomPrompt("");
    }
  }, [promptData]);

  const [localFormulas, setLocalFormulas] = useState<Record<string, string>>({});

  const { data: mairieSettingsData, refetch: refetchSettings } = useQuery<{ settings: MairieSettings | null }>({
    queryKey: ["mairie-settings", selectedCommune],
    queryFn: () => apiFetch(`/api/mairie/settings/${encodeURIComponent(selectedCommune)}`),
    enabled: !!isAuthenticated && (activeTab === "config" || activeTab === "finance") && selectedCommune !== "all",
  });

  useEffect(() => {
    if (mairieSettingsData?.settings?.formulas) {
      setLocalFormulas(mairieSettingsData.settings.formulas);
    } else {
      setLocalFormulas({});
    }
  }, [mairieSettingsData]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<MairieSettings>) => {
      const r = await fetch(`/api/mairie/settings/${encodeURIComponent(selectedCommune)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error("Erreur lors de la sauvegarde des paramètres");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Paramètres sauvegardés", description: "Les taux et coûts ont été mis à jour." });
      queryClient.invalidateQueries({ queryKey: ["mairie-settings", selectedCommune] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  });

  const savePromptMutation = useMutation({
    mutationFn: async (content: string) => {
      const r = await fetch(`/api/mairie/prompts/${encodeURIComponent(selectedCommune)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error("Erreur lors de la sauvegarde du prompt");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration sauvegardée", description: "Le prompt IA a été mis à jour pour cette commune." });
      queryClient.invalidateQueries({ queryKey: ["mairie-prompt", selectedCommune] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (selectedCommune !== "all") {
        formData.append("commune", selectedCommune);
      }
      const r = await fetch("/api/mairie/documents", {
        method: "POST",
        body: formData,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.details || "Upload failed");
      return data;
    },
    onSuccess: () => {
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
      toast({ title: "Succès", description: "Document PLU ajouté à la base de connaissances." });
    },
    onError: (error) => {
      toast({ title: "Erreur serveur", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/mairie/documents/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mairie-documents"] });
      toast({ title: "Supprimé", description: "Le document a été retiré de la base." });
    }
  });

  const deleteDossierMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/mairie/dossiers/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.message || "Delete failed");
      }
      return r.json();
    },
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["mairie-dossiers"] });
      toast({ title: "Dossier supprimé", description: "L'intégralité du dossier a été supprimée." });
    },
    onError: (error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  });

  const saveGlobalPromptMutation = useMutation({
    mutationFn: async ({ key, content }: { key: string; content: string }) => {
      const r = await fetch(`/api/admin/prompts/${key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error("Failed to save global prompt");
      return r.json();
    },
    onSuccess: () => {
      refetchGlobalPrompts();
      toast({ title: "Prompt global sauvegardé", description: "Les changements s'appliquent à tous les dossiers." });
    }
  });

  const resetGlobalPromptMutation = useMutation({
    mutationFn: async (key: string) => {
      const r = await fetch(`/api/admin/prompts/${key}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to reset prompt");
      return r.json();
    },
    onSuccess: () => {
      refetchGlobalPrompts();
      toast({ title: "Prompt réinitialisé", description: "Valeurs par défaut restaurées." });
    }
  });

  const reprocessMutation = useMutation({
    mutationFn: (docId: string) => apiFetch(`/api/documents/${docId}/reprocess`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Analyse relancée", description: "Le document est en cours de traitement." });
      queryClient.invalidateQueries({ queryKey: ["mairie-dossier", selectedId] });
    },
  });

  const visionMutation = useMutation({
    mutationFn: (docId: string) => apiFetch(`/api/mairie/documents/${docId}/vision`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Vision activée", description: "L'analyse graphique par GPT-4o a été lancée." });
      queryClient.invalidateQueries({ queryKey: ["mairie-dossier", selectedId] });
    },
    onError: (err: any) => {
      toast({ title: "Erreur Vision", description: err.message, variant: "destructive" });
    }
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const dossiers = dossiersData?.dossiers ?? [];
  const comparisonRaw = detail?.comparisonResultJson ? JSON.parse(detail.comparisonResultJson) : null;
  const comparison: ComparisonResult | null = comparisonRaw?.data ?? comparisonRaw;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 py-4 animate-in fade-in duration-500 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 sm:h-12 sm:w-12">
            <Building className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">Portail Mairie</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Consultation des dossiers déposés et gestion de la base de connaissance IA.</p>
          </div>
        </div>

        {!selectedId ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
              <TabsList className="w-full lg:max-w-[760px]">
                <TabsTrigger value="dossiers">Dossiers CERFA</TabsTrigger>
                <TabsTrigger value="plu" className="gap-2">Base IA (PLU)</TabsTrigger>
                <TabsTrigger value="finance" className="gap-2"><Zap className="w-3.5 h-3.5" /> Fiscalité & Coûts</TabsTrigger>
                <TabsTrigger value="config" className="gap-2"><Settings className="w-3.5 h-3.5" /> Config Prompt</TabsTrigger>
              </TabsList>

              {communes.length > 0 && (activeTab === "dossiers" || activeTab === "plu" || activeTab === "config" || activeTab === "finance") && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Commune :</span>
                  <Select value={selectedCommune} onValueChange={setSelectedCommune}>
                    <SelectTrigger className="w-full sm:w-[200px] h-9">
                      <SelectValue placeholder="Sélectionner une ville" />
                      <SelectContent>
                        <SelectItem value="all">Toutes les communes</SelectItem>
                        {communes.map((c: string) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </SelectTrigger>
                  </Select>
                </div>
              )}
            </div>

            <TabsContent value="dossiers" className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground font-medium">{dossiers.length} dossier{dossiers.length !== 1 ? "s" : ""} déposé{dossiers.length !== 1 ? "s" : ""}</p>
              </div>

              {loadingDossiers ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="h-40" />
                    </Card>
                  ))}
                </div>
              ) : dossiers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {dossiers.map((d) => (
                    <Card 
                      key={d.id} 
                      className="group overflow-hidden hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 border-primary/5 cursor-pointer relative"
                      onClick={() => setSelectedId(d.id)}
                    >
                      <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${d.criticalityScore && d.criticalityScore >= 50 ? "bg-destructive group-hover:bg-destructive" : d.criticalityScore && d.criticalityScore > 10 ? "bg-amber-500 group-hover:bg-amber-600" : "bg-primary/20 group-hover:bg-primary"}`}></div>
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                             <span className="text-[10px] font-black font-mono bg-muted px-1.5 py-0.5 rounded border">{(d as any).dossierNumber || "SANS NUMÉRO"}</span>
                            <Badge variant={STATUS_CONFIG[d.status]?.variant ?? "outline"}>
                              {STATUS_CONFIG[d.status]?.label ?? d.status}
                            </Badge>
                            {d.anomalyCount && d.anomalyCount > 0 ? (
                               <Badge variant="destructive" className="flex items-center gap-1 text-[10px] h-5 shadow-sm px-1.5 font-semibold font-mono tracking-tight">
                                 <AlertTriangle className="w-3 h-3" />
                                 {d.anomalyCount} ALERTE{d.anomalyCount > 1 ? "S" : ""}
                               </Badge>
                            ) : null}
                          </div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider whitespace-nowrap ml-2">
                            {format(new Date(d.createdAt), "d MMM", { locale: fr })}
                          </span>
                        </div>
                        <p className="font-semibold text-foreground truncate">{d.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 mb-2">
                          <User className="w-3 h-3 text-primary/60 shrink-0" />
                          <span className="truncate">{d.userName || "Déposant inconnu"} ({d.userEmail || "—"})</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 pt-2 border-t border-dashed">
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 text-[9px] h-4">
                            {DOC_TYPE_LABELS[d.documentType] ?? d.documentType}
                          </Badge>
                          {(d.address || d.analysisAddress) && (
                            <div className="flex items-center gap-1 min-w-0">
                              <MapPin className="w-3 h-3 text-primary/60 shrink-0" />
                              <span className="truncate">{d.address || d.analysisAddress}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 shrink-0">
                            <Building className="w-3 h-3 text-primary/60 shrink-0" />
                            <span>{d.commune || d.analysisCity || "—"}</span>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-dashed py-20 bg-muted/20">
                  <CardContent className="text-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground font-medium">Aucun dossier trouvé pour cette sélection.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="plu">
              <BaseIASection currentCommune={selectedCommune} />
            </TabsContent>

            <TabsContent value="config">
              <Card className="border-primary/10 overflow-hidden">
                <CardHeader className="bg-muted/30 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-primary" />
                        Configuration de l'IA
                      </CardTitle>
                      <CardDescription>
                        Gérez les instructions globales et les directives locales par ville.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs defaultValue="local" className="w-full">
                    <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-6 h-12">
                      <TabsTrigger value="local" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 h-full">
                        <MapPin className="w-3.5 h-3.5 mr-2" /> Directives Locales
                      </TabsTrigger>
                      {isAdmin && (
                        <TabsTrigger value="global" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 h-full">
                          <BrainCircuit className="w-3.5 h-3.5 mr-2" /> Prompts Globaux (Admin)
                        </TabsTrigger>
                      )}
                    </TabsList>

                    <TabsContent value="local" className="p-6 focus-visible:ring-0">
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/10 rounded-xl">
                          <Building className="w-5 h-5 text-primary shrink-0" />
                          <div>
                            <p className="font-semibold text-sm">Directives pour {selectedCommune === "all" ? "toutes les communes" : selectedCommune}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Ces instructions sont ajoutées au prompt de comparaison spécifiquement pour cette ville.
                            </p>
                          </div>
                        </div>

                        {selectedCommune === "all" ? (
                          <div className="p-8 text-center bg-muted/20 rounded-lg border border-dashed">
                            <p className="text-sm text-muted-foreground">Veuillez sélectionner une commune spécifique dans le menu en haut à droite.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <Textarea
                              placeholder="Ex: 'Ici, la hauteur se mesure à l'égout du toit et non au faitage...'"
                              className="min-h-[300px] font-mono text-sm leading-relaxed"
                              value={customPrompt}
                              onChange={(e) => setCustomPrompt(e.target.value)}
                            />
                            <div className="flex justify-end">
                              <Button 
                                className="gap-2" 
                                onClick={() => savePromptMutation.mutate(customPrompt)}
                                disabled={savePromptMutation.isPending}
                              >
                                {savePromptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Sauvegarder les directives locales
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    {isAdmin && (
                      <TabsContent value="global" className="p-6 space-y-6 focus-visible:ring-0">
                        <div className="flex items-center gap-3 p-4 bg-accent/5 border border-accent/20 rounded-xl">
                          <BrainCircuit className="w-5 h-5 text-accent shrink-0" />
                          <div>
                            <p className="font-semibold text-sm">Moteur d'IA (Prompts Globaux)</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              MODIFICATION CRITIQUE : Ces prompts définissent le comportement de base de l'IA (Extraction et Comparaison) pour TOUTE la plateforme.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-6">
                          {globalPrompts?.map((p: any) => (
                            <div key={p.key} className="space-y-3 p-4 border rounded-lg bg-muted/10">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold">{p.label}</h4>
                                  <p className="text-xs text-muted-foreground">{p.description}</p>
                                </div>
                                <Badge variant="outline" className="font-mono text-[10px]">{p.key}</Badge>
                              </div>
                              <Textarea
                                defaultValue={p.content}
                                rows={8}
                                className="font-mono text-xs bg-background"
                                onBlur={(e) => {
                                  if (e.target.value !== p.content) {
                                    saveGlobalPromptMutation.mutate({ key: p.key, content: e.target.value });
                                  }
                                }}
                              />
                              <div className="flex justify-start">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[10px] h-7 gap-1.5 text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    if (confirm("Réinitialiser ce prompt aux valeurs par défaut du code ?")) {
                                      resetGlobalPromptMutation.mutate(p.key);
                                    }
                                  }}
                                >
                                  <RotateCcw className="w-3 h-3" /> Réinitialiser
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    )}
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="finance">
              <Card className="border-primary/10 overflow-hidden">
                <CardHeader className="bg-muted/30 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        Fiscalité Locale & Paramètres de Marché
                      </CardTitle>
                      <CardDescription>
                        Définissez les taux et valeurs qui seront appliquées à toutes les analyses de la commune {selectedCommune === "all" ? "" : selectedCommune}.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                      <Zap className="w-5 h-5 text-yellow-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm">Paramètres Financiers pour {selectedCommune === "all" ? "tous les territoires" : selectedCommune}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ces taux seront appliqués automatiquement à TOUTES les analyses foncières de cette commune et seront verrouillés (non modifiables par les utilisateurs).
                        </p>
                      </div>
                    </div>

                    {selectedCommune === "all" ? (
                      <div className="p-8 text-center bg-muted/20 rounded-lg border border-dashed">
                        <p className="text-sm text-muted-foreground">Veuillez sélectionner une commune spécifique dans le menu en haut à droite pour accéder aux paramètres fiscaux.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* SECTION 1: FISCALITÉ LOCALE */}
                        <div className="space-y-4 p-4 border rounded-xl bg-muted/5">
                          <h4 className="text-sm font-bold flex items-center gap-2 text-primary">
                            <Zap className="w-4 h-4" /> Fiscalité Locale
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Taxe d'Aménagement (Commune)</label>
                              <div className="flex items-center gap-2">
                                <Input type="number" step="0.1" id="taRateCommunal" defaultValue={((mairieSettingsData?.settings?.taRateCommunal ?? 0.05) * 100).toFixed(1)} />
                                <span className="text-xs font-bold text-muted-foreground">%</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Taxe d'Aménagement (Dept)</label>
                              <div className="flex items-center gap-2">
                                <Input type="number" step="0.01" id="taRateDept" defaultValue={((mairieSettingsData?.settings?.taRateDept ?? 0.025) * 100).toFixed(2)} />
                                <span className="text-xs font-bold text-muted-foreground">%</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Taxe Foncière</label>
                              <div className="flex items-center gap-2">
                                <Input type="number" step="0.1" id="taxeFonciereRate" defaultValue={((mairieSettingsData?.settings?.taxeFonciereRate ?? 0.40) * 100).toFixed(1)} />
                                <span className="text-xs font-bold text-muted-foreground">%</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">TEOM / Ordures</label>
                              <div className="flex items-center gap-2">
                                <Input type="number" step="0.1" id="teomRate" defaultValue={((mairieSettingsData?.settings?.teomRate ?? 0.12) * 100).toFixed(1)} />
                                <span className="text-xs font-bold text-muted-foreground">%</span>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 pt-2 border-t">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Redevance Archéo (RAP)</label>
                            <div className="flex items-center gap-2 w-1/2">
                              <Input type="number" step="0.01" id="rapRate" defaultValue={((mairieSettingsData?.settings?.rapRate ?? 0.004) * 100).toFixed(2)} />
                              <span className="text-xs font-bold text-muted-foreground">%</span>
                            </div>
                          </div>
                        </div>

                        {/* SECTION 2: VALEURS FORFAITAIRES */}
                        <div className="space-y-4 p-4 border rounded-xl bg-muted/5">
                          <h4 className="text-sm font-bold flex items-center gap-2 text-primary">
                            <Activity className="w-4 h-4" /> Valeurs Forfaitaires
                          </h4>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Valeur TA (€/m²)</label>
                              <Input type="number" id="valeurForfaitaireTA" defaultValue={mairieSettingsData?.settings?.valeurForfaitaireTA ?? 900} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Piscine (€/m²)</label>
                              <Input type="number" id="valeurForfaitairePiscine" defaultValue={mairieSettingsData?.settings?.valeurForfaitairePiscine ?? 250} />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Stationnement (€/unité)</label>
                              <Input type="number" id="valeurForfaitaireStationnement" defaultValue={mairieSettingsData?.settings?.valeurForfaitaireStationnement ?? 2000} />
                            </div>
                          </div>
                        </div>

                        {/* SECTION 3: MARCHÉ LOCAL */}
                        <div className="space-y-4 p-4 border rounded-xl bg-muted/5">
                          <h4 className="text-sm font-bold flex items-center gap-2 text-primary">
                            <BarChart3 className="w-4 h-4" /> Marché & Rendements
                          </h4>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Prix Marché (€/m²)</label>
                              <Input type="number" id="prixM2Maison" defaultValue={mairieSettingsData?.settings?.prixM2Maison ?? 2500} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Rendement Maison</label>
                                <div className="flex items-center gap-2">
                                  <Input type="number" step="0.1" id="yieldMaison" defaultValue={((mairieSettingsData?.settings?.yieldMaison ?? 0.04) * 100).toFixed(1)} />
                                  <span className="text-xs font-bold text-muted-foreground">%</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Rendement Collectif</label>
                                <div className="flex items-center gap-2">
                                  <Input type="number" step="0.1" id="yieldCollectif" defaultValue={((mairieSettingsData?.settings?.yieldCollectif ?? 0.05) * 100).toFixed(1)} />
                                  <span className="text-xs font-bold text-muted-foreground">%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* SECTION 4: ABATTEMENTS */}
                        <div className="space-y-4 p-4 border rounded-xl bg-muted/5">
                          <h4 className="text-sm font-bold flex items-center gap-2 text-primary">
                            <ShieldCheck className="w-4 h-4" /> Abattements & Social
                          </h4>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Abattement Rés. Principale</label>
                              <div className="flex items-center gap-2">
                                <Input type="number" step="0.1" id="abattementRP" defaultValue={((mairieSettingsData?.settings?.abattementRP ?? 0.5) * 100).toFixed(0)} />
                                <span className="text-xs font-bold text-muted-foreground">%</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-tight">Surface Concernée (m²)</label>
                              <Input type="number" id="surfaceAbattement" defaultValue={mairieSettingsData?.settings?.surfaceAbattement ?? 100} />
                            </div>
                          </div>
                        </div>

                      </div>
                      
                      {/* SECTION 5: MOTEUR DE CALCUL DYNAMIQUE */}
                      <div className="space-y-6 pt-8 border-t">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold flex items-center gap-2 text-primary">
                              <Calculator className="w-4 h-4" /> Moteur de Calcul (Mode Déterministe)
                            </h4>
                            <p className="text-[10px] text-muted-foreground mt-1">Personnalisez les formules mathématiques utilisées par le moteur Boost MCP.</p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-[10px] gap-1.5"
                            onClick={() => setLocalFormulas(prev => ({ ...prev, [`nouvelle_taxe_${Object.keys(prev).length + 1}`]: "" }))}
                          >
                            <Plus className="w-3.5 h-3.5" /> Ajouter une formule
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          {Object.entries(localFormulas).map(([key, formula]) => (
                            <div key={key} className="flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
                              <div className="flex-1 space-y-1.5">
                                <label className="text-[9px] font-bold uppercase text-muted-foreground ml-1">Identifiant (Key)</label>
                                <Input 
                                  value={key} 
                                  readOnly={["taxe_amenagement_commune", "taxe_amenagement_dept", "redevance_archeologie_preventive", "taxe_amenagement_totale", "estimation_taxe_fonciere_annuelle"].includes(key)}
                                  onChange={(e) => {
                                    const newKey = e.target.value;
                                    const newFormulas = { ...localFormulas };
                                    delete newFormulas[key];
                                    newFormulas[newKey] = formula;
                                    setLocalFormulas(newFormulas);
                                  }}
                                  className="h-9 font-mono text-xs bg-muted/20"
                                />
                              </div>
                              <div className="flex-[2] space-y-1.5">
                                <label className="text-[9px] font-bold uppercase text-muted-foreground ml-1">Formule mathématique</label>
                                <Input 
                                  value={formula} 
                                  onChange={(e) => setLocalFormulas(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder="ex: surface_taxable_creee * 900 * 0.05"
                                  className="h-9 font-mono text-xs bg-card border-primary/20"
                                />
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="mt-6 text-muted-foreground hover:text-destructive h-9 w-9"
                                onClick={() => {
                                  const next = { ...localFormulas };
                                  delete next[key];
                                  setLocalFormulas(next);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}

                          <div className="p-4 bg-muted/20 rounded-xl border border-dashed text-[10px] text-muted-foreground">
                            <p className="font-bold mb-2 flex items-center gap-2">
                              <BookOpen className="w-3 h-3" /> Variables autorisées :
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
                              <span>surface_taxable_creee</span>
                              <span>surface_taxable_existante</span>
                              <span>valeur_forfaitaire_ta_m2</span>
                              <span>valeur_forfaitaire_piscine_m2</span>
                              <span>taux_taxe_amenagement_commune</span>
                              <span>taux_taxe_amenagement_departement</span>
                              <span>taux_taxe_fonciere</span>
                              <span>taux_rap</span>
                              <span>nombre_stationnements</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t">
                          <Button 
                            className="gap-2 bg-yellow-600 hover:bg-yellow-700 h-10 px-8"
                            onClick={() => {
                              const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
                              
                              saveSettingsMutation.mutate({
                                taRateCommunal: parseFloat(getVal("taRateCommunal")) / 100,
                                taRateDept: parseFloat(getVal("taRateDept")) / 100,
                                taxeFonciereRate: parseFloat(getVal("taxeFonciereRate")) / 100,
                                teomRate: parseFloat(getVal("teomRate")) / 100,
                                rapRate: parseFloat(getVal("rapRate")) / 100,
                                
                                valeurForfaitaireTA: parseInt(getVal("valeurForfaitaireTA")),
                                valeurForfaitairePiscine: parseInt(getVal("valeurForfaitairePiscine")),
                                valeurForfaitaireStationnement: parseInt(getVal("valeurForfaitaireStationnement")),
                                
                                prixM2Maison: parseInt(getVal("prixM2Maison")),
                                yieldMaison: parseFloat(getVal("yieldMaison")) / 100,
                                yieldCollectif: parseFloat(getVal("yieldCollectif")) / 100,
                                
                                abattementRP: parseFloat(getVal("abattementRP")) / 100,
                                surfaceAbattement: parseInt(getVal("surfaceAbattement")),
                                formulas: localFormulas
                              });
                            }}
                            disabled={saveSettingsMutation.isPending}
                          >
                            {saveSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Verrouiller les paramètres fiscaux
                          </Button>
                        </div>
                      </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 -ml-2">
              <Button variant="ghost" className="gap-2 hover:bg-primary/5 text-primary" onClick={() => setSelectedId(null)}>
                <ArrowLeft className="w-4 h-4" /> Retour aux dossiers
              </Button>

              <Button 
                variant="ghost" 
                size="sm" 
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 gap-2"
                onClick={() => {
                  if (confirm("Supprimer l'intégralité du dossier (tous les documents et analyses) ? Cette action est irréversible.")) {
                    deleteDossierMutation.mutate(selectedId!);
                  }
                }}
                disabled={deleteDossierMutation.isPending}
              >
                {deleteDossierMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="text-xs font-medium uppercase tracking-wider">Supprimer le dossier</span>
              </Button>
            </div>

            {loadingDetail ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : detail ? (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar Info & Parcel */}
                <div className="w-full lg:w-80 space-y-4 shrink-0">
                  <Card className="bg-muted/30 border-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <User className="w-3.5 h-3.5" />
                        Administré
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1 px-4 pb-4">
                      <p className="font-semibold">{detail.userName ?? "—"}</p>
                      <p className="text-muted-foreground text-xs">{detail.userEmail ?? "—"}</p>
                    </CardContent>
                  </Card>

                  {(detail.address || detail.analysisAddress) && (
                    <Card className="bg-muted/30 border-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5" />
                          Parcelle
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1 px-4 pb-4">
                        <p className="font-semibold text-xs leading-tight">{detail.address || detail.analysisAddress}</p>
                        {(detail.commune || detail.analysisCity) && <p className="text-muted-foreground text-[10px]">{detail.commune || detail.analysisCity}</p>}
                        {(detail.zoneCode || detail.analysisZoneCode) && (
                          <p className="text-[10px] mt-2 pt-2 border-t border-border/50">
                            Zone : <span className="font-bold text-primary">{detail.zoneCode || detail.analysisZoneCode}</span>
                            {(detail.zoneLabel || detail.analysisZoningLabel) && ` (${detail.zoneLabel || detail.analysisZoningLabel})`}
                          </p>
                        )}
                        {detail.parcelRef && (
                           <p className="text-[10px] text-muted-foreground mt-1 italic">Réf: {detail.parcelRef}</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Main Content Area with Tabs */}
                <div className="flex-1 space-y-6">
                  <Tabs value={activeDossierTab} onValueChange={setActiveDossierTab} className="w-full">
                    <TabsList className="w-full justify-start h-auto p-1 bg-muted/30 flex-wrap">
                      <TabsTrigger value="summary" className="gap-2 px-4 py-2">
                        <ClipboardCheck className="w-4 h-4" />
                        Synthèse Globale
                      </TabsTrigger>
                      {detail.documents?.map((doc) => (
                        <TabsTrigger 
                          key={doc.id} 
                          value={doc.id}
                          className="gap-2 px-4 py-2 relative"
                        >
                          <FileText className="w-4 h-4" />
                          <span className="max-w-[150px] truncate">{doc.fileName || doc.title}</span>
                          {(doc as any).hasVisionAnalysis && (
                            <div className="absolute -top-1 -right-1 group">
                               <div className="w-2.5 h-2.5 bg-amber-500 rounded-full border border-white animate-pulse" />
                            </div>
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    <TabsContent value="summary" className="mt-6 space-y-6">
                      <Card className="border-primary/5 shadow-lg shadow-primary/5 bg-primary/5 border-primary/10">
                        <CardHeader className="pb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-primary text-primary-foreground">PROJET GLOBAL</Badge>
                            <Badge variant="outline" className="bg-white/50">
                              {detail.documents?.length || 1} documents analysés
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-black font-mono bg-white/80 px-1.5 py-0.5 rounded border">{(detail as any).dossierNumber || "SANS NUMÉRO"}</span>
                                <Badge variant="outline" className="bg-white/50 text-[10px] h-5 uppercase tracking-tighter">
                                  {DOC_TYPE_LABELS[detail.documentType] || detail.documentType}
                                </Badge>
                              </div>
                              <CardTitle className="text-2xl font-bold">Synthèse du Dossier</CardTitle>
                              <CardDescription>Vue d'ensemble consolidée de toutes les pièces déposées.</CardDescription>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                              onClick={() => {
                                queryClient.invalidateQueries({ queryKey: ["mairie-dossier-summary", selectedId] });
                                toast({ title: "Actualisation...", description: "La synthèse est en cours de re-génération." });
                              }}
                            >
                              <RefreshCw className="w-4 h-4" />
                              Régénérer la synthèse
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {detail.metadata?.pieceChecklist && (
                            <PieceChecklist checklist={detail.metadata.pieceChecklist} />
                          )}
                          
                          {loadingSummary ? (
                            <div className="py-20 flex flex-col items-center gap-4">
                              <Loader2 className="w-10 h-10 animate-spin text-primary" />
                              <p className="text-muted-foreground italic">Génération de la synthèse globale en cours...</p>
                            </div>
                          ) : (
                            <div className="space-y-8">
                              {/* 1. VISION SYNTHESIS */}
                              <div className="bg-white rounded-xl p-6 border border-primary/10 shadow-sm">
                                <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <Eye className="w-4 h-4" />
                                  Vision de l'instructeur IA
                                </h4>
                                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{globalSummary?.summary || "Synthèse en attente..."}</p>
                              </div>

                              {/* 2. PLU ANALYSIS (Module 4) */}
                              <PLUAnalysisPanel analysis={detail.metadata?.pluAnalysis} />

                              {/* 3. FINANCIAL ANALYSIS (Module 5) */}
                              <FinancialAnalysisPanel analysis={detail.metadata?.financialAnalysis} dossierId={detail.id} />

                              {/* 4. RECOMMENDATIONS & STATUS */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Statut Estimé</h4>
                                  <Badge className={`w-full justify-center py-2 text-sm uppercase tracking-wider ${
                                    globalSummary?.global_status === "conforme" ? "bg-green-600" : 
                                    globalSummary?.global_status === "non_conforme" ? "bg-red-600" : "bg-orange-500"
                                  }`}>
                                    {globalSummary?.global_status || "Analyse en cours..."}
                                  </Badge>
                                </div>
                                <div className="space-y-4">
                                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Recommandations</h4>
                                  <div className="space-y-2">
                                    {globalSummary?.recommendations?.map((rec: string, i: number) => (
                                      <div key={i} className="flex gap-2 items-start text-sm text-muted-foreground italic">
                                        <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                                        <span>{rec}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <TimelineManager dossierId={detail.dossierId || detail.id} currentStep={detail.timelineStep || "depot"} />

                      <MessagerieSection
                        dossierId={detail.dossierId || detail.id}
                        currentRole={user?.role || "mairie"}
                        documentId={activeDossierTab !== "summary" ? activeDossierTab : undefined}
                      />
                    </TabsContent>

                    {detail.documents?.map((doc: any) => (
                      <TabsContent key={doc.id} value={doc.id} className="mt-6 space-y-6">
                        {doc.comparisonResultJson && (
                          <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 mb-6">
                            <div className="flex items-center gap-2 mb-2 text-primary">
                              <Eye className="w-4 h-4" />
                              <span className="font-semibold text-xs uppercase tracking-widest">Interprétation de l'IA Heureka</span>
                            </div>
                            <p className="text-sm text-foreground/80 italic leading-relaxed">
                              "{(() => {
                                try {
                                  const parsedRaw = JSON.parse(doc.comparisonResultJson);
                                  const parsed = parsedRaw?.data ?? parsedRaw;
                                  return parsed.document_interpretation || "Description factuelle du document en cours de génération...";
                                } catch (e) {
                                  return "Analyse en cours...";
                                }
                              })()}"
                            </p>
                          </div>
                        )}
                        <Card className="border-primary/5 shadow-lg shadow-primary/5">
                          <CardHeader className="pb-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                    {DOC_TYPE_LABELS[doc.documentType || ""] ?? doc.documentType}
                                  </Badge>
                                  {doc.documentNature && (
                                    <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 border-indigo-200">
                                      {doc.documentNature}
                                    </Badge>
                                  )}
                                  <Badge variant={STATUS_CONFIG[doc.status || ""]?.variant ?? "outline"}>
                                    {STATUS_CONFIG[doc.status || ""]?.label ?? doc.status}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-4">
                                  <CardTitle className="text-2xl font-bold truncate max-w-md">{doc.fileName || doc.title}</CardTitle>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 h-8 px-2 border-primary/20 hover:bg-primary/5 text-primary"
                                    disabled={reprocessMutation.isPending}
                                    onClick={() => reprocessMutation.mutate(doc.id)}
                                  >
                                    {reprocessMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                    <span className="text-xs">Texte</span>
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 h-8 px-2 border-amber-200 bg-amber-50/30 hover:bg-amber-100 text-amber-700"
                                    disabled={visionMutation.isPending}
                                    onClick={() => visionMutation.mutate(doc.id)}
                                  >
                                    {visionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                    <span className="text-xs">Vision</span>
                                  </Button>
                                </div>

                                {(doc as any).hasVisionAnalysis && (doc as any).visionResultText && (
                                  <div className="mt-4 p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2 text-amber-700">
                                      <Zap className="w-4 h-4" />
                                      <span className="font-bold text-[10px] uppercase tracking-widest text-amber-800">Expertise Visuelle (GPT-4o Vision)</span>
                                    </div>
                                    <p className="text-[11px] text-amber-900 leading-relaxed whitespace-pre-wrap italic">
                                      {(doc as any).visionResultText}
                                    </p>
                                  </div>
                                )}
                                {doc.expertiseNotes && (
                                  <div className="mt-3 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                                    <div className="flex items-center gap-2 mb-1 text-indigo-700">
                                      <Shield className="w-4 h-4" />
                                      <span className="font-semibold text-[10px] uppercase tracking-widest">Note de l'Architecte-Conseil</span>
                                    </div>
                                    <p className="text-xs text-indigo-900/80 leading-relaxed italic">
                                      {doc.expertiseNotes}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Dépôt</p>
                                <p className="text-sm font-medium">{doc.createdAt ? format(new Date(doc.createdAt), "d MMMM yyyy", { locale: fr }) : "—"}</p>
                              </div>
                            </div>
                          </CardHeader>

                          {/* Render comparison result if summary exists */}
                          {doc.comparisonResultJson ? (
                            (() => {
                              const normalizeComparison = (raw: any): any | null => {
                                if (!raw) return null;
                                const data = raw.data || raw;
                                return {
                                  summary: data.summary,
                                  global_status: data.global_status,
                                  score: data.confidence_score,
                                  formalDecision: data.formalDecision,
                                  simulation: data.simulation,
                                  conformities: (data.conformities || []),
                                  inconsistencies: (data.inconsistencies || []),
                                  recommendations: data.recommendations || []
                                };
                              };
                              const comp = normalizeComparison(JSON.parse(doc.comparisonResultJson));
                              if (!comp) return <CardContent className="py-10 text-center text-muted-foreground italic">Données d'analyse non structurées disponibles en base.</CardContent>;
                              
                              return (
                                <CardContent className="space-y-6 pt-0">
                                  <div className="bg-primary/[0.03] border border-primary/10 rounded-xl p-5 relative overflow-hidden flex justify-between items-center gap-6">
                                    <div className="absolute top-0 right-0 p-3 opacity-5">
                                      <ClipboardCheck className="w-16 h-16" />
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="text-sm font-bold text-primary flex items-center gap-2 mb-2 uppercase tracking-wide">
                                        <ClipboardCheck className="w-4 h-4" />
                                        Synthèse de l'instructeur IA
                                      </h4>
                                      <p className="text-sm text-foreground leading-relaxed italic">{comp.summary}</p>
                                    </div>

                                    {comp.score !== undefined && (
                                      <div className="shrink-0 flex flex-col items-center justify-center w-24 h-24 rounded-full border-4 border-primary/10 bg-white shadow-inner relative">
                                         <span className="text-[10px] uppercase font-black text-muted-foreground mb-0.5">Score</span>
                                         <span className={`text-2xl font-black ${comp.score > 80 ? 'text-green-600' : comp.score > 50 ? 'text-orange-500' : 'text-red-600'}`}>
                                           {comp.score}%
                                         </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {comp.formalDecision && (
                                      <div className={`p-4 rounded-xl border ${comp.formalDecision.status === 'favorable' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200 shadow-sm'}`}>
                                         <div className="flex items-center gap-2 mb-2">
                                           <Gavel className={`w-5 h-5 ${comp.formalDecision.status === 'favorable' ? 'text-green-600' : 'text-red-600'}`} />
                                           <span className={`font-bold uppercase tracking-wider text-sm ${comp.formalDecision.status === 'favorable' ? 'text-green-800' : 'text-red-800'}`}>Avis Réglementaire</span>
                                         </div>
                                         <p className="text-sm font-semibold mb-2">{comp.formalDecision.summary}</p>
                                         {comp.formalDecision.blockingIssues && comp.formalDecision.blockingIssues.length > 0 && (
                                           <ul className="space-y-1 list-none p-0">
                                              {comp.formalDecision.blockingIssues.map((issue: string, i: number) => (
                                                <li key={i} className="text-[11px] text-red-700 bg-red-100/50 p-2 rounded border border-red-200 flex gap-2">
                                                  <Shield className="w-3 h-3 shrink-0" />
                                                  {issue}
                                                </li>
                                              ))}
                                           </ul>
                                         )}
                                      </div>
                                    )}

                                    {comp.simulation && comp.simulation.suggestions?.length > 0 && (
                                      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xl relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-2 opacity-10">
                                          <Zap className="w-12 h-12" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <Zap className="w-4 h-4 text-yellow-400" />
                                          <h4 className="font-bold uppercase tracking-widest text-xs">Simulateur de Conformité</h4>
                                        </div>
                                        <div className="space-y-2">
                                          {comp.simulation.suggestions?.map((s: any, i: number) => (
                                            <div key={i} className="bg-white/5 p-2 rounded-lg border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                                              <div className="flex justify-between items-start mb-1">
                                                <span className="text-[8px] font-black uppercase py-0.5 px-1.5 bg-yellow-400 text-slate-900 rounded">{s.category}</span>
                                                <span className="text-[9px] font-bold text-green-400">Impact +{s.scoreImpact}%</span>
                                              </div>
                                              <p className="text-[11px] leading-tight text-slate-200 mb-1">{s.message}</p>
                                              <div className="flex items-center gap-2 text-[9px] text-slate-400">
                                                <span className="line-through">{s.currentValue}</span>
                                                <ChevronRight className="w-2 h-2" />
                                                <span className="text-white font-bold">{s.suggestedValue}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="space-y-6">
                                    {(comp.inconsistencies?.length > 0) && (
                                      <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-red-600 uppercase tracking-widest flex items-center gap-2 px-1">
                                          <AlertTriangle className="w-4 h-4" /> Non-Conformités Majeures
                                        </h4>
                                        <div className="grid grid-cols-1 gap-4">
                                          {comp.inconsistencies.map((point: any, i: number) => (
                                            <TraceabilityPoint key={i} data={point} />
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {(comp.conformities?.length > 0) && (
                                      <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-green-600 uppercase tracking-widest flex items-center gap-2 px-1">
                                          <CheckCircle2 className="w-4 h-4" /> Points de Conformité
                                        </h4>
                                        <div className="grid grid-cols-1 gap-4">
                                          {comp.conformities.map((point: any, i: number) => (
                                            <TraceabilityPoint key={i} data={point} />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {comp.recommendations?.length > 0 && (
                                      <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                                        <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 text-center">Recommandations</h4>
                                        <div className="space-y-1">
                                          {comp.recommendations.map((rec: string, i: number) => (
                                            <p key={i} className="text-sm text-center italic text-muted-foreground">{rec}</p>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              );
                            })()
                          ) : (
                            <CardContent className="py-20 flex flex-col items-center gap-6 text-center">
                              {doc.status === "processing" ? (
                                <>
                                  <div className="relative">
                                     <Loader2 className="w-12 h-12 animate-spin text-primary" />
                                  </div>
                                  <div className="space-y-2">
                                     <p className="font-bold text-xl">Analyse intelligente en cours</p>
                                     <p className="text-sm text-muted-foreground max-w-xs">
                                       L'IA extrait les données techniques du document pour vérifier la conformité avec le PLU.
                                     </p>
                                  </div>
                                </>
                              ) : (
                                 <>
                                   <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                                      <XCircle className="w-10 h-10 text-red-500" />
                                   </div>
                                   <div className="space-y-4 max-w-sm">
                                      <div className="space-y-1">
                                        <p className="font-bold text-xl">Analyse en échec</p>
                                        <p className="text-sm text-muted-foreground">
                                          {doc.failureReason || "L'analyse automatique n'a pas pu être générée pour ce document."}
                                        </p>
                                      </div>
                                      <div className="flex flex-col items-center gap-2">
                                        <Button
                                          variant="destructive"
                                          className="gap-2"
                                          disabled={reprocessMutation.isPending}
                                          onClick={() => reprocessMutation.mutate(doc.id)}
                                        >
                                          {reprocessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                          Relancer l'Analyse
                                        </Button>
                                        <p className="text-[10px] opacity-70 italic">
                                          Note : Tente de re-lire le texte déjà extrait avec le nouveau moteur IA robuste.
                                        </p>
                                      </div>
                                   </div>
                                 </>
                              )}
                            </CardContent>
                          )}
                        </Card>
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
