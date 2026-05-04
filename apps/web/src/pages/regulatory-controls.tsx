import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, SlidersHorizontal } from "lucide-react";
import { ProfessionalShell } from "@/components/layout/ProfessionalShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

type Rule = {
  id: string;
  zoneCode: string | null;
  articleCode: string | null;
  themeCode: string;
  themeLabel: string;
  ruleLabel: string;
  sourceText: string;
  sourcePage: number | null;
  sourcePageEnd: number | null;
  confidenceScore: number | null;
  status: string;
  documentId: string | null;
  documentTitle: string | null;
  overlayCode: string | null;
  overlayType: string | null;
};

const CONTROL_FAMILIES = [
  "destination",
  "implantation voie",
  "limites séparatives",
  "hauteur",
  "emprise",
  "stationnement",
  "aspect extérieur",
  "espaces libres",
  "risques",
  "patrimoine",
  "servitudes",
];

async function apiFetch(path: string) {
  const response = await fetch(path, { credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || "Chargement impossible");
  return payload;
}

function parseCommunes(raw: unknown) {
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

export default function RegulatoryControlsPage() {
  const { user } = useAuth();
  const communes = parseCommunes((user as any)?.authorizedCommunes || (user as any)?.communes);
  const [commune, setCommune] = useState(communes[0] || "all");
  const [zone, setZone] = useState("all");
  const [article, setArticle] = useState("all");
  const [family, setFamily] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ rules: Rule[] }>({
    queryKey: ["regulatory-controls", commune],
    queryFn: () => apiFetch(`/api/mairie/regulatory-calibration/library?commune=${encodeURIComponent(commune)}&visibility=internal`),
    enabled: commune !== "all",
  });

  const rules = data?.rules || [];
  const zones = [...new Set(rules.map((rule) => rule.zoneCode).filter(Boolean) as string[])].sort();
  const articles = [...new Set(rules.map((rule) => rule.articleCode).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));

  const filtered = useMemo(() => rules.filter((rule) => {
    const haystack = `${rule.ruleLabel} ${rule.themeLabel} ${rule.themeCode} ${rule.sourceText} ${rule.documentTitle || ""}`.toLowerCase();
    if (zone !== "all" && rule.zoneCode !== zone) return false;
    if (article !== "all" && rule.articleCode !== article) return false;
    if (family !== "all" && !haystack.includes(family.toLowerCase())) return false;
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    return true;
  }), [article, family, rules, search, zone]);

  return (
    <ProfessionalShell portalType="mairie">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-950">Contrôles réglementaires</h1>
          <p className="mt-1 text-slate-600">Contrôles filtrables par commune, zone, article PLU et famille de contrôle.</p>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filtres</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <Select value={commune} onValueChange={setCommune}>
              <SelectTrigger><SelectValue placeholder="Commune" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sélectionner une commune</SelectItem>
                {communes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger><SelectValue placeholder="Zone" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes zones</SelectItem>{zones.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={article} onValueChange={setArticle}>
              <SelectTrigger><SelectValue placeholder="Article" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous articles</SelectItem>{articles.map((item) => <SelectItem key={item} value={item}>Article {item}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={family} onValueChange={setFamily}>
              <SelectTrigger><SelectValue placeholder="Famille" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes familles</SelectItem>{CONTROL_FAMILIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Recherche texte" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" /> {filtered.length} contrôle(s)</CardTitle>
            <CardDescription>Chaque contrôle conserve sa zone, son article, son document source, son extrait et son statut de validation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <p className="text-sm text-slate-500">Chargement...</p> : filtered.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{rule.zoneCode || "Transversal"}</Badge>
                  {rule.articleCode ? <Badge variant="secondary">Article {rule.articleCode}</Badge> : null}
                  <Badge variant="outline">{rule.themeLabel || rule.themeCode}</Badge>
                  <Badge variant="outline">{rule.status}</Badge>
                  {rule.overlayCode ? <Badge variant="outline">{rule.overlayType || "Overlay"} · {rule.overlayCode}</Badge> : null}
                </div>
                <p className="mt-3 font-semibold text-slate-950">{rule.ruleLabel}</p>
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{rule.sourceText}</p>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <span>Document : {rule.documentTitle || rule.documentId || "Non renseigné"}</span>
                  <span>Page : {rule.sourcePage || "N/A"}{rule.sourcePageEnd ? `-${rule.sourcePageEnd}` : ""}</span>
                  <span>Confiance : {typeof rule.confidenceScore === "number" ? `${Math.round(rule.confidenceScore * 100)}%` : "N/A"}</span>
                </div>
              </div>
            ))}
            {!isLoading && filtered.length === 0 ? <p className="text-sm text-slate-500">Aucun contrôle trouvé pour ces filtres.</p> : null}
          </CardContent>
        </Card>
      </div>
    </ProfessionalShell>
  );
}
