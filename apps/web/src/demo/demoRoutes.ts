import { getDemoStepById, getDemoSteps } from "./demoScenario";
import { DEMO_MODE_ENABLED, type DemoScenarioVariant } from "./demoModeStore";

export const DEMO_SCENARIO_ROUTE = "/demo/scenario";

export function isDemoRouteEnabled() {
  return DEMO_MODE_ENABLED;
}

export function getDemoLaunchRoute(stepId?: string) {
  return stepId ? `${DEMO_SCENARIO_ROUTE}?step=${encodeURIComponent(stepId)}` : DEMO_SCENARIO_ROUTE;
}

export function getStepIndexFromQuery(search: string, variant: DemoScenarioVariant) {
  const params = new URLSearchParams(search);
  const stepId = params.get("step");
  if (!stepId) return 0;
  const steps = getDemoSteps(variant);
  const index = steps.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

export function resolveDemoStepRoute(stepId: string, variant: DemoScenarioVariant) {
  return getDemoStepById(stepId, variant).route;
}
