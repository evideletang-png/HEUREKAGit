import { CheckCircle2, Clock3, Circle } from "lucide-react";
import { demoScenario } from "@/demo/demoScenario";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const statusClass = {
  done: "bg-emerald-100 text-emerald-800",
  current: "bg-blue-100 text-blue-800",
  upcoming: "bg-slate-100 text-slate-500",
};

export function DemoTimeline() {
  return (
    <Card>
      <CardHeader><CardTitle>Timeline d'instruction</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {demoScenario.timeline.map((step) => {
          const Icon = step.status === "done" ? CheckCircle2 : step.status === "current" ? Clock3 : Circle;
          return (
            <div key={`${step.day}-${step.label}`} className="flex gap-3 rounded-lg border bg-white p-3">
              <span className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-md text-sm font-black ${statusClass[step.status]}`}>J+{step.day}</span>
              <div className="flex flex-1 items-center gap-2">
                <Icon className="h-4 w-4 text-slate-500" />
                <p className="font-semibold text-slate-800">{step.label}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
