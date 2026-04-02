import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ data: { email, password } });
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-2 justify-center mb-6 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                <Building2 className="w-5 h-5 text-primary-foreground" />
              </div>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Bon retour</h1>
            <p className="text-muted-foreground mt-2">Connectez-vous pour accéder à vos dossiers</p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-xl border border-border/50">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="nom@exemple.fr" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 bg-background/50 focus:bg-background transition-colors"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mot de passe</Label>
                  <a href="#" className="text-sm font-medium text-primary hover:underline">Oublié ?</a>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-background/50 focus:bg-background transition-colors"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base shadow-md" disabled={isLoggingIn}>
                {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : "Se connecter"}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              S'inscrire
            </Link>
          </p>
        </div>
      </div>
      
      <div className="hidden lg:block relative bg-muted overflow-hidden">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
          alt="Architecture" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px]"></div>
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <blockquote className="text-2xl font-display font-medium leading-relaxed shadow-sm">
            "HEUREKA nous permet d'instruire les dossiers de nos administrés avec une précision et une rapidité sans précédent."
          </blockquote>
          <p className="mt-4 font-semibold">Responsable Urbanisme, Mairie de Tours</p>
        </div>
      </div>
    </div>
  );
}
