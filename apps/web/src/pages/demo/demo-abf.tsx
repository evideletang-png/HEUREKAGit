import { Link } from "wouter";
import { demoScenario } from "@/demo/demoScenario";
import { DemoAccessGuard } from "@/demo/components/DemoAccessGuard";
import { DemoHeader } from "@/demo/components/DemoHeader";
import { DemoScenarioCard } from "@/demo/components/DemoScenarioCard";
import { DemoServiceOpinion } from "@/demo/components/DemoServiceOpinion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoAbf() {
  return (
    <DemoAccessGuard>
      <div className="min-h-screen bg-slate-50">
        <DemoHeader role="ABF" />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
          <Button asChild variant="ghost"><Link href="/demo">Retour vers /demo</Link></Button>
          <DemoScenarioCard />
          <Card>
            <CardHeader><CardTitle>Périmètre d'analyse patrimoniale</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              {["Façade", "Insertion", "Matériaux", "Menuiseries", "Toiture"].map((item) => <div key={item} className="rounded-lg border bg-white p-4 text-center font-bold">{item}</div>)}
            </CardContent>
          </Card>
          <DemoServiceOpinion opinion={demoScenario.opinions.abf} />
        </main>
      </div>
    </DemoAccessGuard>
  );
}
