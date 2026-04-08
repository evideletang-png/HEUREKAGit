import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type ZonePdfViewerProps = {
  documentId: string;
  documentTitle: string;
  pageNumbers: number[];
  onTextSelected: (selection: { text: string; pageNumber: number }) => void;
  className?: string;
};

export function ZonePdfViewer({
  documentId,
  documentTitle,
  pageNumbers,
  onTextSelected,
  className,
}: ZonePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewerWidth, setViewerWidth] = useState(820);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      setViewerWidth(Math.max(320, Math.min(element.clientWidth - 32, 960)));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sortedPages = useMemo(
    () => pageNumbers.slice().sort((left, right) => left - right),
    [pageNumbers],
  );

  return (
    <div ref={containerRef} className={cn("rounded-2xl border bg-muted/15 p-4", className)}>
      <Document
        file={`/api/mairie/documents/${documentId}/view`}
        loading={(
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Chargement du PDF…
          </div>
        )}
        error={(
          <div className="flex min-h-[420px] items-center justify-center text-sm text-destructive">
            Impossible d’ouvrir le PDF source.
          </div>
        )}
        className="space-y-4"
      >
        {sortedPages.map((pageNumber) => (
          <div
            key={pageNumber}
            className="overflow-hidden rounded-xl border bg-background shadow-sm"
            onMouseUp={() => {
              const selectedText = window.getSelection?.()?.toString().trim();
              if (!selectedText) return;
              onTextSelected({ text: selectedText, pageNumber });
            }}
          >
            <div className="border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              {documentTitle} · page {pageNumber}
            </div>
            <div className="overflow-x-auto p-3">
              <Page
                pageNumber={pageNumber}
                width={viewerWidth}
                renderAnnotationLayer
                renderTextLayer
              />
            </div>
          </div>
        ))}
      </Document>
    </div>
  );
}
