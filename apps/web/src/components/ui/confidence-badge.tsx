import { Badge } from "@/components/ui/badge";
import { RuleArticleConfidence } from "@workspace/api-client-react";
import { AIConfidence, ReviewStatus } from "@workspace/ai-core";
import { AlertCircle, CheckCircle, HelpCircle, Info, XCircle, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConfidenceBadgeProps {
  confidence?: RuleArticleConfidence | string | AIConfidence;
  type?: 'data' | 'ai';
  className?: string;
  showDetails?: boolean;
}

export function ConfidenceBadge({ confidence, type = 'ai', className, showDetails = true }: ConfidenceBadgeProps) {
  if (!confidence) return null;

  // Handle new AIConfidence object
  if (typeof confidence === 'object' && 'review_status' in confidence) {
    const aiConf = confidence as AIConfidence;
    
    const statusConfig: Record<ReviewStatus, { label: string; classes: string; icon: any }> = {
      "auto_ok": { 
        label: "Auto-validé", 
        classes: "bg-emerald-50 text-emerald-700 border-emerald-200", 
        icon: <CheckCircle className="w-3 h-3 mr-1" /> 
      },
      "review_recommended": { 
        label: "Revue conseillée", 
        classes: "bg-blue-50 text-blue-700 border-blue-200", 
        icon: <Info className="w-3 h-3 mr-1" /> 
      },
      "manual_required": { 
        label: "Action requise", 
        classes: "bg-amber-50 text-amber-700 border-amber-200", 
        icon: <AlertTriangle className="w-3 h-3 mr-1" /> 
      }
    };

    const config = statusConfig[aiConf.review_status];
    
    const badge = (
      <Badge variant="outline" className={clsx("font-medium text-[10px] py-0 h-5 px-1.5", config.classes, className)}>
        {config.icon}
        {config.label}
        {aiConf.score < 0.6 && <span className="ml-1 opacity-60">({Math.round(aiConf.score * 100)}%)</span>}
      </Badge>
    );

    if (!showDetails) return badge;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-block cursor-help">{badge}</div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs p-3 space-y-2">
            <div>
              <p className="font-bold text-[11px] mb-1">Score de confiance : {Math.round(aiConf.score * 100)}%</p>
              <p className="opacity-90">{aiConf.reason || "Analyse automatisée sans justification spécifique."}</p>
            </div>
            {aiConf.ambiguities.length > 0 && (
              <div className="pt-1 border-t border-primary-foreground/20">
                <p className="font-bold text-[10px] flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" /> Ambiguités détectées :
                </p>
                <ul className="list-disc list-inside mt-1 opacity-80">
                  {aiConf.ambiguities.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {aiConf.missing_critical_data.length > 0 && (
              <div className="pt-1 border-t border-primary-foreground/20">
                <p className="font-bold text-[10px] text-red-200 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Données manquantes :
                </p>
                <ul className="list-disc list-inside mt-1 text-red-100/80">
                  {aiConf.missing_critical_data.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Legacy string-based or data-based logic
  if (type === 'data') {
    const dataConfig: Record<string, any> = {
      'Donnée récupérée': { classes: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle className="w-3 h-3 mr-1" /> },
      'Donnée estimée': { classes: "bg-amber-50 text-amber-700 border-amber-200", icon: <AlertCircle className="w-3 h-3 mr-1" /> },
      'Donnée non trouvée': { classes: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="w-3 h-3 mr-1" /> },
    };
    const conf = dataConfig[confidence as string] || { classes: "bg-gray-100 text-gray-700 border-gray-200", icon: <Info className="w-3 h-3 mr-1" /> };
    
    return (
      <Badge variant="outline" className={clsx("font-medium", conf.classes, className)}>
        {conf.icon}
        {confidence as string}
      </Badge>
    );
  }

  const aiConfig = {
    [RuleArticleConfidence.high]: { label: "Confiance élevée", classes: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle className="w-3 h-3 mr-1" /> },
    [RuleArticleConfidence.medium]: { label: "Confiance moyenne", classes: "bg-amber-50 text-amber-700 border-amber-200", icon: <AlertCircle className="w-3 h-3 mr-1" /> },
    [RuleArticleConfidence.low]: { label: "Confiance faible", classes: "bg-red-50 text-red-700 border-red-200", icon: <AlertCircle className="w-3 h-3 mr-1" /> },
    [RuleArticleConfidence.unknown]: { label: "Non identifié", classes: "bg-gray-100 text-gray-700 border-gray-200", icon: <HelpCircle className="w-3 h-3 mr-1" /> },
  };

  const conf = aiConfig[confidence as keyof typeof aiConfig] || aiConfig[RuleArticleConfidence.unknown];

  return (
    <Badge variant="outline" className={clsx("font-medium text-xs", conf.classes, className)}>
      {conf.icon}
      {conf.label}
    </Badge>
  );
}
