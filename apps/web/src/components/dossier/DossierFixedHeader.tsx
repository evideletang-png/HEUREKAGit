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
    createdAt?: string | null;
    dateDepot?: string | null;
    metadata?: Record<string, any> | null;
  };
}

export function DossierFixedHeader({ dossier }: DossierFixedHeaderProps) {
  const parcelRef = dossier.parcelRef || 
    dossier.metadata?.parcelRef || 
    dossier.metadata?.parcel_ref || 
    dossier.metadata?.parcelAnalysis?.parcelRef;

  // Zone PLU
  const parcelAnalysis = dossier.metadata?.parcelAnalysis || {};
  const zone = dossier.metadata?.zoneCode
    || dossier.metadata?.zone_code
    || parcelAnalysis.zoneCode
    || dossier.metadata?.pluAnalysis?.zone?.code
    || dossier.metadata?.pluAnalysis?.zone;

  // Date de dépôt
  const dateDepot = dossier.dateDepot || dossier.createdAt;
  const formatDate = (value?: string | null) => {
    if (!value) return null;
    return new Intl.DateTimeFormat("fr-FR", { 
      day: "numeric", 
      month: "long", 
      year: "numeric" 
    }).format(new Date(value));
  };

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            {/* Ligne 1 : N° + Type de demande */}
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <span>N° {dossier.dossierNumber || dossier.id}</span>
              <span className="text-slate-400">•</span>
              <span>{dossier.typeProcedure || "Dossier d'urbanisme"}</span>
            </div>

            {/* Ligne 2 : Demandeur */}
            {dossier.userName && (
              <div className="text-sm font-medium text-slate-700">
                {dossier.userName}
              </div>
            )}

            {/* Ligne 3 : Adresse + Parcelle + Zone PLU */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
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
              {zone && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                    Zone {zone}
                  </span>
                </>
              )}
            </div>

            {/* Ligne 4 : Date de dépôt */}
            {dateDepot && (
              <div className="text-sm text-slate-500">
                Déposé le {formatDate(dateDepot)}
              </div>
            )}
          </div>

          {/* Badge statut */}
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