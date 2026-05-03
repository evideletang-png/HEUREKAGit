import { Link } from "wouter";
import { DemoAccessGuard } from "@/demo/components/DemoAccessGuard";
import { DemoHeader } from "@/demo/components/DemoHeader";
import { DemoScenarioCard } from "@/demo/components/DemoScenarioCard";
import { DemoPiecesChecklist } from "@/demo/components/DemoPiecesChecklist";
import { DemoTimeline } from "@/demo/components/DemoTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoCitoyen() {
  return (
    <DemoAccessGuard>
      <div className="min-h-screen bg-slate-50">
        <DemoHeader role="Citoyen" />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
          <Button asChild variant="ghost"><Link href="/demo">Retour vers /demo</Link></Button>
          <DemoScenarioCard />
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader><CardTitle>Recevabilité pétitionnaire</CardTitle></CardHeader>
            <CardContent><p className="font-semibold text-amber-950">Votre dossier est recevable mais nécessite des compléments.</p></CardContent>
          </Card>
          <DemoPiecesChecklist />
          <DemoTimeline />
        </main>
      </div>
    </DemoAccessGuard>
  );
}
