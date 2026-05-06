import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
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

  if (!isDemoRouteEnabled()) return <NotFound />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm font-bold">Preparation du scenario demo Heureka...</p>
      </div>
    </div>
  );
}
