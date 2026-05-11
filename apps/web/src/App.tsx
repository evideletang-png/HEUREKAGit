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
import NewProjectPage from "@/pages/project-new";
import ProjectHubPage from "@/pages/project-hub";
import NewAnalysisPage from "@/pages/new-analysis";
import AnalysisDetailPage from "@/pages/analysis-detail";
import AdminPage from "@/pages/admin";
import AdminPermissionsPage from "@/pages/admin-permissions";
import RegulatoryControlsPage from "@/pages/regulatory-controls";
import AccountPage from "@/pages/account";
import MairiePage from "@/pages/mairie";
import DashboardMairiePage from "@/pages/dashboard-mairie";
import DossierMairieDetailPage from "@/pages/dossier-mairie-detail";
import PortailMairiePage from "@/pages/portail-mairie";
import PortailMetropolePage from "@/pages/portail-metropole";
import PortailABFPage from "@/pages/portail-abf";
import CitoyenPage from "@/pages/citoyen";
import CitoyenDossierDetailPage from "@/pages/citoyen-dossier-detail";
import CitoyenNewDossierPage from "@/pages/citoyen-new-dossier";
import OrientationEntry from "@/modules/orientation/OrientationEntry";
import TasksPage from "@/pages/tasks";
import AppealsPage from "@/pages/appeals";
import AppealDetailPage from "@/pages/appeal-detail";
import MessagingPage from "@/pages/messaging";
import DemoScenarioPage from "@/pages/demo/demo-scenario";
import { DemoRuntime } from "@/components/demo/DemoRuntime";
import { DemoAuthProvider } from "@/demo/DemoAuthProvider";
import { professionalPlaceholderFromRoute } from "@/pages/professional-placeholder";

const MairieDocumentsOpposablesPage = professionalPlaceholderFromRoute("mairie", "/portail-mairie/documents-opposables");
const MairieControlesReglementairesPage = RegulatoryControlsPage;
const MairieServicesConsultesPage = professionalPlaceholderFromRoute("mairie", "/portail-mairie/services-consultes");
const MetropoleDossiersPage = professionalPlaceholderFromRoute("metropole", "/portail-metropole/dossiers-mutualises");
const MetropoleReglementPage = professionalPlaceholderFromRoute("metropole", "/portail-metropole/reglement-intercommunal");
const MetropoleDocumentsPage = professionalPlaceholderFromRoute("metropole", "/portail-metropole/documents-opposables");
const MetropoleControlesPage = professionalPlaceholderFromRoute("metropole", "/portail-metropole/controles-reglementaires");
const MetropoleServicesPage = professionalPlaceholderFromRoute("metropole", "/portail-metropole/services-consultes");
const MetropoleSettingsPage = professionalPlaceholderFromRoute("metropole", "/portail-metropole/parametres");
const AbfDossiersPage = professionalPlaceholderFromRoute("abf", "/portail-abf/dossiers-consultes");
const AbfPrescriptionsPage = professionalPlaceholderFromRoute("abf", "/portail-abf/prescriptions-patrimoniales");
const AbfSettingsPage = professionalPlaceholderFromRoute("abf", "/portail-abf/parametres");
const AdminCommunesPage = professionalPlaceholderFromRoute("admin", "/admin/communes");
const AdminUtilisateursPage = professionalPlaceholderFromRoute("admin", "/admin/utilisateurs");
const AdminBaseDocumentairePage = professionalPlaceholderFromRoute("admin", "/admin/base-documentaire");
const AdminReglesIaPage = professionalPlaceholderFromRoute("admin", "/admin/regles-ia");
const AdminMonitoringPage = professionalPlaceholderFromRoute("admin", "/admin/monitoring");
const AdminSettingsPage = professionalPlaceholderFromRoute("admin", "/admin/parametres");

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
      <Route path="/projects/new" component={NewProjectPage} />
      <Route path="/projects/:id" component={ProjectHubPage} />
      <Route path="/analyses/new" component={NewAnalysisPage} />
      <Route path="/analyses/:id" component={AnalysisDetailPage} />
      <Route path="/admin/communes" component={AdminCommunesPage} />
      <Route path="/admin/utilisateurs" component={AdminUtilisateursPage} />
      <Route path="/admin/droits" component={AdminPermissionsPage} />
      <Route path="/admin/base-documentaire" component={AdminBaseDocumentairePage} />
      <Route path="/admin/regles-ia" component={AdminReglesIaPage} />
      <Route path="/admin/monitoring" component={AdminMonitoringPage} />
      <Route path="/admin/parametres" component={AdminSettingsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/conformite" component={MairiePage} />
      <Route path="/dashboard-mairie/messagerie" component={DashboardMairiePage} />
      <Route path="/dashboard-mairie/statistiques" component={DashboardMairiePage} />
      <Route path="/dashboard-mairie/parametres" component={DashboardMairiePage} />
      <Route path="/dashboard-mairie" component={DashboardMairiePage} />
      <Route path="/dossier/:id" component={DossierMairieDetailPage} />
      <Route path="/portail-mairie/base-ia/zones/:zoneId" component={PortailMairiePage} />
      <Route path="/portail-mairie/base-ia" component={PortailMairiePage} />
      <Route path="/portail-mairie/fiscalite" component={PortailMairiePage} />
      <Route path="/portail-mairie/regles-ia" component={PortailMairiePage} />
      <Route path="/portail-mairie/documents-opposables" component={MairieDocumentsOpposablesPage} />
      <Route path="/portail-mairie/controles-reglementaires" component={MairieControlesReglementairesPage} />
      <Route path="/portail-mairie/services-consultes" component={MairieServicesConsultesPage} />
      <Route path="/portail-mairie/:id?" component={PortailMairiePage} />
      <Route path="/portail-metropole/dossiers-mutualises" component={MetropoleDossiersPage} />
      <Route path="/portail-metropole/reglement-intercommunal" component={MetropoleReglementPage} />
      <Route path="/portail-metropole/documents-opposables" component={MetropoleDocumentsPage} />
      <Route path="/portail-metropole/controles-reglementaires" component={MetropoleControlesPage} />
      <Route path="/portail-metropole/services-consultes" component={MetropoleServicesPage} />
      <Route path="/portail-metropole/parametres" component={MetropoleSettingsPage} />
      <Route path="/portail-metropole/:id?" component={PortailMetropolePage} />
      <Route path="/portail-abf/dossiers-consultes" component={AbfDossiersPage} />
      <Route path="/portail-abf/prescriptions-patrimoniales" component={AbfPrescriptionsPage} />
      <Route path="/portail-abf/parametres" component={AbfSettingsPage} />
      <Route path="/portail-abf/:id?" component={PortailABFPage} />

      {/* Citizen Portal Routes */}
      <Route path="/citoyen" component={CitoyenPage} />
      <Route path="/citoyen/orientation" component={OrientationEntry} />
      <Route path="/citoyen/nouveau" component={CitoyenNewDossierPage} />
      <Route path="/citoyen/dossier/:id" component={CitoyenDossierDetailPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/messagerie" component={MessagingPage} />
      <Route path="/recours" component={AppealsPage} />
      <Route path="/recours/:id" component={AppealDetailPage} />

      <Route path="/demo/scenario" component={DemoScenarioPage} />
      <Route path="/demo" component={DemoScenarioPage} />

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
            <DemoAuthProvider>
              <Router />
              <DemoRuntime />
            </DemoAuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
