import { useState, useEffect, useRef } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, ArrowLeft, Send, Clock, Search, Users, ShieldAlert,
  FileCheck, CheckCircle2, Loader2, MessageSquare, FileText, ClipboardCheck, AlertTriangle, XCircle, RefreshCw, HelpCircle
} from "lucide-react";
import { TraceabilityViewer } from "@/components/analysis/traceability-viewer";
import { MissingInfoAlert } from "@/components/analysis/missing-info-alert";
import { AIConfidence, TraceabilityReference } from "@workspace/ai-core";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

type DossierMsg = {
  id: number;
  dossierId: string;
  fromUserId: string;
  fromRole: string;
  content: string;
  createdAt: string;
};

type DossierDetail = {
  id: string;
  title: string;
  documentType?: string;
  status: string;
  timelineStep?: string;
  commune?: string;
  address?: string;
  parcelRef?: string;
  zoneCode?: string;
  zoneLabel?: string;
  createdAt: string;
  comparisonResultJson?: string;
  documents: {
    id: string;
    title: string;
    fileName: string | null;
    documentType: string;
    status: string;
    failureReason?: string;
    createdAt: string;
  }[];
  metadata?: {
    pieceChecklist?: {
      pieces_obligatoires?: string[];
      pieces_conditionnelles?: string[];
      pieces_manquantes?: string[];
      niveau_completude?: 'OK' | 'KO';
      justification_reglementaire?: string[];
      dossier_type?: string;
    };
    projectCharacteristics?: any;
  };
};

