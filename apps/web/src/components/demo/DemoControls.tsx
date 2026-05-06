import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDemoSteps } from "@/demo/demoScenario";
import {
  DEMO_MODE_ENABLED,
  getDemoScopedRoute,
  readDemoState,
  subscribeDemoState,
  writeDemoState,
  type DemoModeState,
  type DemoScenarioVariant,
} from "@/demo/demoModeStore";
import { goToDemoStep, nextDemoStep, previousDemoStep, resetDemo, seedDemoData } from "@/demo/demoOrchestrator";

export function DemoControls() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<DemoModeState>(() => readDemoState());

  useEffect(() => subscribeDemoState(setState), []);

  const steps = useMemo(() => getDemoSteps(state.variant), [state.variant]);
  const step = steps[state.currentStepIndex] || steps[0];

  useEffect(() => {
    if (!DEMO_MODE_ENABLED || !state.enabled || !state.playing) return;
    const delay = Math.max(800, (step?.waitMs || 1600) / state.speed);
    const timer = window.setTimeout(() => {
      if (state.currentStepIndex >= steps.length - 1) {
        writeDemoState({ playing: false });
        return;
      }
      nextDemoStep(setLocation);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [setLocation, state.currentStepIndex, state.enabled, state.playing, state.speed, step?.waitMs, steps.length]);

  if (!DEMO_MODE_ENABLED || !state.enabled || !step) return null;

  const setVariant = (variant: DemoScenarioVariant) => {
    const next = writeDemoState({ variant, currentStepIndex: 0, role: "citizen", dossierStatus: "draft", playing: false });
    seedDemoData(next);
    const firstStep = getDemoSteps(variant)[0];
    if (firstStep) setLocation(getDemoScopedRoute(firstStep.route));
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[80] w-[min(94vw,900px)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
            <Video className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-md text-[10px] uppercase tracking-widest">
                Mode demo
              </Badge>
              <Badge className="rounded-md bg-slate-100 text-[10px] uppercase tracking-widest text-slate-700 hover:bg-slate-100">
                {state.currentStepIndex + 1}/{steps.length}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm font-bold text-slate-950">{step.title}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={state.variant}
            onChange={(event) => setVariant(event.target.value as DemoScenarioVariant)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
            aria-label="Variante du scenario"
          >
            <option value="decision_favorable">Decision favorable</option>
            <option value="pieces_complementaires">Pieces complementaires</option>
          </select>
          <select
            value={state.speed}
            onChange={(event) => writeDemoState({ speed: Number(event.target.value) as 1 | 1.5 | 2 })}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
            aria-label="Vitesse"
          >
            <option value={1}>x1</option>
            <option value={1.5}>x1.5</option>
            <option value={2}>x2</option>
          </select>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => previousDemoStep(setLocation)} aria-label="Etape precedente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800"
            onClick={() => writeDemoState({ playing: !state.playing })}
          >
            {state.playing ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {state.playing ? "Pause" : "Play"}
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => nextDemoStep(setLocation)} aria-label="Etape suivante">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => resetDemo(setLocation)} aria-label="Reinitialiser">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <select
            value={step.id}
            onChange={(event) => {
              const index = steps.findIndex((candidate) => candidate.id === event.target.value);
              goToDemoStep(index, setLocation);
            }}
            className="h-9 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
            aria-label="Acces direct etape"
          >
            {steps.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
