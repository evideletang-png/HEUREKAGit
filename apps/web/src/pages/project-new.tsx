import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, FolderKanban, Loader2, Plus } from "lucide-react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function NewProjectPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [commune, setCommune] = useState("");
  const [parcelReference, setParcelReference] = useState("");

  const createProject = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          address,
          commune,
          parcelReferences: parcelReference ? [parcelReference] : [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || "Création du projet impossible.");
      return payload;
    },
    onSuccess: (payload) => {
      toast({ title: "Projet créé", description: "Le hub projet est prêt." });
      setLocation(`/projects/${payload.project.id}`);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Création impossible.",
        variant: "destructive",
      });
    },
  });

  return (
    <ProtectedLayout>
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4 gap-2">
          <Link href="/dashboard"><ArrowLeft className="h-4 w-4" /> Retour aux projets</Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
            <FolderKanban className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Nouveau projet</h1>
            <p className="text-sm text-slate-600">Créez l'espace central qui regroupera analyses, GED, démarches et instruction.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-lg border-slate-200">
          <CardHeader>
            <CardTitle>Informations projet</CardTitle>
            <CardDescription>Ces informations pourront être complétées automatiquement par l'analyse parcellaire.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="project-name">Nom du projet *</Label>
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Extension maison Jean Mermoz" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Décrivez brièvement le projet..." />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-address">Adresse</Label>
                <Input id="project-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Adresse du terrain" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-commune">Commune</Label>
                <Input id="project-commune" value={commune} onChange={(event) => setCommune(event.target.value)} placeholder="Commune" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-parcel">Référence cadastrale</Label>
              <Input id="project-parcel" value={parcelReference} onChange={(event) => setParcelReference(event.target.value)} placeholder="Ex. AB 123" />
            </div>
            <Button className="gap-2" disabled={!name.trim() || createProject.isPending} onClick={() => createProject.mutate()}>
              {createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Créer le projet
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 bg-slate-50">
          <CardHeader>
            <CardTitle>Workflow flexible</CardTitle>
            <CardDescription>Aucune brique n'est obligatoire. Vous pourrez lancer seulement ce dont vous avez besoin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>Analyse parcellaire, qualification, GED, dépôt et instruction resteront indépendants mais reliés au même projet.</p>
            <p>Les anciens dossiers et analyses continuent d'exister et apparaissent comme projets hérités.</p>
          </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
