import { Link, useLocation } from "wouter";
import { BarChart3, FileText, Gavel, LogOut, MessageSquare, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const mairieNavigationItems = [
  { href: "/dashboard-mairie", label: "Tableau de bord", icon: FileText },
  { href: "/dashboard-mairie/messagerie", label: "Messagerie", icon: MessageSquare },
  { href: "/dashboard-mairie/statistiques", label: "Statistiques", icon: BarChart3 },
  { href: "/dashboard-mairie/parametres", label: "Paramètres", icon: Settings },
  { href: "/recours", label: "Recours", icon: Gavel },
];

export function MairieNavigation() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const role = (user?.role as string) || "";
  const visibleItems = role === "admin" || role === "super_admin"
    ? [...mairieNavigationItems, { href: "/admin", label: "Administration", icon: ShieldCheck }]
    : mairieNavigationItems;

  return (
    <div className="mb-8 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      <div className="flex min-h-14 items-center gap-2">
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = location === item.href || (item.href !== "/dashboard-mairie" && location.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors sm:px-4 ${
                  active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 pr-1">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-slate-200 bg-white shadow-sm">
                <UserIcon className="h-4 w-4 text-slate-700" />
                <span className="sr-only">Ouvrir les paramètres du compte</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-xl p-2">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold leading-none text-slate-950">{user?.name}</p>
                  <p className="text-xs leading-none text-slate-500">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer rounded-md">
                <Link href="/account" className="flex w-full items-center">
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Mon compte</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer rounded-md text-destructive focus:bg-destructive/10" onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Se déconnecter</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
