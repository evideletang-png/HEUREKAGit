import { Link } from "wouter";
import { LogOut, Menu, MessageSquare, User as UserIcon } from "lucide-react";
import { useListNotifications, type Notification } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { professionalPortalLabels, type ProfessionalPortalType } from "./professionalNavigation";

type ProfessionalTopbarProps = {
  portalType: ProfessionalPortalType;
  commune?: string | null;
  onOpenMenu: () => void;
};

const MESSAGE_NOTIFICATION_TYPES = ["MESSAGE", "MENTION"];

function getMessageRoute(portalType: ProfessionalPortalType) {
  if (portalType === "mairie") return "/dashboard-mairie/messagerie";
  return "/messagerie";
}

function ProfessionalMessageButton({ portalType }: { portalType: ProfessionalPortalType }) {
  const { data } = useListNotifications();
  const notifications = (data?.notifications as Notification[]) || [];
  const unreadMessageCount = notifications.filter((notification) => MESSAGE_NOTIFICATION_TYPES.includes(notification.type) && !notification.isRead).length;

  return (
    <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-slate-100/50" asChild>
      <Link href={getMessageRoute(portalType)} aria-label="Ouvrir la messagerie">
        <MessageSquare className="h-5 w-5 text-slate-600 transition-colors hover:text-primary" />
        {unreadMessageCount > 0 ? (
          <Badge className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center border-2 border-white bg-primary px-1.5 text-[10px] font-bold text-white shadow-sm">
            {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
          </Badge>
        ) : null}
      </Link>
    </Button>
  );
}

export function ProfessionalTopbar({ portalType, commune, onOpenMenu }: ProfessionalTopbarProps) {
  const { user, logout } = useAuth();
  const authorizedCommunes = Array.isArray((user as any)?.authorizedCommunes)
    ? ((user as any).authorizedCommunes as string[]).filter(Boolean)
    : [];
  const selectedCommune = commune || authorizedCommunes[0] || "all";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="outline" size="icon" className="h-10 w-10 lg:hidden" onClick={onOpenMenu}>
          <Menu className="h-4 w-4" />
          <span className="sr-only">Ouvrir la navigation professionnelle</span>
        </Button>
        <div className="min-w-0">
          <p className="truncate text-base font-black text-slate-950">{professionalPortalLabels[portalType]}</p>
          <p className="truncate text-xs font-medium text-slate-500">{commune ? `Commune : ${commune}` : "Espace professionnel"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {authorizedCommunes.length > 1 ? (
          <Select
            value={selectedCommune}
            onValueChange={(value) => {
              window.localStorage.setItem("heureka:selectedCommune", value);
              window.dispatchEvent(new CustomEvent("heureka:selectedCommune", { detail: value }));
            }}
          >
            <SelectTrigger className="hidden h-10 w-[190px] rounded-full border-slate-200 bg-white text-sm font-semibold shadow-sm md:flex">
              <SelectValue placeholder="Commune" />
            </SelectTrigger>
            <SelectContent>
              {authorizedCommunes.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <ProfessionalMessageButton portalType={portalType} />
        <NotificationBell excludeTypes={MESSAGE_NOTIFICATION_TYPES} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-slate-200 bg-white shadow-sm">
              <UserIcon className="h-4 w-4 text-slate-700" />
              <span className="sr-only">Ouvrir le menu du compte</span>
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
    </header>
  );
}
