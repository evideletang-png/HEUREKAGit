import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileText, CheckCircle2, XCircle, AlertTriangle, Building2, Trash2, Link2, RefreshCw, Info, Clock, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminListAnalyses } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DossierDeposit } from "@/components/dossier/DossierDeposit";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...opts });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Erreur serveur");
  }
  return r.json();
}

const DOC_TYPE_LABELS: Record<string, string> = {
  permis_de_construire: "Permis de construire",
  declaration_prealable: "Déclaration préalable",
  permis_amenager: "Permis d'aménager",
  certificat_urbanisme: "Certificat d'urbanisme",
  plu_reference: "PLU (Référence)",
  autre: "Autre document",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline"; class: string }> = {
  pending: { label: "En attente", icon: <Loader2 className="w-3 h-3" />, variant: "outline", class: "bg-gray-100 text-gray-600" },
  processing: { label: "Analyse en cours...", icon: <Loader2 className="w-3 h-3 animate-spin" />, variant: "secondary", class: "bg-blue-100 text-blue-700" },
  completed: { label: "Analysé", icon: <CheckCircle2 className="w-3 h-3" />, variant: "default", class: "bg-green-100 text-green-700" },
  failed: { label: "Échec", icon: <XCircle className="w-3 h-3" />, variant: "destructive", class: "bg-red-100 text-red-700" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    ok: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  };
  const icons: Record<string, React.ReactNode> = {
    ok: <CheckCircle2 className="w-3 h-3" />,
    warning: <AlertTriangle className="w-3 h-3" />,
    critical: <XCircle className="w-3 h-3" />,
    info: <Info className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[severity] ?? styles.info}`}>
      {icons[severity]} {severity === "ok" ? "Conforme" : severity === "critical" ? "Non conforme" : severity === "warning" ? "Vigilance" : "Information"}
    </span>
  );
}

function MairieDossierList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/mairie/dossiers"],
    queryFn: () => apiFetch("/api/mairie/dossiers"),
  });

  const dossiers = data?.dossiers ?? [];

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {dossiers.map((d: any) => (
        <Card key={d.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelect(d.id)}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black font-mono bg-muted px-1.5 py-0.5 rounded border">{d.dossierNumber || "SANS NUMÉRO"}</span>
              <Badge 
                className={`text-[9px] font-black uppercase tracking-widest border-none
                  ${d.status === "SUBMITTED" ? "bg-blue-500 text-white" :
                    d.status === "UNDER_REVIEW" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"}`}
              >
                {d.status}
              </Badge>
            </div>
            <CardTitle className="text-base font-bold mt-2 truncate">{d.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <Building2 className="w-3 h-3" />
                <span className="truncate">{d.userName} ({d.userEmail})</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[9px] font-bold uppercase py-0 px-1">{d.typeProcedure}</Badge>
                <span className="truncate">{d.address || d.commune}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Déposé le {new Date(d.createdAt).toLocaleDateString()}</span>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 text-xs font-bold gap-2 text-primary hover:text-primary hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(d.id);
                }}
              >
                Instruire <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {dossiers.length === 0 && (
        <div className="col-span-full py-12 text-center bg-muted/20 rounded-2xl border-2 border-dashed border-border">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground font-medium">Aucun dossier à instruire pour le moment.</p>
        </div>
      )}
    </div>
  );
}

