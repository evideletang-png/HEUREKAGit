import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, MessageSquare, Clock, Gavel, MapPin, Shield, Building2, Send, Zap, Landmark } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { DossierSIGMap } from "./DossierSIGMap";

interface DossierDetailViewProps {
  dossierId: string;
  userRole: string;
}

export function DossierDetailView({ dossierId, userRole }: DossierDetailViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("summary");

  const { data: detail, isLoading } = useQuery<any>({
    queryKey: ["dossier-full-detail", dossierId],
    queryFn: async () => {
      const r = await fetch(`/api/mairie/dossiers/${dossierId}`);
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: !!dossierId,
  });

  if (isLoading) return <div className="p-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  if (!detail) return <div className="p-20 text-center text-slate-500 font-bold">Dossier introuvable.</div>;

  return (
    <div className="space-y-6 pb-28 md:pb-32">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{detail.title}</h2>
            <Badge variant="outline" className="font-mono text-[10px] border-slate-200">
              {detail.dossierNumber || "SANS NUMÉRO"}
            </Badge>
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-500">
            <MapPin className="w-3.5 h-3.5" /> {detail.address}, {detail.commune}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <Badge className="h-7 px-3 text-[10px] font-black uppercase tracking-widest bg-primary shadow-sm border-none">
            {detail.status?.replace(/_/g, ' ')}
          </Badge>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
            Instruction : <span className="text-slate-900">{detail.assignedMetropoleId ? "MÉTROPOLE" : "MAIRIE"}</span>
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100/50 p-1 rounded-xl border border-slate-200/50">
          <TabsTrigger value="summary" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-bold text-xs">Synthèse</TabsTrigger>
          <TabsTrigger value="analysis" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-bold text-xs">Conformité PLU</TabsTrigger>
          <TabsTrigger value="documents" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-bold text-xs">Pièces ({detail.documents?.length})</TabsTrigger>
          <TabsTrigger value="sig" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-bold text-xs">SIG & Contraintes</TabsTrigger>
          <TabsTrigger value="finance" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-bold text-xs">Finance</TabsTrigger>
          <TabsTrigger value="messages" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-bold text-xs relative">
            Discussion
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </TabsTrigger>
          <TabsTrigger value="history" className="px-6 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary font-bold text-xs">Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="pt-4 space-y-4">
           <Card className="border-none shadow-lg shadow-slate-200/50 rounded-3xl overflow-hidden ring-1 ring-slate-100">
              <CardHeader className="border-b border-slate-50 bg-slate-50/30">
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-800">
                  <Zap className="w-4 h-4 text-primary" /> Diagnostic d'Instruction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <p className="text-sm leading-relaxed text-slate-600 italic">
                    {detail.metadata?.summary || "L'IA génère une synthèse globale de l'instruction dès la réception des pièces..."}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard label="Conformité PLU" value={detail.metadata?.pluAnalysis?.conclusion || "À ANALYSER"} color={detail.metadata?.pluAnalysis?.conclusion === 'CONFORME' ? 'text-emerald-600' : 'text-amber-600'} />
                  <StatCard label="Avis ABF" value={detail.isAbfConcerned ? "REQUIS (SPR/MH)" : "NON REQUIS"} color={detail.isAbfConcerned ? 'text-amber-700' : 'text-slate-400'} />
                  <StatCard label="Blocages" value={detail.anomalyCount || "0"} color={detail.anomalyCount > 0 ? "text-red-500" : "text-emerald-600"} />
                </div>
              </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="analysis" className="pt-4">
           <div className="grid grid-cols-1 gap-3">
             {detail.metadata?.pluAnalysis?.controles?.map((c: any, i: number) => (
                <TraceabilityPoint key={i} data={{ ...c, point: c.categorie }} />
             ))}
             {!detail.metadata?.pluAnalysis?.controles && (
               <div className="p-20 text-center bg-white border border-dashed rounded-3xl text-slate-400 font-bold">
                  Aucune analyse de conformité disponible pour le moment.
               </div>
             )}
           </div>
        </TabsContent>

        <TabsContent value="documents" className="pt-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
           <div className="divide-y divide-slate-50">
             {detail.documents?.map((doc: any) => (
               <div key={doc.id} className="p-4 flex flex-col gap-3 hover:bg-slate-50/50 transition-colors cursor-pointer group sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-primary/10 transition-colors">
                       <FileText className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 leading-none mb-1 break-words">{doc.title}</p>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest font-mono">{doc.pieceCode || "ANNEXE"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`text-[9px] font-black uppercase border-none h-5 ${doc.pieceStatus === 'valide' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {doc.pieceStatus || "À VÉRIFIER"}
                    </Badge>
                  </div>
               </div>
             ))}
           </div>
        </TabsContent>

        <TabsContent value="sig" className="pt-4">
           {detail.metadata?.geoloc?.centroid ? (
             <DossierSIGMap 
                centroid={detail.metadata.geoloc.centroid} 
                parcelShape={detail.metadata.geoloc.shape}
                isAbfConcerned={detail.isAbfConcerned}
                constraints={detail.metadata?.abfConstraints || []}
             />
           ) : (
             <div className="p-20 text-center bg-white border border-dashed rounded-3xl text-slate-400 font-bold italic">
                Données géospatiales non disponibles pour ce dossier.
             </div>
           )}
        </TabsContent>

        <TabsContent value="finance" className="pt-4">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-none shadow-sm bg-indigo-50/40 rounded-3xl">
                <CardHeader><CardTitle className="text-[10px] font-black uppercase tracking-widest text-indigo-950/60">Référence Marché (DVF)</CardTitle></CardHeader>
                <CardContent>
                   <p className="text-3xl font-black text-indigo-700">
                     {detail.metadata?.financialAnalysis?.prix_m2_moyen ? `${Math.round(detail.metadata.financialAnalysis.prix_m2_moyen).toLocaleString()} €/m²` : "N/A"}
                   </p>
                   <p className="text-[9px] text-indigo-950/40 font-bold mt-1 uppercase tracking-tight">Analyse temps réel des 5 dernières mutations</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-emerald-50/40 rounded-3xl">
                <CardHeader><CardTitle className="text-[10px] font-black uppercase tracking-widest text-emerald-950/60">Valeur attendue du Projet</CardTitle></CardHeader>
                <CardContent>
                   <p className="text-3xl font-black text-emerald-700">
                     {detail.metadata?.financialAnalysis?.valeur_projet ? `${detail.metadata.financialAnalysis.valeur_projet.toLocaleString()} €` : "NON DÉFINIE"}
                   </p>
                   <p className="text-[9px] text-emerald-950/40 font-bold mt-1 uppercase tracking-tight">Valeur déclarée par le pétitionnaire</p>
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="messages" className="pt-4">
           <MessagerieSection dossierId={dossierId} currentRole={userRole} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
           <Card className="border-none shadow-lg shadow-slate-200/50 rounded-3xl overflow-hidden ring-1 ring-slate-100">
             <CardHeader className="bg-slate-50/50 border-b border-slate-100">
               <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-800">Historique des actions d'instruction</CardTitle>
             </CardHeader>
             <CardContent className="pt-6">
               <TimelineView dossierId={dossierId} />
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>

      {/* Action Bar for Instructors & Admin */}
      {(userRole !== "citoyen") && (
        <div className="fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100vh-1.5rem)] flex-wrap items-stretch justify-center gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl ring-4 ring-slate-900/5 backdrop-blur-xl animate-in slide-in-from-bottom-8 duration-1000 md:bottom-6 md:left-1/2 md:right-auto md:w-[min(92vw,980px)] md:-translate-x-1/2">
           {(userRole === "mairie" || userRole === "admin") && (
             <>
               <Button className="min-h-12 flex-1 rounded-xl px-4 text-sm font-bold shadow-lg shadow-indigo-200 sm:flex-none sm:px-6 bg-indigo-600 hover:bg-indigo-700" onClick={() => handleTransmit(dossierId)}>
                 <Building2 className="w-4 h-4" /> Transmettre à la Métropole
               </Button>
               {!detail.isAbfConcerned && (
                 <Button variant="outline" className="min-h-12 flex-1 rounded-xl px-4 text-sm font-bold border-amber-200 text-amber-700 hover:bg-amber-50 sm:flex-none sm:px-6" onClick={() => handleRequestABF(dossierId)}>
                   <Landmark className="w-4 h-4" /> Saisir l'ABF
                 </Button>
               )}
             </>
           )}
           {(userRole === "abf" || userRole === "admin") && detail.isAbfConcerned && (
             <Button className="min-h-12 flex-1 rounded-xl px-4 text-sm font-bold shadow-lg shadow-amber-200 sm:flex-none sm:px-6 bg-amber-700 hover:bg-amber-800">
               <Shield className="w-4 h-4" /> Rendre un avis conforme
             </Button>
           )}
           {(userRole === "metropole" || userRole === "admin") && (
             <Button className="min-h-12 flex-1 rounded-xl px-4 text-sm font-bold shadow-lg shadow-slate-200 sm:flex-none sm:px-6 bg-slate-900 hover:bg-black" onClick={() => handleGenerateDecision(dossierId)}>
               <Gavel className="w-4 h-4" /> Gérer la décision
             </Button>
           )}
           <div className="hidden h-8 w-[1px] bg-slate-200 mx-1 md:block" />
           <Button variant="ghost" className="min-h-12 w-full rounded-xl px-4 text-xs font-bold text-slate-500 hover:text-slate-900 sm:w-auto" onClick={() => window.print()}>
             Exporter PDF
           </Button>
        </div>
      )}
    </div>
  );

  async function handleGenerateDecision(id: string) {
    const r = await fetch(`/api/mairie/dossiers/${id}/generate-decision`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (r.ok) {
      const { draft } = await r.json();
      console.log("Decision Draft:", draft);
      alert(`BROUILLON D'ARRÊTÉ GÉNÉRÉ :\n\n${draft.content.substring(0, 500)}...\n\n(Consultez la console pour le texte complet)`);
      toast({ title: "Décision générée", description: "Le brouillon d'arrêté est prêt pour révision." });
    }
  }

  async function handleTransmit(id: string) {
    if(confirm("Confirmer la transmission au service instructeur de la Métropole ?")) {
       const r = await fetch(`/api/mairie/dossiers/${id}/transmit`, { 
         method: 'POST', 
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ metropoleId: 'METROPOLE_DEFAULT' }) 
       });
       if(r.ok) {
         toast({ title: "Dossier transmis", description: "L'instruction est désormais à la charge de la Métropole." });
         queryClient.invalidateQueries({ queryKey: ["dossier-full-detail", id] });
       }
    }
  }

  async function handleRequestABF(id: string) {
    if(confirm("Solliciter l'avis de l'Architecte des Bâtiments de France pour ce dossier ?")) {
      const r = await fetch(`/api/mairie/dossiers/${id}/request-abf`, { method: "POST" });
      if (r.ok) {
        toast({ title: "Saisine ABF envoyée", description: "L'ABF a été alerté et le dossier est marqué comme prioritaire (Attente ABF)." });
        queryClient.invalidateQueries({ queryKey: ["dossier-full-detail", id] });
      }
    }
  }
}

function StatCard({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-5 bg-white border border-slate-100 rounded-3xl shadow-sm text-center flex flex-col items-center justify-center min-h-[100px]">
      <p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">{label}</p>
      <p className={`text-sm font-black uppercase tracking-tight ${color}`}>{value}</p>
    </div>
  );
}

function TraceabilityPoint({ data }: { data: any }) {
  const isOk = data.statut === 'CONFORME' || data.statut === 'OK' || !data.statut;
  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className={`px-4 py-3 flex items-center justify-between border-b ${isOk ? 'bg-emerald-50/30' : 'bg-red-50/30'}`}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[9px] font-bold text-slate-500 border-slate-200 bg-white">
            {data.article || "Art. n.c."}
          </Badge>
          <span className="text-[11px] font-black uppercase text-slate-800 tracking-tight">{data.point}</span>
        </div>
        <div className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
      </div>
      <div className="p-4">
        <p className="text-xs text-slate-600 leading-relaxed font-semibold">{data.message || data.explication}</p>
      </div>
    </div>
  );
}

function MessagerieSection({ dossierId, currentRole }: { dossierId: string; currentRole: string }) {
  const [msg, setMsg] = useState("");
  const queryClient = useQueryClient();
  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ["dossier-messages", dossierId],
    queryFn: async () => {
      const r = await fetch(`/api/mairie/dossiers/${dossierId}/messages`);
      const d = await r.json();
      return d.messages || [];
    }
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      await fetch(`/api/mairie/dossiers/${dossierId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    },
    onSuccess: () => {
      setMsg("");
      queryClient.invalidateQueries({ queryKey: ["dossier-messages", dossierId] });
    }
  });

  const renderContent = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const service = part.substring(1).toUpperCase();
        let color = "bg-primary/20 text-primary";
        if (service === "ABF") color = "bg-amber-100 text-amber-800";
        if (service === "METROPOLE" || service === "MÉTROPOLE") color = "bg-indigo-100 text-indigo-800";
        return <span key={i} className={`px-1.5 py-0.5 rounded-md font-black text-[10px] mx-0.5 ${color}`}>{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const insertMention = (mention: string) => {
    setMsg(prev => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + mention + " ");
  };

  const ROLE_COLORS: Record<string, string> = {
    "admin": "bg-slate-200 text-slate-800",
    "mairie": "bg-slate-700 text-slate-100",
    "metropole": "bg-indigo-600 text-white",
    "abf": "bg-amber-700 text-white"
  };

  return (
    <div className="flex min-h-[420px] flex-col space-y-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-xl shadow-slate-200/20 h-[min(70vh,600px)] sm:p-6">
       <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-40 grayscale">
               <MessageSquare className="w-12 h-12 mb-4" />
               <p className="text-xs font-bold uppercase tracking-widest">Commencer la discussion collaboratrice</p>
               <p className="text-[10px] font-medium mt-1">Mentionnez @ABF ou @Metropole pour les alerter.</p>
            </div>
          )}
          {messages.map((m: any) => (
            <div key={m.id} className={`flex flex-col ${m.fromRole === currentRole ? 'items-end' : 'items-start'}`}>
               <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${m.fromRole === currentRole ? 'bg-slate-900 text-white rounded-tr-none shadow-lg' : 'bg-slate-100 text-slate-800 rounded-tl-none'}`}>
                 <p className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter mb-2 border-b border-white/10 pb-1 ${ROLE_COLORS[m.fromRole] || 'bg-slate-400 text-white'}`}>{m.fromRole}</p>
                 <div className="font-medium">{renderContent(m.content)}</div>
               </div>
            </div>
          ))}
       </div>
       <div className="flex flex-wrap gap-2 pt-2">
          {["@ABF", "@Metropole", "@Mairie"].map(m => (
            <button key={m} onClick={() => insertMention(m)} className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-bold text-slate-500 hover:bg-primary/10 hover:text-primary transition-colors">
              {m}
            </button>
          ))}
       </div>
       <div className="flex flex-col gap-2 border-t border-slate-50 pt-2 sm:flex-row">
          <Input 
            value={msg} 
            onChange={(e) => setMsg(e.target.value)} 
            placeholder="Écrire à un service..." 
            className="h-14 rounded-2xl bg-slate-50 border-none focus-visible:ring-primary shadow-inner" 
            onKeyDown={(e) => e.key === 'Enter' && sendMutation.mutate(msg)}
          />
          <Button className="h-14 w-full rounded-2xl bg-primary shadow-lg shadow-indigo-200 active:scale-95 transition-transform sm:w-14" onClick={() => sendMutation.mutate(msg)}>
            <Send className="w-5 h-5" />
          </Button>
       </div>
    </div>
  );
}

function TimelineView({ dossierId }: { dossierId: string }) {
  const { data: timelineData } = useQuery<any>({
    queryKey: ["dossier-timeline", dossierId],
    queryFn: async () => {
      const r = await fetch(`/api/mairie/dossiers/${dossierId}/timeline`);
      return r.json();
    }
  });
  
  const events = timelineData?.events || [];
  if (events.length === 0) return <div className="p-20 text-center text-slate-400 font-bold italic">Aucun événement enregistré.</div>;
  
  return (
    <div className="relative pl-8 space-y-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
      {events.map((e: any, i: number) => (
        <div key={i} className="relative">
          <div className="absolute -left-[37px] top-1.5 w-6 h-6 rounded-full bg-white border-2 border-primary shadow-sm flex items-center justify-center z-10">
             {e.type === 'STATUS_CHANGE' ? <Shield className="w-3 h-3 text-primary" /> : <Clock className="w-3 h-3 text-primary" />}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
              {format(new Date(e.createdAt || new Date()), "eeee d MMMM • HH:mm", { locale: fr })}
            </p>
            <p className="text-sm font-black text-slate-900 tracking-tight leading-tight">{e.description}</p>
            <div className="flex gap-2 pt-1">
              {e.toStatus && <Badge variant="secondary" className="text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 rounded-lg">{e.toStatus}</Badge>}
              <Badge variant="outline" className="text-[8px] uppercase font-mono opacity-30 pointer-events-none">{e.type}</Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
