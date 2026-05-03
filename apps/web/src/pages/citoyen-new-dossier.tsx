import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ArrowLeft, Upload, FileText, X, CheckCircle2, Search, Loader2, Plus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useGeocodeAddress } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { AppShell } from "@/components/layout/AppShell";

export default function CitoyenNewDossierPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [address, setAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [docType, setDocType] = useState("permis_de_construire");
  const [title, setTitle] = useState("");

  const geocode = useGeocodeAddress({ q: address }, { query: { enabled: address.length > 5 } } as any);

  const upload = useMutation({
    mutationFn: async (formData: FormData) => {
      const r = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData, // No Content-Type header — browser sets it with boundary automatically
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAddress || files.length === 0 || !title) {
      toast({
        title: "Champs manquants",
        description: "Veuillez renseigner un titre, une adresse et ajouter au moins un document.",
        variant: "destructive"
      });
      return;
    }

    const formData = new FormData();
    files.forEach(file => formData.append("files", file));
    formData.append("adresse", selectedAddress.label); // The API uses 'adresse' for geocoding
    formData.append("commune", selectedAddress.city || "");
    formData.append("title", title);
    formData.append("documentType", docType);

    try {
      await upload.mutateAsync(formData);
      
      toast({
        title: "Dossier déposé !",
        description: "Votre dossier a été transmis avec succès et est en cours d'analyse.",
      });
      
      setLocation("/citoyen");
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erreur lors du dépôt",
        description: err?.message || "Une erreur est survenue lors de l'envoi de vos documents.",
        variant: "destructive"
      });
    }
  };

  return (
    <AppShell className="bg-muted/20 pb-20" mainClassName="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 w-full">
      <div className="mb-6 rounded-lg border border-border/40 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/citoyen">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary-foreground" />
            </div>
            <CardTitle className="text-lg">Nouveau Dépôt de Dossier</CardTitle>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">1. Informations du Projet</CardTitle>
              <CardDescription>Donnez un nom à votre projet et renseignez l'adresse concernée.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Titre du projet</Label>
                <Input 
                  id="title" 
                  placeholder="Ex: Extension de garage, Rénovation façade..." 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Adresse du terrain</Label>
                <div className="relative">
                  <Input 
                    id="address" 
                    placeholder="Cherchez une adresse..." 
                    value={address}
                    onChange={e => {
                      setAddress(e.target.value);
                      if (selectedAddress) setSelectedAddress(null);
                    }}
                    className="h-11 pl-10"
                    autoComplete="off"
                  />
                  <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
                  {geocode.isLoading && <Loader2 className="absolute right-3.5 top-3.5 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>

                {geocode.data?.results && address.length > 5 && !selectedAddress && (
                  <Card className="absolute z-50 w-full mt-1 border shadow-xl max-h-60 overflow-y-auto">
                    <CardContent className="p-0">
                      {geocode.data.results.map((res: any, i: number) => (
                        <button
                          key={i}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-muted flex flex-col transition-colors border-b last:border-0"
                          onClick={() => {
                            setSelectedAddress(res);
                            setAddress(res.label);
                          }}
                        >
                          <span className="text-sm font-semibold">{res.label}</span>
                          <span className="text-xs text-muted-foreground">{res.city} ({res.postcode})</span>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {selectedAddress && (
                  <div className="mt-2 text-xs font-medium text-emerald-600 flex items-center gap-1.5 bg-emerald-50 w-fit px-3 py-1.5 rounded-full ring-1 ring-emerald-100">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Adresse validée : {selectedAddress.city}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type de dossier</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger id="type" className="h-11">
                    <SelectValue placeholder="Choisir le type de demande" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permis_de_construire">Permis de Construire (PC)</SelectItem>
                    <SelectItem value="declaration_prealable">Déclaration Préalable (DP)</SelectItem>
                    <SelectItem value="certificat_urbanisme">Certificat d'Urbanisme (CU)</SelectItem>
                    <SelectItem value="permis_amenager">Permis d'Aménager (PA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">2. Pièces du Dossier</CardTitle>
              <CardDescription>Téléchargez ici votre CERFA rempli, ainsi que les plans (masse, coupe, façade).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div 
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-all ${
                  files.length > 0 ? "border-primary/40 bg-primary/5" : "border-muted-foreground/20 hover:border-primary/40"
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <h4 className="text-lg font-semibold mb-1">Cliquer pour ajouter des fichiers</h4>
                <p className="text-sm text-muted-foreground mb-6">Supports PDF, JPG, PNG (Max 10MB par fichier)</p>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  id="file-upload" 
                  onChange={handleFileChange}
                />
                <Button variant="outline" asChild className="rounded-lg px-8">
                  <label htmlFor="file-upload" className="cursor-pointer">Sélectionner des documents</label>
                </Button>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground px-1">Fichiers à envoyer ({files.length})</p>
                  <div className="grid grid-cols-1 gap-2">
                    {files.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium line-clamp-1">{file.name}</p>
                            <p className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(i)}
                          className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4 pt-4">
            <Button variant="ghost" asChild>
              <Link href="/citoyen">Annuler</Link>
            </Button>
            <Button 
              type="submit" 
              size="lg" 
              className="px-10 h-12 shadow-lg shadow-primary/20"
              disabled={upload.isPending || !selectedAddress || files.length === 0 || !title}
            >
              {upload.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transfert en cours...
                </>
              ) : (
                "Finaliser et Envoyer mon dossier"
              )}
            </Button>
          </div>
      </form>
    </AppShell>
  );
}
