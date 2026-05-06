import { getDemoSteps, type DemoStep } from "./demoScenario";
import { demoDossier, demoMessages, demoSeedUsers, getDemoDossierForStatus } from "./demoSeedData";
import {
  DEMO_MODE_ENABLED,
  DEFAULT_DEMO_STATE,
  getDemoScopedRoute,
  readDemoState,
  resetDemoState,
  writeDemoState,
  type DemoModeState,
  type DemoScenarioVariant,
} from "./demoModeStore";

const DEMO_SEED_STORAGE_KEY = "heureka.demo.seed";

export function seedDemoData(state: DemoModeState = readDemoState()) {
  if (typeof window === "undefined") return;
  const dossier = getDemoDossierForStatus(state.dossierStatus);
  window.localStorage.setItem(
    DEMO_SEED_STORAGE_KEY,
    JSON.stringify({
      dossier,
      messages: demoMessages,
      users: demoSeedUsers,
      variant: state.variant,
      seededAt: new Date().toISOString(),
    }),
  );
}

export function readDemoSeed() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DEMO_SEED_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getDemoSeedDossier() {
  return readDemoSeed()?.dossier || demoDossier;
}

export function getDemoSeedMessages() {
  return readDemoSeed()?.messages || demoMessages;
}

export function startDemo(options: { stepIndex?: number; variant?: DemoScenarioVariant } = {}) {
  if (!DEMO_MODE_ENABLED) return DEFAULT_DEMO_STATE;
  const steps = getDemoSteps(options.variant || DEFAULT_DEMO_STATE.variant);
  const stepIndex = Math.min(Math.max(options.stepIndex || 0, 0), steps.length - 1);
  const step = steps[stepIndex];
  const next = writeDemoState({
    enabled: true,
    playing: false,
    currentStepIndex: stepIndex,
    variant: options.variant || DEFAULT_DEMO_STATE.variant,
    role: step.role,
    dossierStatus: step.dossierStatus || "draft",
    seededAt: new Date().toISOString(),
  });
  seedDemoData(next);
  return next;
}

export function goToStep(stepId: string, navigate?: (route: string) => void) {
  const state = readDemoState();
  const steps = getDemoSteps(state.variant);
  const index = steps.findIndex((step) => step.id === stepId);
  return goToDemoStep(index >= 0 ? index : 0, navigate);
}

export function applyDemoStep(step: DemoStep, index: number) {
  const state = writeDemoState({
    enabled: true,
    currentStepIndex: index,
    role: step.role,
    dossierStatus: step.dossierStatus || readDemoState().dossierStatus,
  });
  seedDemoData(state);
  return state;
}

export function goToDemoStep(index: number, navigate?: (route: string) => void) {
  const state = readDemoState();
  const steps = getDemoSteps(state.variant);
  const nextIndex = Math.min(Math.max(index, 0), steps.length - 1);
  const step = steps[nextIndex];
  applyDemoStep(step, nextIndex);
  navigate?.(getDemoScopedRoute(step.route));
  return step;
}

export function nextDemoStep(navigate?: (route: string) => void) {
  return goToDemoStep(readDemoState().currentStepIndex + 1, navigate);
}

export const nextStep = nextDemoStep;

export function previousDemoStep(navigate?: (route: string) => void) {
  return goToDemoStep(readDemoState().currentStepIndex - 1, navigate);
}

export const previousStep = previousDemoStep;

export function stopDemo() {
  const state = writeDemoState({ playing: false });
  seedDemoData(state);
  return state;
}

export function resetDemo(navigate?: (route: string) => void) {
  resetDemoState();
  if (typeof window !== "undefined") window.localStorage.removeItem(DEMO_SEED_STORAGE_KEY);
  const state = startDemo({ stepIndex: 0 });
  const firstStep = getDemoSteps(state.variant)[0];
  navigate?.(getDemoScopedRoute(firstStep.route));
  return state;
}

export const resetDemoScenario = resetDemo;

export function getCurrentDemoStep(state: DemoModeState = readDemoState()) {
  const steps = getDemoSteps(state.variant);
  return steps[Math.min(Math.max(state.currentStepIndex, 0), steps.length - 1)];
}
