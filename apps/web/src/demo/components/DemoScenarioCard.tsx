import { Building2, MapPin } from "lucide-react";
import { demoScenario } from "@/demo/demoScenario";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DemoScenarioCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Dossier figé Rochecorbon</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-600"><MapPin className="h-4 w-4" /> {demoScenario.address} · Parcelle {demoScenario.parcel}</p>
          <h2 className="text-2xl font-black text-slate-950">{demoScenario.project}</h2>
          <p className="text-slate-600">{demoScenario.procedure} · Zone {demoScenario.pluZone}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Surface existante" value={`${demoScenario.existingSurface} m²`} />
            <Stat label="Surface créée" value={`${demoScenario.createdSurface} m²`} />
            <Stat label="Surface totale" value={`${demoScenario.totalSurface} m²`} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-slate-700">Contraintes clés</p>
          <div className="flex flex-wrap gap-2">
            {demoScenario.constraints.map((constraint) => <Badge key={constraint} variant="outline" className="bg-slate-50">{constraint}</Badge>)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}