const PieceChecklist = ({ checklist, dossierId, onUpload }: { checklist: any, dossierId: string, onUpload: (e: React.ChangeEvent<HTMLInputElement>, code: string) => void }) => {
  if (!checklist) return null;

  const { pieces_obligatoires, pieces_conditionnelles, pieces_manquantes, niveau_completude, justification_reglementaire } = checklist;

  return (
    <Card className={`border-none ${niveau_completude === 'OK' ? 'bg-green-50/20' : 'bg-amber-50/20'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            Checklist des Pièces Justificatives (Dossier {checklist.dossier_type || 'PCMI'})
          </CardTitle>
          <Badge className={niveau_completude === 'OK' ? 'bg-green-600' : 'bg-amber-600'}>
            {niveau_completude === 'OK' ? 'DOSSIER COMPLET' : 'PIÈCES MANQUANTES'}
          </Badge>
        </div>
        {justification_reglementaire && (
          <p className="text-[10px] text-muted-foreground mt-1 italic">{justification_reglementaire.join(', ')}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase px-1">Pièces Obligatoires</h4>
            {pieces_obligatoires?.map((code: string) => (
              <div key={code} className="flex items-center justify-between p-2 bg-white rounded border border-border/50">
                <div className="flex flex-col">
                  <span className="text-xs font-mono font-bold text-primary">{code}</span>
                </div>
                {pieces_manquantes?.includes(code) ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="h-5 text-[9px]">MANQUANT</Badge>
                    <div className="relative">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] gap-1">
                        DÉPOSER
                      </Button>
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        accept=".pdf,image/*"
                        onChange={(e) => onUpload(e, code)} 
                      />
                    </div>
                  </div>
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
              </div>
            ))}
          </div>
          
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase px-1">Pièces Sous Condition</h4>
            {pieces_conditionnelles?.map((code: string) => (
              <div key={code} className="flex items-center justify-between p-2 bg-white rounded border border-border/50">
                <span className="text-xs font-mono font-bold text-indigo-600">{code}</span>
                {pieces_manquantes?.includes(code) ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="h-5 text-[9px]">MANQUANT</Badge>
                    <div className="relative">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] gap-1">
                        DÉPOSER
                      </Button>
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        accept=".pdf,image/*"
                        onChange={(e) => onUpload(e, code)} 
                      />
                    </div>
                  </div>
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ChatSection = ({ messages, user, loading, message, setMessage, handleSendMessage, scrollRef, isPending }: any) => {
  return (
    <Card className="flex flex-col border-none shadow-lg overflow-hidden ring-1 ring-border/40" style={{ height: "calc(100vh - 12rem)" }}>
      <CardHeader className="bg-primary text-primary-foreground py-4 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          <div>
            <CardTitle className="text-base">Messagerie Mairie</CardTitle>
            <CardDescription className="text-primary-foreground/70 text-[10px]">Direct avec l'instructeur</CardDescription>
          </div>
        </div>
      </CardHeader>
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4" ref={scrollRef}>
        {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        {!loading && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 mt-8">
            <MessageSquare className="w-8 h-8 text-slate-200 mb-2" />
            <p className="text-sm font-medium text-slate-400">Aucun message</p>
          </div>
        )}
        {messages.map((msg: any) => {
          const isMe = msg.fromUserId === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-white border text-slate-700 rounded-tl-none"}`}>
                <p>{msg.content}</p>
                <span className={`text-[9px] mt-1 block text-right font-medium ${isMe ? "text-primary-foreground/70" : "text-slate-400"}`}>
                  {format(new Date(msg.createdAt), 'HH:mm', { locale: fr })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-3 bg-white border-t border-border/40 shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Input placeholder="Écrivez votre message..." value={message} onChange={(e) => setMessage(e.target.value)} className="flex-1 h-10 border-none bg-slate-100 rounded-full px-4" disabled={isPending} />
          <Button type="submit" size="icon" disabled={!message.trim() || isPending} className="rounded-full w-10 h-10 shadow-md transform active:scale-95 transition-all">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    </Card>
  );
};

type ComparisonResult = {
  conformites: { point: string; article?: string; explication: string }[];
  inconsistencies: { point: string; article?: string; explication: string; severite: "mineure" | "majeure" | "bloquante" | string; confidence?: AIConfidence }[];
  points_attention: { point: string; explication: string; confidence?: AIConfidence }[];
  summary: string;
  recommendations: string[];
  global_status?: "conforme" | "non_conforme" | "partiellement_conforme" | "indéterminé";
  score?: number;
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  completed: { label: "Analysé", variant: "default", icon: CheckCircle2 },
  processing: { label: "En cours", variant: "secondary", icon: Loader2 },
  pending: { label: "En attente", variant: "outline", icon: ClipboardCheck },
  failed: { label: "Échec", variant: "destructive", icon: XCircle },
};

const SEVERITE_CONFIG: Record<string, { label: string; color: string }> = {
  mineure: { label: "Mineure", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  minor: { label: "Mineure", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  majeure: { label: "Majeure", color: "bg-orange-100 text-orange-800 border-orange-200" },
  major: { label: "Majeure", color: "bg-orange-100 text-orange-800 border-orange-200" },
  bloquante: { label: "Bloquante", color: "bg-red-100 text-red-800 border-red-200" },
  blocking: { label: "Bloquante", color: "bg-red-100 text-red-800 border-red-200" },
  critical: { label: "Bloquante", color: "bg-red-100 text-red-800 border-red-200" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  permis_de_construire: "Permis de construire",
  declaration_prealable: "Déclaration préalable",
  permis_amenager: "Permis d'aménager",
  certificat_urbanisme: "Certificat d'urbanisme",
  autre: "Autre document",
};

async function apiFetch(path: string) {
  const r = await fetch(path, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default function CitoyenDossierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("info");
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: docData, isLoading: docLoading } = useQuery<{ document: DossierDetail; analysis?: ComparisonResult; documents: any[] }>({
    queryKey: ["citoyen-dossier", id],
    queryFn: () => apiFetch(`/api/documents/${id}`),
    enabled: !!id,
    refetchInterval: (data: any) => {
      const status = data?.document?.status;
      return status === "processing" ? 5000 : false;
    },
  });

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: DossierMsg[] }>({
    queryKey: ["dossier-messages", id],
    queryFn: () => apiFetch(`/api/documents/${id}/messages`),
    enabled: !!id,
    refetchInterval: 15000,
  });

  const isDocTab = activeTab !== "info" && activeTab !== "messages" && activeTab !== "synthese";
  const { data: detail, isLoading: loadingDetail } = useQuery<{ document: DossierDetail; analysis?: ComparisonResult }>({
    queryKey: ["citoyen-document", activeTab],
    queryFn: () => apiFetch(`/api/documents/${activeTab}`),
    enabled: isDocTab,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const r = await fetch(`/api/documents/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["dossier-messages", id] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/documents/${id}/submit`, {
        method: "PATCH",
        credentials: "include"
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Dossier soumis !", description: "Votre dossier a été transmis au service Mairie." });
      queryClient.invalidateQueries({ queryKey: ["citoyen-dossier", id] });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de soumettre le dossier.", variant: "destructive" });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, pieceCode }: { file: File, pieceCode: string }) => {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("dossierId", id!);
      formData.append("pieceCode", pieceCode);
      formData.append("commune", docData?.document?.commune || "");
      formData.append("adresse", docData?.document?.address || "");

      const r = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Pièce déposée", description: "L'analyse a été relancée automatiquement." });
      queryClient.invalidateQueries({ queryKey: ["citoyen-dossier", id] });
    },
    onError: (err) => {
      toast({ title: "Erreur de dépôt", description: err.message || "Erreur inconnue", variant: "destructive" });
    }
  });

  const handlePieceUpload = (e: React.ChangeEvent<HTMLInputElement>, code: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate({ file, pieceCode: code });
  };

  const reprocessMutation = useMutation({
    mutationFn: (docId: string) => fetch(`/api/documents/${docId}/reprocess`, { 
      method: "POST",
      credentials: "include"
    }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["citoyen-document", activeTab] });
      queryClient.invalidateQueries({ queryKey: ["citoyen-dossier", id] });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesData?.messages]);

  if (authLoading || docLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!docData?.document) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-8">
        <h2 className="text-xl font-bold mb-4">Dossier non trouvé</h2>
        <Button asChild>
          <Link href="/citoyen">Retour au tableau de bord</Link>
        </Button>
      </div>
    );
  }

  const doc = docData.document;
  const docs = docData.documents || [];
  const messages = messagesData?.messages || [];

  const steps = [
    { id: "depot", label: "Dépôt", icon: Clock, description: "Votre dossier a été reçu par nos services." },
    { id: "analyse", label: "Analyse", icon: Search, description: "Nos experts vérifient la conformité technique." },
    { id: "instruction", label: "Instruction", icon: Users, description: "La Mairie instruit officiellement votre demande." },
    { id: "pieces", label: "Compléments", icon: ShieldAlert, description: "Des pièces complémentaires peuvent être demandées." },
    { id: "decision", label: "Décision", icon: FileCheck, description: "La décision finale a été rendue." },
  ];

  const currentStepIndex = Math.max(0, steps.findIndex(s => s.id === doc.timelineStep));

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMessage.isPending) return;
    sendMessage.mutate(message.trim());
  };

  const normalizeComparison = (raw: any): ComparisonResult | null => {
    if (!raw) return null;
    const data = raw.data || raw;
    
    // If it's already a ComparisonResult
    if (data.summary && (data.conformites || data.inconsistencies)) {
      return data;
    }
    
    // If it's the new RuleEvaluationSchema list (rules)
    if (data.rules || data.regulatory_checks) {
      const items = data.rules || data.regulatory_checks;
      return {
        summary: data.summary || data.analysis?.summary || "Analyse technique disponible.",
        global_status: data.review_status === "auto_ok" ? "conforme" : "indéterminé",
        conformites: items
          .filter((c: any) => c.compliance === "COMPLIANT" || c.compliance === "OK")
          .map((c: any) => ({ point: c.rule || c.rule_id, article: c.source, explication: c.justification || c.analysis })),
        inconsistencies: items
          .filter((c: any) => c.compliance === "NON_COMPLIANT")
          .map((c: any) => ({ 
            point: c.rule || c.rule_id, 
            article: c.source, 
            explication: c.justification || c.analysis, 
            severite: c.impact_level || "major",
            confidence: c.confidence
          })),
        points_attention: items
          .filter((c: any) => c.compliance === "UNCERTAIN")
          .map((c: any) => ({ 
            point: c.rule || c.rule_id, 
            explication: c.justification || c.analysis,
            confidence: c.confidence
          })),
        recommendations: data.recommendations || []
      };
    }
    
    return null;
  };

  const comparison: ComparisonResult | null = detail?.document?.comparisonResultJson ? normalizeComparison(JSON.parse(detail.document.comparisonResultJson)) : null;

  return (
    <div className="min-h-screen bg-muted/20 pb-12">
      <header className="bg-white border-b border-border/40 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/citoyen">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <p className="font-bold text-base line-clamp-1">{doc.title}</p>
                <div className="text-xs text-muted-foreground">
                  ID: {doc.id.split('-')[0].toUpperCase()} • {doc.commune || "Mairie"}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {doc.status === 'pending' || doc.status === 'draft' || doc.timelineStep === 'depot' ? (
              <Button 
                size="sm" 
                className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-2 shadow-md h-8 px-4"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                SOUMETTRE LE DOSSIER
              </Button>
            ) : doc.status === 'SUBMITTED' ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 py-1.5 px-3">DOSSIER SOUMIS</Badge>
            ) : null}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white/50 border border-border/40 p-1 h-auto flex-wrap">
            <TabsTrigger value="info" className="gap-2 px-4 py-2">
              <Clock className="w-4 h-4" /> Suivi & Infos
            </TabsTrigger>
            <TabsTrigger value="synthese" className="gap-2 px-4 py-2">
              <ClipboardCheck className="w-4 h-4" /> Synthèse Globale
            </TabsTrigger>
            {docs.map((d) => (
              <TabsTrigger key={d.id} value={d.id} className="gap-2 px-4 py-2 relative max-w-[200px] truncate">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{d.fileName || DOC_TYPE_LABELS[d.documentType] || d.title}</span>
                {d.status === "failed" && (
                  <AlertTriangle className="w-3 h-3 text-destructive animate-pulse" />
                )}
                {d.status === "processing" && (
                  <Loader2 className="w-3 h-3 animate-spin text-primary/40" />
                )}
              </TabsTrigger>
            ))}
            <TabsTrigger value="messages" className="gap-2 px-4 py-2 sm:hidden">
              <MessageSquare className="w-4 h-4" /> Messages
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-0">
            <div className="lg:col-span-2 space-y-8">
              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-white border-b border-border/40">
                  <CardTitle>Suivi de votre Dossier</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="flex flex-col lg:flex-row justify-between gap-8 lg:gap-0 relative">
                    <div className="hidden lg:block absolute left-8 right-8 top-8 h-0.5 bg-muted" />
                    {steps.map((step, index) => {
                      const isCompleted = index < currentStepIndex;
                      const isCurrent = index === currentStepIndex;
                      const StepIcon = step.icon;
                      return (
                        <div key={step.id} className="flex lg:flex-col items-center relative z-10 lg:w-32 text-center lg:px-2 gap-3 lg:gap-0">
                          <div className={`flex items-center justify-center w-10 h-10 lg:w-16 lg:h-16 rounded-full border-2 transition-all duration-300 ${
                            isCompleted ? "bg-primary border-primary text-primary-foreground shadow-md" :
                            isCurrent ? "bg-white border-primary text-primary scale-110 shadow-md ring-4 ring-primary/10" :
                            "bg-white border-muted text-muted-foreground"
                          }`}>
                            {isCompleted ? <CheckCircle2 className="w-5 h-5 lg:w-8 lg:h-8" /> : <StepIcon className="w-5 h-5 lg:w-8 lg:h-8" />}
                          </div>
                          <div className="lg:mt-4 text-left lg:text-center">
                            <p className={`text-sm font-bold ${isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 hidden lg:block leading-tight">{step.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {doc.metadata?.pieceChecklist && (
                    <div className="mt-8 border-t pt-8">
                      <PieceChecklist 
                        checklist={doc.metadata.pieceChecklist} 
                        dossierId={doc.id}
                        onUpload={handlePieceUpload}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader><CardTitle>Informations Projet</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Adresse</p>
                    <p className="text-sm font-medium">{doc.address || "Non renseignée"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Référence Cadastrale</p>
                    <p className="text-sm font-medium">{doc.parcelRef || (doc.status === 'processing' ? "Analyse..." : "Non disponible")}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Commune</p>
                    <p className="text-sm font-medium">{doc.commune || "Mairie"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Zonage PLU</p>
                    <p className="text-sm font-medium">{doc.zoneCode ? `${doc.zoneCode} (${doc.zoneLabel || ""})` : "Non défini"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="hidden lg:block lg:col-span-1">
               <ChatSection 
                 messages={messages} 
                 user={user} 
                 loading={messagesLoading} 
                 message={message} 
                 setMessage={setMessage} 
                 handleSendMessage={handleSendMessage} 
                 scrollRef={scrollRef}
                 isPending={sendMessage.isPending}
               />
            </div>
          </TabsContent>

          <TabsContent value="synthese" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card className="border-none shadow-sm overflow-hidden bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <ClipboardCheck className="w-6 h-6 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Synthèse de l'Analyse Urbaine</CardTitle>
                      </div>
                    </div>
                    <CardDescription>Analyse consolidée de l'ensemble des pièces de votre dossier par l'IA HEUREKA et l'instructeur.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {docData?.analysis ? (
                      <>
                        <div className="bg-white p-6 rounded-2xl border border-primary/10 shadow-sm relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4 opacity-10">
                              <ShieldAlert className="w-12 h-12 text-primary" />
                           </div>
                           <h4 className="text-sm font-bold text-primary uppercase mb-4 tracking-widest">Résumé Exécutif</h4>
                           <p className="text-slate-700 leading-relaxed italic">"{docData.analysis.summary}"</p>
                        </div>

                        {docData.analysis.recommendations?.length > 0 && (
                          <div className="space-y-4">
                            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Prochaines Étapes</h4>
                            <div className="grid gap-3">
                              {docData.analysis.recommendations?.map((rec, i) => (
                                <div key={i} className="flex gap-3 items-start p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  </div>
                                  <p className="text-sm text-slate-600">{rec}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-20 text-center space-y-4 bg-white rounded-2xl border border-dashed border-slate-200">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto opacity-20" />
                        <p className="text-muted-foreground text-sm">L'analyse globale est en cours de génération...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className="lg:col-span-1 hidden lg:block">
                 <ChatSection 
                   messages={messages} 
                   user={user} 
                   loading={messagesLoading} 
                   message={message} 
                   setMessage={setMessage} 
                   handleSendMessage={handleSendMessage} 
                   scrollRef={scrollRef}
                   isPending={sendMessage.isPending}
                 />
              </div>
            </div>
          </TabsContent>

          {docs.map((d) => (
            <TabsContent key={d.id} value={d.id} className="space-y-6 mt-0">
               {loadingDetail ? (
                 <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
               ) : (
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                   <div className="lg:col-span-2 space-y-6">
                     <Card className="border-none shadow-sm overflow-hidden">
                       <CardHeader className="border-b border-border/40">
                         <div className="flex justify-between items-start">
                           <div>
                             <CardTitle className="text-2xl truncate max-w-md">{d.fileName || d.title}</CardTitle>
                             <CardDescription>Type : {DOC_TYPE_LABELS[d.documentType] || d.documentType}</CardDescription>
                           </div>
                           <div className="flex gap-2">
                             {d.status === "processing" && (
                               <Button variant="outline" size="sm" onClick={() => reprocessMutation.mutate(d.id)} disabled={reprocessMutation.isPending} className="h-7 text-[10px] px-2">
                                 {reprocessMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                 RELANCER
                               </Button>
                             )}
                             <Badge variant={STATUS_CONFIG[d.status]?.variant || "outline"}>
                               {STATUS_CONFIG[d.status]?.label || d.status}
                             </Badge>
                           </div>
                         </div>
                       </CardHeader>
                       <CardContent className="pt-8">
                         {d.status === "failed" && (
                           <div className="bg-destructive/10 border border-destructive/20 text-destructive p-6 rounded-2xl mb-8 space-y-4 shadow-sm ring-1 ring-destructive/10">
                             <div className="flex items-center gap-3">
                               <ShieldAlert className="w-8 h-8 animate-pulse" />
                               <h4 className="text-lg font-bold">Document Inexploitable</h4>
                             </div>
                             <p className="text-sm leading-relaxed whitespace-pre-line opacity-90">
                               {d.failureReason || "Le document n'a pas pu être lu par l'IA. Veuillez vérifier qu'il s'agit d'un PDF textuel ou d'une image nette (JPG/PNG)."}
                             </p>
                             <div className="pt-2 flex gap-3">
                               <Button variant="secondary" size="sm" onClick={() => reprocessMutation.mutate(d.id)} disabled={reprocessMutation.isPending}>
                                 {reprocessMutation.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                                 Relancer l'Analyse
                               </Button>
                             </div>
                           </div>
                         )}
                         {comparison ? (
                           <div className="space-y-8">
                             <div>
                               <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                                 <ClipboardCheck className="w-4 h-4 text-emerald-500" />
                                 Synthèse de conformité
                               </h4>
                               <p className="text-sm leading-relaxed text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100 italic">
                                 "{comparison.summary}"
                               </p>
                             </div>

                             {comparison?.inconsistencies && comparison.inconsistencies.length > 0 && (
                               <div>
                                 <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                                   <AlertTriangle className="w-4 h-4 text-amber-500" />
                                   Points de non-conformité
                                 </h4>
                                 <div className="space-y-4">
                                   {comparison?.inconsistencies?.map((inc: any, i: number) => (
                                     <div key={i} className="p-4 rounded-xl border border-amber-100 bg-amber-50/50">
                                       <div className="flex justify-between items-start mb-2">
                                         <p className="font-bold text-sm text-amber-900">{inc.point}</p>
                                         <Badge className={SEVERITE_CONFIG[inc.severite]?.color}>{SEVERITE_CONFIG[inc.severite]?.label || inc.severite}</Badge>
                                       </div>
                                       <p className="text-xs text-amber-800/80 leading-relaxed">{inc.explication}</p>
                                       
                                       {/* Actionable next steps for citizens if uncertain/missing */}
                                       {inc.confidence?.review_status === 'manual_required' && (
                                          <MissingInfoAlert 
                                            type="citizen" 
                                            missingFields={inc.confidence.missing_critical_data}
                                            reason={inc.confidence.reason}
                                            className="mt-3"
                                            onAction={() => setActiveTab("info")} // Link to upload section
                                          />
                                       )}
                                       
                                       {inc.article && <p className="text-[10px] mt-2 font-mono text-amber-700/60 font-bold uppercase tracking-tighter">Réf: {inc.article}</p>}
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}

                             {comparison?.conformites && comparison.conformites.length > 0 && (
                               <div>
                                 <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                                   <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                   Points conformes
                                 </h4>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   {comparison?.conformites?.map((conf: any, i: number) => (
                                     <div key={i} className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/30">
                                       <p className="font-bold text-xs text-emerald-900 mb-1">{conf.point}</p>
                                       <p className="text-[10px] text-emerald-800/70 line-clamp-2">{conf.explication}</p>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}
                           </div>
                         ) : (
                           <div className="py-20 text-center text-muted-foreground">
                             <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                             <p>Analyse non disponible ou en cours pour ce document.</p>
                           </div>
                         )}
                       </CardContent>
                     </Card>
                   </div>
                   <div className="lg:col-span-1 hidden lg:block">
                     <ChatSection 
                        messages={messages} 
                        user={user} 
                        loading={messagesLoading} 
                        message={message} 
                        setMessage={setMessage} 
                        handleSendMessage={handleSendMessage} 
                        scrollRef={scrollRef}
                        isPending={sendMessage.isPending}
                      />
                   </div>
                 </div>
               )}
            </TabsContent>
          ))}

          <TabsContent value="messages" className="lg:hidden mt-0">
             <ChatSection 
               messages={messages} 
               user={user} 
               loading={messagesLoading} 
               message={message} 
               setMessage={setMessage} 
               handleSendMessage={handleSendMessage} 
               scrollRef={scrollRef}
               isPending={sendMessage.isPending}
             />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
