import { FileText, Search, Gavel, MessageSquare } from "lucide-react";

export type DossierTabType = "recapitulatif" | "analyse" | "instruction" | "historique";

interface TabDefinition {
  key: DossierTabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    key: "recapitulatif",
    label: "Récapitulatif du dossier",
    icon: FileText,
    description: "Vue d'ensemble du projet et des informations principales"
  },
  {
    key: "analyse",
    label: "Analyse du dossier", 
    icon: Search,
    description: "Analyse détaillée des pièces et conformité réglementaire"
  },
  {
    key: "instruction",
    label: "Instruction",
    icon: Gavel,
    description: "Délais, timeline et actions d'instruction"
  },
  {
    key: "historique",
    label: "Historique & Messages",
    icon: MessageSquare,
    description: "Événements et communications"
  }
];

export interface DossierTabsProps {
  activeTab: DossierTabType;
  onTabChange: (tab: DossierTabType) => void;
  className?: string;
}

export function DossierTabs({ activeTab, onTabChange, className }: DossierTabsProps) {
  return (
    <div className={`bg-white border-b border-slate-200 ${className || ""}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-8 overflow-x-auto">
          {TAB_DEFINITIONS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={`group flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-slate-950 text-slate-950"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}