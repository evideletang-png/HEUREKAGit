import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  FolderKanban,
  Loader2,
  MapPin,
  Plus,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { PROJECT_MODULES, getProjectModule } from "@/lib/projects/projectModules";
import type { ProjectCard } from "@/lib/projects/types";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Brouillon",
    analysis_completed: "Analyse terminée",
    analysis_in_progress: "Analyse en cours",
    incomplet: "Incomplet",
    submitted: "Déposé",
    en_instruction: "En instruction",
    complete: "Complet",
  };
  return labels[status?.toLowerCase()] || status || "Projet";
}

function sourceLabel(source: ProjectCard["source"]) {
  if (source === "analysis") return "Projet hérité d'une analyse";
  if (source === "dossier") return "Projet hérité d'un dossier";
  return "Projet";
}

function ProjectCardView({ project }: { project: ProjectCard }) {
  const modules = Array.from(new Map(project.usedModules.map(getProjectModule).filter(Boolean).map((module) => [module!.id, module])).values()).slice(0, 4);
  return (
    <Card className="group overflow-hidden rounded-lg border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-md border-slate-200 bg-slate-50 text-slate-600">
                {sourceLabel(project.source)}
              </Badge>
              {project.mainPluZone ? <Badge className="rounded-md">Zone {project.mainPluZone}</Badge> : null}
            </div>
            <h2 className="line-clamp-2 text-lg font-semibold text-slate-950">{project.name}</h2>
            <p className="mt-1 line-clamp-1 text-sm text-slate-500">{project.commune || "Commune à confirmer"}</p>
          </div>
          {project.alerts.length > 0 ? <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600" /> : null}
        </div>

        <div className="space-y-2 text-sm text-slate-600">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span className="line-clamp-1">{project.address || "Adresse à renseigner"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.parcelReferences.length > 0 ? (
              project.parcelReferences.slice(0, 2).map((parcel) => (
                <span key={parcel} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{parcel}</span>
              ))
            ) : (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">Parcelle à confirmer</span>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">{statusLabel(project.status)}</span>
            <span className="text-slate-500">{Math.round(project.progress || 0)}%</span>
          </div>
          <Progress value={project.progress || 0} className="h-2 bg-slate-100" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {modules.length > 0 ? modules.map((module) => (
            <Badge key={module!.id} variant="secondary" className="rounded-md bg-slate-100 text-slate-600">
              {module!.title}
            </Badge>
          )) : <Badge variant="outline" className="rounded-md">Aucune brique activée</Badge>}
        </div>

        {project.alerts.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {project.alerts[0]}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">
            Activité {format(new Date(project.updatedAt || project.createdAt), "d MMM yyyy", { locale: fr })}
          </span>
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/projects/${encodeURIComponent(project.id)}`}>
              Ouvrir <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<{ projects: ProjectCard[] }>({
    queryKey: ["projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects", { credentials: "include" });
      if (!response.ok) throw new Error("Chargement des projets impossible.");
      return response.json();
    },
  });

  return (
    <ProtectedLayout>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FolderKanban className="h-3.5 w-3.5" />
            Espace projet urbanistique
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-950">Vos projets</h1>
          <p className="max-w-3xl text-sm text-slate-600 sm:text-base">
            Pilotez vos analyses, pièces, dépôts, échanges et instructions depuis un hub projet unique et modulaire.
          </p>
        </div>
        <Button size="lg" className="w-full gap-2 shadow-md sm:w-auto" asChild>
          <Link href="/projects/new">
            <Plus className="h-5 w-5" />
            Nouveau projet
          </Link>
        </Button>
      </div>

      {user?.role === "admin" && (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link href="/portail-mairie" className="group flex items-start gap-4 rounded-lg border border-green-200 bg-green-50/50 p-5 shadow-sm transition-all hover:bg-green-100/60 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-600 text-white shadow-lg transition-transform group-hover:scale-105">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-green-900">Portail Mairie</h3>
              <p className="text-xs italic text-green-700/70">Gestion & pré-instruction locale</p>
            </div>
          </Link>
          <Link href="/portail-metropole" className="group flex items-start gap-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm transition-all hover:bg-indigo-100/60 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg transition-transform group-hover:scale-105">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-indigo-900">Portail Métropole</h3>
              <p className="text-xs italic text-indigo-700/70">Instruction experte mutualisée</p>
            </div>
          </Link>
          <Link href="/portail-abf" className="group flex items-start gap-4 rounded-lg border border-amber-200 bg-amber-50/50 p-5 shadow-sm transition-all hover:bg-amber-100/60 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-700 text-white shadow-lg transition-transform group-hover:scale-105">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900">Avis ABF</h3>
              <p className="text-xs italic text-amber-700/70">Consultation patrimoine & bâtiments</p>
            </div>
          </Link>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </div>
      ) : data?.projects?.length === 0 ? (
        <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <FolderKanban className="mb-5 h-12 w-12 text-slate-300" />
          <h3 className="mb-2 text-xl font-bold text-slate-950">Aucun projet pour le moment</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-slate-600">
            Créez votre premier projet pour centraliser adresse, analyse parcellaire, GED, pièces et démarches administratives.
          </p>
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="mr-2 h-4 w-4" />
              Créer un projet
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.projects?.map((project) => <ProjectCardView key={project.id} project={project} />)}
        </div>
      )}

      <div className="mt-10 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Briques modulaires disponibles</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {PROJECT_MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <div key={module.id} className="rounded-lg border border-slate-200 p-3">
                <Icon className="mb-2 h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-slate-950">{module.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{module.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </ProtectedLayout>
  );
}
