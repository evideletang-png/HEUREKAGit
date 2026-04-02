import { TraceabilityReference } from "@workspace/ai-core";
import { ExternalLink, FileText, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TraceabilityViewerProps {
  sources: TraceabilityReference[];
  className?: string;
}

export function TraceabilityViewer({ sources, className }: TraceabilityViewerProps) {
  if (!sources || sources.length === 0) {
    return (
      <div className="p-3 bg-muted/30 rounded-lg border border-dashed border-border text-xs text-muted-foreground italic">
        Aucune source textuelle n'est rattachée à cet élément.
      </div>
    );
  }

  return (
    <div className={className}>
      <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
        <MapPin className="w-3 h-3" /> Traçabilité des sources
      </h5>
      <div className="space-y-2">
        {sources.map((src, i) => (
          <div key={i} className="group relative bg-white border border-border/60 hover:border-primary/30 rounded-lg p-3 transition-colors shadow-sm ring-1 ring-border/5">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-primary/80">
                <FileText className="w-3 h-3" />
                <span className="truncate max-w-[150px]">{src.file_name || "Document source"}</span>
                {src.page_number && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold">
                    Page {src.page_number}
                  </Badge>
                )}
              </div>
              <button className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 font-medium transition-colors">
                <ExternalLink className="w-2.5 h-2.5" /> Voir l'original
              </button>
            </div>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 rounded-full" />
              <blockquote className="pl-4 text-[11px] text-slate-600 leading-relaxed font-mono italic">
                "{src.raw_snippet}"
              </blockquote>
            </div>
            {src.relevance_score < 0.8 && (
              <div className="mt-2 text-[9px] text-amber-600 font-medium flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-amber-500" />
                Pertinence estimée : {Math.round(src.relevance_score * 100)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
