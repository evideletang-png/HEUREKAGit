import { Link, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Download,
  FileText,
  Mail,
  MoreVertical,
  Plus,
  Search,
  Send,
  Settings,
  X,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { MairieNavigation } from "@/components/layout/MairieNavigation";

type MairieDossier = {
  id: string;
  title?: string | null;
  dossierNumber?: string | null;
  userName?: string | null;
  address?: string | null;
  commune?: string | null;
  typeProcedure?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, any> | null;
  parcelRef?: string | null;
  documentCount?: number | null;
  anomalyCount?: number | null;
  criticalityScore?: number | null;
};

type DashboardStatusConfig = {
  key: string;
  label: string;
  active: boolean;
  color?: string;
};

type MairieSettings = {
  citizenPortalTownHallName?: string;
  citizenPortalEmail?: string;
  formulas?: {
    dashboardStatuses?: DashboardStatusConfig[];
    [key: string]: any;
  } | null;
  [key: string]: any;
};

async function apiFetch(path: string) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return response.json();
}

const demoRows: MairieDossier[] = [
  { id: "demo-1", dossierNumber: "DP-13120-26-00045", typeProcedure: "Déclaration Préalable", address: "5 rue des Oliviers", userName: "Marie Martin", status: "Pièces manquantes", updatedAt: "2026-04-26", createdAt: "2026-03-20", parcelRef: "CD-0118", metadata: { zoneCode: "UB" }, anomalyCount: 2 },
  { id: "demo-2", dossierNumber: "CU-13120-26-00012", typeProcedure: "Certificat d'Urbanisme", address: "7 impasse Mistral", userName: "Anne Roche", status: "À notifier", updatedAt: "2026-04-10", parcelRef: "AB-2041" },
  { id: "demo-3", dossierNumber: "CU-13120-26-00023", typeProcedure: "Certificat d'Urbanisme", address: "45 route de Marseille", userName: "Patrick Vincent", status: "Notifié au demandeur", updatedAt: "2026-03-15", parcelRef: "AC-0932" },
  { id: "demo-4", dossierNumber: "DP-13120-26-00067", typeProcedure: "Déclaration Préalable", address: "22 rue des Lilas", userName: "François Garnier", status: "Consultation interne", updatedAt: "2026-05-01", documentCount: 4, parcelRef: "BD-4430", metadata: { zoneCode: "UA" } },
  { id: "demo-5", dossierNumber: "PC-13120-26-00123", typeProcedure: "Permis de Construire", address: "12 avenue de la République", userName: "Jean Dupont", status: "En instruction", updatedAt: "2026-05-11", documentCount: 6, parcelRef: "AA-0112" },
  { id: "demo-6", dossierNumber: "PC-13120-26-00098", typeProcedure: "Permis de Construire", address: "28 chemin du Lac", userName: "Lucie Bernard", status: "En instruction", updatedAt: "2026-05-27", documentCount: 5, parcelRef: "AD-7812" },
  { id: "demo-7", dossierNumber: "PC-13120-26-00089", typeProcedure: "Permis de Construire", address: "14 boulevard Gambetta", userName: "SCI Provence", status: "En instruction", updatedAt: "2026-06-13", documentCount: 5, parcelRef: "BC-1109" },
  { id: "demo-8", dossierNumber: "PC-13120-26-00134", typeProcedure: "Permis de Construire", address: "3 place de la Mairie", userName: "Sylvie Moreau", status: "Déposé", updatedAt: "2026-06-25", parcelRef: "AE-5540" },
];

const defaultDashboardStatuses: DashboardStatusConfig[] = [
  { key: "depose", label: "Déposé", active: true },
  { key: "instruction", label: "En instruction", active: true },
  { key: "pieces_manquantes", label: "Pièces manquantes", active: true },
  { key: "consultation", label: "Consultation interne", active: true },
  { key: "notifier", label: "À notifier", active: true },
  { key: "notifie", label: "Notifié au demandeur", active: true },
];

const conversations = [
  { name: "Jean Dupont", ref: "PC-13120-26-00123", preview: "Merci pour votre retour. Je vais compléter les pièces manquantes.", time: "Il y a 2h" },
  { name: "Marie Martin", ref: "DP-13120-26-00045", preview: "Bonjour, avez-vous reçu les documents complémentaires ?", time: "Hier" },
  { name: "Pierre Dubois", ref: "CU-13120-26-00078", preview: "Je vous confirme la réception de l'avis favorable.", time: "2 mars" },
];

