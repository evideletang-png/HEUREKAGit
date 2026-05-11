import type { ParcelContextAnalysis } from "@/lib/location-intelligence/analyzeParcelContext";
import { Badge } from "@/components/ui/badge";

export function ParcelContextDetails({ analysis }: { analysis: ParcelContextAnalysis | null | undefined }) {
  if (!analysis) return null;
  const constraints = analysis.detectedConstraints;
  const rows = [
    ["ABF / abords MH", constraints.abf || constraints.monumentHistoriqueAbords],
    ["SPR", constraints.spr],
    ["Site classé / inscrit", constraints.siteClasse || constraints.siteInscrit],
    ["Natura 2000", constraints.natura2000],
    ["PPRI / PPRN / PPRT", constraints.ppri || constraints.pprn || constraints.pprt],
    ["SIS / ancienne ICPE", constraints.sis || constraints.formerIcpe],
    ["OAP", constraints.oap],
    ["SUP", constraints.sup],
    ["Métropole / voirie", constraints.metropolisInstruction || constraints.roadAuthority],
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="font-semibold text-slate-950">Détail réglementaire détecté</h4>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {rows.map(([label, detected]) => (
            <div key={label as string} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span>{label}</span>
              <Badge variant={detected ? "default" : "outline"}>{detected ? "détecté" : "non identifié"}</Badge>
            </div>
          ))}
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold text-slate-900">Sources interrogées</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.providerResults.map((result) => (
                <Badge key={result.provider} variant={result.status === "ok" ? "secondary" : "outline"}>
                  {result.provider} · {result.status}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Consultations probables</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
              {analysis.probableConsultations.length > 0 ? analysis.probableConsultations.map((consultation) => (
                <li key={`${consultation.service}-${consultation.reason}`}>{consultation.service} — {consultation.reason}</li>
              )) : <li>Aucune consultation additionnelle identifiée.</li>}
            </ul>
          </div>
          <p className="text-xs text-slate-500">
            Les données sont indicatives avant dépôt. Le service instructeur peut confirmer ou corriger ces informations lors de l'instruction.
          </p>
        </div>
      </div>
    </div>
  );
}
