import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Loader2,
  MapPin,
} from "lucide-react";
import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PROJECT_MODULES, type ProjectModuleDefinition } from "@/lib/projects/projectModules";
import type { ProjectCard, ProjectTimelineEvent } from "@/lib/projects/types";

type ProjectHubPayload = {
  project: ProjectCard;
  timeline: ProjectTimelineEvent[];
};

function formatDate(value?: string | null) {
  if (!value) return "Date inconnue";
  return format(new Date(value), "d MMMM yyyy", { locale: fr });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Brouillon",
    submitted: "Transmis",
    complete: "Complet",
    incomplete: "Incomplet",
    in_instruction: "En instruction",
    analysis_completed: "Analyse réalisée",
    analysis_in_progress: "Analyse en cours",
  };
  return labels[status] || status;
}

function moduleLink(module: ProjectModuleDefinition, project: ProjectCard) {
  const encodedId = encodeURIComponent(project.id);
  if (module.id === "parcel_analysis") return project.routes?.analysis || `/analyses/new?projectId=${encodedId}`;
  if (module.id === "project_qualification") return `/citoyen/orientation?projectId=${encodedId}&returnTo=project`;
  if (module.id === "administrative_dossier") return project.routes?.dossier || `/citoyen/nouveau?orientation=skip&projectId=${encodedId}`;
  if (module.id === "project_ged") return `/projects/${encodedId}`;
  if (module.id === "appeals_and_modifications") return "/recours";
  return null;
}

function ModuleCard({ module, project, isUsed }: { module: ProjectModuleDefinition; project: ProjectCard; isUsed: boolean }) {
  const Icon = module.icon;
  const link = moduleLink(module, project);
  const stateLabel = isUsed ? "Utilisée" : module.status === "planned" ? "Prévue" : "Disponible";

  return (
    <Card className="rounded-lg border-slate-200 shadow-sm">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant={isUsed ? "default" : "outline"} className={isUsed ? "" : "text-slate-600"}>
            {stateLabel}
          </Badge>
        </div>
        <div className="min-h-[94px] space-y-2">
          <h3 className="text-base font-semibold text-slate-950">{module.title}</h3>
          <p className="text-sm leading-6 text-slate-600">{module.description}</p>
        </div>
        {link ? (
          <Button asChild variant="outline" className="mt-auto justify-between">
            <Link href={link}>
              Ouvrir <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled variant="outline" className="mt-auto justify-between">
            Prévu <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectHubPage() {
  const params = useParams<{ id: string }>();
  const projectId = decodeURIComponent(params.id || "");

  const { data, isLoading, error } = useQuery<ProjectHubPayload>({
    queryKey: ["project-hub", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || "Projet introuvable.");
      return payload;
    },
    enabled: Boolean(projectId),
  });

  if (isLoading) {
    return (
      <ProtectedLayout>
        <div className="flex min-h-[420px] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </ProtectedLayout>
    );
  }

  if (error || !data?.project) {
    return (
      <ProtectedLayout>
        <Card className="rounded-lg border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle>Projet introuvable</CardTitle>
            <CardDescription>{error instanceof Error ? error.message : "Impossible d'ouvrir ce projet."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard">Retour aux projets</Link>
            </Button>
          </CardContent>
        </Card>
      </ProtectedLayout>
    );
  }

  const { project, timeline } = data;
  const isModuleUsed = (module: ProjectModuleDefinition) => {
    if (module.id === "administrative_dossier") {
      return project.usedModules.some((id) => ["administrative_dossier", "dossier_assembly", "administrative_deposit", "instruction_tracking"].includes(id));
    }
    return project.usedModules.includes(module.id);
  };
  const syntheticTimeline = timeline.length
    ? timeline
    : [
        {
          id: `${project.id}:created`,
          type: "project_opened",
          title: project.source === "project" ? "Projet créé" : "Projet héritage indexé",
          description:
            project.source === "analysis"
              ? "Ancienne analyse rattachée au nouveau pilotage projet."
              : project.source === "dossier"
                ? "Dossier administratif rattaché au nouveau pilotage projet."
                : "Espace projet disponible.",
          createdAt: project.createdAt,
        },
      ];

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <Button variant="ghost" asChild className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" /> Retour aux projets
          </Link>
        </Button>

        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{statusLabel(project.status)}</Badge>
                  <Badge variant="outline">{project.source === "project" ? "Projet" : project.source === "analysis" ? "Analyse héritée" : "Dossier hérité"}</Badge>
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950">{project.name}</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    {project.description || "Hub projet centralisant analyses, documents, démarches, échanges et instruction."}
                  </p>
                </div>
              </div>

              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 lg:w-80">
                <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                  <span>Avancement projet</span>
                  <span>{project.progress}%</span>
                </div>
                <Progress value={project.progress} className="mt-3" />
                <p className="mt-3 text-xs text-slate-500">
                  Dernière activité : {formatDate(project.updatedAt || project.createdAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Contexte de la parcelle
            </CardTitle>
            <CardDescription>Adresse, références cadastrales et contexte réglementaire disponibles pour ce projet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Adresse</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{project.address || "À renseigner"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commune</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{project.commune || "À préciser"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parcelle</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{project.parcelReferences.join(", ") || "À détecter"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zone PLU</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{project.mainPluZone || "À analyser"}</p>
              </div>
            </div>
            {project.detectedConstraints.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <span className="font-semibold">Contraintes détectées : </span>
                {project.detectedConstraints.join(", ")}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Aucune contrainte territoriale consolidée dans le projet pour l'instant. Lancez l'analyse parcellaire pour fiabiliser le zonage, les servitudes, les risques et les consultations.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200">
          <CardHeader>
            <CardTitle>Briques projet</CardTitle>
            <CardDescription>Les briques sont indépendantes et peuvent être utilisées dans l'ordre utile au projet.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PROJECT_MODULES.map((module) => (
              <ModuleCard key={module.id} module={module} project={project} isUsed={isModuleUsed(module)} />
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <Card className="rounded-lg border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Timeline projet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {syntheticTimeline.map((event) => (
                  <div key={event.id} className="border-l-2 border-primary/30 pl-4">
                    <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                    {event.description && <p className="mt-1 text-sm text-slate-600">{event.description}</p>}
                    <p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="rounded-lg border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" /> Alertes réglementaires
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {project.alerts.length > 0 ? (
                  project.alerts.map((alert) => (
                    <div key={alert} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      {alert}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">Aucune alerte bloquante n'est rattachée à ce projet pour l'instant.</p>
                )}
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href={project.routes?.dossier || `/citoyen/nouveau?orientation=skip&projectId=${encodeURIComponent(project.id)}`}>
                    Préparer le dossier administratif
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
