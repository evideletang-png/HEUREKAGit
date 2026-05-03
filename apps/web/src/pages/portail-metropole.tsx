import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Building2, ClipboardCheck, MessageSquare, ArrowLeft, Search, Filter } from "lucide-react";
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

export default function PortailMetropolePage({ params }: { params: { id?: string } }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const selectedId = params.id;
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) { setLocation("/login"); return; }
      const role = (user?.role as any);
      if (role !== "metropole" && role !== "admin" && role !== "super_admin") {
        setLocation("/dashboard");
      }
    }
  }, [isLoading, isAuthenticated, user]);

  const { data: dossiersData, isLoading: loadingDossiers } = useQuery<{ dossiers: Dossier[] }>({
    queryKey: ["metropole-dossiers"],
    queryFn: () => apiFetch("/api/mairie/dossiers"),
    enabled: !!isAuthenticated,
  });

  const filteredDossiers = (dossiersData?.dossiers || []).filter(d => 
    (d.title || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
    (d.commune || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.dossierNumber || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppShell className="bg-[#F8FAFC]" mainClassName="container mx-auto py-8 px-4 max-w-7xl w-full">
        {selectedId ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button variant="ghost" onClick={() => setLocation("/portail-metropole")} className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Retour au Dashboard Métropolitain
            </Button>
            <DossierDetailView dossierId={selectedId} userRole="metropole" />
          </div>
        ) : (
          <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-600 rounded-2xl shadow-indigo-200 shadow-lg">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-3xl font-black tracking-tight text-slate-900">Portail Métropolitain</h1>
                </div>
                <p className="text-slate-500 font-medium max-w-md">
                   Interface d'instruction pour les dossiers transmis par les communes de la Métropole.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Rechercher un dossier..." 
                    className="pl-10 w-[280px] h-11 bg-white border-slate-200 rounded-xl"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" className="h-11 gap-2 rounded-xl border-slate-200">
                  <Filter className="w-4 h-4" /> Filtres
                </Button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <StatCard label="Dossiers à instruire" value={filteredDossiers.length.toString()} icon={ClipboardCheck} color="text-indigo-600" />
               <StatCard label="En attente ABF" value="2" icon={MessageSquare} color="text-amber-600" />
               <StatCard label="Décisions rendues ce mois" value="14" icon={Building2} color="text-emerald-600" />
            </div>

            <Card className="border-none shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden">
               <CardHeader className="bg-white border-b border-slate-50 py-6">
                 <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Dossiers Transmis</CardTitle>
               </CardHeader>
               <CardContent className="p-0">
                  {loadingDossiers ? (
                    <div className="p-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>
                  ) : filteredDossiers.length === 0 ? (
                    <div className="p-20 text-center text-slate-400 font-medium">Aucun dossier trouvé.</div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {filteredDossiers.map((d) => (
                        <div 
                          key={d.id} 
                          className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors cursor-pointer group"
                          onClick={() => setLocation(`/portail-metropole/${d.id}`)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                               <Building2 className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                            </div>
                            <div>
                               <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{d.title}</p>
                               <p className="text-xs text-slate-500 font-medium">{d.address}, {d.commune}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                             <div className="text-right flex flex-col items-end gap-1">
                                <Badge className="text-[9px] font-black uppercase tracking-widest" variant="secondary">{d.status}</Badge>
                                <p className="text-[10px] text-slate-400 font-bold">{d.dossierNumber}</p>
                             </div>
                             <div className="p-2 bg-slate-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowLeft className="w-4 h-4 text-slate-400 rotate-180" />
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
    <Card className="border-none shadow-lg shadow-slate-200/40 rounded-3xl overflow-hidden">
      <CardContent className="p-6 flex items-center gap-4">
        <div className={`p-4 rounded-2xl bg-white shadow-sm border border-slate-50 ${color}`}>
           <Icon className="w-6 h-6" />
        </div>
        <div>
           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
           <p className={`text-2xl font-black ${color}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
