import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ClipboardCheck, MessageSquare, ArrowLeft, Search, Gavel, Landmark } from "lucide-react";
import { DossierDetailView } from "@/components/dossier/DossierDetailView";
import { Input } from "@/components/ui/input";

type Dossier = {
  id: string;
  title: string;
  typeProcedure: string;
  status: string;
  createdAt: string;
  commune: string;
  address: string;
  dossierNumber: string;
};

async function apiFetch(path: string) {
  const r = await fetch(path, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default function PortailABFPage({ params }: { params: { id?: string } }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const selectedId = params.id;
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) { setLocation("/login"); return; }
      const role = (user?.role as any);
      if (role !== "abf" && role !== "admin" && role !== "super_admin") {
        setLocation("/dashboard");
      }
    }
  }, [isLoading, isAuthenticated, user]);

  const { data: dossiersData, isLoading: loadingDossiers } = useQuery<{ dossiers: Dossier[] }>({
    queryKey: ["abf-dossiers"],
    queryFn: () => apiFetch("/api/mairie/dossiers"), // Filter is handled server-side by role
    enabled: !!isAuthenticated,
  });

  const filteredDossiers = (dossiersData?.dossiers || []).filter(d => 
    (d.title || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (d.commune || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.dossierNumber || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppShell className="bg-[#FDFCFB]" mainClassName="container mx-auto py-8 px-4 max-w-7xl w-full">
        {selectedId ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button variant="ghost" onClick={() => setLocation("/portail-abf")} className="gap-2 -ml-2 text-amber-700 hover:text-amber-900">
              <ArrowLeft className="w-4 h-4" /> Retour à l'expertise Patrimoniale
            </Button>
            <DossierDetailView dossierId={selectedId} userRole="abf" />
          </div>
        ) : (
          <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-700 rounded-2xl shadow-amber-200 shadow-lg">
                    <Landmark className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-3xl font-black tracking-tight text-slate-900">Expertise ABF</h1>
                </div>
                <p className="text-slate-500 font-medium max-w-md">
                   Interface dédiée aux Architectes des Bâtiments de France pour l'instruction des dossiers en périmètre protégé.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 invisible" />
                <Input 
                   placeholder="Rechercher un dossier SPR/MH..." 
                   className="w-[280px] h-11 bg-white border-amber-200 rounded-xl focus:border-amber-500"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <StatCard label="Avis à rendre" value={filteredDossiers.length.toString()} icon={Gavel} color="text-amber-700" />
               <StatCard label="SPR / MH" value={filteredDossiers.length.toString()} icon={Landmark} color="text-orange-700" />
               <StatCard label="Délais critiques" value="1" icon={ClipboardCheck} color="text-red-700" />
               <StatCard label="Échanges" value="8" icon={MessageSquare} color="text-blue-700" />
            </div>

            <Card className="border-none shadow-xl shadow-amber-900/5 rounded-3xl overflow-hidden border-t-4 border-t-amber-700">
               <CardHeader className="bg-white border-b border-amber-50 py-6">
                 <CardTitle className="text-sm font-black uppercase tracking-widest text-amber-700/60 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Dossiers nécessitant un avis patrimonial
                 </CardTitle>
               </CardHeader>
               <CardContent className="p-0">
                  {loadingDossiers ? (
                    <div className="p-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-amber-700" /></div>
                  ) : filteredDossiers.length === 0 ? (
                    <div className="p-20 text-center text-slate-400 font-medium">Aucun dossier en attente d'avis ABF.</div>
                  ) : (
                    <div className="divide-y divide-amber-50/50">
                      {filteredDossiers.map((d) => (
                        <div 
                          key={d.id} 
                          className="p-6 flex items-center justify-between hover:bg-amber-50/20 transition-colors cursor-pointer group"
                          onClick={() => setLocation(`/portail-abf/${d.id}`)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white border border-amber-100 rounded-2xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                               <Landmark className="w-5 h-5 text-amber-700/40 group-hover:text-amber-700 transition-colors" />
                            </div>
                            <div>
                               <p className="font-bold text-slate-900 group-hover:text-amber-700 transition-colors">{d.title}</p>
                               <p className="text-xs text-slate-500 font-medium">{d.address}, {d.commune}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                             <div className="text-right flex flex-col items-end gap-1">
                                <Badge className="text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 hover:bg-amber-200 border-none">{d.status}</Badge>
                                <p className="text-[10px] text-slate-400 font-bold">{d.dossierNumber}</p>
                             </div>
                             <div className="p-2 bg-amber-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowLeft className="w-4 h-4 text-amber-700 rotate-180" />
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
               </CardContent>
            </Card>
          </div>
        )}
    </AppShell>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <Card className="border-none shadow-md rounded-2xl overflow-hidden bg-white">
      <CardContent className="p-5 flex items-center gap-3">
        <div className={`p-3 rounded-xl bg-slate-50 ${color}`}>
           <Icon className="w-5 h-5" />
        </div>
        <div>
           <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">{label}</p>
           <p className={`text-xl font-black ${color}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
