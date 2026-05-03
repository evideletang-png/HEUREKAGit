import { demoScenario, type DemoPluStatus } from "@/demo/demoScenario";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const statusClasses: Record<DemoPluStatus, string> = {
  conforme: "bg-emerald-100 text-emerald-800",
  "à vérifier": "bg-amber-100 text-amber-900",
  "à risque": "bg-orange-100 text-orange-900",
  "sans alerte": "bg-slate-100 text-slate-700",
  "non conforme": "bg-red-100 text-red-800",
  incomplet: "bg-violet-100 text-violet-800",
};

export function DemoPluAnalysis() {
  return (
    <Card>
      <CardHeader><CardTitle>Analyse PLU article par article</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {demoScenario.pluAnalysis.map((item) => {
          const major = item.article === "Article 11";
          return (
            <div key={item.article} className={`rounded-lg border p-4 ${major ? "border-red-300 bg-red-50" : "bg-white"}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-black">{item.article}</p>
                <Badge className={statusClasses[item.status]}>{item.status}</Badge>
              </div>
              <p className="mt-2 font-semibold text-slate-800">{item.summary}</p>
              <p className="mt-1 text-sm text-slate-600">Impact : {item.impact}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
