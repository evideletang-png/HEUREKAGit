import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, User as UserIcon, LayoutDashboard, ShieldCheck, Scale, Building, FileText, Gavel } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "../notifications/NotificationBell";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();

  const isPublicPage = location === "/" || location === "/login" || location === "/register";

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl transition-all">
      <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-md group-hover:shadow-lg transition-all duration-300 group-hover:-translate-y-0.5">
            <Building2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-primary">
            HEUREKA
          </span>
        </Link>

        <div className="flex items-center gap-4">
          {!isAuthenticated ? (
            <>
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <Link href="/login">Se connecter</Link>
              </Button>
              <Button asChild className="shadow-md hover:shadow-lg transition-all">
                <Link href="/register">Essai gratuit</Link>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="ghost" size="sm" asChild className="hidden md:flex gap-2">
                <Link href="/dashboard">
                  <LayoutDashboard className="w-4 h-4" />
                  Tableau de bord
                </Link>
              </Button>
              {((user?.role as string) === "citoyen" || (user?.role as string) === "user") && (
                <Button variant="ghost" size="sm" asChild className="flex gap-2 text-primary font-medium">
                  <Link href="/citoyen">
                    <FileText className="w-4 h-4" />
                    Mes dossiers
                  </Link>
                </Button>
              )}
              {["citoyen", "user", "mairie", "admin", "super_admin"].includes((user?.role as string) || "") && (
                <Button variant="ghost" size="sm" asChild className="hidden sm:flex gap-2 text-slate-700 font-medium">
                  <Link href="/recours">
                    <Gavel className="w-4 h-4" />
                    Recours
                  </Link>
                </Button>
              )}
              {((user?.role as string) === "mairie" || (user?.role as string) === "admin" || (user?.role as string) === "super_admin") && (
                <Button variant="ghost" size="sm" asChild className="hidden sm:flex gap-2 text-primary font-bold">
                  <Link href="/portail-mairie">
                    <ShieldCheck className="w-4 h-4" />
                    Instruction Mairie
                  </Link>
                </Button>
              )}
              {((user?.role as string) === "metropole" || (user?.role as string) === "admin") && (
                <Button variant="ghost" size="sm" asChild className="hidden sm:flex gap-2 text-indigo-600 font-bold">
                  <Link href="/portail-metropole">
                    <Building2 className="w-4 h-4" />
                    Instruction Métropole
                  </Link>
                </Button>
              )}
              {((user?.role as string) === "abf" || (user?.role as string) === "admin") && (
                <Button variant="ghost" size="sm" asChild className="hidden sm:flex gap-2 text-amber-700 font-bold">
                  <Link href="/portail-abf">
                    <Scale className="w-4 h-4" />
                    Avis ABF
                  </Link>
                </Button>
              )}

              <NotificationBell />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full w-9 h-9 border-border/50 shadow-sm">
                    <UserIcon className="w-4 h-4 text-primary" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-primary">{user?.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer rounded-md">
                    <Link href="/dashboard" className="flex items-center w-full">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      <span>Tableau de bord</span>
                    </Link>
                  </DropdownMenuItem>
                  {(isAuthenticated && (user?.role as string) === "user") && (
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md text-primary">
                      <Link href="/citoyen" className="flex items-center w-full">
                        <FileText className="mr-2 h-4 w-4" />
                        <span>Mes dossiers</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {["citoyen", "user", "mairie", "admin", "super_admin"].includes((user?.role as string) || "") && (
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md">
                      <Link href="/recours" className="flex items-center w-full">
                        <Gavel className="mr-2 h-4 w-4" />
                        <span>Recours</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild className="cursor-pointer rounded-md">
                    <Link href="/account" className="flex items-center w-full">
                      <UserIcon className="mr-2 h-4 w-4" />
                      <span>Mon compte</span>
                    </Link>
                  </DropdownMenuItem>
                  {((user?.role as string) === "admin") && (
                    <>
                      <DropdownMenuItem asChild className="cursor-pointer rounded-md text-indigo-600 font-bold">
                        <Link href="/portail-metropole" className="flex items-center w-full">
                          <Building2 className="mr-2 h-4 w-4" />
                          <span>Instruction Métropole</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="cursor-pointer rounded-md text-amber-700 font-bold">
                        <Link href="/portail-abf" className="flex items-center w-full">
                          <Scale className="mr-2 h-4 w-4" />
                          <span>Avis ABF</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {((user?.role as string) === "mairie" || (user?.role as string) === "admin") && (
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md text-primary font-bold">
                      <Link href="/portail-mairie" className="flex items-center w-full">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span>Instruction Experte (Mairie)</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {(user?.role as string) === "admin" && (
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md text-accent">
                      <Link href="/admin" className="flex items-center w-full">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span>Administration Centrale</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer text-destructive focus:bg-destructive/10 rounded-md"
                    onClick={() => logout()}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Se déconnecter</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
