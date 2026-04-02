import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { useListNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, getListNotificationsQueryKey, Notification } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, MessageSquare, AlertCircle, PlusCircle, Activity, ArrowRight, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Link } from "wouter";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * TasksPage
 * Displays a full list of user notifications, acting as a To-Do list for administrative tasks.
 */
export default function TasksPage() {
  const { data, isLoading } = useListNotifications();
  const queryClient = useQueryClient();
  const markRead = useMarkNotificationAsRead();
  const markAllRead = useMarkAllNotificationsAsRead();
  const [filter, setFilter] = useState<"all" | "unread">("unread");

  const notifications = (data?.notifications as Notification[]) || [];
  const filteredNotifs = filter === "unread" ? notifications.filter((n: Notification) => !n.isRead) : notifications;

  const handleMarkRead = async (id: string) => {
    try {
      await markRead.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (err) {
      console.error("Failed to mark read", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (err) {
      console.error("Failed to mark all read", err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'MENTION': return <MessageSquare className="w-5 h-5 text-indigo-500" />;
      case 'NEW_DOSSIER': return <PlusCircle className="w-5 h-5 text-green-500" />;
      case 'MESSAGE': return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case 'STATUS_CHANGE': return <Activity className="w-5 h-5 text-amber-500" />;
      default: return <AlertCircle className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <ProtectedLayout>
      <div className="container mx-auto py-8 px-4 max-w-5xl transition-all animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="space-y-1">
            <h1 className="text-4xl font-display font-black tracking-tight text-slate-900 flex items-center gap-3">
              <Bell className="w-8 h-8 text-primary/40" />
              Centre de Tâches
            </h1>
            <p className="text-muted-foreground text-lg">Gérez vos alertes et vos actions prioritaires en temps réel.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="shadow-sm font-semibold rounded-xl h-11" 
              onClick={handleMarkAllRead} 
              disabled={notifications.filter((n: Notification) => !n.isRead).length === 0}
            >
              <Check className="w-4 h-4 mr-2" />
              Tout marquer comme lu
            </Button>
          </div>
        </header>

        <Tabs defaultValue="unread" className="w-full space-y-6" onValueChange={(v) => setFilter(v as any)}>
          <div className="flex items-center justify-between">
            <TabsList className="bg-muted/50 p-1 rounded-xl h-12">
              <TabsTrigger value="unread" className="rounded-lg font-bold px-6 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                À traiter ({notifications.filter((n: Notification) => !n.isRead).length})
              </TabsTrigger>
              <TabsTrigger value="all" className="rounded-lg font-bold px-6 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Historique ({notifications.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="unread" className="space-y-4 focus-visible:outline-none">
            {isLoading ? (
              <div className="py-20 text-center text-muted-foreground font-medium">Chargement de vos tâches...</div>
            ) : filteredNotifs.length === 0 ? (
              <Card className="border-dashed border-2 bg-muted/20 border-muted-foreground/20">
                <CardContent className="py-20 text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                    <Check className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Tout est à jour !</h3>
                  <p className="text-muted-foreground">Vous n'avez aucune tâche en attente pour le moment.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredNotifs.map((n: Notification) => (
                  <Card key={n.id} className="group hover:border-primary/40 transition-all border-border/50 shadow-sm hover:shadow-md">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                          {getIcon(n.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4 mb-1">
                            <h3 className="font-bold text-lg text-slate-900 truncate">{n.title}</h3>
                            <Badge variant={n.priority === 'HIGH' ? 'destructive' : 'secondary'} className="text-[10px] font-black uppercase tracking-widest px-2">
                              {n.priority}
                            </Badge>
                          </div>
                          <p className="text-slate-600 mb-4 leading-relaxed">{n.message}</p>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <span className="text-xs text-slate-400 font-medium italic">
                              Reçu le {format(n.createdAt ? new Date(n.createdAt) : new Date(), 'PPpp', { locale: fr })}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-xs font-bold text-slate-400 hover:text-primary transition-colors hover:bg-primary/5" 
                                onClick={() => handleMarkRead(n.id)}
                              >
                                Marquer comme lu
                              </Button>
                              {n.dossierId && (
                                <Button size="sm" className="h-8 text-xs font-bold shadow-sm px-4 bg-primary hover:bg-primary/90" asChild>
                                  <Link href={n.type === 'NEW_DOSSIER' ? `/portail-mairie` : `/citoyen/dossier/${n.dossierId}`}>
                                    Accéder
                                    <ArrowRight className="w-3.5 h-3.5 ml-2" />
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-4 focus-visible:outline-none">
             <div className="grid gap-3">
                {notifications.map((n: Notification) => (
                  <Card key={n.id} className={`border-border/40 transition-colors ${n.isRead ? 'bg-muted/10 opacity-70' : 'bg-white border-primary/20 shadow-sm'}`}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                       <div className="flex items-center gap-4 min-w-0">
                          <div className="shrink-0">{getIcon(n.type)}</div>
                          <div className="truncate">
                            <p className={`font-bold text-sm truncate ${n.isRead ? 'text-slate-500' : 'text-slate-900'}`}>{n.title}</p>
                            <p className="text-xs text-slate-400 font-medium">Reçu le {format(n.createdAt ? new Date(n.createdAt) : new Date(), 'PP', { locale: fr })}</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                          {n.dossierId && (
                            <Button variant="outline" size="sm" asChild className="h-8 text-[10px] font-black uppercase tracking-tighter invisible group-hover:visible sm:visible">
                               <Link href={n.type === 'NEW_DOSSIER' ? `/portail-mairie` : `/citoyen/dossier/${n.dossierId}`}>
                                 Ouvrir
                               </Link>
                            </Button>
                          )}
                       </div>
                    </CardContent>
                  </Card>
                ))}
             </div>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedLayout>
  );
}
