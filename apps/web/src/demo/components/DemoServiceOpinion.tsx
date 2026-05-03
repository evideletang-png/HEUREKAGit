import type { DemoServiceOpinion as Opinion } from "@/demo/demoScenario";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DemoServiceOpinion({ opinion }: { opinion: Opinion }) {
  const details = opinion.prescriptions || opinion.observations || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Avis {opinion.service}
          <Badge className="bg-slate-950 text-white">{opinion.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {opinion.highlights?.length ? <div className="flex flex-wrap gap-2">{opinion.highlights.map((item) => <Badge key={item} variant="outline" className="bg-slate-50">{item}</Badge>)}</div> : null}
        <div className="space-y-2">
          {details.map((item) => <p key={item} className="rounded-lg border bg-white p-3 text-sm font-medium text-slate-700">{item}</p>)}
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-500">Conclusion</p>
          <p className="mt-1 font-semibold">{opinion.conclusion}</p>
        </div>
      </CardContent>
    </Card>
  );
}
