import { AlertCircle, CheckCircle2, Circle, Clock3, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CerfaSectionDefinition, CerfaSectionStatus } from "@/lib/urbanisme/cerfa/cerfaFormSchema";

const STATUS_LABELS: Record<CerfaSectionStatus, string> = {
  not_started: "Non commencé",
  in_progress: "En cours",
  complete: "Complet",
  error: "Erreur",
  not_applicable: "Non concerné",
};

function StatusIcon({ status }: { status: CerfaSectionStatus }) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-red-600" />;
  if (status === "in_progress") return <Clock3 className="h-4 w-4 text-amber-600" />;
  if (status === "not_applicable") return <FileQuestion className="h-4 w-4 text-slate-400" />;
  return <Circle className="h-4 w-4 text-slate-300" />;
}

export function CerfaSectionSidebar(props: {
  sections: CerfaSectionDefinition[];
  activeSectionId: string;
  statuses: Record<string, CerfaSectionStatus>;
  onSelect: (sectionId: string) => void;
}) {
  return (
    <aside className="sticky top-6 h-fit rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="px-2 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rubriques CERFA</p>
      </div>
      <nav className="space-y-1">
        {props.sections.map((section) => {
          const status = props.statuses[section.id] || "not_started";
          const active = props.activeSectionId === section.id;
          return (
            <Button
              key={section.id}
              type="button"
              variant="ghost"
              className={cn(
                "h-auto w-full justify-start gap-2 rounded-md px-2 py-2 text-left text-sm",
                active ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-slate-700 hover:bg-slate-50",
              )}
              onClick={() => props.onSelect(section.id)}
            >
              <span className={cn("shrink-0", active && "[&_svg]:text-primary-foreground")}>
                <StatusIcon status={status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{section.title}</span>
                <span className={cn("block truncate text-[11px]", active ? "text-primary-foreground/75" : "text-slate-500")}>
                  {STATUS_LABELS[status]}
                </span>
              </span>
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}
