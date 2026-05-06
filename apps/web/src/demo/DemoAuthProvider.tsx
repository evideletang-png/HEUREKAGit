import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DEMO_MODE_ENABLED, getDemoUser, isDemoUrlScoped, readDemoState, setDemoRole, subscribeDemoState, type DemoModeState } from "./demoModeStore";
import type { DemoRole } from "./demoScenario";
import type { DemoSeedUser } from "./demoSeedData";

type DemoAuthContextValue = {
  isDemoAuthenticated: boolean;
  demoUser: DemoSeedUser | null;
  role: DemoRole | null;
  loginAsDemoRole: (role: DemoRole) => void;
};

const DemoAuthContext = createContext<DemoAuthContextValue>({
  isDemoAuthenticated: false,
  demoUser: null,
  role: null,
  loginAsDemoRole: () => {},
});

export function DemoAuthProvider({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [state, setState] = useState<DemoModeState>(() => readDemoState());

  useEffect(() => subscribeDemoState(setState), []);

  const active = DEMO_MODE_ENABLED && state.enabled && isDemoUrlScoped({ pathname: location, search: typeof window !== "undefined" ? window.location.search : "" });
  const role = active ? state.role : null;
  const demoUser = active ? getDemoUser(state.role) : null;

  return (
    <DemoAuthContext.Provider
      value={{
        isDemoAuthenticated: active,
        demoUser,
        role,
        loginAsDemoRole: (nextRole) => setDemoRole(nextRole),
      }}
    >
      {children}
    </DemoAuthContext.Provider>
  );
}

export function useDemoAuth() {
  return useContext(DemoAuthContext);
}
