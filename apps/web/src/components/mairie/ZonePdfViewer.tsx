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
  fallbackPages?: Array<{ pageNumber: number; text: string }>;
  onTextSelected: (selection: { text: string; pageNumber: number }) => void;
  className?: string;
};

export function ZonePdfViewer({
  documentId,
  documentTitle,
  pageNumbers,
  fallbackPages = [],
  onTextSelected,
  className,
}: ZonePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewerWidth, setViewerWidth] = useState(820);
  const [pdfUnavailable, setPdfUnavailable] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    setPdfBytes(null);
    setPdfError(null);
    setPdfUnavailable(false);
    setPdfLoading(true);

    fetch(`/api/mairie/documents/${documentId}/view`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.message || payload?.error || "Impossible de récupérer le PDF.");
        }
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (bytes.length === 0) {
          throw new Error("Le PDF retourné est vide.");
        }
        setPdfBytes(bytes);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPdfUnavailable(true);
        setPdfError(error instanceof Error ? error.message : "Impossible d’ouvrir le PDF source.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPdfLoading(false);
        }
      });

    return () => controller.abort();
  }, [documentId]);

  if (pdfLoading) {
    return (
      <div ref={containerRef} className={cn("rounded-2xl border bg-muted/15 p-4", className)}>
        <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Chargement du PDF…
        </div>
      </div>
    );
  }

  if (pdfUnavailable || !pdfBytes) {
    return (
      <div ref={containerRef} className={cn("rounded-2xl border bg-muted/15 p-4", className)}>
        <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {pdfError || "Impossible d’ouvrir le PDF source."}
        </div>
        <div className="space-y-4">
          {fallbackPages.length > 0 ? fallbackPages.map((page) => (
            <div
              key={page.pageNumber}
              className="overflow-hidden rounded-xl border bg-background shadow-sm"
              onMouseUp={() => {
                const selectedText = window.getSelection?.()?.toString().trim();
                if (!selectedText) return;
                onTextSelected({ text: selectedText, pageNumber: page.pageNumber });
              }}
            >
              <div className="border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                {documentTitle} · page {page.pageNumber}
              </div>
              <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap px-4 py-3 text-sm leading-6 text-foreground">
                {page.text || "Aucun texte extrait pour cette page."}
              </pre>
            </div>
          )) : (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-destructive">
              Aucun texte borné n’est disponible pour cette zone.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("rounded-2xl border bg-muted/15 p-4", className)}>
      <Document
        file={{ data: pdfBytes }}
        onLoadError={(error) => {
          setPdfUnavailable(true);
          setPdfError(error instanceof Error ? error.message : "Impossible d’ouvrir le PDF source.");
        }}
        loading={(
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Chargement du PDF…
          </div>
        )}
        error={(
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            Bascule vers le texte extrait…
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
