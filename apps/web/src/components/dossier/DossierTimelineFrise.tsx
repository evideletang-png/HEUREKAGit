import { AlertTriangle, Check, Clock3 } from "lucide-react";
import { clsx } from "clsx";
import type { TimelineStep, TimelineAlert } from "@/lib/urbanisme/timeline/timeline.types";

type TimelineFriseProps = {
  steps: TimelineStep[];
  alerts: TimelineAlert[];
  remainingDays: number | null;
  hasDeadline: boolean;
  adjustedDelayMonths: number;
  baseDelayMonths: number;
  isSuspended: boolean;
};

function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

const STATUS_STYLES: Record<TimelineStep["status"], { border: string; bg: string; text: string; dot: string }> = {
  done: {
    border: "border-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  current: {
    border: "border-blue-600",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-600",
  },
  pending: {
    border: "border-slate-300",
    bg: "bg-white",
    text: "text-slate-400",
    dot: "bg-slate-300",
  },
  blocked: {
    border: "border-red-400",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  warning: {
    border: "border-amber-400",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
};

function StepCircle({ status }: { status: TimelineStep["status"] }) {
  const s = STATUS_STYLES[status];
  const isActive = status === "done" || status === "current";

  return (
    <div
      className={clsx(
        "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        s.border,
        isActive ? s.bg : "bg-white",
      )}
    >
      {status === "done" ? (
        <Check className={clsx("h-3.5 w-3.5", s.text)} strokeWidth={2.5} />
      ) : status === "current" || status === "warning" ? (
        <div className={clsx("h-2 w-2 rounded-full", s.dot)} />
      ) : status === "blocked" ? (
        <div className="h-2 w-2 rounded-full bg-red-400" />
      ) : (
        <div className="h-2 w-2 rounded-full border border-slate-300" />
      )}
    </div>
  );
}

function Connector({ status }: { status: TimelineStep["status"] }) {
  const isDone = status === "done";
  return (
    <div className="flex-1 min-w-[12px] max-w-[48px] mx-1 lg:mx-2">
      <div className={clsx("h-px w-full", isDone ? "bg-emerald-400" : "bg-slate-200")} />
    </div>
  );
}

function AlertBadge({ level }: { level: TimelineAlert["level"] }) {
  const color =
    level === "critical"
      ? "text-red-600"
      : level === "warning"
        ? "text-amber-600"
        : "text-slate-500";
  const bg =
    level === "critical"
      ? "bg-red-50"
      : level === "warning"
        ? "bg-amber-50"
        : "bg-slate-50";
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", color, bg)}>
      <AlertTriangle className="h-3 w-3" />
      {level === "critical" ? "Critique" : level === "warning" ? "Attention" : "Info"}
    </span>
  );
}

export function DossierTimelineFrise({
  steps,
  alerts,
  remainingDays,
  hasDeadline,
  adjustedDelayMonths,
  baseDelayMonths,
  isSuspended,
}: TimelineFriseProps) {
  const criticalAlerts = alerts.filter((a) => a.level === "critical");
  const warningAlerts = alerts.filter((a) => a.level === "warning");
  const infoAlerts = alerts.filter((a) => a.level === "info");
  const hasAlerts = alerts.length > 0;
  const hasCriticalOrWarning = criticalAlerts.length > 0 || warningAlerts.length > 0;

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Timeline steps */}
          <div className="flex items-center flex-1 min-w-0">
            {steps.map((step, index) => (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                {/* Step node */}
                <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                  <StepCircle status={step.status} />
                  <span
                    className={clsx(
                      "text-center text-xs font-medium leading-tight",
                      step.status === "current" || step.status === "done"
                        ? "text-slate-800"
                        : step.status === "blocked"
                          ? "text-red-600"
                          : "text-slate-500",
                    )}
                  >
                    {step.label}
                  </span>
                  {step.date && (
                    <span className="text-[11px] leading-tight text-slate-400">
                      {formatDate(step.date)}
                    </span>
                  )}
                  {step.key === "instruction" && !step.date && (
                    <span className="text-[11px] leading-tight text-slate-400 whitespace-nowrap">
                      {adjustedDelayMonths > baseDelayMonths
                        ? `${baseDelayMonths}+${adjustedDelayMonths - baseDelayMonths} mois`
                        : `${adjustedDelayMonths} mois`}
                    </span>
                  )}
                  {step.key === "echeance" && remainingDays !== null && hasDeadline && (
                    <span
                      className={clsx(
                        "text-[11px] leading-tight font-semibold whitespace-nowrap",
                        remainingDays < 0
                          ? "text-red-600"
                          : remainingDays <= 7
                            ? "text-amber-600"
                            : "text-slate-500",
                      )}
                    >
                      {remainingDays < 0
                        ? "Délai dépassé"
                        : `${remainingDays}j`}
                    </span>
                  )}
                </div>

                {/* Connector */}
                {index < steps.length - 1 && (
                  <div className="flex-1 min-w-[8px] mx-1 lg:mx-2">
                    <div
                      className={clsx(
                        "h-px w-full",
                        step.status === "done" ? "bg-emerald-400" : "bg-slate-200",
                      )}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right section: alerts + remaining days */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Tacite / overdue */}
            {remainingDays !== null && remainingDays < 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                <AlertTriangle className="h-3 w-3" />
                Délai dépassé
              </span>
            )}

            {/* Suspended */}
            {isSuspended && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                <Clock3 className="h-3 w-3" />
                Suspendu
              </span>
            )}

            {/* Alert badges */}
            {criticalAlerts.length > 0 && <AlertBadge level="critical" />}
            {warningAlerts.length > 0 && <AlertBadge level="warning" />}
            {infoAlerts.length > 0 && !hasCriticalOrWarning && <AlertBadge level="info" />}

            {/* Detail link */}
            {hasAlerts && (
              <span className="group relative inline-flex items-center">
                <span className="cursor-help rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700">
                  {alerts.length} alerte{alerts.length > 1 ? "s" : ""}
                  <span className="invisible group-hover:visible absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
                    <ul className="space-y-1.5">
                      {alerts.map((alert, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span
                            className={clsx(
                              "mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full",
                              alert.level === "critical"
                                ? "bg-red-500"
                                : alert.level === "warning"
                                  ? "bg-amber-500"
                                  : "bg-slate-400",
                            )}
                          />
                          <span
                            className={clsx(
                              alert.level === "critical"
                                ? "text-red-700"
                                : alert.level === "warning"
                                  ? "text-amber-700"
                                  : "text-slate-600",
                            )}
                          >
                            {alert.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </span>
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
