import { Link } from "wouter";
import { Building2, CheckCircle2, FileSearch, Gavel, ShieldCheck, Siren } from "lucide-react";
import { demoScenario } from "@/demo/demoScenario";
import { DemoAccessGuard } from "@/demo/components/DemoAccessGuard";
import { DemoHeader } from "@/demo/components/DemoHeader";
import { DemoScenarioCard } from "@/demo/components/DemoScenarioCard";
import { DemoTimeline } from "@/demo/components/DemoTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const roleLinks = [
  { href: "/demo/citoyen", label: "Citoyen", icon: CheckCircle2 },
  { href: "/demo/mairie", label: "Mairie", icon: Building2 },
  { href: "/demo/metropole", label: "Métropole", icon: ShieldCheck },
  { href: "/demo/abf", label: "ABF", icon: Gavel },
  { href: "/demo/sdis", label: "SDIS", icon: Siren },
];

export default function DemoHome() {
  return (
    <DemoAccessGuard>
      <div className="min-h-screen bg-slate-50">
        <DemoHeader role="Accueil" />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8">
          <DemoScenarioCard />
          <Card>
            <CardHeader><CardTitle>Scénario figé sans IA live</CardTitle></CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
              <p className="text-slate-600">
                Cette démonstration présente un dossier de {demoScenario.commune} avec pré-contrôle,
                analyse PLU, consultations ABF/SDIS, avis consolidé et projet de décision. Les données
                sont locales, aucun appel IA réel n'est effectué et aucune donnée n'est écrite en base.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {["Pré-contrôle", "Analyse PLU", "Consultation services extérieurs", "Avis consolidé", "Projet de décision"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg bg-slate-100 p-3 font-semibold text-slate-700"><FileSearch className="h-4 w-4" /> {item}</div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-5">
            {roleLinks.map((item) => {
              const Icon = item.icon;
              return <Button key={item.href} asChild variant="outline" className="h-14 justify-start gap-2 bg-white"><Link href={item.href}><Icon className="h-4 w-4" /> {item.label}</Link></Button>;
            })}
          </div>
          <DemoTimeline />
        </main>
      </div>
    </DemoAccessGuard>
  );
}