export default function MairiePage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("permis_de_construire");
  const [uploading, setUploading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>("none");
  const [selectedReferenceDocId, setSelectedReferenceDocId] = useState<string>("none");
  const [commune, setCommune] = useState("");
  const [adresse, setAdresse] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleSelectDossier = (id: string) => {
    setLocation(`/portail-mairie/${id}`);
  };

  const assignedCommunes = useMemo(() => {
    const raw = (user as any)?.communes;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      if (raw.startsWith("[")) {
        try { return JSON.parse(raw); } catch { return []; }
      }
      return raw.split(",").map((c: string) => c.trim()).filter(Boolean);
    }
    return [];
  }, [user]);

  useEffect(() => {
    if (!commune && assignedCommunes.length > 0) {
      setCommune(assignedCommunes[0]);
    }
  }, [assignedCommunes, commune]);

  const { data: analysesData } = useAdminListAnalyses({ status: "completed" });
  const analyses = analysesData?.analyses ?? [];

  const { data: documentsData, isLoading } = useQuery({
    queryKey: ["/api/documents"],
    queryFn: () => apiFetch("/api/documents"),
    refetchInterval: 4000,
  });
  const documents = documentsData?.documents ?? [];

  const { data: selectedData, isLoading: loadingDetail } = useQuery({
    queryKey: ["/api/documents", selectedDocId],
    queryFn: () => apiFetch(`/api/documents/${selectedDocId}`),
    enabled: !!selectedDocId,
    refetchInterval: selectedDocId ? 3000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSelectedDocId(null);
      toast({ title: "Document supprimé." });
    },
  });

  const compareMutation = useMutation({
    mutationFn: ({ id, analysisId, referenceDocumentId, commune }: { id: string; analysisId?: string; referenceDocumentId?: string; commune?: string }) =>
      apiFetch(`/api/documents/${id}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          analysisId: analysisId === "none" ? undefined : analysisId, 
          referenceDocumentId: referenceDocumentId === "none" ? undefined : referenceDocumentId,
          commune
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", selectedDocId] });
      toast({ title: "Comparaison PLU lancée !", description: "Les résultats arriveront dans quelques instants." });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/documents/${id}/reprocess`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", selectedDocId] });
      toast({ title: "Analyse relancée !", description: "L'IA re-traite le document..." });
    },
  });

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      formData.append("title", title || (files.length > 1 ? `Dossier (${files.length} fichiers)` : files[0].name));
      formData.append("documentType", docType);

      if (selectedAnalysisId && selectedAnalysisId !== "none") formData.append("analysisId", selectedAnalysisId);
      if (selectedReferenceDocId && selectedReferenceDocId !== "none") formData.append("referenceDocumentId", selectedReferenceDocId);
      if (commune) formData.append("commune", commune);
      if (adresse) formData.append("adresse", adresse);

      const r = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!r.ok) throw new Error("Erreur upload");
      const data = await r.json();
      toast({ title: "Document envoyé !", description: "L'analyse IA est en cours..." });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSelectedDocId(data.id);
      setFiles([]);
      setTitle("");
      setAdresse("");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      toast({ title: "Erreur", description: "Impossible d'envoyer le document.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const selectedDoc = selectedData?.document;
  const extractedResult = selectedDoc?.extractedDataJson
    ? (() => { try { return JSON.parse(selectedDoc.extractedDataJson); } catch { return null; } })()
    : null;
  const extractedData = extractedResult?.data ?? extractedResult;

  const comparisonResultRaw = selectedDoc?.comparisonResultJson
    ? (() => { try { return JSON.parse(selectedDoc.comparisonResultJson); } catch { return null; } })()
    : null;
  const comparisonResult = comparisonResultRaw?.data ?? comparisonResultRaw;

  const globalStatusConfig: Record<string, { label: string; class: string }> = {
    conforme: { label: "Conforme au PLU", class: "bg-green-100 text-green-800 border-green-200" },
    non_conforme: { label: "Non conforme au PLU", class: "bg-red-100 text-red-800 border-red-200" },
    partiellement_conforme: { label: "Partiellement conforme", class: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    indéterminé: { label: "Indéterminé", class: "bg-gray-100 text-gray-800 border-gray-200" },
  };

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary">Conformité Urbanisme</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium italic">
              Module de dépôt dynamique et analyse IA des dossiers (PC, DP, CU).
            </p>
          </div>
        </div>

        <Tabs defaultValue="mairie-dossiers" className="w-full">
          <TabsList className="bg-muted/50 p-1 mb-8">
            <TabsTrigger value="mairie-dossiers" className="gap-2 font-bold px-6">
              <Building2 className="w-4 h-4" /> Dossiers en cours
            </TabsTrigger>
            <TabsTrigger value="dossier" className="gap-2 font-bold px-6">
              <Upload className="w-4 h-4" /> Nouveau (Test)
            </TabsTrigger>
            <TabsTrigger value="archives" className="gap-2 font-bold px-6">
              <Clock className="w-4 h-4" /> Archives & Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mairie-dossiers">
            {selectedDossierId ? (
              <div className="space-y-4">
                <Button variant="outline" onClick={() => setSelectedDossierId(null)} className="mb-2 gap-2 font-bold h-9">
                  <ArrowRight className="w-4 h-4 rotate-180" /> Retour à la liste
                </Button>
                <DossierDeposit dossierId={selectedDossierId} />
              </div>
            ) : (
              <MairieDossierList onSelect={handleSelectDossier} />
            )}
          </TabsContent>

          <TabsContent value="dossier">
            <DossierDeposit />
          </TabsContent>

          <TabsContent value="archives">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Existing Archives Content ... */}
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Déposer un document</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div
                      className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => fileRef.current?.click()}
                      onDrop={e => { e.preventDefault(); const dropped = Array.from(e.dataTransfer.files); if (dropped.length) setFiles([...files, ...dropped]); }}
                      onDragOver={e => e.preventDefault()}
                    >
                      <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium">{files.length > 0 ? `${files.length} fichier(s) sélectionné(s)` : "PDF, image, ou texte (Multiples autorisés)"}</p>
                      {files.length > 0 && <p className="text-xs text-primary mt-1 line-clamp-2">{files.map(f => f.name).join(", ")}</p>}
                      <p className="text-xs text-muted-foreground mt-2">Glisser-déposer ou cliquer pour ajouter des documents</p>
                    </div>
                    <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                      onChange={e => { if (e.target.files?.length) setFiles([...files, ...Array.from(e.target.files)]); }} />

                    <Input placeholder="Titre du document" value={title} onChange={e => setTitle(e.target.value)} />

                    <div className="space-y-1.5">
                      <Label className="text-xs">Type de document</Label>
                      <Select value={docType} onValueChange={setDocType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-xs">Commune du projet</Label>
                      {assignedCommunes.length > 0 ? (
                        <Select value={commune || "none"} onValueChange={setCommune}>
                          <SelectTrigger><SelectValue placeholder="Choisir une commune..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>Choisir une commune...</SelectItem>
                            {assignedCommunes.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input placeholder="ex: Etretat" value={commune} onChange={e => setCommune(e.target.value)} />
                      )}
                    </div>

                    <Button className="w-full" onClick={handleUpload} disabled={files.length === 0 || uploading}>
                      {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi...</> : <><Upload className="w-4 h-4 mr-2" />Analyser</>}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Mes documents ({documents.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {isLoading && <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
                    {!isLoading && documents.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun document.</p>}
                    {documents.map((doc: any) => {
                      const sc = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.pending;
                      return (
                        <div
                          key={doc.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedDocId === doc.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/50"}`}
                          onClick={() => setSelectedDocId(doc.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{doc.title}</p>
                              <p className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</p>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.class}`}>
                              {sc.icon}{sc.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2">
                {!selectedDoc && (
                  <div className="flex flex-col items-center justify-center h-96 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                    <FileText className="w-12 h-12 mb-4 opacity-30" />
                    <p className="font-medium">Sélectionnez un document</p>
                  </div>
                )}

                {selectedDoc && (
                  <div className="space-y-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h2 className="text-xl font-bold text-primary mb-1">{selectedDoc.title}</h2>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{DOC_TYPE_LABELS[selectedDoc.documentType] ?? selectedDoc.documentType}</Badge>
                              {selectedDoc.commune && <Badge variant="secondary" className="gap-1"><Building2 className="w-3 h-3" />{selectedDoc.commune}</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => reprocessMutation.mutate(selectedDoc.id)} disabled={reprocessMutation.isPending || selectedDoc.status === "processing"}>
                              {reprocessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => deleteMutation.mutate(selectedDoc.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {selectedDoc.status === "failed" && (
                          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                            <p className="font-bold">Échec de l'analyse</p>
                            <p className="opacity-90">{selectedDoc.failureReason || "Erreur inconnue"}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {extractedData && (
                      <Card>
                        <CardHeader className="pb-3"><CardTitle className="text-base">Données extraites</CardTitle></CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {extractedData.project_address && <div><Label className="text-[10px] uppercase">Adresse</Label><p className="text-sm font-medium">{extractedData.project_address}</p></div>}
                            {extractedData.requested_surface_m2 != null && <div><Label className="text-[10px] uppercase">Surface</Label><p className="text-sm font-medium">{extractedData.requested_surface_m2} m²</p></div>}
                            {extractedData.requested_emprise_m2 != null && <div><Label className="text-[10px] uppercase">Emprise</Label><p className="text-sm font-medium">{extractedData.requested_emprise_m2} m²</p></div>}
                            {extractedData.requested_height_m != null && <div><Label className="text-[10px] uppercase">Hauteur</Label><p className="text-sm font-medium">{extractedData.requested_height_m} m</p></div>}
                          </div>
                          {extractedData.project_description && (
                            <div className="mt-4 bg-muted/30 p-3 rounded-lg">
                              <p className="text-[10px] uppercase text-muted-foreground mb-1">Description</p>
                              <p className="text-sm">{extractedData.project_description}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {comparisonResult && (
                      <div className="space-y-4">
                        <div className={`border rounded-xl p-4 ${globalStatusConfig[comparisonResult.global_status]?.class ?? globalStatusConfig.indéterminé.class}`}>
                          <p className="text-xs font-medium uppercase opacity-70 mb-1">Conformité PLU</p>
                          <p className="text-lg font-bold">{globalStatusConfig[comparisonResult.global_status]?.label ?? "Indéterminé"}</p>
                          {comparisonResult.summary && <p className="mt-2 text-sm opacity-90">{comparisonResult.summary}</p>}
                        </div>

                        {comparisonResult.inconsistencies?.length > 0 && (
                          <Card className="border-red-200">
                            <CardHeader className="pb-3"><CardTitle className="text-sm text-red-700 flex items-center gap-2"><XCircle className="w-4 h-4" /> Incohérences ({comparisonResult.inconsistencies.length})</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                              {comparisonResult.inconsistencies.map((item: any, i: number) => (
                                <div key={i} className="bg-red-50 p-3 rounded-lg border border-red-100 text-sm">
                                  <p className="font-bold text-red-900">{item.category}</p>
                                  <p className="text-xs text-red-700 mb-1">{item.article}</p>
                                  <p className="text-red-800">{item.analysis}</p>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}

                        {comparisonResult.conformities?.length > 0 && (
                          <Card className="border-green-200">
                            <CardHeader className="pb-3"><CardTitle className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Points conformes ({comparisonResult.conformities.length})</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                              {comparisonResult.conformities.map((item: any, i: number) => (
                                <div key={i} className="text-sm flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> <span className="text-green-900">{item.category} : {item.analysis}</span></div>
                              ))}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedLayout>
  );
}
