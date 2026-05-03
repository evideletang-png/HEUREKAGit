import { AlertTriangle } from "lucide-react";
import { demoScenario } from "@/demo/demoScenario";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function DemoAlerts() {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Synthèse simulée</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Score de conformité</span><span className="text-2xl font-black">{demoScenario.aiConclusion.scoreConformite}/100</span></div>
          <Progress value={demoScenario.aiConclusion.scoreConformite} />
          <Badge className="mt-3 bg-blue-100 text-blue-900">{demoScenario.aiConclusion.status}</Badge>
        </div>
        <List title="Points bloquants" items={demoScenario.aiConclusion.pointsBloquants} tone="red" />
        <List title="Points d'attention" items={demoScenario.aiConclusion.pointsAttention} tone="amber" />
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-500">Recommandation d'instruction</p>
          <p className="mt-1 font-semibold text-slate-800">{demoScenario.aiConclusion.recommendation}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function List({ title, items, tone }: { title: string; items: readonly string[]; tone: "red" | "amber" }) {
  const className = tone === "red" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900";
  return <div><p className="mb-2 font-bold">{title}</p><div className="flex flex-wrap gap-2">{items.map((item) => <Badge key={item} className={className}>{item}</Badge>)}</div></div>;
}
