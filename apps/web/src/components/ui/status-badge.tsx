import { Badge } from "@/components/ui/badge";
import { AnalysisStatus } from "@workspace/api-client-react";
import { Loader2, CheckCircle2, XCircle, FileText, Map, Calculator, PlayCircle } from "lucide-react";
import { clsx } from "clsx";

interface StatusBadgeProps {
  status: AnalysisStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = {
    [AnalysisStatus.draft]: {
      label: "Brouillon",
      icon: <PlayCircle className="w-3 h-3 mr-1" />,
      classes: "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
    },
    [AnalysisStatus.collecting_data]: {
      label: "Collecte des données",
      icon: <Map className="w-3 h-3 mr-1 animate-pulse" />,
      classes: "bg-blue-50 text-blue-700 border-blue-200"
    },
    [AnalysisStatus.parsing_documents]: {
      label: "Analyse PLU",
      icon: <FileText className="w-3 h-3 mr-1 animate-pulse" />,
      classes: "bg-indigo-50 text-indigo-700 border-indigo-200"
    },
    [AnalysisStatus.extracting_rules]: {
      label: "Extraction des règles",
      icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />,
      classes: "bg-violet-50 text-violet-700 border-violet-200"
    },
    [AnalysisStatus.calculating]: {
      label: "Calcul constructibilité",
      icon: <Calculator className="w-3 h-3 mr-1 animate-bounce" />,
      classes: "bg-purple-50 text-purple-700 border-purple-200"
    },
    [AnalysisStatus.completed]: {
      label: "Terminé",
      icon: <CheckCircle2 className="w-3 h-3 mr-1" />,
      classes: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
    },
    [AnalysisStatus.failed]: {
      label: "Échoué",
      icon: <XCircle className="w-3 h-3 mr-1" />,
      classes: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
    }
  };

  const { label, icon, classes } = config[status] || config[AnalysisStatus.draft];

  return (
    <Badge variant="outline" className={clsx("font-medium py-1 px-2.5 shadow-sm transition-colors", classes, className)}>
      {icon}
      {label}
    </Badge>
  );
}
