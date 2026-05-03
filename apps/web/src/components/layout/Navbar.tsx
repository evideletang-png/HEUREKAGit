import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, User as UserIcon, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "../notifications/NotificationBell";
import { getRoleNavigationLinks } from "./RoleNavigation";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [location] = useLocation();

  const role = (user?.role as string) || "";
  const navigationLinks = getRoleNavigationLinks(role, isAuthenticated);
  const desktopLinks = navigationLinks.filter((item) => item.href !== "/account");

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl transition-all">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:px-4 md:px-6 lg:px-8">
        <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-md transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg">
            <Building2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-primary sm:text-xl">
            HEUREKA
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isAuthenticated ? (
            <>
              <Button
                variant="outline"
                asChild
                className="h-10 px-3 text-sm shadow-sm sm:hidden"
              >
                <Link href="/login">Se connecter</Link>
              </Button>
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <Link href="/login">Se connecter</Link>
              </Button>
              <Button asChild className="h-10 px-3 shadow-md transition-all hover:shadow-lg sm:px-4">
                <Link href="/register">Essai gratuit</Link>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className="hidden items-center gap-1.5 md:flex">
                {desktopLinks.map((item) => {
                  const Icon = item.icon;
                  const active = location === item.href || (item.href !== "/dashboard" && location.startsWith(`${item.href}/`));
                  return (
                    <Button key={item.href} variant={active ? "secondary" : "ghost"} size="sm" asChild className="gap-2 font-medium">
                      <Link href={item.href}>
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </Button>
                  );
                })}
              </div>

              <NotificationBell />

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-border/50 shadow-sm md:hidden">
                    <Menu className="h-4 w-4 text-primary" />
                    <span className="sr-only">Ouvrir la navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="overflow-y-auto px-4 py-6">
                  <SheetHeader className="pr-8 text-left">
                    <SheetTitle>Navigation</SheetTitle>
                    <SheetDescription>
                      Accès rapide aux espaces HEUREKA depuis mobile.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-2">
                    {navigationLinks.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button
                          key={item.href}
                          asChild
                          variant={location === item.href ? "default" : "outline"}
                          className="h-12 w-full justify-start rounded-xl px-4 text-sm"
                        >
                          <Link href={item.href}>
                            <Icon className="mr-2 h-4 w-4" />
                            {item.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                  <div className="mt-6 rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-sm font-medium text-primary">{user?.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{user?.email}</p>
                    <Button
                      variant="outline"
                      className="mt-4 h-11 w-full justify-start rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5"
                      onClick={() => logout()}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Se déconnecter
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="hidden h-9 w-9 rounded-full border-border/50 shadow-sm md:inline-flex">
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
                  {navigationLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild className="cursor-pointer rounded-md">
                        <Link href={item.href} className="flex items-center w-full">
                          <Icon className="mr-2 h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
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
