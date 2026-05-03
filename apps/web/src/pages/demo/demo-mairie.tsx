import { Link } from "wouter";
import { demoScenario } from "@/demo/demoScenario";
import { DemoAccessGuard } from "@/demo/components/DemoAccessGuard";
import { DemoHeader } from "@/demo/components/DemoHeader";
import { DemoScenarioCard } from "@/demo/components/DemoScenarioCard";
import { DemoPiecesChecklist } from "@/demo/components/DemoPiecesChecklist";
import { DemoPluAnalysis } from "@/demo/components/DemoPluAnalysis";
import { DemoAlerts } from "@/demo/components/DemoAlerts";
import { DemoTimeline } from "@/demo/components/DemoTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const actions = ["Demander pièces complémentaires", "Consulter ABF", "Consulter SDIS", "Générer projet d'arrêté"];

export default function DemoMairie() {
  const { toast } = useToast();
  const simulate = (label: string) => toast({ title: "Action simulée en mode démo", description: label });
  return (
    <DemoAccessGuard>
      <div className="min-h-screen bg-slate-50">
        <DemoHeader role="Mairie" />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
          <Button asChild variant="ghost"><Link href="/demo">Retour vers /demo</Link></Button>
          <DemoScenarioCard />
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Score conformité" value={`${demoScenario.aiConclusion.scoreConformite}/100`} />
            <Stat label="Statut" value="Sous réserves" />
            <Stat label="Consultations" value="ABF + SDIS" />
            <Stat label="Décision" value="Accord prescrit" />
          </div>
          <Card>
            <CardHeader><CardTitle>Actions d'instruction simulées</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              {actions.map((action) => <Button key={action} variant="outline" onClick={() => simulate(action)}>{action}</Button>)}
            </CardContent>
          </Card>
          <DemoAlerts />
          <DemoPiecesChecklist />
          <DemoPluAnalysis />
          <DemoTimeline />
        </main>
      </div>
    </DemoAccessGuard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}
