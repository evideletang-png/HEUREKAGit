import { useState } from "react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useCreateAnalysis, useGeocodeAddress, getGeocodeAddressQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search, Loader2, ArrowRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";

export default function NewAnalysisPage() {
  const [address, setAddress] = useState("");
  const debouncedAddress = useDebounce(address, 400);
  const [selectedGeo, setSelectedGeo] = useState<any>(null);
  
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
      onError: () => {
        toast({ variant: "destructive", title: "Erreur", description: "Impossible de créer l'analyse." });
      }
    }
  });

  const handleSelectAddress = (item: any) => {
    setAddress(item.label);
    setSelectedGeo(item);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    createMutation.mutate({
      data: {
        address: address,
        lat: selectedGeo?.lat,
        lng: selectedGeo?.lng,
        title: address.split(',')[0] // Use first part of address as default title
      }
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
                    setSelectedGeo(null); // Reset selection if typing again
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

            <div className="pt-6 border-t border-border flex justify-end">
              <Button 
                type="submit" 
                size="lg" 
                className="h-12 px-8 shadow-md"
                disabled={!address || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Lancement...</>
                ) : (
                  <>Analyser ce foncier <ArrowRight className="w-5 h-5 ml-2" /></>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
