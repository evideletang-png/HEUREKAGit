import { DossierStatusBadge } from "./DossierStatusBadge";

export interface DossierFixedHeaderProps {
  dossier: {
    id: string;
    dossierNumber?: string | null;
    typeProcedure?: string | null;
    userName?: string | null;
    address?: string | null;
    commune?: string | null;
    parcelRef?: string | null;
    status?: string | null;
    metadata?: Record<string, any> | null;
  };
}

export function DossierFixedHeader({ dossier }: DossierFixedHeaderProps) {
  const parcelRef = dossier.parcelRef || 
    dossier.metadata?.parcelRef || 
    dossier.metadata?.parcel_ref || 
    dossier.metadata?.parcelAnalysis?.parcelRef;

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="font-medium">
                N° {dossier.dossierNumber || dossier.id}
              </span>
              <span className="text-slate-400">•</span>
              <span>{dossier.typeProcedure || "Dossier d'urbanisme"}</span>
              {dossier.userName && (
                <>
                  <span className="text-slate-400">•</span>
                  <span>{dossier.userName}</span>
                </>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-800">
              <span className="font-medium">
                {dossier.address || "Adresse non renseignée"}
              </span>
              {dossier.commune && (
                <>
                  <span className="text-slate-400">•</span>
                  <span>{dossier.commune}</span>
                </>
              )}
              {parcelRef && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-mono">
                    Parcelle {parcelRef}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            <DossierStatusBadge 
              status={dossier.status || "in_instruction"} 
              className="px-3 py-2"
            />
          </div>
        </div>
      </div>
    </div>
  );
}