function formatDate(value?: string | null) {
  if (!value) return "Non daté";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function normalizeText(value?: string | null) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseCommunes(raw: unknown) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function deadlineInfo(row: MairieDossier, index = 0) {
  const baseDate = row.updatedAt || row.createdAt;
  if (row.status && normalizeText(row.status).includes("manqu")) {
    return { label: "J+3 retard", className: "text-red-600", date: baseDate || "2026-04-26" };
  }
  if (normalizeText(row.status).includes("notifi")) {
    return { label: "J-0", className: "text-amber-600", date: baseDate };
  }
  const days = Math.max(2, 12 + index * 8);
  return { label: `J-${days}`, className: days > 30 ? "text-emerald-700" : "text-amber-600", date: baseDate };
}

function statusStyle(status?: string | null) {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("manqu") || normalized.includes("retard")) return "bg-amber-100 text-amber-800";
  if (normalized.includes("notifi")) return "bg-emerald-100 text-emerald-800";
  if (normalized.includes("consult")) return "bg-indigo-100 text-indigo-800";
  if (normalized.includes("instruction")) return "bg-blue-100 text-blue-800";
  return "bg-stone-100 text-stone-700";
}

function statusMatches(rowStatus: string | null | undefined, configuredStatus: DashboardStatusConfig) {
  return normalizeText(rowStatus).includes(normalizeText(configuredStatus.label));
}

function getDossierUrl(row: MairieDossier) {
  return row.id.startsWith("demo-") ? "/dossier/d2" : `/dossier/${encodeURIComponent(row.id)}`;
}

function MairieShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f6] text-slate-950">
      <main className="mx-auto w-full max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
        <MairieNavigation />
        {children}
      </main>
    </div>
  );
}

