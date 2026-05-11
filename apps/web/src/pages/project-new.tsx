import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useGeocodeAddress, getGeocodeAddressQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, CheckCircle2, FolderKanban, Loader2, MapPin, Plus, Search } from "lucide-react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";

type GeoSelection = {
  label: string;
  postcode?: string;
  city?: string;
  lat: number;
  lng: number;
  banId?: string;
  inseeCode?: string;
  parcelles?: string[];
};

type ParcelPreviewItem = {
  idu: string;
  section: string;
  numero: string;
  parcelRef: string;
  contenanceM2: number;
};

type ParcelPreviewResponse = {
  primaryParcel: ParcelPreviewItem;
  adjacentParcels: ParcelPreviewItem[];
  zoningPreview?: {
    zoneCode: string | null;
    zoningLabel: string | null;
  } | null;
};

export default function NewProjectPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const debouncedAddress = useDebounce(address, 350);
  const [selectedAddress, setSelectedAddress] = useState<GeoSelection | null>(null);
  const [commune, setCommune] = useState("");
  const [parcelReference, setParcelReference] = useState("");
  const [parcelPreview, setParcelPreview] = useState<ParcelPreviewResponse | null>(null);
  const [parcelPreviewError, setParcelPreviewError] = useState<string | null>(null);
  const [isLoadingParcelPreview, setIsLoadingParcelPreview] = useState(false);

  const { data: geoData, isFetching: isGeocoding } = useGeocodeAddress(
    { q: debouncedAddress },
    {
      query: {
        queryKey: getGeocodeAddressQueryKey({ q: debouncedAddress }),
        enabled: debouncedAddress.length > 3 && !selectedAddress,
      },
    },
  );

  const resetLocationSelection = () => {
    setSelectedAddress(null);
    setParcelPreview(null);
    setParcelPreviewError(null);
  };

  const loadParcelPreview = async (item: GeoSelection) => {
    setIsLoadingParcelPreview(true);
    setParcelPreviewError(null);
    try {
      const response = await fetch("/api/analyses/parcel-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lat: item.lat,
          lng: item.lng,
          banId: item.banId,
          label: item.label,
          banParcelles: item.parcelles,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Parcelle non déterminée automatiquement.");

      setParcelPreview(payload);
      if (payload.primaryParcel?.parcelRef) {
        setParcelReference(payload.primaryParcel.parcelRef);
      } else if (payload.primaryParcel?.idu) {
        setParcelReference(payload.primaryParcel.idu);
      } else if (item.parcelles?.[0]) {
        setParcelReference(item.parcelles[0]);
      }
    } catch (error) {
      setParcelPreview(null);
      if (item.parcelles?.[0]) {
        setParcelReference(item.parcelles[0]);
      }
      setParcelPreviewError(error instanceof Error ? error.message : "Parcelle non déterminée automatiquement.");
    } finally {
      setIsLoadingParcelPreview(false);
    }
  };

  const handleSelectAddress = (item: GeoSelection) => {
    setSelectedAddress(item);
    setAddress(item.label);
    setCommune(item.city || "");
    setParcelReference(item.parcelles?.[0] || "");
    setParcelPreview(null);
    setParcelPreviewError(null);
    void loadParcelPreview(item);
  };

  const createProject = useMutation({
    mutationFn: async () => {
      const primaryParcel = parcelPreview?.primaryParcel;
      const response = await fetch("/api/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          address: selectedAddress?.label || address,
          commune: selectedAddress?.city || commune,
          parcelReferences: parcelReference ? [parcelReference] : selectedAddress?.parcelles || [],
          latitude: selectedAddress?.lat,
          longitude: selectedAddress?.lng,
          mainPluZone: parcelPreview?.zoningPreview?.zoneCode || null,
          detectedConstraints: [],
          metadata: {
            address: selectedAddress
              ? {
                  label: selectedAddress.label,
                  city: selectedAddress.city,
                  postcode: selectedAddress.postcode,
                  inseeCode: selectedAddress.inseeCode,
                  banId: selectedAddress.banId,
                }
              : null,
            parcelPreview: primaryParcel
              ? {
                  idu: primaryParcel.idu,
                  section: primaryParcel.section,
                  numero: primaryParcel.numero,
                  parcelRef: primaryParcel.parcelRef,
                  contenanceM2: primaryParcel.contenanceM2,
                  zoningPreview: parcelPreview?.zoningPreview || null,
                }
              : null,
          },
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
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="project-address"
                    value={address}
                    onChange={(event) => {
                      setAddress(event.target.value);
                      resetLocationSelection();
                    }}
                    placeholder="Rechercher une adresse..."
                    className="pl-10 pr-10"
                    autoComplete="off"
                  />
                  {isGeocoding || isLoadingParcelPreview ? (
                    <Loader2 className="absolute right-3.5 top-3 h-4 w-4 animate-spin text-slate-500" />
                  ) : selectedAddress ? (
                    <CheckCircle2 className="absolute right-3.5 top-3 h-4 w-4 text-emerald-600" />
                  ) : null}

                  {geoData?.results && geoData.results.length > 0 && !selectedAddress ? (
                    <div className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                      {geoData.results.map((item: GeoSelection, index: number) => (
                        <button
                          key={`${item.banId || item.label}-${index}`}
                          type="button"
                          className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0"
                          onClick={() => handleSelectAddress(item)}
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>
                            <span className="block text-sm font-semibold text-slate-950">{item.label}</span>
                            <span className="text-xs text-slate-500">{item.postcode} {item.city}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {selectedAddress ? (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Adresse sélectionnée : {selectedAddress.city || "commune détectée"}
                  </div>
                ) : address.length > 3 ? (
                  <p className="text-xs text-amber-700">Sélectionnez une adresse proposée pour lancer la détection automatique.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-commune">Commune</Label>
                <Input id="project-commune" value={commune} onChange={(event) => setCommune(event.target.value)} placeholder="Commune" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-parcel">Référence cadastrale</Label>
              <Input id="project-parcel" value={parcelReference} onChange={(event) => setParcelReference(event.target.value)} placeholder="Ex. AB 123" />
              {isLoadingParcelPreview ? (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Recherche automatique de la parcelle...
                </p>
              ) : parcelPreview?.primaryParcel ? (
                <p className="text-xs text-emerald-700">
                  Parcelle détectée : {parcelPreview.primaryParcel.parcelRef}
                  {parcelPreview.primaryParcel.contenanceM2 ? ` · ${parcelPreview.primaryParcel.contenanceM2} m²` : ""}
                  {parcelPreview.zoningPreview?.zoneCode ? ` · Zone ${parcelPreview.zoningPreview.zoneCode}` : ""}
                </p>
              ) : parcelPreviewError ? (
                <p className="text-xs text-amber-700">{parcelPreviewError}</p>
              ) : null}
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
