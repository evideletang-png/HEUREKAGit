import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  LogOut,
  Map,
  MessageSquare,
  Plus,
  Send,
  Settings,
  User,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { DeadlineWidget } from "@/components/instruction/DeadlineWidget";
import { InstructionTimeline } from "@/components/instruction/InstructionTimeline";
import { LegalAlerts, type LegalAlert } from "@/components/instruction/LegalAlerts";

type DossierDetail = {
  id: string;
  title?: string | null;
  dossierNumber?: string | null;
  typeProcedure?: string | null;
  status?: string | null;
  userName?: string | null;
  address?: string | null;
  commune?: string | null;
  parcelRef?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, any> | null;
  instructionStatus?: string | null;
  dateDepot?: string | null;
  dateCompletude?: string | null;
  dateLimiteInstruction?: string | null;
  isTacite?: boolean | null;
  documents?: Array<{
    id: string;
    title?: string | null;
    fileName?: string | null;
    documentType?: string | null;
    status?: string | null;
    createdAt?: string | null;
  }>;
  messages?: Array<{ id: string | number; content?: string | null; createdAt?: string | null }>;
};

type InstructionPayload = {
  instruction: {
    instructionStatus?: string | null;
    dateDepot?: string | null;
    dateCompletude?: string | null;
    dateLimiteInstruction?: string | null;
    isTacite?: boolean;
    alerts?: LegalAlert[];
  };
  timeline: Array<{
    id: string;
    type?: string;
    description?: string;
    createdAt?: string;
    metadata?: Record<string, any> | null;
  }>;
};

async function apiFetch(path: string) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return response.json();
}

const demoDossier: DossierDetail = {
  id: "d2",
  dossierNumber: "PC-13120-26-00123",
  typeProcedure: "Permis de Construire",
  status: "En instruction",
  userName: "Jean Dupont",
  address: "12 avenue de la République, 13120 Gardanne",
  commune: "Gardanne",
  parcelRef: "CD-0118",
  createdAt: "2026-03-15",
  updatedAt: "2026-03-18",
  metadata: {
    zoneCode: "UB",
    surfacePlancher: 120,
    pluAnalysis: { zone: "UB" },
  },
  instructionStatus: "complet",
  dateDepot: "2026-03-15",
  dateCompletude: "2026-03-18",
  dateLimiteInstruction: "2026-05-18",
  isTacite: false,
  documents: [
    { id: "cerfa", title: "Formulaire CERFA", documentType: "cerfa" },
    { id: "plan", title: "Plan de masse", documentType: "plan" },
    { id: "notice", title: "Notice descriptive", documentType: "notice" },
  ],
};