function StatCard({ label, value, delta, icon: Icon, tone = "blue", active = false, onClick }: { label: string; value: string; delta: string; icon: typeof FileText; tone?: "blue" | "amber" | "emerald" | "violet"; active?: boolean; onClick?: () => void }) {
  const colors = {
    blue: "text-blue-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    violet: "text-violet-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md ${
        active ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <Icon className={`h-5 w-5 ${colors[tone]}`} />
      </div>
      <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm font-medium text-emerald-700">{delta}</p>
    </button>
  );
}

function DossierPreview({ dossier, onClose }: { dossier: MairieDossier | null; onClose: () => void }) {
  if (!dossier) return null;

  const deadline = deadlineInfo(dossier, 0);
  const zone = dossier.metadata?.zoneCode || dossier.metadata?.zone_code || dossier.metadata?.pluAnalysis?.zone || "Zone non renseignée";
  const hasPlu = !!dossier.documentCount || !!dossier.metadata?.pluAnalysis;
  const timeline = [
    { label: "Dépôt", date: formatDate(dossier.createdAt || "2026-03-20"), done: true },
    { label: "Complétude", date: formatDate(dossier.updatedAt || "2026-03-22"), done: true },
    { label: "Instruction en cours", date: "depuis 7 jours", current: true },
    { label: "Décision", date: `avant ${formatDate(deadline.date)}`, done: false },
  ];

  const openDossier = () => {
    window.open(getDossierUrl(dossier), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-50 p-4 sm:p-6">
      <aside
        className="pointer-events-auto ml-auto flex max-h-[calc(100vh-3rem)] w-full max-w-[30rem] flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{dossier.dossierNumber || dossier.title || "Dossier urbanisme"}</h2>
              <p className="mt-1 text-lg font-semibold text-slate-500">{dossier.typeProcedure || "Procédure urbanisme"}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-950" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <span className={`inline-flex rounded-lg px-3 py-2 text-sm font-medium ${statusStyle(dossier.status)}`}>
            ● {dossier.status || "Déposé"}
          </span>

          <div className="mt-7 space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Demandeur</p>
              <p className="mt-2 text-lg font-medium">{dossier.userName || "Demandeur"} · {dossier.address || "Adresse non renseignée"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Parcelle</p>
              <p className="mt-2 text-lg font-medium">{dossier.parcelRef || dossier.metadata?.parcel_ref || "Parcelle non renseignée"} · {zone}</p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Échéance légale</p>
              <p className="mt-2 text-lg font-medium">{formatDate(deadline.date)} · <span className={deadline.className}>{deadline.label}</span></p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-base font-medium text-slate-500">
            {hasPlu ? "Analyse PLU disponible" : "Pas d'analyse PLU disponible"}
          </div>

          <div className="mt-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-500">Frise</p>
            <div className="space-y-4">
              {timeline.map((item) => (
                <div key={item.label} className="flex gap-4">
                  <span className={`mt-2 h-3 w-3 shrink-0 rounded-full ${item.current ? "bg-blue-700" : item.done ? "bg-green-700" : "bg-stone-300"}`} />
                  <div>
                    <p className={`text-base font-semibold ${item.current ? "text-slate-700" : item.done ? "text-slate-700" : "text-stone-500"}`}>{item.label}</p>
                    <p className="text-sm font-medium text-slate-400">{item.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto flex gap-3 border-t border-slate-100 p-6">
          <Button className="h-12 flex-1 rounded-xl bg-slate-900 text-base font-bold text-white hover:bg-slate-800" onClick={openDossier}>
            Ouvrir le dossier
          </Button>
          <Button variant="outline" size="icon" className="h-12 w-16 rounded-xl border-slate-300">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </aside>
    </div>
  );
}

function DashboardView() {
  const { user } = useAuth();
  const assignedCommunes = useMemo(() => parseCommunes((user as any)?.communes), [user]);
  const selectedCommune = assignedCommunes[0] || "all";
  const [activeMetric, setActiveMetric] = useState<"all" | "pending" | "processed" | "delay">("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [previewDossier, setPreviewDossier] = useState<MairieDossier | null>(null);

  const { data, isLoading } = useQuery<{ dossiers: MairieDossier[] }>({
    queryKey: ["mairie-dashboard-dossiers", selectedCommune],
    queryFn: () => apiFetch(`/api/mairie/dossiers${selectedCommune !== "all" ? `?commune=${encodeURIComponent(selectedCommune)}` : ""}`),
  });
  const { data: settingsData } = useQuery<{ settings: MairieSettings | null }>({
    queryKey: ["mairie-dashboard-settings", selectedCommune],
    queryFn: () => apiFetch(`/api/mairie/settings/${encodeURIComponent(selectedCommune)}`),
    enabled: selectedCommune !== "all",
  });

  const rows = data?.dossiers?.length ? data.dossiers : demoRows;
  const activeStatuses = useMemo(() => {
    const configured = settingsData?.settings?.formulas?.dashboardStatuses;
    const base = configured?.length ? configured : defaultDashboardStatuses;
    const presentLabels = Array.from(new Set(rows.map((row) => row.status).filter(Boolean).map(String)));
    const merged = [...base];
    presentLabels.forEach((label) => {
      if (!merged.some((item) => normalizeText(item.label) === normalizeText(label))) {
        merged.push({ key: normalizeText(label).replace(/\s+/g, "_"), label, active: true });
      }
    });
    return merged.filter((status) => status.active);
  }, [rows, settingsData]);

  const agents = useMemo(() => Array.from(new Set(rows.map((_, index) => index % 2 ? "S. Leroy" : "J. Dubois"))), [rows]);
  const types = useMemo(() => Array.from(new Set(rows.map((row) => row.typeProcedure || "PC"))), [rows]);
  const pendingRows = rows.filter((row) => !normalizeText(row.status).includes("notifi"));
  const processedRows = rows.filter((row) => normalizeText(row.status).includes("notifi"));

  const filteredRows = useMemo(() => rows.filter((row, index) => {
    if (activeMetric === "pending" && !pendingRows.includes(row)) return false;
    if (activeMetric === "processed" && !processedRows.includes(row)) return false;
    if (activeMetric === "delay" && !deadlineInfo(row, index).label.includes("+") && !deadlineInfo(row, index).label.includes("J-0")) return false;
    if (statusFilter !== "all" && normalizeText(row.status) !== normalizeText(statusFilter)) return false;
    if (typeFilter !== "all" && normalizeText(row.typeProcedure) !== normalizeText(typeFilter)) return false;
    const agent = index % 2 ? "S. Leroy" : "J. Dubois";
    if (agentFilter !== "all" && agent !== agentFilter) return false;

    const haystack = [
      row.dossierNumber,
      row.title,
      row.userName,
      row.address,
      row.commune,
      row.parcelRef,
      row.metadata?.parcel_ref,
      row.status,
      row.typeProcedure,
    ].map((item) => normalizeText(String(item || ""))).join(" ");
    return !search || haystack.includes(normalizeText(search));
  }), [activeMetric, agentFilter, pendingRows, processedRows, rows, search, statusFilter, typeFilter]);

  return (
    <MairieShell>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="mt-2 text-base text-slate-600">Gestion des demandes d'urbanisme</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 rounded-lg border-slate-300 bg-white">
            <Download className="h-4 w-4" /> Exporter
          </Button>
          <Button asChild className="gap-2 rounded-lg bg-slate-950 text-white hover:bg-slate-800">
            <Link href="/conformite"><Plus className="h-4 w-4" /> Nouveau dossier</Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Dossiers en cours" value={String(rows.length || 24)} delta="+3 cette semaine" icon={Clock3} active={activeMetric === "all"} onClick={() => setActiveMetric("all")} />
        <StatCard label="En attente" value={String(pendingRows.length || 8)} delta="2 en retard" icon={Clock3} tone="amber" active={activeMetric === "pending"} onClick={() => setActiveMetric("pending")} />
        <StatCard label="Traités ce mois" value={String(processedRows.length || 42)} delta="+12% vs M-1" icon={CheckCircle2} tone="emerald" active={activeMetric === "processed"} onClick={() => setActiveMetric("processed")} />
        <StatCard label="Délai moyen" value="38j" delta="-5j sur 30j" icon={TrendingUp} tone="violet" active={activeMetric === "delay"} onClick={() => setActiveMetric("delay")} />
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-11 rounded-lg border-slate-200 pl-9"
              placeholder="Rechercher (numéro, nom, adresse, parcelle...)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950">
            <option value="all">Statut</option>
            {activeStatuses.map((status) => <option key={status.key} value={status.label}>{status.label}</option>)}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950">
            <option value="all">Type</option>
            {types.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950">
            <option value="all">Agent</option>
            {agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>{isLoading ? "Chargement..." : `${filteredRows.length} dossier${filteredRows.length > 1 ? "s" : ""}`}</span>
          <span>1-{filteredRows.length} sur {rows.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3"><Checkbox /></th>
                <th className="px-3 py-3">Numéro</th>
                <th className="px-3 py-3">Demandeur</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Échéance ↑</th>
                <th className="px-3 py-3">Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row, index) => {
                const deadline = deadlineInfo(row, index);
                return (
                <tr key={row.id} className={`cursor-pointer hover:bg-slate-50 ${row.anomalyCount ? "border-l-4 border-l-red-400 bg-amber-50/20" : ""}`} onClick={() => setPreviewDossier(row)}>
                  <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}><Checkbox /></td>
                  <td className="px-3 py-4">
                    <button type="button" className="text-left font-bold leading-tight text-slate-950 hover:underline">
                      {row.dossierNumber || row.title || "Dossier urbanisme"}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">{row.typeProcedure || "PC"} · {row.address || row.commune || "Adresse à compléter"}</p>
                    {!!row.documentCount && <span className="mt-2 inline-flex rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">PLU analysé</span>}
                  </td>
                  <td className="px-3 py-4 font-medium">{row.userName || "Demandeur"}</td>
                  <td className="px-3 py-4"><span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${statusStyle(row.status)}`}>{row.status || "Déposé"}</span></td>
                  <td className="px-3 py-4">
                    <p className={`font-semibold ${deadline.className}`}>{deadline.label}</p>
                    <p className="text-xs text-slate-400">{formatDate(deadline.date)}</p>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index % 2 ? "SL" : "JD"}</span>
                      <span className="text-xs font-medium">{index % 2 ? "S. Leroy" : "J. Dubois"}</span>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          {filteredRows.length === 0 && (
            <div className="py-12 text-center text-sm font-medium text-slate-500">
              Aucun dossier ne correspond aux critères.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>↵ naviguer · ↩ ouvrir · ⌘K recherche</span>
          <span>‹ 1 / 1 ›</span>
        </div>
      </div>
      <DossierPreview dossier={previewDossier} onClose={() => setPreviewDossier(null)} />
    </MairieShell>
  );
}

function MessagerieView() {
  const [selectedConversation] = useState(conversations[0]);
  return (
    <MairieShell>
      <h1 className="text-3xl font-bold tracking-tight">Messagerie</h1>
      <p className="mt-2 text-base text-slate-600">Échangez avec les demandeurs</p>
      <div className="my-8 border-t border-slate-200" />
      <div className="grid min-h-[42rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[22rem_1fr]">
        <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="p-4">
            <Input className="rounded-lg border-slate-200" placeholder="Rechercher une conversation..." />
          </div>
          <div className="divide-y divide-slate-100">
            {conversations.map((conversation, index) => (
              <button key={conversation.ref} className={`w-full p-4 text-left ${index === 0 ? "bg-slate-50" : "bg-white hover:bg-slate-50"}`}>
                <p className="font-bold">{conversation.name}</p>
                <p className="text-sm text-slate-500">{conversation.ref}</p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{conversation.preview}</p>
                <p className="mt-2 text-xs text-slate-400">{conversation.time}</p>
              </button>
            ))}
          </div>
        </aside>
        <section>
          <div className="flex items-center gap-3 border-b border-slate-200 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100"><User className="h-5 w-5 text-slate-500" /></span>
            <div>
              <p className="font-bold">{selectedConversation.name}</p>
              <p className="text-sm text-slate-500">{selectedConversation.ref}</p>
            </div>
          </div>
          <div className="space-y-5 p-5">
            <p className="max-w-sm rounded-lg bg-slate-100 p-4">Bonjour, j'ai une question concernant mon dossier de permis de construire.</p>
            <p className="ml-auto max-w-sm rounded-lg bg-slate-950 p-4 text-white">Bonjour Monsieur Dupont, je suis à votre disposition. Quelle est votre question ?</p>
            <p className="max-w-sm rounded-lg bg-slate-100 p-4">Il me manque le plan de façade. Puis-je le transmettre par ce canal ?</p>
            <p className="ml-auto max-w-sm rounded-lg bg-slate-950 p-4 text-white">Oui, vous pouvez joindre le document ici ou via votre espace personnel.</p>
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-4">
            <Input className="rounded-lg border-slate-200" placeholder="Votre message..." />
            <Button className="gap-2 rounded-lg bg-slate-950"><Send className="h-4 w-4" /> Envoyer</Button>
          </div>
        </section>
      </div>
    </MairieShell>
  );
}

function StatistiquesView() {
  return (
    <MairieShell>
      <h1 className="text-3xl font-bold tracking-tight">Statistiques</h1>
      <p className="mt-2 text-base text-slate-600">Analyse des performances du service urbanisme</p>
      <div className="mt-9 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Dossiers traités" value="156" delta="+12% vs mois dernier" icon={FileText} />
        <StatCard label="Délai moyen" value="38j" delta="-5 jours" icon={Clock3} tone="violet" />
        <StatCard label="Taux d'acceptation" value="78%" delta="+3%" icon={CheckCircle2} tone="emerald" />
        <StatCard label="Demandeurs actifs" value="324" delta="+8%" icon={Users} tone="amber" />
        {["Évolution mensuelle", "Répartition par type"].map((title) => (
          <section key={title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
            <h2 className="text-xl font-bold">{title}</h2>
            <div className="mt-6 flex h-64 items-center justify-center rounded-lg bg-slate-50 text-slate-500">Graphique à venir</div>
          </section>
        ))}
      </div>
    </MairieShell>
  );
}

function ParametresView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const assignedCommunes = useMemo(() => parseCommunes((user as any)?.communes), [user]);
  const selectedCommune = assignedCommunes[0] || "all";
  const { data: settingsData } = useQuery<{ settings: MairieSettings | null }>({
    queryKey: ["mairie-dashboard-settings", selectedCommune],
    queryFn: () => apiFetch(`/api/mairie/settings/${encodeURIComponent(selectedCommune)}`),
    enabled: selectedCommune !== "all",
  });
  const [localStatuses, setLocalStatuses] = useState<DashboardStatusConfig[]>(defaultDashboardStatuses);

  useEffect(() => {
    const configured = settingsData?.settings?.formulas?.dashboardStatuses;
    if (configured?.length) setLocalStatuses(configured);
  }, [settingsData]);

  const saveStatusesMutation = useMutation({
    mutationFn: async () => {
      if (selectedCommune === "all") throw new Error("Aucune commune sélectionnée");
      const existing = settingsData?.settings || {};
      const response = await fetch(`/api/mairie/settings/${encodeURIComponent(selectedCommune)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...existing,
          formulas: {
            ...(existing.formulas || {}),
            dashboardStatuses: localStatuses,
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Impossible de sauvegarder les statuts");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mairie-dashboard-settings", selectedCommune] });
      toast({ title: "Statuts sauvegardés", description: "Les filtres actifs du dashboard ont été mis à jour." });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  return (
    <MairieShell>
      <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
      <p className="mt-2 text-base text-slate-600">Réglages de fonctionnement du portail Mairie.</p>
      <div className="mt-9 grid gap-6">
        <SettingsBlock title="Notifications" icon={Bell} items={["Nouveau dossier déposé", "Avis reçu d'un service consulté", "Rappel de délai d'instruction"]} checked={[true, true, false]} />
        <SettingsBlock title="Notifications par email" icon={Mail} items={["Résumé quotidien", "Résumé hebdomadaire"]} checked={[true, false]} />
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold"><Settings className="h-5 w-5" /> Statuts d'instruction actifs</h2>
              <p className="mt-1 text-sm text-slate-500">Ces statuts alimentent le filtre Statut du dashboard Mairie.</p>
            </div>
            <Button
              className="rounded-lg bg-slate-950 text-white hover:bg-slate-800"
              onClick={() => saveStatusesMutation.mutate()}
              disabled={saveStatusesMutation.isPending || selectedCommune === "all"}
            >
              Enregistrer
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {localStatuses.map((status, index) => (
              <label key={status.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="font-semibold">{status.label}</span>
                <Checkbox
                  checked={status.active}
                  onCheckedChange={(checked) => {
                    setLocalStatuses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, active: checked === true } : item));
                  }}
                />
              </label>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-xl font-bold"><FileText className="h-5 w-5" /> Modèles de courrier</h2>
            <Button variant="outline" className="gap-2 rounded-lg"><Plus className="h-4 w-4" /> Nouveau modèle</Button>
          </div>
          <p className="mb-3 text-sm font-medium">Modèles disponibles</p>
          {[
            ["Acceptation - Permis de Construire", "acceptation", "bg-emerald-100 text-emerald-700"],
            ["Refus - Non-conformité PLU", "refus", "bg-red-100 text-red-700"],
          ].map(([title, badge, color]) => (
            <button key={title} className="mb-2 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
              <span><span className="block font-bold">{title}</span><span className={`mt-2 inline-flex rounded px-2 py-0.5 text-sm ${color}`}>{badge}</span></span>
              <MoreVertical className="h-5 w-5 text-slate-400" />
            </button>
          ))}
          <div className="mt-4 flex h-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500">
            <FileText className="mb-2 h-8 w-8" />
            <p className="font-bold">Sélectionnez un modèle</p>
            <p>ou créez-en un nouveau</p>
          </div>
        </section>
        <Button className="h-12 rounded-lg bg-slate-950 text-base font-bold text-white hover:bg-slate-800">
          Enregistrer les modifications
        </Button>
      </div>
    </MairieShell>
  );
}

function SettingsBlock({ title, icon: Icon, items, checked }: { title: string; icon: typeof Bell; items: string[]; checked: boolean[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 flex items-center gap-2 text-xl font-bold"><Icon className="h-5 w-5" /> {title}</h2>
      <div className="space-y-4">
        {items.map((item, index) => (
          <label key={item} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <Checkbox defaultChecked={checked[index]} />
            {item}
          </label>
        ))}
      </div>
    </section>
  );
}

export default function DashboardMairiePage() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !["mairie", "admin", "super_admin"].includes((user?.role as string) || ""))) {
      setLocation(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isAuthenticated, isLoading, setLocation, user]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f6] text-slate-500">Chargement...</div>;
  }

  if (!isAuthenticated || !["mairie", "admin", "super_admin"].includes((user?.role as string) || "")) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f6] text-slate-500">Redirection...</div>;
  }

  if (location.endsWith("/messagerie")) return <MessagerieView />;
  if (location.endsWith("/statistiques")) return <StatistiquesView />;
  if (location.endsWith("/parametres")) return <ParametresView />;
  return <DashboardView />;
}
