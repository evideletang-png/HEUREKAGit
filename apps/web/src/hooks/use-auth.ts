import { useGetMe, useLogin, useRegister, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export function useAuth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData([`/api/auth/me`], data.user);
        toast({
          title: "Connexion réussie",
          description: "Bienvenue sur HEUREKA.",
        });
        const role = (data.user.role as any);
        if (data.user.email?.toLowerCase() === "test@heureka.fr") setLocation("/demo");
        else if (role === "admin" || role === "super_admin") setLocation("/admin");
        else if (role === "mairie") setLocation("/portail-mairie");
        else if (role === "metropole") setLocation("/portail-metropole");
        else if (role === "abf") setLocation("/portail-abf");
        else if (role === "citoyen" || role === "user") setLocation("/citoyen");
        else setLocation("/dashboard");
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Erreur de connexion",
          description: err.message || "Vérifiez vos identifiants.",
        });
      }
    }
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData([`/api/auth/me`], data.user);
        toast({
          title: "Inscription réussie",
          description: "Votre compte a été créé avec succès.",
        });
        if ((data.user.role as string) === "admin") setLocation("/admin");
        else if ((data.user.role as string) === "mairie") setLocation("/conformite");
        else setLocation("/citoyen");
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Erreur d'inscription",
          description: err.message || "Une erreur est survenue.",
        });
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData([`/api/auth/me`], null);
        queryClient.clear();
        setLocation("/login");
      }
    }
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
