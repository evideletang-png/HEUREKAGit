import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages — each becomes its own JS chunk loaded on demand
const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/landing"));
const LoginPage = lazy(() => import("@/pages/login"));
const RegisterPage = lazy(() => import("@/pages/register"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const NewAnalysisPage = lazy(() => import("@/pages/new-analysis"));
const AnalysisDetailPage = lazy(() => import("@/pages/analysis-detail"));
const AdminPage = lazy(() => import("@/pages/admin"));
const AccountPage = lazy(() => import("@/pages/account"));
const MairiePage = lazy(() => import("@/pages/mairie"));
const PortailMairiePage = lazy(() => import("@/pages/portail-mairie"));
const PortailMetropolePage = lazy(() => import("@/pages/portail-metropole"));
const PortailABFPage = lazy(() => import("@/pages/portail-abf"));
const CitoyenPage = lazy(() => import("@/pages/citoyen"));
const CitoyenDossierDetailPage = lazy(() => import("@/pages/citoyen-dossier-detail"));
const CitoyenNewDossierPage = lazy(() => import("@/pages/citoyen-new-dossier"));
const TasksPage = lazy(() => import("@/pages/tasks"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
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
