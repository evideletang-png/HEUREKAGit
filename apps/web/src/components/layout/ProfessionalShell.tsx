import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { ProfessionalSidebar } from "./ProfessionalSidebar";
import { ProfessionalTopbar } from "./ProfessionalTopbar";
import type { ProfessionalPortalType } from "./professionalNavigation";

type ProfessionalShellProps = {
  children: React.ReactNode;
  portalType: ProfessionalPortalType;
  commune?: string | null;
  contentClassName?: string;
};

function parseFirstCommune(raw: unknown) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ? String(raw[0]) : null;
  if (typeof raw === "string") {
    if (raw.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed[0] ? String(parsed[0]) : null;
      } catch {
        return null;
      }
    }
    return raw.split(",").map((item) => item.trim()).filter(Boolean)[0] || null;
  }
  return null;
}

export function ProfessionalShell({ children, portalType, commune, contentClassName }: ProfessionalShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCommune, setSelectedCommune] = useState<string | null>(() => window.localStorage.getItem("heureka:selectedCommune"));
  const { user } = useAuth();
  const resolvedCommune = useMemo(() => commune || selectedCommune || parseFirstCommune((user as any)?.authorizedCommunes) || parseFirstCommune((user as any)?.communes), [commune, selectedCommune, user]);

  useEffect(() => {
    const handler = (event: Event) => setSelectedCommune(String((event as CustomEvent<string>).detail || ""));
    window.addEventListener("heureka:selectedCommune", handler);
    return () => window.removeEventListener("heureka:selectedCommune", handler);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f7f6] text-slate-950 lg:grid lg:grid-cols-[280px_1fr]">
      <div className="hidden lg:block lg:h-screen lg:sticky lg:top-0">
        <ProfessionalSidebar portalType={portalType} />
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[300px] p-0">
          <ProfessionalSidebar portalType={portalType} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="min-w-0">
        <ProfessionalTopbar portalType={portalType} commune={resolvedCommune} onOpenMenu={() => setMobileOpen(true)} />
        <main className={contentClassName || "mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"}>
          {children}
        </main>
      </div>
    </div>
  );
}
