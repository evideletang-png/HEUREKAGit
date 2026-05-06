import { useEffect, useState } from "react";
import { EyeOff, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDemoSteps } from "@/demo/demoScenario";
import { DEMO_MODE_ENABLED, readDemoState, subscribeDemoState, writeDemoState, type DemoModeState } from "@/demo/demoModeStore";

const ROLE_LABELS: Record<string, string> = {
  citizen: "Citoyen",
  mairie: "Mairie / instructeur",
  metropole: "Metropole",
  abf: "ABF",
  sdis: "Service consulte",
  signatory: "Signataire",
};

export function DemoStepOverlay() {
  const [state, setState] = useState<DemoModeState>(() => readDemoState());

  useEffect(() => subscribeDemoState(setState), []);

  if (!DEMO_MODE_ENABLED || !state.enabled || state.overlayHidden) return null;

  const steps = getDemoSteps(state.variant);
  const step = steps[state.currentStepIndex] || steps[0];
  if (!step) return null;

  return (
    <aside className="fixed right-4 top-4 z-[79] w-[min(92vw,420px)] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-md bg-slate-950 text-white hover:bg-slate-950">
              {state.currentStepIndex + 1}/{steps.length}
            </Badge>
            <Badge variant="outline" className="rounded-md gap-1">
              <UserRound className="h-3 w-3" />
              {ROLE_LABELS[step.role] || step.role}
            </Badge>
          </div>
          <h2 className="text-base font-black tracking-tight text-slate-950">{step.title}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-900"
          onClick={() => writeDemoState({ overlayHidden: true })}
          aria-label="Masquer l'overlay demo"
        >
          <EyeOff className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-sm leading-relaxed text-slate-600">{step.description}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-slate-950 transition-all"
          style={{ width: `${((state.currentStepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>
    </aside>
  );
}
