import { Link } from "wouter";
import { demoScenario } from "@/demo/demoScenario";
import { DemoAccessGuard } from "@/demo/components/DemoAccessGuard";
import { DemoHeader } from "@/demo/components/DemoHeader";
import { DemoScenarioCard } from "@/demo/components/DemoScenarioCard";
import { DemoPluAnalysis } from "@/demo/components/DemoPluAnalysis";
import { DemoServiceOpinion } from "@/demo/components/DemoServiceOpinion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoMetropole() {
  return (
    <DemoAccessGuard>
      <div className="min-h-screen bg-slate-50">
        <DemoHeader role="Métropole" />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
          <Button asChild variant="ghost"><Link href="/demo">Retour vers /demo</Link></Button>
          <DemoScenarioCard />
          <DemoServiceOpinion opinion={demoScenario.opinions.metropole} />
          <Card>
            <CardHeader><CardTitle>Coordination intercommunale</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {["Conflit règlement écrit / SPR", "Vigilance hauteurs et servitudes", "Coordination mairie / ABF"].map((item) => <div key={item} className="rounded-lg border bg-white p-4 font-semibold">{item}</div>)}
            </CardContent>
          </Card>
          <DemoPluAnalysis />
        </main>
      </div>
    </DemoAccessGuard>
  );
}