function formatDate(value?: string | null) {
  if (!value) return "Non daté";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function statusClass(status?: string | null) {
  const normalized = (status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("refus") || normalized.includes("incomplet")) return "bg-red-100 text-red-700";
  if (normalized.includes("notifi") || normalized.includes("accepte")) return "bg-emerald-100 text-emerald-700";
  if (normalized.includes("instruction")) return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function MairieDetailShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const navItems = [
    { href: "/dashboard-mairie", label: "Tableau de bord", icon: FileText },
    { href: "/dashboard-mairie/messagerie", label: "Messagerie", icon: MessageSquare },
    { href: "/dashboard-mairie/statistiques", label: "Statistiques", icon: Map },
    { href: "/dashboard-mairie/parametres", label: "Paramètres", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#f7f7f6] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="flex min-h-20 items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard-mairie" className="flex min-w-[8.5rem] items-center gap-3 font-bold leading-tight text-slate-950">
            <span className="flex h-8 w-6 items-center justify-center rounded-full bg-slate-950 text-sm text-white">H</span>
            <span>HEUREKA -<br />Portail Mairie</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto px-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href;
              return (
                <Link key={item.href} href={item.href} className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors sm:px-4 ${active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"}`}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Button variant="ghost" size="icon" className="relative shrink-0 text-slate-500">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" />
          </Button>
          <div className="hidden max-w-40 text-sm leading-snug text-slate-500 md:block">
            {user?.name || "Sophie Laurent"} -<br />Service Urbanisme
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-slate-500" onClick={() => logout()}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-9 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function DossierMairieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"instruction" | "parcelle" | "historique">("instruction");

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !["mairie", "admin", "super_admin"].includes((user?.role as string) || ""))) {
      setLocation(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isAuthenticated, isLoading, setLocation, user]);

  const query = useQuery<DossierDetail>({
    queryKey: ["mairie-full-dossier", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id || "")}`),
    enabled: !!id && !id.startsWith("demo-") && id !== "d2",
  });
  const instructionQuery = useQuery<InstructionPayload>({
    queryKey: ["mairie-dossier-instruction", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id || "")}/instruction`),
    enabled: !!id && !id.startsWith("demo-") && id !== "d2",
  });

  const dossier = query.data || demoDossier;
  const instruction = instructionQuery.data?.instruction || {
    instructionStatus: dossier.instructionStatus || demoDossier.instructionStatus,
    dateDepot: dossier.dateDepot || dossier.createdAt || demoDossier.dateDepot,
    dateCompletude: dossier.dateCompletude || demoDossier.dateCompletude,
    dateLimiteInstruction: dossier.dateLimiteInstruction || demoDossier.dateLimiteInstruction,
    isTacite: !!dossier.isTacite,
    alerts: [],
  };
  const instructionTimeline = instructionQuery.data?.timeline || [
    { id: "depot", type: "depot", description: "Dossier déposé", createdAt: instruction.dateDepot || demoDossier.dateDepot },
    { id: "completude", type: "piece_recue", description: "Dossier complet", createdAt: instruction.dateCompletude || demoDossier.dateCompletude },
  ];
  const zone = dossier.metadata?.zoneCode || dossier.metadata?.zone_code || dossier.metadata?.pluAnalysis?.zone || "UB";
  const surface = dossier.metadata?.surfacePlancher || dossier.metadata?.surface_plancher || dossier.metadata?.requested_surface_m2 || 120;
  const documents = dossier.documents?.length ? dossier.documents : demoDossier.documents || [];

  const projectFacts = useMemo(() => [
    ["Type de demande", dossier.typeProcedure || "Permis de Construire"],
    ["Date de dépôt", formatDate(dossier.createdAt || demoDossier.createdAt)],
    ["Surface de plancher", `${surface} m²`],
    ["Zonage PLU", `Zone ${zone}`],
  ], [dossier, surface, zone]);

  if (isLoading || query.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f6] text-slate-500">Chargement du dossier...</div>;
  }

  return (
    <MairieDetailShell>
      <div className="mb-8">
        <Link href="/dashboard-mairie" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base text-slate-500">Dossier n° {dossier.dossierNumber || dossier.id}</p>
              <h1 className="mt-2 max-w-2xl text-4xl font-bold tracking-tight">{dossier.typeProcedure || dossier.title || "Dossier urbanisme"}</h1>
              <p className="mt-4 text-lg text-slate-600">Demandeur : {dossier.userName || "Demandeur"}</p>
              <p className="mt-1 max-w-xl text-lg text-slate-600">{dossier.address || "Adresse non renseignée"}</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-6 py-4 text-lg font-bold ${statusClass(dossier.status)}`}>
              <Clock3 className="h-5 w-5" />
              {dossier.status || "En instruction"}
            </span>
          </div>

          <InfoCard title="Actions">
            <div className="grid gap-3 sm:grid-cols-3">
              <Button className="h-20 rounded-lg bg-green-600 text-base font-bold text-white hover:bg-green-700">Accepter le dossier</Button>
              <Button className="h-20 rounded-lg bg-red-600 text-base font-bold text-white hover:bg-red-700">Refuser le dossier</Button>
              <Button className="h-20 rounded-lg bg-amber-600 text-base font-bold text-white hover:bg-amber-700">Demander des pièces</Button>
            </div>
          </InfoCard>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <nav className="grid sm:grid-cols-3">
              {[
                ["instruction", "Instruction du dossier", FileText],
                ["parcelle", "Analyse de parcelle", Map],
                ["historique", "Historique & Messages", MessageSquare],
              ].map(([key, label, Icon]) => (
                <button
                  key={key as string}
                  type="button"
                  onClick={() => setTab(key as any)}
                  className={`flex min-h-16 items-center justify-center gap-2 border-b-2 px-4 text-sm font-bold ${tab === key ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label as string}
                </button>
              ))}
            </nav>
          </div>

          {tab === "instruction" && (
            <div className="grid gap-6 xl:grid-cols-2">
              <InfoCard title="Instruction">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                    Statut : {instruction.instructionStatus || "depose"}
                  </span>
                  <span className={`rounded-full px-4 py-2 text-sm font-bold ${instruction.isTacite ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {instruction.isTacite ? "Risque de décision tacite" : "Instruction suivie"}
                  </span>
                </div>
                <InstructionTimeline
                  events={instructionTimeline}
                  dates={[
                    { label: "Dépôt", value: instruction.dateDepot },
                    { label: "Complétude", value: instruction.dateCompletude },
                    { label: "Limite", value: instruction.dateLimiteInstruction },
                  ]}
                />
              </InfoCard>

              <InfoCard title="Délais & Alertes">
                <div className="space-y-5">
                  <DeadlineWidget deadline={instruction.dateLimiteInstruction} isTacite={instruction.isTacite} />
                  <LegalAlerts alerts={instruction.alerts || []} />
                </div>
              </InfoCard>

              <InfoCard title="Informations du projet">
                <div className="grid gap-5 sm:grid-cols-2">
                  {projectFacts.map(([label, value]) => (
                    <div key={label}>
                      <p className="text-sm font-medium text-slate-500">{label}</p>
                      <p className="mt-1 text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Documents">
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="font-semibold">{doc.title || doc.fileName || doc.documentType || "Document"}</span>
                      <Button variant="ghost" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Avis des services">
                <div className="mb-4">
                  <Button variant="outline" className="gap-2 rounded-lg border-slate-300">
                    <Plus className="h-4 w-4" />
                    Consulter un autre service
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg bg-emerald-50 p-4 text-emerald-950">
                    <p className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Métropole - Avis favorable</p>
                    <p className="mt-2 text-sm">Reçu le 20 mars 2026</p>
                    <p className="mt-2 text-sm italic text-emerald-800">Motif : Surface &gt; 40m² en zone urbaine</p>
                    <p className="mt-2">Le projet respecte les règles d'urbanisme applicables.</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-4 text-amber-950">
                    <p className="flex items-center gap-2 text-lg font-bold"><Clock3 className="h-5 w-5 text-amber-600" /> ABF - En attente</p>
                    <p className="mt-2 text-sm">Demandé le 18 mars 2026</p>
                    <p className="mt-2 text-sm italic text-amber-800">Motif : Périmètre de protection monument historique</p>
                    <p className="mt-2">Avis de l'Architecte des Bâtiments de France en attente.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <strong>Consultations automatiques :</strong> Le système détermine automatiquement les services à consulter selon les caractéristiques du projet. Vous pouvez ajouter manuellement d'autres services si nécessaire.
                  </div>
                </div>
              </InfoCard>
            </div>
          )}

          {tab === "parcelle" && (
            <InfoCard title="Analyse de parcelle">
              <div className="grid gap-5 sm:grid-cols-3">
                <div><p className="text-sm text-slate-500">Parcelle</p><p className="mt-1 text-lg font-semibold">{dossier.parcelRef || "CD-0118"}</p></div>
                <div><p className="text-sm text-slate-500">Zonage</p><p className="mt-1 text-lg font-semibold">Zone {zone}</p></div>
                <div><p className="text-sm text-slate-500">Commune</p><p className="mt-1 text-lg font-semibold">{dossier.commune || "Gardanne"}</p></div>
              </div>
              <div className="mt-6 flex h-72 items-center justify-center rounded-lg bg-slate-100 text-slate-500">Carte parcellaire à venir</div>
            </InfoCard>
          )}

          {tab === "historique" && (
            <div className="grid gap-6 xl:grid-cols-2">
              <InfoCard title="Historique">
                <div className="space-y-5">
                  <div className="flex gap-3"><span className="mt-2 h-3 w-3 rounded-full bg-green-700" /><div><p className="font-bold">Dossier complet</p><p className="text-slate-500">18 mars 2026</p></div></div>
                  <div className="flex gap-3"><span className="mt-2 h-3 w-3 rounded-full bg-green-700" /><div><p className="font-bold">Dossier déposé</p><p className="text-slate-500">{formatDate(dossier.createdAt || demoDossier.createdAt)}</p></div></div>
                </div>
              </InfoCard>
              <InfoCard title="Contacter le demandeur">
                <Textarea placeholder="Votre message..." className="min-h-32 rounded-lg border-slate-300" />
                <Button className="mt-4 gap-2 rounded-lg bg-slate-950 text-white hover:bg-slate-800">
                  <Send className="h-4 w-4" />
                  Envoyer
                </Button>
              </InfoCard>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <InfoCard title="Délais">
            <div className="rounded-lg bg-blue-50 p-5 text-blue-900">
              <p className="text-sm font-medium">Délai restant</p>
              <p className="mt-2 text-4xl font-bold">42 jours</p>
            </div>
            <p className="mt-4 text-sm text-slate-500">Délai d'instruction de 2 mois à compter de la réception du dossier complet.</p>
          </InfoCard>
          <InfoCard title="Points d'attention">
            <div className="space-y-3">
              <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><Clock3 className="h-4 w-4 shrink-0" /> Avis ABF en attente.</p>
              <p className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"><XCircle className="h-4 w-4 shrink-0" /> Vérifier les pièces complémentaires si le dossier devient incomplet.</p>
            </div>
          </InfoCard>
        </aside>
      </div>
    </MairieDetailShell>
  );
}
