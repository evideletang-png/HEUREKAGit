import { Loader2 } from "lucide-react";

export function ParcelDetectionLoader({ label = "Analyse automatique du terrain en cours" }: { label?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Heureka interroge les sources cadastre, urbanisme, risques, patrimoine et environnement disponibles.
      </p>
    </div>
  );
}
