import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { DemoControls } from "./DemoControls";
import { DemoOverlay } from "./DemoOverlay";
import { DEMO_MODE_ENABLED, isDemoUrlScoped, readDemoState, subscribeDemoState, writeDemoState } from "@/demo/demoModeStore";

export function DemoRuntime() {
  const [location] = useLocation();
  const [state, setState] = useState(() => readDemoState());

  useEffect(() => subscribeDemoState(setState), []);

  if (!DEMO_MODE_ENABLED || !state.enabled || !isDemoUrlScoped({ pathname: location, search: window.location.search })) return null;

  return (
    <>
      <DemoOverlay />
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
