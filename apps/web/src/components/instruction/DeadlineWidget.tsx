import { Clock3 } from "lucide-react";

function formatDate(value?: string | Date | null) {
  if (!value) return "Non calculée";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export function DeadlineWidget({ deadline, isTacite }: { deadline?: string | Date | null; isTacite?: boolean }) {
  return (
    <div className={`rounded-lg p-5 ${isTacite ? "bg-red-50 text-red-900" : "bg-blue-50 text-blue-900"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
        <Clock3 className="h-4 w-4" />
        Délai d'instruction
      </div>
      <p className="mt-3 text-2xl font-bold">{formatDate(deadline)}</p>
      <p className="mt-2 text-sm font-medium">{isTacite ? "Risque permis tacite" : "OK"}</p>
    </div>
  );
}
