import { CheckCircle2, Circle, Clock3, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface DossierTimelineFriseProps {
  instruction: {
    dateDepot?: string | null;
    dateCompletude?: string | null;
    dateLimiteInstruction?: string | null;
    isTacite?: boolean;
  };
  pendingConsultations?: Array<{
    service: string;
    reason?: string;
  }>;
}

interface TimelineStep {
  key: string;
  label: string;
  date?: string | null;
  status: "completed" | "pending" | "overdue";
}

function formatCompactDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleDateString("fr-FR", { 
    day: "2-digit", 
    month: "2-digit" 
  });
}

function calculateRemainingDays(limitDate?: string | null): number | null {
  if (!limitDate) return null;
  const today = new Date();
  const limit = new Date(limitDate);
  const diffTime = limit.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getStepIcon(status: TimelineStep["status"], size = "h-4 w-4") {
  switch (status) {
    case "completed":
      return <CheckCircle2 className={`${size} text-emerald-600`} />;
    case "pending":
      return <Circle className={`${size} text-slate-400`} />;
    case "overdue":
      return <AlertTriangle className={`${size} text-red-600`} />;
    default:
      return <Circle className={`${size} text-slate-400`} />;
  }
}

export function DossierTimelineFrise({ instruction, pendingConsultations = [] }: DossierTimelineFriseProps) {
  const remainingDays = calculateRemainingDays(instruction.dateLimiteInstruction);
  
  const steps: TimelineStep[] = [
    {
      key: "depot",
      label: "Dépôt",
      date: instruction.dateDepot,
      status: instruction.dateDepot ? "completed" : "pending"
    },
    {
      key: "completude", 
      label: "Complétude",
      date: instruction.dateCompletude,
      status: instruction.dateCompletude ? "completed" : "pending"
    },
    {
      key: "limite",
      label: "Limite",
      date: instruction.dateLimiteInstruction,
      status: remainingDays !== null ? (remainingDays < 0 ? "overdue" : "pending") : "pending"
    }
  ];

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Frise chronologique */}
          <div className="flex-1">
            <div className="flex items-center gap-6 overflow-x-auto pb-2">
              {steps.map((step, index) => (
                <div key={step.key} className="flex items-center gap-2 whitespace-nowrap">
                  {/* Icône étape */}
                  <div className="flex items-center gap-2">
                    {getStepIcon(step.status)}
                    <div className="text-sm">
                      <div className="font-medium text-slate-700">
                        {step.date ? formatCompactDate(step.date) : "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {step.label}
                      </div>
                    </div>
                  </div>
                  
                  {/* Connecteur */}
                  {index < steps.length - 1 && (
                    <div className="mx-2 h-px w-8 bg-slate-300" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Délai restant et alertes */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {remainingDays !== null && (
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-slate-500" />
                <span className={`text-sm font-semibold ${
                  remainingDays < 0 
                    ? "text-red-700" 
                    : remainingDays <= 7 
                      ? "text-amber-700" 
                      : "text-slate-700"
                }`}>
                  {remainingDays < 0 
                    ? `${Math.abs(remainingDays)} jour(s) dépassé(s)`
                    : `${remainingDays} jour(s) restant(s)`
                  }
                </span>
              </div>
            )}

            {instruction.isTacite && (
              <Badge variant="destructive" className="text-xs">
                Risque tacite
              </Badge>
            )}

            {/* Consultations en attente */}
            {pendingConsultations.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-amber-700">
                  {pendingConsultations.map(c => c.service).join(", ")} en attente
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}