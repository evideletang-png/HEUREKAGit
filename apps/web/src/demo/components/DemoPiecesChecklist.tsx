import { demoScenario, type DemoPieceStatus } from "@/demo/demoScenario";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const labels: Record<DemoPieceStatus, string> = { ok: "OK", missing: "Manquante", insufficient: "Insuffisante" };
const classes: Record<DemoPieceStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  missing: "bg-red-100 text-red-800",
  insufficient: "bg-amber-100 text-amber-900",
};

export function DemoPiecesChecklist() {
  return (
    <Card>
      <CardHeader><CardTitle>Pièces du dossier</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {demoScenario.pieces.map((piece) => (
          <div key={piece.code} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3">
            <div><p className="font-bold">{piece.code}</p><p className="text-sm text-slate-500">{piece.label}</p></div>
            <Badge className={classes[piece.status]}>{labels[piece.status]}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
