import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, FileSearch, Calculator, FileOutput, ShieldCheck, Building, Building2, Zap } from "lucide-react";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" }
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative pt-20 pb-32 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
              alt="Background architecture" 
              className="w-full h-full object-cover opacity-20 dark:opacity-10 mix-blend-multiply"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background"></div>
          </div>
          
          <div className="container mx-auto px-4 md:px-8 relative z-10">
            <motion.div 
              className="max-w-4xl mx-auto text-center"
              initial="initial"
              animate="animate"
              variants={stagger}
            >
              <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent font-medium text-sm mb-6 border border-accent/20">
                <Zap className="w-4 h-4" />
                <span>Nouveau : Analyse IA des PLU</span>
              </motion.div>
              
              <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-bold text-primary mb-6 leading-tight">
                Simplifiez vos <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">dossiers d'urbanisme</span> et la conformité au PLU.
              </motion.h1>
              
              <motion.p variants={fadeIn} className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
                HEUREKA est la plateforme d’assistance aux dossiers d’urbanisme et d’analyse de conformité au PLU pour les citoyens et les collectivités locales.
              </motion.p>
              
              <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg shadow-xl shadow-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all" asChild>
                  <Link href="/register">
                    Créer mon dossier
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg border-2" asChild>
                  <Link href="#comment-ca-marche">Espace Collectivité</Link>
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4 md:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Un accompagnement complet et transparent</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">De l'identification de la parcelle à la validation du dossier, HEUREKA simplifie les échanges entre citoyens et services instructeurs.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { icon: MapPin, title: "Identification Parcellaire", desc: "Localisez précisément votre projet et récupérez instantanément les données cadastrales officielles." },
                { icon: FileSearch, title: "Conformité au PLU", desc: "Vérifiez automatiquement la conformité de votre projet avec le Règlement Local d'Urbanisme (PLU/PLUi)." },
                { icon: Calculator, title: "Assistance au Dossier", desc: "Générez les pièces nécessaires et suivez l'avancement de votre demande pas à pas." },
                { icon: FileOutput, title: "Interface Collaborative", desc: "Échangez directement avec votre mairie et les services experts (ABF, Métropole) en toute transparence." }
              ].map((feature, i) => (
                <div key={i} className="bg-background rounded-2xl p-8 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 group">
                  <div className="w-14 h-14 rounded-xl bg-primary/5 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <feature.icon className="w-7 h-7 text-primary group-hover:text-primary-foreground transition-colors" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Personas */}
        <section className="py-24 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 md:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              <div className="lg:w-1/2">
                <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">Une plateforme pour tous les acteurs du territoire</h2>
                <p className="text-primary-foreground/80 text-lg mb-8 leading-relaxed">
                  HEUREKA offre des outils spécifiques pour chaque profil utilisateur, garantissant une instruction fluide et sécurisée.
                </p>
                <ul className="space-y-4">
                  {[
                    "Citoyens et Porteurs de projets",
                    "Mairies et Services Urbanisme",
                    "Métropoles et Intercommunalités",
                    "Architectes des Bâtiments de France (ABF)"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-lg font-medium text-white/90">
                      <ShieldCheck className="w-6 h-6 text-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:w-1/2 relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-accent to-blue-400 rounded-3xl blur-3xl opacity-30 animate-pulse"></div>
                <div className="relative bg-card text-card-foreground rounded-3xl p-8 shadow-2xl border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <Building className="w-8 h-8 text-primary" />
                      <div>
                        <h4 className="font-bold text-lg">Dossier #2026-04</h4>
                        <p className="text-sm text-muted-foreground">Projet d'extension - Zone URb1</p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">En cours d'instruction</div>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-background rounded-xl border border-border">
                      <p className="text-sm text-muted-foreground mb-1">Conformité PLU</p>
                      <p className="text-2xl font-bold text-primary">Validée <span className="text-sm font-normal text-muted-foreground">(Articles 1-14)</span></p>
                    </div>
                    <div className="p-4 bg-background rounded-xl border border-border">
                      <p className="text-sm text-muted-foreground mb-1">Avis expert (ABF)</p>
                      <p className="text-2xl font-bold text-primary">Favorable <span className="text-sm font-normal text-muted-foreground">(Zone Patrimoine)</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-border py-12">
        <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Building2 className="w-5 h-5 text-primary" />
            <span className="font-display font-bold text-lg text-primary">HEUREKA</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2025 HEUREKA SaaS. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
