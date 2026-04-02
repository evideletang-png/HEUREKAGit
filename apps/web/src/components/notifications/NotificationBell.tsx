import { Bell, Check, MessageSquare, AlertCircle, PlusCircle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useListNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, getListNotificationsQueryKey, Notification } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Link } from "wouter";

/**
 * NotificationBell Component
 * Displays a bell icon with an unread badge and a popover listing recent alerts.
 */
export function NotificationBell() {
  const { data } = useListNotifications();
  const queryClient = useQueryClient();
  const markRead = useMarkNotificationAsRead();
  const markAllRead = useMarkAllNotificationsAsRead();

  const notifications = (data?.notifications as Notification[]) || [];
  const unreadCount = notifications.filter((n: Notification) => !n.isRead).length;

  const handleMarkRead = async (id: string) => {
    try {
      await markRead.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'MENTION': return <MessageSquare className="w-4 h-4 text-indigo-500" />;
      case 'NEW_DOSSIER': return <PlusCircle className="w-4 h-4 text-green-500" />;
      case 'MESSAGE': return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'STATUS_CHANGE': return <Activity className="w-4 h-4 text-amber-500" />;
      default: return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative group hover:bg-slate-100/50 rounded-full">
          <Bell className="w-5 h-5 text-slate-600 group-hover:text-primary transition-colors" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 px-1.5 min-w-[1.25rem] h-5 flex items-center justify-center bg-destructive text-white border-2 border-white shadow-sm text-[10px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-xl shadow-2xl border-border/50" align="end">
        <div className="p-4 border-b border-border/40 flex items-center justify-between bg-muted/10">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-[11px] px-2 hover:bg-primary/5 text-primary font-medium" 
              onClick={(e) => {
                e.stopPropagation();
                handleMarkAllRead();
              }}
            >
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <ScrollArea className="h-[350px]">
          {notifications.length === 0 ? (
            <div className="py-12 px-4 text-center text-muted-foreground text-sm">
              <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>Aucune notification pour le moment.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {notifications.map((n) => (
                <div 
                  key={n.id} 
                  className={`p-4 hover:bg-muted/30 transition-colors relative group cursor-pointer ${!n.isRead ? 'bg-primary/5' : ''}`}
                  onClick={() => !n.isRead && handleMarkRead(n.id)}
                >
                  <div className="flex gap-3">
                    <div className="mt-1 shrink-0">
                      {getIcon(n.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className={`text-xs font-semibold leading-tight ${!n.isRead ? 'text-primary' : 'text-slate-900'}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {formatDistanceToNow(n.createdAt ? new Date(n.createdAt) : new Date(), { addSuffix: true, locale: fr })}
                        </span>
                        {n.dossierId && (
                          <Link 
                            href={n.type === 'NEW_DOSSIER' ? `/portail-mairie` : `/citoyen/dossier/${n.dossierId}`} 
                            className="text-[10px] text-primary hover:underline font-bold"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Accéder
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  {!n.isRead && (
                    <div className="absolute right-3 top-4 w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t border-border/40 bg-muted/5">
          <Button variant="ghost" className="w-full h-8 text-[11px] font-bold text-slate-600 hover:text-primary" asChild>
            <Link href="/tasks">Voir toutes les tâches</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
