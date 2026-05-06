import type { DossierStatus } from "@/lib/urbanisme/dossier/statusWorkflow";
import { demoSeedUsers, type DemoUserRole, type DemoSeedUser } from "./demoSeedData";

export type DemoScenarioVariant = "decision_favorable" | "pieces_complementaires";

export type DemoModeState = {
  enabled: boolean;
  playing: boolean;
  currentStepIndex: number;
  speed: 1 | 1.5 | 2;
  variant: DemoScenarioVariant;
  role: DemoUserRole;
  overlayHidden: boolean;
  dossierStatus: DossierStatus | "signature_pending";
  seededAt?: string;
};

const STORAGE_KEY = "heureka.demo.mode";

export const DEMO_MODE_ENABLED =
  String((import.meta as any).env?.VITE_ENABLE_DEMO_MODE || "").toLowerCase() === "true";

export const DEFAULT_DEMO_STATE: DemoModeState = {
  enabled: false,
  playing: false,
  currentStepIndex: 0,
  speed: 1,
  variant: "decision_favorable",
  role: "citizen",
  overlayHidden: false,
  dossierStatus: "draft",
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readDemoState(): DemoModeState {
  if (!canUseStorage()) return DEFAULT_DEMO_STATE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_DEMO_STATE;
  try {
    return { ...DEFAULT_DEMO_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_DEMO_STATE;
  }
}

export function writeDemoState(next: Partial<DemoModeState> | ((current: DemoModeState) => Partial<DemoModeState>)) {
  const current = readDemoState();
  const patch = typeof next === "function" ? next(current) : next;
  const value: DemoModeState = { ...current, ...patch };
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("heureka-demo-state", { detail: value }));
  }
  return value;
}

export function resetDemoState() {
  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("heureka-demo-state", { detail: DEFAULT_DEMO_STATE }));
  }
  return DEFAULT_DEMO_STATE;
}

export function subscribeDemoState(listener: (state: DemoModeState) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = () => listener(readDemoState());
  window.addEventListener("storage", handle);
  window.addEventListener("heureka-demo-state", handle as EventListener);
  return () => {
    window.removeEventListener("storage", handle);
    window.removeEventListener("heureka-demo-state", handle as EventListener);
  };
}

export function getDemoUser(role: DemoUserRole = readDemoState().role): DemoSeedUser {
  return demoSeedUsers[role] || demoSeedUsers.citizen;
}

export function isDemoSessionActive() {
  return DEMO_MODE_ENABLED && readDemoState().enabled;
}

export function setDemoRole(role: DemoUserRole) {
  return writeDemoState({ role });
}
