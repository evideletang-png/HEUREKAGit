import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

const demoLinks = [
  { href: "/demo/citoyen", label: "Vue citoyen" },
  { href: "/demo/mairie", label: "Vue mairie" },
  { href: "/demo/metropole", label: "Vue métropole" },
  { href: "/demo/abf", label: "Vue ABF" },
  { href: "/demo/sdis", label: "Vue SDIS" },
];

export function DemoHeader({ role }: { role: string }) {
  const [location] = useLocation();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Link href="/demo" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 font-bold text-white">H</span>
          <div>
            <p className="text-lg font-black text-slate-950">HEUREKA — Démonstration</p>
            <p className="text-sm text-slate-500">Rôle simulé : {role}</p>
          </div>
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">MODE DÉMO</Badge>
        </Link>
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1">
          {demoLinks.map((item) => {
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
