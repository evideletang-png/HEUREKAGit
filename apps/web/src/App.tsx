import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
import NewAnalysisPage from "@/pages/new-analysis";
import AnalysisDetailPage from "@/pages/analysis-detail";
import AdminPage from "@/pages/admin";
import AccountPage from "@/pages/account";
import MairiePage from "@/pages/mairie";
import PortailMairiePage from "@/pages/portail-mairie";
import PortailMetropolePage from "@/pages/portail-metropole";
import PortailABFPage from "@/pages/portail-abf";
import CitoyenPage from "@/pages/citoyen";
import CitoyenDossierDetailPage from "@/pages/citoyen-dossier-detail";
import CitoyenNewDossierPage from "@/pages/citoyen-new-dossier";
import TasksPage from "@/pages/tasks";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      {/* Protected Routes - Protection logic is inside ProtectedLayout */}
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/analyses/new" component={NewAnalysisPage} />
      <Route path="/analyses/:id" component={AnalysisDetailPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/conformite" component={MairiePage} />
      <Route path="/portail-mairie/:id?" component={PortailMairiePage} />
      <Route path="/portail-metropole/:id?" component={PortailMetropolePage} />
      <Route path="/portail-abf/:id?" component={PortailABFPage} />

      {/* Citizen Portal Routes */}
      <Route path="/citoyen" component={CitoyenPage} />
      <Route path="/citoyen/nouveau" component={CitoyenNewDossierPage} />
      <Route path="/citoyen/dossier/:id" component={CitoyenDossierDetailPage} />
      <Route path="/tasks" component={TasksPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
