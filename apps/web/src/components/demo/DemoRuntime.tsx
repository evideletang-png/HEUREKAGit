import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DemoControls } from "./DemoControls";
import { DemoStepOverlay } from "./DemoStepOverlay";
import { DEMO_MODE_ENABLED, readDemoState, subscribeDemoState, writeDemoState } from "@/demo/demoModeStore";

export function DemoRuntime() {
  const [state, setState] = useState(() => readDemoState());

  useEffect(() => subscribeDemoState(setState), []);

  if (!DEMO_MODE_ENABLED || !state.enabled) return null;

  return (
    <>
      <DemoStepOverlay />
      {state.overlayHidden && (
        <Button
          type="button"
          className="fixed right-4 top-4 z-[79] rounded-xl bg-slate-950 text-white shadow-xl hover:bg-slate-800"
          onClick={() => writeDemoState({ overlayHidden: false })}
        >
          Afficher narration
        </Button>
      )}
      <DemoControls />
    </>
  );
}
