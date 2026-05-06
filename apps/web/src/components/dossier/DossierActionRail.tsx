import { ArrowLeft, CheckCircle2, Download, Save, Send, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function DossierActionRail(props: {
  completionRate: number;
  canTransmit: boolean;
  isSaving?: boolean;
  isTransmitting?: boolean;
  onImport: () => void;
  onExport: () => void;
  onVerify: () => void;
  onSave: () => void;
  onTransmit: () => void;
  onBack: () => void;
}) {
  const completion = Math.round(props.completionRate);
  return (
    <aside className="sticky top-6 h-fit rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-slate-600">Complétude</span>
          <Badge variant={props.canTransmit ? "default" : "outline"}>{completion}%</Badge>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, completion))}%` }} />
        </div>
      </div>

      <div className="grid gap-2">
        <Button type="button" variant="outline" className="justify-start gap-2" onClick={props.onImport}>
          <Upload className="h-4 w-4" />
          Importer un dossier
        </Button>
        <Button type="button" variant="outline" className="justify-start gap-2" onClick={props.onExport}>
          <Download className="h-4 w-4" />
          Exporter le dossier
        </Button>
        <Button type="button" variant="outline" className="justify-start gap-2" onClick={props.onVerify}>
          <Wand2 className="h-4 w-4" />
          Vérifier ma saisie
        </Button>
        <Button type="button" variant="outline" className="justify-start gap-2" onClick={props.onSave} disabled={props.isSaving}>
          <Save className="h-4 w-4" />
          Sauvegarder
        </Button>
        <Button
          type="button"
          className="justify-start gap-2"
          onClick={props.onTransmit}
          disabled={!props.canTransmit || props.isTransmitting}
        >
          {props.canTransmit ? <Send className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          Transmettre ma demande
        </Button>
        <Button type="button" variant="ghost" className="justify-start gap-2" onClick={props.onBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>
    </aside>
  );
}
