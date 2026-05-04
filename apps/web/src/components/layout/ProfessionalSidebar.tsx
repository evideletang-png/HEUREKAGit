import { Link, useLocation } from "wouter";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  isProfessionalRouteActive,
  professionalNavigation,
  professionalPortalLabels,
  type ProfessionalPortalType,
} from "./professionalNavigation";

type ProfessionalSidebarProps = {
  portalType: ProfessionalPortalType;
  onNavigate?: () => void;
};

export function ProfessionalSidebar({ portalType, onNavigate }: ProfessionalSidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const permissions = new Set(((user as any)?.permissions || []).map(String));
  const role = String((user as any)?.role || "");
  const hasGlobalAccess = Boolean((user as any)?.hasGlobalAccess || role === "admin" || role === "super_admin");
  const canSee = (permission?: string) => !permission || hasGlobalAccess || permissions.has(permission) || permissions.has("*");
  const sections = professionalNavigation[portalType]
    .map((section) => ({ ...section, items: section.items.filter((item) => canSee(item.permission)) }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white">
      <Link href="/dashboard" className="flex h-16 items-center gap-3 border-b border-slate-200 px-4" onClick={onNavigate}>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">HEUREKA</p>
          <p className="truncate text-xs font-medium text-slate-500">{professionalPortalLabels[portalType]}</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{section.title}</p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isProfessionalRouteActive(item, location);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                      active ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-white" : "text-slate-500 group-hover:text-slate-900")} />
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      {item.description ? (
                        <span className={cn("mt-0.5 hidden text-xs font-medium leading-snug xl:block", active ? "text-slate-200" : "text-slate-400")}>{item.description}</span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
