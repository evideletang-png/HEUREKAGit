import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStepIndexFromQuery, isDemoRouteEnabled } from "@/demo/demoRoutes";
import { readDemoState } from "@/demo/demoModeStore";
import { goToDemoStep, startDemo } from "@/demo/demoOrchestrator";

export default function DemoScenarioPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isDemoRouteEnabled()) return;
    const current = readDemoState();
    const stepIndex = getStepIndexFromQuery(window.location.search, current.variant);
    startDemo({ stepIndex, variant: current.variant });
    goToDemoStep(stepIndex, setLocation);
  }, [setLocation]);

  if (!isDemoRouteEnabled()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-700">
        <Card className="max-w-xl border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Scenario demo desactive sur ce build
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              La route existe, mais l'orchestration demo complete doit etre activee explicitement sur un build production avec
              <span className="font-mono font-bold text-slate-950"> VITE_ENABLE_DEMO_MODE=true</span>.
            </p>
            <p>En local/dev, elle reste active par defaut pour faciliter les repetitions de demonstration.</p>
            <Button asChild>
              <Link href="/demo">Retour au mode demo</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm font-bold">Preparation du scenario demo Heureka...</p>
      </div>
    </div>
  );
}
