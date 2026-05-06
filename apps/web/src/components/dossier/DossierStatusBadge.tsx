import { Badge } from "@/components/ui/badge";
import { getDossierStatusMeta, type DossierStatus } from "@/lib/urbanisme/dossier/statusWorkflow";
import { CheckCircle2, Clock3, FileCheck2, FileClock, FilePenLine, Gavel, MessageSquare, Send } from "lucide-react";
import { clsx } from "clsx";
import type { ComponentType } from "react";

const ICONS: Record<DossierStatus, ComponentType<{ className?: string }>> = {
  draft: FilePenLine,
  submitted: Send,
  incomplete: FileClock,
  complete: FileCheck2,
  in_instruction: Clock3,
  in_consultation: MessageSquare,
  decision_pending: Gavel,
  signature_pending: FilePenLine,
  signed: CheckCircle2,
  notified: CheckCircle2,
};

export function DossierStatusBadge({
  status,
  className,
  prefix,
}: {
  status?: string | null;
  className?: string;
  prefix?: string;
}) {
  const meta = getDossierStatusMeta(status);
  const Icon = ICONS[meta.status];

  return (
    <Badge variant="outline" className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-bold", meta.className, className)}>
      <Icon className="h-3.5 w-3.5" />
      {prefix ? `${prefix} : ` : null}{meta.label}
    </Badge>
  );
}
