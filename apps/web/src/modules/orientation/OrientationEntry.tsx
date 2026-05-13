import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Compass, FileText, Route } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCommuneModuleConfig } from "@/lib/communes/getCommuneModuleConfig";
import type { ProjectCard } from "@/lib/projects/types";
import { isDemoSessionActive } from "@/demo/demoModeStore";
import { CompositeProjectWizard } from "./CompositeProjectWizard";
import { ORIENTATION_HELP_TEXT } from "./orientation.config";
import { OrientationResult } from "./OrientationResult";
import { ORIENTATION_STORAGE_KEY, type OrientationResultPayload } from "./orientation.types";

type OrientationStep = "entry" | "wizard" | "result";

function projectReturnRoute(projectId: string | null) {
  return projectId ? `/projects/${encodeURIComponent(projectId)}` : "/citoyen";
}

function directDepositRoute(type?: string, projectId?: string | null) {
  const params = new URLSearchParams();
  params.set("orientation", type ? "guided" : "skip");
  if (type) params.set("type", type);
  if (projectId) params.set("projectId", projectId);
  if (projectId) params.set("returnTo", "project");
  return `/citoyen/nouveau?${params.toString()}`;
}

export default function OrientationEntry() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<OrientationStep>("entry");
  const [result, setResult] = useState<OrientationResultPayload | null>(null);
  const [projectContext, setProjectContext] = useState<ProjectCard | null>(null);
  const config = getCommuneModuleConfig({ communeName: isDemoSessionActive() ? "Commune Démo" : "Tours" });
  const searchParams = new URLSearchParams(window.location.search);
  const projectId = searchParams.get("projectId");
  const returnToProject = searchParams.get("returnTo") === "project" && Boolean(projectId);
  const backRoute = returnToProject ? projectReturnRoute(projectId) : "/citoyen";

  useEffect(() => {
    if (!config.modules.orientationAssistantEnabled) {
      const params = new URLSearchParams();
      params.set("orientation", "disabled");
      if (projectId) params.set("projectId", projectId);
      if (projectId) params.set("returnTo", "project");
      setLocation(`/citoyen/nouveau?${params.toString()}`);
    }
  }, [config.modules.orientationAssistantEnabled, setLocation, projectId]);

  useEffect(() => {
    if (!projectId) {
      setProjectContext(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectId)}`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || payload.error || "Projet introuvable.");
        if (!cancelled) setProjectContext(payload.project || null);
      })
      .catch(() => {
        if (!cancelled) setProjectContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!config.modules.orientationAssistantEnabled) return null;

  return (
    <AppShell className="bg-slate-50 pb-16" mainClassName="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={backRoute}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <Badge variant="outline">Assistant d'orientation</Badge>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Vous ne savez pas quelle démarche déposer ?</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {config.modules.orientationHelpText || ORIENTATION_HELP_TEXT}
          </p>
        </div>
      </div>

      {step === "entry" ? (
        <div className="grid gap-5 md:grid-cols-2" data-demo="orientation-assistant">
          <Card className="border-primary/20 shadow-sm">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Compass className="h-6 w-6" />
              </div>
              <CardTitle>Être guidé dans ma démarche</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                Sélectionnez les travaux prévus, répondez aux questions utiles, puis Heureka vous proposera le dossier le plus adapté.
              </p>
              <Button className="mt-5 w-full" onClick={() => setStep("wizard")}>
                Lancer l'assistant
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <FileText className="h-6 w-6" />
              </div>
              <CardTitle>Je sais déjà quel dossier déposer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                Accédez directement au dépôt classique et choisissez vous-même le type de dossier.
              </p>
              <Button className="mt-5 w-full" variant="outline" onClick={() => setLocation(directDepositRoute(undefined, projectId))}>
                Aller au dépôt
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === "wizard" ? (
        <Card className="border-slate-200 shadow-sm" data-demo="orientation-assistant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5 text-primary" />
              Assistant d'orientation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CompositeProjectWizard
              initialLocation={{
                address: projectContext?.address,
                commune: projectContext?.commune,
                parcel: projectContext?.parcelReferences?.[0],
                pluZone: projectContext?.mainPluZone,
                coordinates: projectContext?.coordinates,
              }}
              onResult={(nextResult) => {
                setResult(nextResult);
                setStep("result");
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {step === "result" && result ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <OrientationResult
              result={result}
              onCreate={(type) => setLocation(directDepositRoute(type, projectId))}
              onEdit={() => setStep("wizard")}
              onChooseOther={() => {
                sessionStorage.removeItem(ORIENTATION_STORAGE_KEY);
                setLocation(directDepositRoute(undefined, projectId));
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
