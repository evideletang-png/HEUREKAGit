import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, FileText, CheckCircle2, Clock, AlertCircle, 
  ArrowRight, AlertTriangle, Loader2, Check, MessageSquare, Calendar, User, Play, Building2, ShieldCheck
} from "lucide-react";
import { PROCEDURES } from "@/constants/procedures";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface PieceStatus {
  code: string;
  status: "À compléter" | "En cours" | "OK" | "Erreur";
  docs: any[];
}

export function DossierDeposit({ dossierId: initialDossierId }: { dossierId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const isMairie = user?.role === "mairie" || user?.role === "admin";
  const isCitizen = user?.role === "user";
  const [dossierId, setDossierId] = useState<string | undefined>(initialDossierId);
  const [procedureCode, setProcedureCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pieces" | "messages">("pieces");

  // Fetch dossier details if it exists
  const { data: dossierData, isLoading: loadingDossier } = useQuery({
    queryKey: ["/api/dossiers", dossierId],
    queryFn: async () => {
      const r = await fetch(`/api/dossiers/${dossierId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement dossier");
      return r.json();
    },
    enabled: !!dossierId,
    refetchInterval: (query) => {
      // Refetch if any document is still processing
      const data: any = query.state.data;
      const documents = data?.documents || [];
      const isProcessing = documents.some((d: any) => d.status === "processing" || d.status === "pending");
      return isProcessing ? 3000 : false;
    }
  });

  const dossier = dossierData?.dossier;
  const documents = dossierData?.documents || [];

  const currentProcedure = useMemo(() => {
    const code = dossier?.typeProcedure || procedureCode;
    return code ? PROCEDURES[code] : null;
  }, [dossier, procedureCode]);

  const pieceStatuses = useMemo(() => {
    if (!currentProcedure) return [];
    
    return currentProcedure.pieces.map(piece => {
      const pieceDocs = documents.filter((d: any) => d.pieceCode === piece.code);
      
      let overallStatus: PieceStatus["status"] = "À compléter";
      if (pieceDocs.length > 0) {
        const hasProcessing = pieceDocs.some((d: any) => d.status === "processing" || d.status === "pending");
        const hasFailed = pieceDocs.some((d: any) => d.status === "failed");
        const allCompleted = pieceDocs.every((d: any) => d.status === "completed");

        if (hasProcessing) overallStatus = "En cours";
        else if (allCompleted) overallStatus = "OK";
        else if (hasFailed) overallStatus = "Erreur";
        else overallStatus = "En cours";
      }

      return {
        code: piece.code,
        status: overallStatus,
        docs: pieceDocs,
      };
    });
  }, [currentProcedure, documents]);

  const stats = useMemo(() => {
    if (!currentProcedure) return { total: 0, mandatory: 0, complete: 0, rate: 0 };
    
    const mandatoryPieces = currentProcedure.pieces.filter(p => p.isMandatory);
    const completeMandatory = pieceStatuses.filter(s => {
      const p = currentProcedure.pieces.find(cp => cp.code === s.code);
      return p?.isMandatory && s.status === "OK";
    }).length;

    return {
      total: currentProcedure.pieces.length,
      mandatory: mandatoryPieces.length,
      complete: pieceStatuses.filter(s => s.status === "OK").length,
      rate: Math.round((completeMandatory / mandatoryPieces.length) * 100) || 0,
    };
  }, [currentProcedure, pieceStatuses]);

  const createDossier = useMutation({
    mutationFn: async (type: string) => {
      const r = await fetch("/api/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          typeProcedure: type,
          title: `Nouveau dossier ${type} - ${new Date().toLocaleDateString()}`,
        }),
      });
      if (!r.ok) throw new Error("Erreur création dossier");
      return r.json();
    },
    onSuccess: (data) => {
      setDossierId(data.dossier.id);
      toast({ title: "Dossier initialisé", description: "Veuillez maintenant déposer les pièces requises." });
    },
  });

  const uploadPiece = useMutation({
    mutationFn: async ({ pieceCode, file }: { pieceCode: string; file: File }) => {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("pieceCode", pieceCode);
      formData.append("dossierId", dossierId!);
      
      let docType = "autre";
      if (pieceCode.startsWith("PCMI") || pieceCode.startsWith("DP") || pieceCode.startsWith("PA")) {
        docType = "permis_de_construire";
      }
      formData.append("documentType", docType);

      const r = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!r.ok) throw new Error("Erreur upload");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dossiers", dossierId] });
      toast({ title: "Document reçu", description: "Analyse en cours..." });
    },
  });

  const submitDossier = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/dossiers/${dossierId}/submit`, { 
        method: "PATCH",
        credentials: "include" 
      });
      if (!r.ok) throw new Error("Erreur soumission");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dossiers", dossierId] });
      toast({ title: "Dossier transmis", description: "Votre dossier est maintenant en attente d'instruction par la mairie." });
    }
  });

  const startInstruction = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/dossiers/${dossierId}/start-instruction`, { 
        method: "PATCH",
        credentials: "include"
      });
      if (!r.ok) throw new Error("Erreur lancement instruction");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dossiers", dossierId] });
      toast({ title: "Instruction lancée", description: "Le dossier est maintenant en cours d'examen." });
      setActiveTab("messages");
    }
  });

  const isLocked = dossier?.status !== "DRAFT" && !isMairie;

  if (!dossierId) {
    return (
      <Card className="border-2 border-dashed border-primary/20 bg-primary/5">
        <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Commencer un nouveau dossier</h2>
          <p className="text-muted-foreground max-w-md mb-8">
            Sélectionnez le type de procédure pour générer automatiquement la liste des pièces Cerfa obligatoires.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            {Object.entries(PROCEDURES).map(([code, proc]) => (
              <Button key={code} variant="outline" className="h-auto py-3 px-6 flex flex-col items-start gap-1 text-left" onClick={() => createDossier.mutate(code)}>
                <span className="font-bold text-primary">{code}</span>
                <span className="text-[10px] opacity-70 whitespace-nowrap">{proc.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadingDossier) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium animate-pulse">Chargement de la structure du dossier...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none shadow-lg ring-1 ring-border/50">
        <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black font-mono bg-muted px-1.5 py-0.5 rounded border">{dossier?.dossierNumber || "SANS NUMÉRO"}</span>
                <Badge className="bg-primary/10 text-primary border-none px-2 py-0.5">{dossier?.typeProcedure}</Badge>
                <span className="text-xs text-muted-foreground">Déposé le {new Date(dossier?.createdAt).toLocaleDateString()}</span>
              </div>
              <CardTitle className="text-2xl font-black tracking-tight">{dossier?.title}</CardTitle>
              {isMairie && (dossier as any)?.userName && (
                <div className="flex items-center gap-2 text-xs text-primary font-bold mt-1">
                  <User className="w-3.5 h-3.5" />
                  <span>Déposant : {(dossier as any).userName} ({(dossier as any).userEmail})</span>
                </div>
              )}
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Complétude</p>
                <p className="text-3xl font-black text-primary">{stats.rate}%</p>
              </div>
              {isMairie && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 text-[10px] font-black uppercase tracking-widest gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                  onClick={() => window.location.href = `/portail-mairie/${dossierId}`}
                >
                  <ShieldCheck className="w-3 h-3" /> Expertise Fin. & PLU
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>Pièces obligatoires ({stats.complete}/{stats.mandatory})</span>
                <span>{stats.rate}%</span>
              </div>
              <Progress value={stats.rate} className="h-2 bg-muted rounded-full" />
            </div>
            <div className="shrink-0 flex items-center gap-3">
              <Badge 
                className={`h-9 px-4 font-black text-xs tracking-widest uppercase border-none
                  ${dossier?.status === "DRAFT" ? "bg-gray-100 text-gray-600" :
                    dossier?.status === "SUBMITTED" ? "bg-blue-500 text-white" :
                    dossier?.status === "UNDER_REVIEW" ? "bg-amber-500 text-white" :
                    dossier?.status === "APPROVED" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}
              >
                Statut : {dossier?.status}
              </Badge>
              {dossier?.status === "UNDER_REVIEW" && (
                <div className="flex gap-1">
                   <Button variant={activeTab === "pieces" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("pieces")} className="h-9 px-4 gap-2">
                     <FileText className="w-4 h-4" /> Pièces
                   </Button>
                   <Button variant={activeTab === "messages" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("messages")} className="h-9 px-4 gap-2">
                     <MessageSquare className="w-4 h-4" /> Messages
                   </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {activeTab === "pieces" ? (
        <div className="grid grid-cols-1 gap-6">
          {/* HERO SECTION: CERFA FORM */}
          {pieceStatuses.find(p => p.code === "CERFA") && (() => {
            const piece = currentProcedure?.pieces.find(p => p.code === "CERFA")!;
            const status = pieceStatuses.find(s => s.code === "CERFA")!;
            const isOK = status.status === "OK";
            const isPending = status.status === "En cours";
            const isError = status.status === "Erreur";
            const pieceDocs = status.docs || [];

            return (
              <Card className={`overflow-hidden border-2 transition-all duration-300 ${isOK ? "border-emerald-500/50 bg-emerald-50/20" : "border-primary/20 bg-primary/5 shadow-md"}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isOK ? "bg-emerald-100 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-black">{piece.name}</CardTitle>
                        <p className="text-xs text-muted-foreground italic">{piece.description}</p>
                      </div>
                    </div>
                    <Badge 
                      className={`px-3 py-1 font-black uppercase text-[10px] tracking-widest border-none
                        ${isOK ? "bg-emerald-500 text-white" : 
                          isPending ? "bg-blue-500 text-white animate-pulse" : 
                          isError ? "bg-red-500 text-white" : "bg-primary text-white"}`}
                    >
                      {status.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-1 w-full">
                      {pieceDocs.length > 0 ? (
                        <div className="space-y-2">
                          {pieceDocs.map((doc: any) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-border shadow-sm">
                              <div className="flex items-center gap-3 truncate">
                                <CheckCircle2 className={`w-4 h-4 ${isOK ? "text-emerald-500" : "text-primary/40"}`} />
                                <span className="font-bold text-sm truncate">{doc.title || "Formulaire Cerfa"}</span>
                              </div>
                              <Badge variant="outline" className="text-[10px] font-bold uppercase">{doc.status}</Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-20 flex items-center justify-center border-2 border-dashed border-primary/20 rounded-xl bg-white/50">
                          <p className="text-xs text-muted-foreground font-medium">Aucun formulaire déposé</p>
                        </div>
                      )}
                    </div>
                    {!isLocked && (
                      <div className="relative shrink-0 w-full md:w-auto">
                        <input 
                          type="file" 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadPiece.mutate({ pieceCode: "CERFA", file });
                          }}
                        />
                        <Button size="lg" className="w-full md:w-auto font-black uppercase tracking-tighter gap-2 shadow-lg shadow-primary/20">
                          <Upload className="w-4 h-4" /> {pieceDocs.length > 0 ? "Modifier le CERFA" : "Déposer le formulaire officiel"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* SUPPORTING DOCUMENTS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentProcedure?.pieces.filter(p => p.code !== "CERFA").map((piece) => {
              const status = pieceStatuses.find(s => s.code === piece.code);
              const isOK = status?.status === "OK";
              const isPending = status?.status === "En cours";
              const isError = status?.status === "Erreur";
              const pieceDocs = status?.docs || [];

              return (
                <Card key={piece.code} className={`relative transition-all duration-200 ${isOK ? "bg-emerald-50/30 border-emerald-100" : "hover:border-primary/30"}`}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${piece.isMandatory ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                            {piece.code}
                          </span>
                          {piece.isMandatory && <span className="text-[9px] uppercase font-bold text-red-500/70 tracking-tighter">Obligatoire</span>}
                        </div>
                        <CardTitle className="text-sm font-bold truncate leading-tight">{piece.name}</CardTitle>
                      </div>
                      
                      <Badge 
                        variant="outline" 
                        className={`shrink-0 text-[10px] h-5 gap-1 border-none font-bold uppercase tracking-tight
                          ${isOK ? "bg-emerald-100 text-emerald-700" : 
                            isPending ? "bg-blue-100 text-blue-700" : 
                            isError ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {isOK ? <Check className="w-2.5 h-2.5" /> : 
                         isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 
                         isError ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                        {status?.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-[11px] text-muted-foreground mb-4 line-clamp-2 min-h-[32px] italic">
                      {piece.description}
                    </p>

                    {pieceDocs.length > 0 && (
                      <div className="space-y-2 mb-4 max-h-32 overflow-y-auto pr-1">
                        {pieceDocs.map((doc: any) => (
                          <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-white border border-border/50 text-[10px]">
                            <div className="flex items-center gap-2 truncate flex-1 mr-2">
                              <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="truncate font-medium">{doc.title || doc.id.slice(0, 8)}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {doc.status === "completed" ? (
                                <Badge className="h-4 text-[8px] bg-emerald-100 text-emerald-700 border-none px-1.5 font-bold">VALIDE</Badge>
                              ) : doc.status === "failed" ? (
                                <Badge className="h-4 text-[8px] bg-red-100 text-red-700 border-none px-1.5 font-bold">DÉFAUT</Badge>
                              ) : (
                                <Badge className="h-4 text-[8px] bg-blue-100 text-blue-700 border-none px-1.5 animate-pulse font-bold">ANALYSE</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!isLocked && (
                      <div className="relative w-full">
                        <input 
                          type="file" 
                          multiple
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            files.forEach(file => uploadPiece.mutate({ pieceCode: piece.code, file }));
                          }}
                          disabled={uploadPiece.isPending}
                        />
                        <Button variant="outline" size="sm" className="w-full h-8 text-xs border-dashed border-2 gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all">
                          <Upload className="w-3 h-3" /> {pieceDocs.length > 0 ? "Ajouter un autre fichier" : "Déposer le(s) fichier(s)"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-lg">Messagerie administrative</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border-2 border-dashed border-border">
                <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium">Ouvrez une discussion avec l'instructeur</p>
                <p className="text-xs">Les échanges techniques sont archivés dans le dossier.</p>
                <Button className="mt-4" variant="outline" disabled>Bientôt disponible</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Timeline du projet</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {(dossier?.timeline || []).map((ev: any, i: number) => (
                <div key={i} className="relative pl-6 border-l-2 border-primary/20 last:border-l-0 pb-1">
                  <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-white" />
                  <p className="text-xs font-black uppercase text-primary">{ev.event}</p>
                  <p className="text-xs text-muted-foreground mb-1">{new Date(ev.date).toLocaleString()}</p>
                  <p className="text-[10px] italic font-medium">Par : {ev.author}</p>
                </div>
              ))}
              {(!dossier?.timeline || dossier.timeline.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun événement enregistré.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-between p-6 bg-white rounded-2xl shadow-xl border border-border/50 sticky bottom-6 z-10 backdrop-blur-sm bg-white/90">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Statut de soumission</p>
          <div className="flex items-center gap-2">
            {dossier?.status === "DRAFT" ? (
              stats.rate === 100 ? (
                <Badge className="bg-emerald-500 text-white border-none gap-1.5 px-3 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Prêt pour soumission
                </Badge>
              ) : (
                <Badge variant="outline" className="text-red-500 border-red-200 bg-red-50 gap-1.5 px-3 py-1 font-bold">
                  <AlertCircle className="w-3.5 h-3.5" /> Dossier incomplet ({stats.mandatory - stats.complete} manquants)
                </Badge>
              )
            ) : (
                <Badge className="bg-primary text-white border-none gap-1.5 px-3 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Dossier {dossier?.status}
                </Badge>
            )}
          </div>
        </div>
        
        <div className="flex gap-4">
          {isMairie && dossier?.status === "SUBMITTED" && (
            <Button 
              size="lg" 
              onClick={() => startInstruction.mutate()}
              disabled={startInstruction.isPending}
              className="h-12 px-10 font-black text-sm uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-200 transition-all hover:scale-105"
            >
              {startInstruction.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Lancer l'instruction"} <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          )}

          {isCitizen && dossier?.status === "DRAFT" && (
            <Button 
              size="lg" 
              onClick={() => submitDossier.mutate()}
              disabled={stats.rate < 100 || submitDossier.isPending}
              className={`h-12 px-10 font-black text-sm uppercase tracking-widest shadow-lg transition-all
                ${stats.rate === 100 ? "bg-primary hover:scale-105 shadow-primary/20" : "bg-muted grayscale opacity-50"}`}
            >
              {submitDossier.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Transmettre en Mairie"} <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          )}

          {dossier?.status !== "DRAFT" && dossier?.status !== "SUBMITTED" && isCitizen && (
            <div className="flex items-center gap-2 text-primary font-black uppercase text-xs tracking-tighter bg-primary/5 px-4 py-2 rounded-xl border border-primary/20">
              <Clock className="w-4 h-4" /> En cours d'instruction
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
