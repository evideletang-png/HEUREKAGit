import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft, CalendarClock, FileText, Gavel, Loader2, MessageSquare, Scale, Send, ShieldCheck, Upload } from "lucide-react";

async function apiFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return response.json();
}

const APPEAL_TYPE_LABELS: Record<string, string> = {
  signalement: "Signalement",
  gracieux: "Recours gracieux",
  contentieux: "Recours contentieux",
  deja_engage: "Contentieux déjà engagé",
};

const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  nouveau: "Nouveau",
  analyse_recevabilite: "Analyse recevabilité",
  precontentieux: "Pré-contentieux",
  contentieux: "Contentieux",
  regularisation: "Régularisation",
  clos: "Clos",
};

export default function AppealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const currentRole = (user?.role as string) || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nextStatus, setNextStatus] = useState("analyse_recevabilite");
  const [message, setMessage] = useState("");
  const [newGround, setNewGround] = useState({
    category: "urbanisme",
    title: "",
    description: "",
    linkedPluArticle: "",
    linkedDocumentId: "",
    linkedExtractedMetric: "",
    seriousnessScore: "",
    responseDraft: "",
    status: "a_qualifier",
  });

  const detailQuery = useQuery<any>({
    queryKey: ["appeal-detail", id],
    queryFn: () => apiFetch(`/api/appeals/${id}`),
    enabled: !!id,
  });

  const isInstructor = currentRole === "mairie" || currentRole === "admin" || currentRole === "super_admin";
  const appeal = detailQuery.data?.appeal;
  const dossier = detailQuery.data?.dossier;

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiFetch(`/api/appeals/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appeal-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["appeals"] });
      toast({ title: "Statut mis à jour", description: "Le recours a été requalifié avec succès." });
    },
  });

  const groundMutation = useMutation({
    mutationFn: () => apiFetch(`/api/appeals/${id}/grounds`, {
      method: "POST",
      body: JSON.stringify({
        ...newGround,
        seriousnessScore: newGround.seriousnessScore ? Number(newGround.seriousnessScore) : null,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appeal-detail", id] });
      setNewGround({
        category: "urbanisme",
        title: "",
        description: "",
        linkedPluArticle: "",
        linkedDocumentId: "",
        linkedExtractedMetric: "",
        seriousnessScore: "",
        responseDraft: "",
        status: "a_qualifier",
      });
      toast({ title: "Grief ajouté", description: "Le grief est maintenant rattaché au recours." });
    },
  });

  const messageMutation = useMutation({
    mutationFn: () => apiFetch(`/api/appeals/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: message }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appeal-detail", id] });
      setMessage("");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      formData.append("category", "piece_recours");
      return apiFetch(`/api/appeals/${id}/documents`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appeal-detail", id] });
      toast({ title: "Pièce ajoutée", description: "Le document a bien été stocké dans le recours." });
    },
  });

  const summaryStats = useMemo(() => {
    if (!appeal) return [];
    return [
      { label: "Recevabilité", value: appeal.admissibilityScore != null ? `${appeal.admissibilityScore}/100` : "N/A" },
      { label: "Risque urbanistique", value: appeal.urbanRiskScore != null ? `${appeal.urbanRiskScore}/100` : "N/A" },
      { label: "Dossier lié", value: dossier?.dossierNumber || dossier?.title || "N/A" },
      { label: "Commune", value: appeal.commune || dossier?.commune || "N/A" },
    ];
  }, [appeal, dossier]);

  if (detailQuery.isLoading) {
    return (
      <ProtectedLayout>
        <div className="py-24 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      </ProtectedLayout>
    );
  }

  if (detailQuery.error || !appeal) {
    return (
      <ProtectedLayout>
        <div className="py-20 text-center text-destructive">
          <AlertTriangle className="w-10 h-10 mx-auto mb-4" />
          <p>Impossible de charger ce recours.</p>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Button variant="ghost" asChild className="w-fit px-0">
              <Link href="/recours"><ArrowLeft className="w-4 h-4 mr-2" /> Retour aux recours</Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{appeal.summary}</h1>
              <Badge variant="outline">{APPEAL_TYPE_LABELS[appeal.appealType] || appeal.appealType}</Badge>
              <Badge className="bg-slate-900 text-white border-0">{STATUS_LABELS[appeal.status] || appeal.status}</Badge>
            </div>
            <p className="text-muted-foreground">{appeal.projectAddress || "Adresse non renseignée"} · {appeal.commune || "Commune à préciser"}</p>
          </div>

          {isInstructor && (
            <Card className="lg:min-w-[320px]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pilotage instructeur</CardTitle>
                <CardDescription>Vue différenciée mairie / administration pour qualifier le recours et sécuriser la procédure.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={nextStatus} onValueChange={setNextStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => statusMutation.mutate(nextStatus)} disabled={statusMutation.isPending}>
                  {statusMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Mettre à jour le statut
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {summaryStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold mt-2">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="synthese" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-2 bg-muted/30 p-2">
            <TabsTrigger value="synthese">Synthèse</TabsTrigger>
            <TabsTrigger value="griefs">Griefs</TabsTrigger>
            <TabsTrigger value="pieces">Pièces</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="echeances">Échéances</TabsTrigger>
            <TabsTrigger value="historique">Historique</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="synthese" className="pt-4">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Qualification contradictoire</CardTitle>
                  <CardDescription>Le module est pensé comme un outil de sécurisation procédurale et d’aide à la qualification, pas comme un produit d’attaque de voisinage.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <p className="font-medium mb-2">Résumé</p>
                    <p className="text-muted-foreground leading-relaxed">{appeal.summary}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoRow label="Type d'autorisation" value={appeal.permitType || dossier?.typeProcedure || "N/A"} />
                    <InfoRow label="Référence décision" value={appeal.decisionReference || dossier?.dossierNumber || "N/A"} />
                    <InfoRow label="Début affichage" value={appeal.postingStartDate ? new Date(appeal.postingStartDate).toLocaleDateString("fr-FR") : "N/A"} />
                    <InfoRow label="Preuve affichage" value={appeal.postingEvidenceStatus || "N/A"} />
                    <InfoRow label="Dépôt du recours" value={appeal.filingDate ? new Date(appeal.filingDate).toLocaleDateString("fr-FR") : "N/A"} />
                    <InfoRow label="Dossier urbanisme lié" value={dossier?.title || "N/A"} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Parties</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {(detailQuery.data?.parties || []).map((party: any) => (
                    <div key={party.id} className="rounded-xl border p-3">
                      <p className="font-medium capitalize">{party.partyRole}</p>
                      <p className="text-muted-foreground mt-1">{party.identity?.name || "Identité non renseignée"}</p>
                      {party.identity?.email && <p className="text-muted-foreground">{party.identity.email}</p>}
                      {party.identity?.interestDescription && <p className="mt-2">{party.identity.interestDescription}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="griefs" className="pt-4">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Griefs qualifiés</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(detailQuery.data?.grounds || []).length === 0 && (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Aucun grief n'a encore été formalisé.</div>
                  )}
                  {(detailQuery.data?.grounds || []).map((ground: any) => (
                    <div key={ground.id} className="rounded-xl border p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{ground.title}</p>
                        <Badge variant="outline">{ground.category}</Badge>
                        <Badge className="bg-primary text-primary-foreground border-0">{ground.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{ground.description}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {ground.linkedPluArticle && <span>Article PLU: {ground.linkedPluArticle}</span>}
                        {ground.linkedDocumentId && <span>Pièce liée: {ground.linkedDocumentId}</span>}
                        {ground.linkedExtractedMetric && <span>Métrique: {ground.linkedExtractedMetric}</span>}
                        {ground.seriousnessScore != null && <span>Gravité: {ground.seriousnessScore}/100</span>}
                      </div>
                      {ground.responseDraft && (
                        <div className="rounded-lg bg-muted/30 p-3 text-sm">
                          <p className="font-medium mb-1">Brouillon de réponse</p>
                          <p className="text-muted-foreground">{ground.responseDraft}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ajouter un grief</CardTitle>
                  <CardDescription>Liez-le à un article du PLU, une pièce ou une donnée calculée si nécessaire.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="Catégorie" value={newGround.category} onChange={(e) => setNewGround((current) => ({ ...current, category: e.target.value }))} />
                  <Input placeholder="Titre" value={newGround.title} onChange={(e) => setNewGround((current) => ({ ...current, title: e.target.value }))} />
                  <Textarea placeholder="Description" value={newGround.description} onChange={(e) => setNewGround((current) => ({ ...current, description: e.target.value }))} />
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input placeholder="Article PLU" value={newGround.linkedPluArticle} onChange={(e) => setNewGround((current) => ({ ...current, linkedPluArticle: e.target.value }))} />
                    <Input placeholder="Pièce liée" value={newGround.linkedDocumentId} onChange={(e) => setNewGround((current) => ({ ...current, linkedDocumentId: e.target.value }))} />
                    <Input placeholder="Métrique liée" value={newGround.linkedExtractedMetric} onChange={(e) => setNewGround((current) => ({ ...current, linkedExtractedMetric: e.target.value }))} />
                  </div>
                  <Input placeholder="Gravité (0-100)" value={newGround.seriousnessScore} onChange={(e) => setNewGround((current) => ({ ...current, seriousnessScore: e.target.value }))} />
                  <Textarea placeholder="Brouillon de réponse" value={newGround.responseDraft} onChange={(e) => setNewGround((current) => ({ ...current, responseDraft: e.target.value }))} />
                  <Button onClick={() => groundMutation.mutate()} disabled={groundMutation.isPending || !newGround.title || !newGround.description}>
                    {groundMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scale className="w-4 h-4 mr-2" />}
                    Enregistrer le grief
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="pieces" className="pt-4">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Pièces justificatives</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(detailQuery.data?.documents || []).length === 0 && (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Aucune pièce n'a été téléversée pour l'instant.</div>
                  )}
                  {(detailQuery.data?.documents || []).map((document: any) => (
                    <div key={document.id} className="rounded-xl border p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{document.title}</p>
                        <p className="text-xs text-muted-foreground">{document.category || "Pièce recours"} · {document.originalFileName || document.fileName}</p>
                      </div>
                      <Button variant="outline" asChild>
                        <a href={`/api/appeals/documents/${document.id}/view`} target="_blank" rel="noreferrer"><FileText className="w-4 h-4 mr-2" /> Ouvrir</a>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ajouter une pièce</CardTitle>
                  <CardDescription>Le fichier est stocké dans le recours pour alimenter l’instruction contradictoire.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadMutation.mutate(file);
                    }}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                    {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Téléverser une pièce
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Notifications procédurales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(detailQuery.data?.notifications || []).map((notification: any) => (
                  <div key={notification.id} className="rounded-xl border p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{notification.type}</p>
                      <p className="text-sm text-muted-foreground mt-1">{notification.notes || "Notification procédurale"}</p>
                      {notification.dueAt && <p className="text-xs text-muted-foreground mt-1">Échéance: {new Date(notification.dueAt).toLocaleDateString("fr-FR")}</p>}
                    </div>
                    <Badge variant="outline">{notification.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="echeances" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Échéances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(detailQuery.data?.deadlines || []).map((deadline: any) => (
                  <div key={deadline.id} className="rounded-xl border p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{deadline.label}</p>
                      <p className="text-sm text-muted-foreground">{new Date(deadline.dueDate).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <Badge variant="outline">{deadline.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historique" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Historique</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(detailQuery.data?.events || []).map((event: any) => (
                  <div key={event.id} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{event.description}</p>
                      <Badge variant="outline">{event.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{new Date(event.createdAt).toLocaleString("fr-FR")}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Messages</CardTitle>
                <CardDescription>Les échanges sont tracés dans le recours pour documenter le contradictoire.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {(detailQuery.data?.messages || []).map((msg: any) => (
                    <div key={msg.id} className={`rounded-2xl p-4 max-w-3xl ${msg.fromUserId === user?.id ? "bg-primary text-primary-foreground ml-auto" : "bg-muted text-foreground"}`}>
                      <p className="text-xs opacity-80 mb-1">{msg.fromRole}</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ajouter un message..." />
                  <Button onClick={() => messageMutation.mutate()} disabled={messageMutation.isPending || !message.trim()}>
                    {messageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium mt-2">{value}</p>
    </div>
  );
}
