import { CheckCircle2, XCircle, AlertTriangle, FileQuestion, FileCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type DocumentStatus = "detected" | "missing" | "incomplete" | "validated" | "incoherent";

interface DocumentScoreIndicatorProps {
  status: DocumentStatus;
  score?: number;
  confidence?: number;
  className?: string;
}

const STATUS_CONFIG = {
  detected: {
    icon: FileQuestion,
    label: "Détectée",
    className: "bg-blue-50 text-blue-800 border-blue-200",
    badgeVariant: "default" as const
  },
  missing: {
    icon: XCircle,
    label: "Absente",
    className: "bg-red-50 text-red-800 border-red-200",
    badgeVariant: "destructive" as const
  },
  incomplete: {
    icon: AlertTriangle,
    label: "Incomplète",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    badgeVariant: "outline" as const
  },
  validated: {
    icon: CheckCircle2,
    label: "Validée",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    badgeVariant: "default" as const
  },
  incoherent: {
    icon: XCircle,
    label: "Incohérente",
    className: "bg-red-50 text-red-800 border-red-200",
    badgeVariant: "destructive" as const
  }
};

export function DocumentScoreIndicator({ status, score, confidence, className }: DocumentScoreIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${config.className} ${className || ""}`}>
      <Icon className="h-5 w-5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant={config.badgeVariant} className="font-semibold">
            {config.label}
          </Badge>
          {score !== undefined && (
            <span className="text-sm font-bold">
              Score: {score}/100
            </span>
          )}
        </div>
        {confidence !== undefined && (
          <p className="mt-1 text-xs opacity-75">
            Confiance IA: {Math.round(confidence * 100)}%
          </p>
        )}
      </div>
    </div>
  );
}