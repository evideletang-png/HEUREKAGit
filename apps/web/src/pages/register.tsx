import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const { register, isRegistering } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register({ data: { name, email, password } });
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:block relative bg-muted overflow-hidden order-last lg:order-first">
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`} 
          alt="Architecture" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px]"></div>
        <div className="absolute top-12 left-12 right-12 text-white">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-2xl mb-8 border border-white/30">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-4xl font-display font-bold leading-tight mb-4">L'urbanisme au service des citoyens et des collectivités.</h2>
          <p className="text-lg text-white/90 max-w-md">Créez votre compte pour lancer votre premier dossier d'urbanisme ou accéder aux outils d'instruction.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-center lg:text-left">
            <Link href="/" className="inline-flex lg:hidden items-center gap-2 justify-center mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                <Building2 className="w-5 h-5 text-primary-foreground" />
              </div>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Créer un compte</h1>
            <p className="text-muted-foreground mt-2">Rejoignez la plateforme HEUREKA pour vos projets d'urbanisme</p>
          </div>

          <div className="bg-card p-8 rounded-2xl shadow-xl border border-border/50">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nom complet</Label>
                <Input 
                  id="name" 
                  placeholder="Jean Dupont" 
                  required 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="nom@exemple.fr" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-background/50"
                />
                <p className="text-xs text-muted-foreground mt-1">8 caractères minimum.</p>
              </div>
              <Button type="submit" className="w-full h-12 text-base shadow-md" disabled={isRegistering}>
                {isRegistering ? <Loader2 className="w-5 h-5 animate-spin" /> : "S'inscrire"}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte ?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
