import type { LucideIcon } from "lucide-react";
import { Building2, FileText, Gavel, LayoutDashboard, MessageSquare, Scale, ShieldCheck, User as UserIcon } from "lucide-react";

export type UserRole = "citoyen" | "user" | "mairie" | "metropole" | "abf" | "admin" | "super_admin" | string;

export type RoleNavigationLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
};

export const ROLE_NAVIGATION_LINKS: RoleNavigationLink[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["citoyen", "user", "mairie", "metropole", "abf", "admin", "super_admin"] },
  { href: "/citoyen", label: "Mes dossiers", icon: FileText, roles: ["citoyen", "user"] },
  { href: "/dashboard-mairie", label: "Instruction Mairie", icon: ShieldCheck, roles: ["mairie", "admin", "super_admin"] },
  { href: "/portail-metropole", label: "Instruction Métropole", icon: Building2, roles: ["metropole", "admin", "super_admin"] },
  { href: "/portail-abf", label: "Avis ABF", icon: Scale, roles: ["abf", "admin", "super_admin"] },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare, roles: ["citoyen", "user", "mairie", "metropole", "abf", "admin", "super_admin"] },
  { href: "/recours", label: "Recours", icon: Gavel, roles: ["citoyen", "user", "mairie", "admin", "super_admin"] },
  { href: "/admin", label: "Administration", icon: ShieldCheck, roles: ["admin", "super_admin"] },
  { href: "/account", label: "Mon compte", icon: UserIcon, roles: ["citoyen", "user", "mairie", "metropole", "abf", "admin", "super_admin"] },
];

export function getRoleNavigationLinks(role: UserRole, isAuthenticated: boolean) {
  if (!isAuthenticated) return [];
  return ROLE_NAVIGATION_LINKS.filter((item) => item.roles.includes(role));
}
