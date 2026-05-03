import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "./AppShell";
import { MairieNavigation } from "./MairieNavigation";

export function ProtectedLayout({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    } else if (!isLoading && requireAdmin && !["admin", "super_admin"].includes((user?.role as string) || "")) {
      setLocation("/dashboard");
    }
  }, [isLoading, isAuthenticated, setLocation, requireAdmin, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || (requireAdmin && !["admin", "super_admin"].includes((user?.role as string) || ""))) {
    // Show spinner while the useEffect redirect is in flight — avoids a blank flash
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (["mairie", "admin", "super_admin"].includes((user?.role as string) || "")) {
    return (
      <div className="min-h-screen bg-[#f7f7f6] text-slate-950">
        <main className="animate-in fade-in duration-500 flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-8 min-w-0">
          <MairieNavigation />
          {children}
        </main>
      </div>
    );
  }

  return (
    <AppShell mainClassName="animate-in fade-in duration-500 flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-8 min-w-0">
      {children}
    </AppShell>
  );
}
