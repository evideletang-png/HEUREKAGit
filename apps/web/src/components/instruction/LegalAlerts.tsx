import { AlertTriangle } from "lucide-react";

export type LegalAlert = {
  type: string;
  message: string;
  severity?: "info" | "warning" | "critical";
  source?: "system" | "ai";
};

export function LegalAlerts({ alerts }: { alerts: LegalAlert[] }) {
  if (alerts.length === 0) {
    return <p className="rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800">Aucune alerte d'instruction détectée.</p>;
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <div key={`${alert.type}-${index}`} className={`rounded-lg p-4 ${alert.severity === "critical" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <AlertTriangle className="h-4 w-4" />
            {alert.source === "ai" ? "Alerte IA" : "Alerte système"} · {alert.type}
          </p>
          <p className="mt-2">{alert.message}</p>
        </div>
      ))}
    </div>
  );
}
