export type TimelineStepStatus = "done" | "current" | "pending" | "blocked" | "warning";

export type TimelineStep = {
  key: string;
  label: string;
  date: string | null;
  status: TimelineStepStatus;
  description: string;
};

export type TriggeredConsultation = {
  type: string;
  label: string;
  reason: string;
  impact: string;
  status: "pending" | "sent" | "received" | "not_required";
};

export type TimelineAlert = {
  level: "info" | "warning" | "critical";
  message: string;
};

export type DelayEngineResult = {
  baseDelayMonths: number;
  adjustedDelayMonths: number;
  startDate: string | null;
  depositDate: string;
  completenessDate: string | null;
  deadlineDate: string | null;
  remainingDays: number | null;
  hasDeadline: boolean;
  status: "pre_deposit" | "pending_completeness" | "incomplete" | "suspended" | "in_progress" | "overdue" | "decided";
  isSuspended: boolean;
  suspensionReason: string | null;
  triggeredConsultations: TriggeredConsultation[];
  timelineSteps: TimelineStep[];
  alerts: TimelineAlert[];
};
