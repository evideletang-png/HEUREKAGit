import { useEffect, useMemo, useState } from "react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useCreateAnalysis, useGeocodeAddress, getGeocodeAddressQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search, Loader2, ArrowRight, Layers, CheckCircle2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { getApiUrl } from "@/lib/api";
import { MapContainer, Polygon, TileLayer, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import L from "leaflet";

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
  isPrimary: boolean;
  isAdjacent: boolean;
  feature: Record<string, unknown>;
  positions?: [number, number][];
};

type ParcelPreviewResponse = {
  primaryParcel: ParcelPreviewItem;
  adjacentParcels: ParcelPreviewItem[];
  zoningPreview?: {
    zoneCode: string | null;
    zoningLabel: string | null;
  } | null;
};

function extractFirstRing(feature: Record<string, any> | null | undefined): number[][] | null {
  const geometry = feature?.geometry;
  if (!geometry?.coordinates) return null;
  if (geometry.type === "MultiPolygon") return geometry.coordinates?.[0]?.[0] ?? null;
  if (geometry.type === "Polygon") return geometry.coordinates?.[0] ?? null;
  return null;
}

function extractParcelPositions(parcel: ParcelPreviewItem): [number, number][] | null {
  if (Array.isArray(parcel.positions) && parcel.positions.length >= 3) {
    return parcel.positions;
  }

  const ring = extractFirstRing(parcel.feature as Record<string, any>);
  if (!ring) return null;
  return ring.map((coords) => [coords[1], coords[0]] as [number, number]);
}

function FitParcelPreviewBounds({
  polygons,
  center,
}: {
  polygons: Array<{ positions: [number, number][] }>;
  center: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    const allPoints = polygons.flatMap((polygon) => polygon.positions);
    if (allPoints.length >= 3) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [24, 24], maxZoom: 19 });
      return;
    }
    map.setView(center, 19);
  }, [center, map, polygons]);

  return null;
}

