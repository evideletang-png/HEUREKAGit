import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, FilePlus2, History, Link2, Loader2, PencilLine, Plus, Save, Trash2, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const ARTICLES = [
  [1, "Occupations interdites"],
  [2, "Occupations soumises à conditions"],
  [3, "Accès / voirie"],
  [4, "Réseaux"],
  [5, "Sans objet"],
  [6, "Implantation voies"],
  [7, "Limites séparatives"],
  [8, "Constructions sur même propriété"],
  [9, "Emprise au sol"],
  [10, "Hauteur"],
  [11, "Aspect extérieur"],
  [12, "Stationnement"],
  [13, "Espaces libres / plantations"],
  [14, "Sans objet"],
] as const;

async function apiFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "Chargement impossible");
  return payload;
}

function toText(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

function buildRuleDraft(rule?: any, articleNumber?: number, articleTitle?: string) {
  return {
    id: rule?.id || "",
    articleNumber: String(rule?.articleNumber ?? articleNumber ?? ""),
    articleTitle: rule?.articleTitle || articleTitle || "",
    topic: rule?.topic || "",
    rawContent: rule?.rawContent || "",
    summary: rule?.summary || "",
    ruleText: rule?.ruleText || "",
    conditions: rule?.conditions || "",
    exceptions: rule?.exceptions || "",
    valueMin: rule?.valueMin ?? "",
    valueMax: rule?.valueMax ?? "",
    valueExact: rule?.valueExact ?? "",
    unit: rule?.unit || "",
    destination: rule?.destination || "",
    projectType: rule?.projectType || "",
    confidenceScore: rule?.confidenceScore ?? 0.5,
    validationStatus: rule?.validationStatus || "draft",
    sourceDocumentId: rule?.sourceDocumentId || "__none__",
    sourcePage: rule?.sourcePage ?? "",
    sourceExcerpt: rule?.sourceExcerpt || "",
    instructorNote: rule?.instructorNote || "",
  };
}

export function ZoneDetail({ zoneId }: { zoneId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingZone, setEditingZone] = useState(false);
  const [zoneDraft, setZoneDraft] = useState<any>({});
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<ReturnType<typeof buildRuleDraft>>(buildRuleDraft());
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [documentDraft, setDocumentDraft] = useState<any>({});

  const { data, isLoading } = useQuery<any>({
    queryKey: ["reglement-zone-detail", zoneId],
    queryFn: () => apiFetch(`/api/reglement/zones/${zoneId}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["reglement-zone-detail", zoneId] });

  const updateZoneMutation = useMutation({
    mutationFn: () => apiFetch(`/api/reglement/zones/${zoneId}`, { method: "PATCH", body: JSON.stringify(zoneDraft) }),
    onSuccess: () => { setEditingZone(false); invalidate(); toast({ title: "Zone enregistrée" }); },
    onError: (err: any) => toast({ title: "Enregistrement impossible", description: err.message, variant: "destructive" }),
  });

  const validateMutation = useMutation({
    mutationFn: () => apiFetch(`/api/reglement/zones/${zoneId}/validate`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast({ title: "Zone validée humainement" }); },
    onError: (err: any) => toast({ title: "Validation impossible", description: err.message, variant: "destructive" }),
  });

  const saveRuleMutation = useMutation({
    mutationFn: () => {
      const body = { ...ruleDraft, sourceDocumentId: ruleDraft.sourceDocumentId === "__none__" ? null : ruleDraft.sourceDocumentId };
      return editingRuleId && editingRuleId !== "__new__"
        ? apiFetch(`/api/reglement/rules/${editingRuleId}`, { method: "PATCH", body: JSON.stringify(body) })
        : apiFetch(`/api/reglement/zones/${zoneId}/rules`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { setEditingRuleId(null); setRuleDraft(buildRuleDraft()); invalidate(); toast({ title: "Règle enregistrée" }); },
    onError: (err: any) => toast({ title: "Règle non enregistrée", description: err.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => apiFetch(`/api/reglement/rules/${ruleId}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Règle supprimée" }); },
    onError: (err: any) => toast({ title: "Suppression impossible", description: err.message, variant: "destructive" }),
  });

  const convertRuleMutation = useMutation({
    mutationFn: (ruleId: string) => apiFetch(`/api/reglement/rules/${ruleId}/convert-control`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { invalidate(); toast({ title: "Contrôle généré" }); },
    onError: (err: any) => toast({ title: "Conversion impossible", description: err.message, variant: "destructive" }),
  });

  const updateDocumentMutation = useMutation({
    mutationFn: () => apiFetch(`/api/reglement/documents/${editingDocumentId}`, { method: "PATCH", body: JSON.stringify(documentDraft) }),
    onSuccess: () => { setEditingDocumentId(null); invalidate(); toast({ title: "Métadonnées enregistrées" }); },
    onError: (err: any) => toast({ title: "Document non enregistré", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!data?.zone || editingZone) return;
    setZoneDraft({
      zoneCode: data.zone.zoneCode || "",
      zoneLabel: data.zone.zoneLabel || "",
      zoneType: data.zone.zoneType || "",
      summary: data.zone.summary || "",
      guidanceNotes: data.zone.guidanceNotes || "",
      status: data.zone.status || "draft",
      confidenceScore: data.zone.confidenceScore ?? 0.5,
      linkedDocumentIds: data.zone.linkedDocumentIds || [],
      constraints: data.zone.constraints || [],
      notebookUrl: data.zone.notebookUrl || "",
      notebookSummary: data.zone.notebookSummary || "",
    });
  }, [data?.zone, editingZone]);

  const rules = data?.rules || [];
  const controls = data?.controls || [];
  const documents = data?.documents || [];
  const history = data?.history || [];
  const groupedRules = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const rule of rules) {
      const article = Number(rule.articleNumber || 0);
      map.set(article, [...(map.get(article) || []), rule]);
    }
    return map;
  }, [rules]);

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de la zone...</div>;
  if (!data?.zone) return null;

  const openRuleEditor = (rule?: any, articleNumber?: number, articleTitle?: string) => {
    setEditingRuleId(rule?.id || "__new__");
    setRuleDraft(buildRuleDraft(rule, articleNumber, articleTitle));
  };

  const openDocumentEditor = (document: any) => {
    const meta = document?.structuredContent?.reglementMetadata || {};
    setEditingDocumentId(document.id);
    setDocumentDraft({
      title: document.title || "",
      documentType: document.documentType || "",
      opposability: document.isOpposable === false ? "informatif" : "opposable",
      perimeter: meta.perimeter || "",
      zones: toText(meta.zones || data.zone.zoneCode),
      approvalDate: meta.approvalDate || "",
      modificationDate: meta.modificationDate || "",
      version: meta.version || "",
      officialSource: meta.officialSource || "",
      shortSummary: meta.shortSummary || document.explanatoryNote || "",
      detailedSummary: meta.detailedSummary || "",
      keyPoints: toText(meta.keyPoints),
      uncertainties: meta.uncertainties || "",
      humanReviewRequired: !!meta.humanReviewRequired,
      internalNotes: meta.internalNotes || "",
      notebookUrl: document.notebookUrl || "",
      notebookSummary: document.notebookSummary || "",
    });
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Zone {data.zone.zoneCode}</CardTitle>
              <CardDescription>{data.zone.zoneLabel || data.zone.summary || "Zone réglementaire"}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.zone.status === "validated" ? "default" : data.zone.status === "to_review" ? "secondary" : "outline"}>
                {data.zone.status === "validated" ? "Validé humainement" : data.zone.status === "to_review" ? "À vérifier" : "Brouillon"}
              </Badge>
              <Badge variant="outline">Import Notebook compatible</Badge>
              {data.zone.notebookUrl && (
                <Button variant="outline" asChild>
                  <a href={data.zone.notebookUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Voir analyse Notebook
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditingZone(true)}><PencilLine className="mr-2 h-4 w-4" /> Modifier la zone</Button>
              <Button disabled={validateMutation.isPending || data.zone.status === "validated"} onClick={() => validateMutation.mutate()}>
                {validateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Valider la zone
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editingZone ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Input value={zoneDraft.zoneCode} onChange={(e) => setZoneDraft({ ...zoneDraft, zoneCode: e.target.value })} placeholder="Code zone" />
              <Input value={zoneDraft.zoneLabel} onChange={(e) => setZoneDraft({ ...zoneDraft, zoneLabel: e.target.value })} placeholder="Libellé" />
              <Input value={zoneDraft.zoneType} onChange={(e) => setZoneDraft({ ...zoneDraft, zoneType: e.target.value })} placeholder="Type de zone" />
              <Select value={zoneDraft.status} onValueChange={(value) => setZoneDraft({ ...zoneDraft, status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="to_review">À vérifier</SelectItem>
                  <SelectItem value="validated">Validé</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" step="0.01" min="0" max="1" value={zoneDraft.confidenceScore} onChange={(e) => setZoneDraft({ ...zoneDraft, confidenceScore: e.target.value })} placeholder="Niveau de confiance" />
              <Input value={toText(zoneDraft.constraints)} onChange={(e) => setZoneDraft({ ...zoneDraft, constraints: e.target.value })} placeholder="Contraintes associées" />
              <Input value={zoneDraft.notebookUrl} onChange={(e) => setZoneDraft({ ...zoneDraft, notebookUrl: e.target.value })} placeholder="Lien NotebookLM" />
              <Input value={zoneDraft.notebookSummary} onChange={(e) => setZoneDraft({ ...zoneDraft, notebookSummary: e.target.value })} placeholder="Résumé Notebook" />
              <Textarea className="lg:col-span-2" value={zoneDraft.summary} onChange={(e) => setZoneDraft({ ...zoneDraft, summary: e.target.value })} placeholder="Résumé général" />
              <Textarea className="lg:col-span-2" value={zoneDraft.guidanceNotes} onChange={(e) => setZoneDraft({ ...zoneDraft, guidanceNotes: e.target.value })} placeholder="Notes internes" />
              <div className="flex gap-2 lg:col-span-2">
                <Button onClick={() => updateZoneMutation.mutate()} disabled={updateZoneMutation.isPending}><Save className="mr-2 h-4 w-4" /> Enregistrer</Button>
                <Button variant="outline" onClick={() => setEditingZone(false)}><X className="mr-2 h-4 w-4" /> Annuler</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{data.zone.summary || data.zone.guidanceNotes || "Aucun résumé validé."}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{rules.length} règle(s)</Badge>
                <Badge variant="outline">{controls.length} contrôle(s)</Badge>
                <Badge variant="outline">{documents.length} source(s)</Badge>
                <Badge variant="outline">Confiance {Math.round(Number(data.zone.confidenceScore || 0) * 100)}%</Badge>
                {data.zone.notebookUrl && <Badge variant="secondary">Analyse externe · NotebookLM</Badge>}
              </div>
              {data.zone.notebookSummary && <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">{data.zone.notebookSummary}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openRuleEditor(undefined, 1, ARTICLES[0][1])}><Plus className="mr-2 h-4 w-4" /> Ajouter une règle</Button>
        <Button variant="outline" onClick={() => openRuleEditor(undefined, 1, ARTICLES[0][1])}><FilePlus2 className="mr-2 h-4 w-4" /> Ajouter un article</Button>
        <Button variant="outline"><Link2 className="mr-2 h-4 w-4" /> Lier un document</Button>
      </div>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Articles 1 à 14</CardTitle>
          <CardDescription>Administration manuelle des articles, règles extraites, sources, conditions et validations.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-2">
            {ARTICLES.map(([articleNumber, articleTitle]) => {
              const articleRules = groupedRules.get(articleNumber) || [];
              return (
                <AccordionItem key={articleNumber} value={`article-${articleNumber}`} className="rounded-lg border px-3">
                  <AccordionTrigger>
                    <div className="flex flex-wrap items-center gap-2 text-left">
                      <span>Article {articleNumber} · {articleTitle}</span>
                      <Badge variant={articleRules.length ? "secondary" : "outline"}>{articleRules.length} règle(s)</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <Button size="sm" variant="outline" onClick={() => openRuleEditor(undefined, articleNumber, articleTitle)}>
                      <Plus className="mr-2 h-4 w-4" /> Ajouter une règle à cet article
                    </Button>
                    {articleRules.map((rule: any) => (
                      <div key={rule.id} className="rounded-lg border bg-muted/20 p-3">
                        {editingRuleId === rule.id ? (
                          <RuleEditor draft={ruleDraft} setDraft={setRuleDraft} documents={documents} onCancel={() => setEditingRuleId(null)} onSave={() => saveRuleMutation.mutate()} saving={saveRuleMutation.isPending} />
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-2">
                                <Badge>{rule.topic}</Badge>
                                <Badge variant="outline">{rule.validationStatus === "validated" ? "Validé humainement" : rule.validationStatus === "proposed" ? "Correction proposée" : "À vérifier"}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => openRuleEditor(rule)}><PencilLine className="mr-2 h-4 w-4" /> Modifier</Button>
                                <Button size="sm" variant="outline" onClick={() => convertRuleMutation.mutate(rule.id)}>Convertir en contrôle</Button>
                                <Button size="sm" variant="outline" onClick={() => deleteRuleMutation.mutate(rule.id)}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button>
                              </div>
                            </div>
                            <p className="text-sm">{rule.ruleText}</p>
                            {(rule.conditions || rule.exceptions || rule.valueMin || rule.valueMax || rule.valueExact || rule.unit) && (
                              <p className="text-xs text-muted-foreground">
                                Conditions : {rule.conditions || "N/A"} · Exceptions : {rule.exceptions || "N/A"} · Valeurs : {rule.valueMin || "-"} / {rule.valueMax || "-"} / {rule.valueExact || "-"} {rule.unit || ""}
                              </p>
                            )}
                            {rule.sourceExcerpt && <p className="rounded bg-background p-2 text-xs text-muted-foreground">{rule.sourceExcerpt}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                    {articleRules.length === 0 && <p className="text-sm text-muted-foreground">Aucune règle structurée pour cet article.</p>}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {editingRuleId === "__new__" && (
        <Card className="border-primary/10 shadow-sm">
          <CardHeader><CardTitle className="text-base">Nouvelle règle</CardTitle></CardHeader>
          <CardContent><RuleEditor draft={ruleDraft} setDraft={setRuleDraft} documents={documents} onCancel={() => setEditingRuleId(null)} onSave={() => saveRuleMutation.mutate()} saving={saveRuleMutation.isPending} /></CardContent>
        </Card>
      )}

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Documents sources</CardTitle>
          <CardDescription>Les documents prouvent les règles et peuvent être liés aux zones, articles, règles et contrôles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.length > 0 ? documents.map((document: any) => (
            <div key={document.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
              {editingDocumentId === document.id ? (
                <DocumentEditor draft={documentDraft} setDraft={setDocumentDraft} onCancel={() => setEditingDocumentId(null)} onSave={() => updateDocumentMutation.mutate()} saving={updateDocumentMutation.isPending} />
              ) : (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium">{document.title || document.fileName || "Document"}</p>
                    <p className="text-muted-foreground">{document.documentType || "source"} · {document.fileName || "fichier lié"}</p>
                    {document.notebookSummary && <p className="mt-1 text-xs text-muted-foreground">NotebookLM : {document.notebookSummary}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {document.notebookUrl && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={document.notebookUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" /> Voir analyse Notebook
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openDocumentEditor(document)}>Éditer les métadonnées</Button>
                    <Button size="sm" variant="outline">Lier aux zones</Button>
                    <Button size="sm" variant="outline">Voir les règles extraites</Button>
                    <Button size="sm" variant="outline">Voir les divergences</Button>
                  </div>
                </div>
              )}
            </div>
          )) : <p className="text-sm text-muted-foreground">Aucun document source rattaché.</p>}
        </CardContent>
      </Card>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Historique des modifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.length > 0 ? history.slice(0, 8).map((item: any) => (
            <div key={item.id} className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              {item.action} · {item.userId || "utilisateur"} · {new Date(item.createdAt).toLocaleString("fr-FR")}
            </div>
          )) : <p className="text-sm text-muted-foreground">Aucune modification historisée.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleEditor({ draft, setDraft, documents, onCancel, onSave, saving }: any) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Input value={draft.articleNumber} onChange={(e) => setDraft({ ...draft, articleNumber: e.target.value })} placeholder="Numéro d'article" />
      <Input value={draft.articleTitle} onChange={(e) => setDraft({ ...draft, articleTitle: e.target.value })} placeholder="Titre d'article" />
      <Input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="Thème" />
      <Select value={draft.validationStatus} onValueChange={(value) => setDraft({ ...draft, validationStatus: value })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Brouillon</SelectItem>
          <SelectItem value="to_review">À vérifier</SelectItem>
          <SelectItem value="proposed">Correction proposée</SelectItem>
          <SelectItem value="validated">Validé</SelectItem>
        </SelectContent>
      </Select>
      <Textarea className="lg:col-span-2" value={draft.rawContent} onChange={(e) => setDraft({ ...draft, rawContent: e.target.value })} placeholder="Contenu brut" />
      <Textarea className="lg:col-span-2" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} placeholder="Résumé" />
      <Textarea className="lg:col-span-2" value={draft.ruleText} onChange={(e) => setDraft({ ...draft, ruleText: e.target.value })} placeholder="Texte de règle" />
      <Input value={draft.conditions} onChange={(e) => setDraft({ ...draft, conditions: e.target.value })} placeholder="Conditions" />
      <Input value={draft.exceptions} onChange={(e) => setDraft({ ...draft, exceptions: e.target.value })} placeholder="Exceptions" />
      <Input value={draft.valueMin} onChange={(e) => setDraft({ ...draft, valueMin: e.target.value })} placeholder="Valeur min" />
      <Input value={draft.valueMax} onChange={(e) => setDraft({ ...draft, valueMax: e.target.value })} placeholder="Valeur max" />
      <Input value={draft.valueExact} onChange={(e) => setDraft({ ...draft, valueExact: e.target.value })} placeholder="Valeur exacte" />
      <Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="Unité" />
      <Input value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })} placeholder="Destination concernée" />
      <Input value={draft.projectType} onChange={(e) => setDraft({ ...draft, projectType: e.target.value })} placeholder="Projet concerné" />
      <Select value={draft.sourceDocumentId} onValueChange={(value) => setDraft({ ...draft, sourceDocumentId: value })}>
        <SelectTrigger><SelectValue placeholder="Document source" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Aucun document</SelectItem>
          {documents.map((document: any) => <SelectItem key={document.id} value={document.id}>{document.title || document.fileName || "Document"}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input value={draft.sourcePage} onChange={(e) => setDraft({ ...draft, sourcePage: e.target.value })} placeholder="Page source" />
      <Textarea className="lg:col-span-2" value={draft.sourceExcerpt} onChange={(e) => setDraft({ ...draft, sourceExcerpt: e.target.value })} placeholder="Extrait source" />
      <Textarea className="lg:col-span-2" value={draft.instructorNote} onChange={(e) => setDraft({ ...draft, instructorNote: e.target.value })} placeholder="Note instructeur" />
      <div className="flex gap-2 lg:col-span-2">
        <Button onClick={onSave} disabled={saving}><Save className="mr-2 h-4 w-4" /> Enregistrer</Button>
        <Button variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" /> Annuler</Button>
      </div>
    </div>
  );
}

function DocumentEditor({ draft, setDraft, onCancel, onSave, saving }: any) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Titre" />
      <Select value={draft.documentType} onValueChange={(value) => setDraft({ ...draft, documentType: value })}>
        <SelectTrigger><SelectValue placeholder="Type document" /></SelectTrigger>
        <SelectContent>
          {["règlement écrit", "plan de zonage", "OAP", "SPR", "PPRI", "SUP", "annexe", "délibération", "autre"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={draft.opposability} onValueChange={(value) => setDraft({ ...draft, opposability: value })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="opposable">Opposable</SelectItem>
          <SelectItem value="informatif">Informatif</SelectItem>
          <SelectItem value="à vérifier">À vérifier</SelectItem>
        </SelectContent>
      </Select>
      <Input value={draft.perimeter} onChange={(e) => setDraft({ ...draft, perimeter: e.target.value })} placeholder="Périmètre" />
      <Input value={draft.zones} onChange={(e) => setDraft({ ...draft, zones: e.target.value })} placeholder="Zones concernées" />
      <Input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} placeholder="Version" />
      <Input value={draft.approvalDate} onChange={(e) => setDraft({ ...draft, approvalDate: e.target.value })} placeholder="Date d'approbation" />
      <Input value={draft.modificationDate} onChange={(e) => setDraft({ ...draft, modificationDate: e.target.value })} placeholder="Date de modification" />
      <Input className="lg:col-span-2" value={draft.officialSource} onChange={(e) => setDraft({ ...draft, officialSource: e.target.value })} placeholder="Source officielle" />
      <Input className="lg:col-span-2" value={draft.notebookUrl} onChange={(e) => setDraft({ ...draft, notebookUrl: e.target.value })} placeholder="Lien NotebookLM" />
      <Textarea className="lg:col-span-2" value={draft.notebookSummary} onChange={(e) => setDraft({ ...draft, notebookSummary: e.target.value })} placeholder="Résumé Notebook" />
      <Textarea className="lg:col-span-2" value={draft.shortSummary} onChange={(e) => setDraft({ ...draft, shortSummary: e.target.value })} placeholder="Résumé court" />
      <Textarea className="lg:col-span-2" value={draft.detailedSummary} onChange={(e) => setDraft({ ...draft, detailedSummary: e.target.value })} placeholder="Résumé détaillé" />
      <Textarea value={draft.keyPoints} onChange={(e) => setDraft({ ...draft, keyPoints: e.target.value })} placeholder="Points clés" />
      <Textarea value={draft.uncertainties} onChange={(e) => setDraft({ ...draft, uncertainties: e.target.value })} placeholder="Limites / incertitudes" />
      <Textarea className="lg:col-span-2" value={draft.internalNotes} onChange={(e) => setDraft({ ...draft, internalNotes: e.target.value })} placeholder="Notes internes" />
      <div className="flex gap-2 lg:col-span-2">
        <Button onClick={onSave} disabled={saving}><Save className="mr-2 h-4 w-4" /> Enregistrer</Button>
        <Button variant="outline" onClick={onCancel}><X className="mr-2 h-4 w-4" /> Annuler</Button>
      </div>
    </div>
  );
}
