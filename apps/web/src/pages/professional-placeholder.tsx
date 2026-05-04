import { useEffect } from "react";
import { useLocation } from "wouter";
import { Construction } from "lucide-react";
import { ProfessionalShell } from "@/components/layout/ProfessionalShell";
import { professionalNavigation, type ProfessionalPortalType } from "@/components/layout/professionalNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

type ProfessionalPlaceholderPageProps = {
  portalType: ProfessionalPortalType;
  title: string;
  description: string;
};

export default function ProfessionalPlaceholderPage({ portalType, title, description }: ProfessionalPlaceholderPageProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    const role = (user?.role as string) || "";
    const allowed =
      role === "admin" ||
      role === "super_admin" ||
      (portalType === "mairie" && role === "mairie") ||
      (portalType === "metropole" && role === "metropole") ||
      (portalType === "abf" && role === "abf");
    if (!allowed) setLocation("/dashboard");
  }, [isAuthenticated, isLoading, portalType, setLocation, user]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f6] text-slate-500">Chargement...</div>;
  }

  return (
    <ProfessionalShell portalType={portalType}>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Construction className="h-5 w-5 text-slate-500" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-2xl text-slate-600">{description}</p>
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
            Module en préparation
          </div>
        </CardContent>
      </Card>
    </ProfessionalShell>
  );
}

export function professionalPlaceholderFromRoute(portalType: ProfessionalPortalType, href: string) {
  const item = professionalNavigation[portalType].flatMap((section) => section.items).find((entry) => entry.href === href);
  return () => (
    <ProfessionalPlaceholderPage
      portalType={portalType}
      title={item?.label || "Module professionnel"}
      description={item?.description || "Ce module sera activé progressivement dans l'espace professionnel."}
    />
  );
}
