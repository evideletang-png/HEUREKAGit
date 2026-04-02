import { AlertCircle, FilePlus, HelpCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MissingInfoAlertProps {
  type: "citizen" | "expert";
  missingFields: string[];
  reason?: string;
  onAction?: () => void;
  className?: string;
}

export function MissingInfoAlert({ type, missingFields, reason, onAction, className }: MissingInfoAlertProps) {
  const isExpert = type === "expert";

  return (
    <Alert className={cn("bg-amber-50 border-amber-200 shadow-sm", className)}>
      <div className="flex items-start gap-3">
        <HelpCircle className="h-5 w-5 mt-0.5 text-amber-600" />
        <div className="flex-1">
          <AlertTitle className="text-amber-900 font-bold mb-1">
            {isExpert ? "Analyse incomplète / Revue nécessaire" : "Information manquante détectée"}
          </AlertTitle>
          <AlertDescription className="text-amber-800/80 text-[13px] leading-relaxed">
            {reason || (isExpert 
              ? "L'IA n'a pas pu conclure sur ce point réglementaire en raison de données manquantes ou trop ambiguës."
              : "Certaines informations nécessaires à la validation automatique n'ont pas pu être extraites de vos documents.")}
            
            {missingFields.length > 0 && (
              <div className="mt-2 text-[11px] font-semibold bg-amber-100/50 px-2 py-1 rounded inline-block">
                Éléments concernés : {missingFields.join(", ")}
              </div>
            )}
            
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              {isExpert ? (
                <>
                  <Button size="sm" variant="outline" className="h-8 text-[11px] bg-amber-50" onClick={onAction}>
                    Forcer la conformité manuelle
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-[11px]">
                    Notifier le citoyen
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" className="h-8 text-[11px] gap-2 bg-amber-600 hover:bg-amber-700" onClick={onAction}>
                    <FilePlus className="w-3.5 h-3.5" /> Déposer une pièce justificative
                  </Button>
                  <p className="text-[10px] italic self-center">
                    Ceci aidera à débloquer l'analyse de votre dossier.
                  </p>
                </>
              )}
            </div>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