export default function NewAnalysisPage() {
  const [address, setAddress] = useState("");
  const debouncedAddress = useDebounce(address, 400);
  const [selectedGeo, setSelectedGeo] = useState<GeoSelection | null>(null);
  const [step, setStep] = useState<"selection" | "confirmation">("selection");
  const [isLandAssembly, setIsLandAssembly] = useState(false);
  const [parcelPreview, setParcelPreview] = useState<ParcelPreviewResponse | null>(null);
  const [parcelPreviewError, setParcelPreviewError] = useState<string | null>(null);
  const [isLoadingParcelPreview, setIsLoadingParcelPreview] = useState(false);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: geoData, isFetching: isGeocoding } = useGeocodeAddress(
    { q: debouncedAddress },
    { 
      query: { 
        queryKey: getGeocodeAddressQueryKey({ q: debouncedAddress }),
        enabled: debouncedAddress.length > 3 && !selectedGeo 
      } 
    }
  );

  const createMutation = useCreateAnalysis({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Analyse créée", description: "Le pipeline d'analyse a démarré." });
        setLocation(`/analyses/${data.id}`);
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Erreur", description: error?.message || "Impossible de créer l'analyse." });
      }
    }
  });

  const loadParcelPreview = async (item: GeoSelection) => {
    setIsLoadingParcelPreview(true);
    setParcelPreviewError(null);
    try {
      const response = await fetch(`${getApiUrl()}/api/analyses/parcel-preview`, {
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de charger les parcelles autour de cette adresse.");

      setParcelPreview(data);
      setSelectedParcelIds((current) => {
        if (current.length > 0 && isLandAssembly) {
          const next = current.filter((id) => id === data.primaryParcel.idu || data.adjacentParcels.some((parcel: ParcelPreviewItem) => parcel.idu === id));
          return next.includes(data.primaryParcel.idu) ? next : [data.primaryParcel.idu, ...next];
        }
        return [data.primaryParcel.idu];
      });
    } catch (error: any) {
      setParcelPreview(null);
      setSelectedParcelIds([]);
      setParcelPreviewError(error?.message || "Impossible de charger les parcelles voisines.");
    } finally {
      setIsLoadingParcelPreview(false);
    }
  };

  const handleSelectAddress = (item: GeoSelection) => {
    setAddress(item.label);
    setSelectedGeo(item);
    setStep("selection");
    setParcelPreview(null);
    setParcelPreviewError(null);
    setSelectedParcelIds([]);
  };

  useEffect(() => {
    if (selectedGeo) {
      void loadParcelPreview(selectedGeo);
    }
  }, [selectedGeo]);

  useEffect(() => {
    if (!isLandAssembly && parcelPreview?.primaryParcel?.idu) {
      setSelectedParcelIds([parcelPreview.primaryParcel.idu]);
    }
  }, [isLandAssembly, parcelPreview]);

  const parcelOptions = useMemo(() => {
    if (!parcelPreview) return [];
    return [parcelPreview.primaryParcel, ...parcelPreview.adjacentParcels];
  }, [parcelPreview]);

  const selectedParcels = useMemo(
    () => {
      if (!isLandAssembly && parcelPreview?.primaryParcel) {
        return [parcelPreview.primaryParcel];
      }
      return parcelOptions.filter((parcel) => selectedParcelIds.includes(parcel.idu));
    },
    [isLandAssembly, parcelOptions, parcelPreview, selectedParcelIds],
  );

  const selectedParcelSurface = useMemo(
    () => selectedParcels.reduce((sum, parcel) => sum + (parcel.contenanceM2 || 0), 0),
    [selectedParcels],
  );

  const parcelMapPolygons = useMemo(
    () =>
      selectedParcels
        .map((parcel) => {
          const positions = extractParcelPositions(parcel);
          if (!positions) return null;
          return {
            idu: parcel.idu,
            label: parcel.parcelRef || `${parcel.section} ${parcel.numero}`,
            isPrimary: parcel.idu === parcelPreview?.primaryParcel.idu,
            positions,
          };
        })
        .filter(Boolean) as { idu: string; label: string; isPrimary: boolean; positions: [number, number][] }[],
    [parcelPreview?.primaryParcel.idu, selectedParcels],
  );

  const parcelCandidatePolygons = useMemo(
    () =>
      parcelOptions
        .map((parcel) => {
          const positions = extractParcelPositions(parcel);
          if (!positions) return null;
          const isPrimary = parcel.idu === parcelPreview?.primaryParcel.idu;
          const isSelected = selectedParcelIds.includes(parcel.idu);
          return {
            idu: parcel.idu,
            label: parcel.parcelRef || `${parcel.section} ${parcel.numero}`,
            isPrimary,
            isSelected,
            positions,
            surfaceM2: parcel.contenanceM2,
          };
        })
        .filter(Boolean) as Array<{
          idu: string;
          label: string;
          isPrimary: boolean;
          isSelected: boolean;
          positions: [number, number][];
          surfaceM2: number;
        }>,
    [parcelOptions, parcelPreview?.primaryParcel.idu, selectedParcelIds],
  );

  const canContinue = !!selectedGeo && !!parcelPreview?.primaryParcel && !isLoadingParcelPreview;
  const canSubmit = canContinue && selectedParcels.length > 0;

  const toggleAdjacentParcel = (parcelId: string) => {
    if (parcelPreview?.primaryParcel.idu === parcelId) return;

    setSelectedParcelIds((current) =>
      current.includes(parcelId)
        ? current.filter((id) => id !== parcelId)
        : [...current, parcelId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !selectedGeo || step !== "confirmation") return;

    const selectedAssemblyParcels = isLandAssembly
      ? selectedParcels.map((parcel) => ({
          idu: parcel.idu,
          section: parcel.section,
          numero: parcel.numero,
          parcelRef: parcel.parcelRef,
          contenanceM2: parcel.contenanceM2,
          feature: parcel.feature,
        }))
      : undefined;

    createMutation.mutate({
      data: {
        address: address,
        lat: selectedGeo.lat,
        lng: selectedGeo.lng,
        banId: selectedGeo.banId,
        inseeCode: selectedGeo.inseeCode,
        city: selectedGeo.city,
        postcode: selectedGeo.postcode,
        selectedParcels: selectedAssemblyParcels,
        banParcelles: selectedGeo.parcelles,
        title: address.split(',')[0]
      } as any
    });
  };

  return (
    <ProtectedLayout>
      <div className="max-w-3xl mx-auto mt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Nouvelle étude de faisabilité</h1>
          <p className="text-muted-foreground">Saisissez l'adresse de la parcelle à analyser. Notre IA s'occupe de récupérer les données cadastrales et le PLU.</p>
        </div>

        <Card className="p-6 md:p-8 shadow-lg border-border/60">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className={`rounded-full px-3 py-1 text-sm font-medium ${step === "selection" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                1. Sélection foncière
              </div>
              <div className={`rounded-full px-3 py-1 text-sm font-medium ${step === "confirmation" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                2. Confirmation
              </div>
            </div>

            <div className="space-y-3 relative">
              <Label htmlFor="address" className="text-base font-semibold">Adresse du projet</Label>
              <div className="relative">
                <Search className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="address"
                  placeholder="12 rue de la Paix, 75000 Paris..."
                  className="pl-12 h-14 text-lg bg-background shadow-inner"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setSelectedGeo(null);
                    setStep("selection");
                    setParcelPreview(null);
                    setParcelPreviewError(null);
                    setSelectedParcelIds([]);
                  }}
                  autoComplete="off"
                />
                {isGeocoding && (
                  <Loader2 className="absolute right-4 top-3.5 w-5 h-5 animate-spin text-primary" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {geoData?.results && geoData.results.length > 0 && !selectedGeo && (
                <div className="absolute top-full left-0 w-full mt-2 bg-popover rounded-xl shadow-xl border border-border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                  {geoData.results.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-muted flex items-start gap-3 transition-colors border-b border-border/50 last:border-0"
                      onClick={() => handleSelectAddress(item)}
                    >
                      <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{item.postcode} {item.city}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedGeo && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 animate-in fade-in">
                <MapPin className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Localisation confirmée</p>
                  <p className="text-sm opacity-90 mt-1">Coordonnées GPS identifiées : {selectedGeo.lat.toFixed(4)}, {selectedGeo.lng.toFixed(4)}</p>
                </div>
              </div>
            )}

            {selectedGeo && step === "selection" && (
              <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div>
                  <p className="font-semibold">Parcelle détectée avant lancement</p>
                  <p className="text-sm text-muted-foreground">
                    Le tunnel d'analyse repartira de cette sélection validée, sans refaire un ciblage libre de l'adresse.
                  </p>
                </div>

                {isLoadingParcelPreview && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Chargement du contexte cadastral...
                  </div>
                )}

                {parcelPreviewError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {parcelPreviewError}
                  </div>
                )}

                {!isLoadingParcelPreview && parcelPreview?.primaryParcel && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{parcelPreview.primaryParcel.parcelRef || `${parcelPreview.primaryParcel.section} ${parcelPreview.primaryParcel.numero}`}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Principale</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Surface cadastrale : {Math.round(parcelPreview.primaryParcel.contenanceM2 || 0)} m²
                      </p>
                      {parcelPreview.zoningPreview?.zoneCode && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Zone pré-détectée : {parcelPreview.zoningPreview.zoningLabel || `Zone ${parcelPreview.zoningPreview.zoneCode}`}
                        </p>
                      )}
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-1" />
                  </div>
                )}
              </div>
            )}

            {step === "selection" && (
              <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-3">
                <div className="flex items-start gap-3">
                  <Layers className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold">Option groupement foncier</p>
                    <p className="text-sm text-muted-foreground">
                      Activez-la uniquement si le projet porte sur plusieurs parcelles adjacentes. Le mode standard reste la voie recommandée dans la majorité des cas.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isLandAssembly}
                    onChange={(e) => setIsLandAssembly(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Projet sur un groupement foncier
                </label>
              </div>
            )}

            {isLandAssembly && selectedGeo && parcelPreview && step === "selection" && (
              <div className="rounded-xl border border-border bg-background p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">Parcelles adjacentes proposées</p>
                    <p className="text-sm text-muted-foreground">
                      La parcelle principale est toujours incluse. Ajoutez seulement les parcelles contiguës réellement intégrées au projet.
                    </p>
                  </div>
                  {isLoadingParcelPreview && <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />}
                </div>

                {!isLoadingParcelPreview && parcelPreview && (
                  <>
                    <div className="space-y-2">
                      {parcelOptions.map((parcel) => {
                        const checked = selectedParcelIds.includes(parcel.idu);
                        const isPrimary = parcel.idu === parcelPreview.primaryParcel.idu;
                        return (
                          <label
                            key={parcel.idu}
                            className={`flex items-center justify-between gap-4 rounded-xl border p-3 ${checked ? "border-primary bg-primary/5" : "border-border"}`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isPrimary}
                                onChange={() => toggleAdjacentParcel(parcel.idu)}
                                className="mt-1 h-4 w-4 rounded border-border"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{parcel.parcelRef || `${parcel.section} ${parcel.numero}`}</p>
                                  {isPrimary && <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Principale</span>}
                                  {!isPrimary && <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Adjacente</span>}
                                </div>
                                <p className="text-sm text-muted-foreground">{Math.round(parcel.contenanceM2 || 0)} m²</p>
                              </div>
                            </div>
                            {checked && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                          </label>
                        );
                      })}
                    </div>

                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                      <p className="text-sm font-semibold text-primary">
                        {selectedParcels.length} parcelle{selectedParcels.length > 1 ? "s" : ""} sélectionnée{selectedParcels.length > 1 ? "s" : ""}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Surface cadastrale cumulée : {Math.round(selectedParcelSurface)} m²
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/10 p-3">
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold">Carte de sélection du groupement foncier</p>
                          <p className="text-sm text-muted-foreground">
                            La parcelle principale reste bleue. Les parcelles adjacentes proposées apparaissent en orange, puis passent en vert quand elles sont sélectionnées.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                            Principale
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                            Adjacente proposée
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            Adjacente sélectionnée
                          </span>
                        </div>
                      </div>

                      <div className="h-80 overflow-hidden rounded-lg border border-border">
                        <MapContainer center={[selectedGeo.lat, selectedGeo.lng]} zoom={19} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
                          {parcelCandidatePolygons.length > 0 && (
                            <FitParcelPreviewBounds polygons={parcelCandidatePolygons} center={[selectedGeo.lat, selectedGeo.lng]} />
                          )}
                          <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                          {parcelCandidatePolygons.map((polygon) => {
                            const color = polygon.isPrimary ? "#2563eb" : polygon.isSelected ? "#10b981" : "#f59e0b";
                            const fillOpacity = polygon.isPrimary ? 0.28 : polygon.isSelected ? 0.22 : 0.14;
                            return (
                              <Polygon
                                key={polygon.idu}
                                positions={polygon.positions}
                                eventHandlers={polygon.isPrimary ? undefined : { click: () => toggleAdjacentParcel(polygon.idu) }}
                                pathOptions={{
                                  color,
                                  weight: polygon.isPrimary ? 3.5 : polygon.isSelected ? 3 : 2.5,
                                  fillColor: color,
                                  fillOpacity,
                                }}
                              >
                                <LeafletTooltip sticky direction="top">
                                  <div className="space-y-0.5 text-xs">
                                    <div className="font-semibold">{polygon.label}</div>
                                    <div>{Math.round(polygon.surfaceM2 || 0)} m²</div>
                                    <div>
                                      {polygon.isPrimary
                                        ? "Parcelle principale"
                                        : polygon.isSelected
                                          ? "Adjacente sélectionnée"
                                          : "Adjacente proposée"}
                                    </div>
                                    {!polygon.isPrimary && <div>Clique dans la liste pour ajouter ou retirer cette parcelle.</div>}
                                  </div>
                                </LeafletTooltip>
                              </Polygon>
                            );
                          })}
                        </MapContainer>
                      </div>

                      {parcelCandidatePolygons.length === 0 && (
                        <p className="mt-3 text-sm text-amber-700">
                          La carte est centrée sur l’adresse, mais la géométrie des parcelles proposées n’a pas encore pu être résolue. La liste reste utilisable pendant que nous rechargeons ce contexte.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {step === "confirmation" && selectedGeo && parcelPreview?.primaryParcel && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-5">
                <div>
                  <p className="font-semibold text-primary">Contexte verrouillé avant lancement</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    L'analyse repartira de cette adresse validée, de cette sélection parcellaire et de la zone détectée, sans nouveau ciblage libre.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-primary/15 bg-background p-4 space-y-3">
                    <p className="text-sm font-semibold">Données confirmées</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Adresse</span>
                        <span className="text-right font-medium">{selectedGeo.label}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Code INSEE</span>
                        <span className="font-medium">{selectedGeo.inseeCode || "Indisponible"}</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Référence foncière</span>
                        <span className="text-right font-medium">
                          {selectedParcels.map((parcel) => parcel.parcelRef || `${parcel.section} ${parcel.numero}`).join(" + ")}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Surface cumulée</span>
                        <span className="font-medium">{Math.round(selectedParcelSurface)} m²</span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">Zone détectée</span>
                        <span className="font-medium">
                          {parcelPreview.zoningPreview?.zoneCode ? `Zone ${parcelPreview.zoningPreview.zoneCode}` : "Indisponible"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-primary/15 bg-background p-4 space-y-3">
                    <p className="text-sm font-semibold">Niveau de fiabilité</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                        <span>Adresse BAN / IGN sélectionnée</span>
                        <span className="font-semibold">Confirmé</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                        <span>Parcelle{selectedParcels.length > 1 ? "s" : ""} retenue{selectedParcels.length > 1 ? "s" : ""}</span>
                        <span className="font-semibold">Confirmé</span>
                      </div>
                      <div className={`flex items-center justify-between gap-4 rounded-lg px-3 py-2 ${parcelPreview.zoningPreview?.zoneCode ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-border bg-muted/30 text-muted-foreground"}`}>
                        <span>Zone PLU pré-détectée</span>
                        <span className="font-semibold">{parcelPreview.zoningPreview?.zoneCode ? "À vérifier dans l'analyse" : "Indisponible"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-muted-foreground">
                        <span>Règles de constructibilité</span>
                        <span className="font-semibold">Calculées après lancement</span>
                      </div>
                    </div>
                  </div>
                </div>

                {parcelMapPolygons.length > 0 && (
                  <div className="rounded-xl border border-primary/15 bg-background p-3">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold">Carte des parcelles retenues</p>
                        <p className="text-sm text-muted-foreground">
                          Vérifiez visuellement le contour avant de lancer l'analyse.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Principale</span>
                        {isLandAssembly && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Adjacente</span>}
                      </div>
                    </div>
                    <div className="h-72 overflow-hidden rounded-lg border border-border">
                      <MapContainer center={[selectedGeo.lat, selectedGeo.lng]} zoom={19} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {parcelMapPolygons.map((polygon) => (
                          <Polygon
                            key={polygon.idu}
                            positions={polygon.positions}
                            pathOptions={{
                              color: polygon.isPrimary ? "#2563eb" : "#10b981",
                              weight: polygon.isPrimary ? 3 : 2,
                              fillOpacity: polygon.isPrimary ? 0.28 : 0.18,
                            }}
                          />
                        ))}
                      </MapContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-6 border-t border-border flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {step === "confirmation" && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 px-6"
                  onClick={() => setStep("selection")}
                >
                  Revenir à la sélection
                </Button>
              )}

              {step === "selection" ? (
                <Button
                  type="button"
                  size="lg"
                  className="h-12 px-8 shadow-md"
                  disabled={!canContinue}
                  onClick={() => setStep("confirmation")}
                >
                  Continuer vers la confirmation <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 px-8 shadow-md"
                  disabled={!canSubmit || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Lancement...</>
                  ) : (
                    <>Analyser ce foncier <ArrowRight className="w-5 h-5 ml-2" /></>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
