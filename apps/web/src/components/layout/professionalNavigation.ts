import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  BookOpen,
  Building2,
  FileCheck2,
  FileCog,
  FileText,
  Gavel,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  Network,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Users,
  Zap,
} from "lucide-react";

export type ProfessionalPortalType = "mairie" | "metropole" | "abf" | "admin";

export type ProfessionalNavigationItem = {
  label: string;
  href: string;
  description?: string;
  icon: LucideIcon;
  activeMatches?: string[];
  permission?: string;
};

export type ProfessionalNavigationSection = {
  title: string;
  items: ProfessionalNavigationItem[];
};

export const professionalPortalLabels: Record<ProfessionalPortalType, string> = {
  mairie: "Portail Mairie",
  metropole: "Portail Métropole",
  abf: "Portail ABF",
  admin: "Administration",
};

export const professionalNavigation: Record<ProfessionalPortalType, ProfessionalNavigationSection[]> = {
  mairie: [
    {
      title: "Pilotage",
      items: [
        {
          label: "Tableau de bord",
          href: "/dashboard-mairie",
          description: "Dossiers en cours, priorités, alertes",
          icon: LayoutDashboard,
          activeMatches: ["exact:/dashboard-mairie", "/dossier/"],
          permission: "dossier.read",
        },
      ],
    },
    {
      title: "Outils d'instruction",
      items: [
        { label: "Règlement (PLU)", href: "/portail-mairie/base-ia", description: "Base PLU, zones, règles extraites", icon: BookOpen, activeMatches: ["/portail-mairie/base-ia"], permission: "plu.read" },
        { label: "Documents opposables", href: "/portail-mairie/documents-opposables", description: "PLU, SPR, PPRI, servitudes, documents graphiques", icon: Archive, permission: "plu.read" },
        { label: "Contrôles réglementaires", href: "/portail-mairie/controles-reglementaires", description: "Hauteur, implantation, emprise, stationnement, aspect extérieur", icon: FileCheck2, permission: "dossier.instruct" },
        { label: "Services consultés", href: "/portail-mairie/services-consultes", description: "ABF, SDIS, DDT, métropole, consultations externes", icon: Siren, permission: "dossier.consult_services" },
        { label: "Fiscalité", href: "/portail-mairie/fiscalite", description: "Taxes, coûts, simulations", icon: Zap, permission: "fiscalite.read" },
        { label: "Règles IA", href: "/portail-mairie/regles-ia", description: "Prompts, corrections humaines, apprentissage local", icon: FileCog, permission: "plu.write" },
      ],
    },
    {
      title: "Collaboration",
      items: [
        { label: "Messagerie", href: "/dashboard-mairie/messagerie", icon: MessageSquare, permission: "message.read" },
        { label: "Recours", href: "/recours", icon: Gavel, permission: "dossier.read" },
      ],
    },
    {
      title: "Paramètres",
      items: [
        { label: "Paramètres mairie", href: "/dashboard-mairie/parametres", icon: Settings, permission: "settings.read" },
      ],
    },
  ],
  metropole: [
    {
      title: "Métropole",
      items: [
        { label: "Tableau de bord", href: "/portail-metropole", icon: LayoutDashboard, activeMatches: ["exact:/portail-metropole"], permission: "dossier.read" },
        { label: "Dossiers mutualisés", href: "/portail-metropole/dossiers-mutualises", icon: FileText, permission: "dossier.read" },
        { label: "Règlement intercommunal", href: "/portail-metropole/reglement-intercommunal", icon: BookOpen, permission: "plu.read" },
        { label: "Documents opposables", href: "/portail-metropole/documents-opposables", icon: Archive, permission: "plu.read" },
        { label: "Contrôles réglementaires", href: "/portail-metropole/controles-reglementaires", icon: FileCheck2, permission: "dossier.instruct" },
        { label: "Services consultés", href: "/portail-metropole/services-consultes", icon: Network, permission: "dossier.consult_services" },
        { label: "Messagerie", href: "/messagerie", icon: MessageSquare, permission: "message.read" },
        { label: "Paramètres", href: "/portail-metropole/parametres", icon: Settings, permission: "settings.read" },
      ],
    },
  ],
  abf: [
    {
      title: "ABF",
      items: [
        { label: "Avis à rendre", href: "/portail-abf", icon: Landmark, activeMatches: ["exact:/portail-abf"], permission: "dossier.read" },
        { label: "Dossiers consultés", href: "/portail-abf/dossiers-consultes", icon: FileText, permission: "dossier.read" },
        { label: "Prescriptions patrimoniales", href: "/portail-abf/prescriptions-patrimoniales", icon: ScrollText, permission: "plu.read" },
        { label: "Messagerie", href: "/messagerie", icon: MessageSquare, permission: "message.read" },
        { label: "Paramètres", href: "/portail-abf/parametres", icon: Settings, permission: "settings.read" },
      ],
    },
  ],
  admin: [
    {
      title: "Administration",
      items: [
        { label: "Administration", href: "/admin", icon: ShieldCheck, activeMatches: ["exact:/admin"], permission: "users.manage" },
        { label: "Communes", href: "/admin/communes", icon: Building2, permission: "settings.write" },
        { label: "Utilisateurs", href: "/admin/utilisateurs", icon: Users, permission: "users.manage" },
        { label: "Droits", href: "/admin/droits", icon: ShieldCheck, permission: "users.manage" },
        { label: "Base documentaire", href: "/admin/base-documentaire", icon: Archive, permission: "plu.write" },
        { label: "Prompts / Règles IA", href: "/admin/regles-ia", icon: FileCog, permission: "plu.write" },
        { label: "Monitoring", href: "/admin/monitoring", icon: Activity, permission: "users.manage" },
        { label: "Paramètres", href: "/admin/parametres", icon: Settings, permission: "settings.write" },
      ],
    },
  ],
};

export function isProfessionalRouteActive(item: ProfessionalNavigationItem, location: string) {
  const matches = item.activeMatches || [item.href];
  return matches.some((match) => {
    if (match.startsWith("exact:")) return location === match.slice("exact:".length);
    return location === match || (match !== "/" && location.startsWith(`${match}/`));
  });
}
