import { AlertTriangle, CheckCircle2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequiredPieces, type ParcelAnalysisLike, type PieceRequirement } from "@/lib/pieceRequirements";

function PieceList({ title, pieces }: { title: string; pieces: PieceRequirement[] }) {
  if (pieces.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-bold text-slate-800">{title}</h4>
      <div className="space-y-2">
        {pieces.map((piece) => (
          <div key={piece.code} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div>
              <p className="text-sm font-semibold">{piece.code} · {piece.label}</p>
              {piece.reason ? <p className="text-xs text-slate-500">{piece.reason}</p> : null}
            </div>
            <Badge variant={piece.level === "obligatoire" ? "default" : "secondary"}>{piece.level}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DynamicPieceChecklist({
  procedureType,
  parcelAnalysis,
}: {
  procedureType: string;
  parcelAnalysis?: ParcelAnalysisLike | null;
}) {
  const result = getRequiredPieces({ procedureType, parcelAnalysis });
  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Pièces attendues
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {parcelAnalysis ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
            <p className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Contexte de localisation</p>
            <p className="mt-1">
              {parcelAnalysis.zoneCode ? `Zone ${parcelAnalysis.zoneCode}` : "Zone non déterminée"}
              {parcelAnalysis.zoneLabel || parcelAnalysis.zoningLabel ? ` — ${parcelAnalysis.zoneLabel || parcelAnalysis.zoningLabel}` : ""}
            </p>
          </div>
        ) : null}
        <PieceList title="Pièces obligatoires" pieces={result.requiredPieces} />
        <PieceList title="Pièces complémentaires possibles selon la localisation" pieces={result.conditionalPieces} />
        {result.warnings.map((warning) => (
          <p key={warning} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {warning}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
