import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  onTextSelected: (selection: { text: string; pageNumber: number; pageEndNumber: number | null }) => void;
  onVisualSelected?: (capture: {
    pageNumber: number;
    previewDataUrl: string;
    box: { x: number; y: number; width: number; height: number };
  }) => void;
  className?: string;
};

type VisualDraftSelection = {
  pageNumber: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  canvasLeft: number;
  canvasTop: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getRectBounds(selection: VisualDraftSelection) {
  const left = Math.min(selection.startX, selection.currentX);
  const top = Math.min(selection.startY, selection.currentY);
  const width = Math.abs(selection.currentX - selection.startX);
  const height = Math.abs(selection.currentY - selection.startY);
  return { left, top, width, height };
}

function resolveSelectionPageNumber(node: Node | null): number | null {
  let current: HTMLElement | null =
    node instanceof HTMLElement
      ? node
      : node?.parentElement || null;

  while (current) {
    const raw = current.dataset.pageNumber;
    if (raw) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    current = current.parentElement;
  }

  return null;
}

export function ZonePdfViewer({
  documentId,
  documentTitle,
  pageNumbers,
  fallbackPages = [],
  onTextSelected,
  onVisualSelected,
  className,
}: ZonePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageCanvasRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [viewerWidth, setViewerWidth] = useState(820);
  const [pdfUnavailable, setPdfUnavailable] = useState(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [visualMode, setVisualMode] = useState(false);
  const [visualDraft, setVisualDraft] = useState<VisualDraftSelection | null>(null);

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
    if (!visualDraft) return;

    const handlePointerMove = (event: PointerEvent) => {
      const container = pageCanvasRefs.current[visualDraft.pageNumber];
      const canvas = container?.querySelector("canvas");
      if (!container || !canvas) return;

      const containerRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const nextX = clamp(event.clientX - canvasRect.left, 0, canvasRect.width);
      const nextY = clamp(event.clientY - canvasRect.top, 0, canvasRect.height);

      setVisualDraft((current) => current ? {
        ...current,
        currentX: nextX,
        currentY: nextY,
        canvasLeft: canvasRect.left - containerRect.left,
        canvasTop: canvasRect.top - containerRect.top,
      } : current);
    };

    const handlePointerUp = () => {
      const current = visualDraft;
      const container = pageCanvasRefs.current[current.pageNumber];
      const canvas = container?.querySelector("canvas");
      if (!container || !canvas) {
        setVisualDraft(null);
        return;
      }

      const bounds = getRectBounds(current);
      if (bounds.width < 12 || bounds.height < 12) {
        setVisualDraft(null);
        return;
      }

      const canvasRect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / canvasRect.width;
      const scaleY = canvas.height / canvasRect.height;
      const sourceX = bounds.left * scaleX;
      const sourceY = bounds.top * scaleY;
      const sourceWidth = bounds.width * scaleX;
      const sourceHeight = bounds.height * scaleY;
      const maxPreviewEdge = 560;
      const ratio = Math.min(
        1,
        maxPreviewEdge / Math.max(sourceWidth || 1, sourceHeight || 1),
      );
      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = Math.max(1, Math.round(sourceWidth * ratio));
      previewCanvas.height = Math.max(1, Math.round(sourceHeight * ratio));
      const context = previewCanvas.getContext("2d");
      if (context) {
        context.drawImage(
          canvas,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          previewCanvas.width,
          previewCanvas.height,
        );
        onVisualSelected?.({
          pageNumber: current.pageNumber,
          previewDataUrl: previewCanvas.toDataURL("image/png"),
          box: {
            x: Number((sourceX / (canvas.width || 1)).toFixed(4)),
            y: Number((sourceY / (canvas.height || 1)).toFixed(4)),
            width: Number((sourceWidth / (canvas.width || 1)).toFixed(4)),
            height: Number((sourceHeight / (canvas.height || 1)).toFixed(4)),
          },
        });
      }
      setVisualDraft(null);
      setVisualMode(false);
      window.getSelection?.()?.removeAllRanges();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onVisualSelected, visualDraft]);

  useEffect(() => {
    const controller = new AbortController();
    let createdUrl: string | null = null;
    setPdfObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
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
        if (buffer.byteLength === 0) {
          throw new Error("Le PDF retourné est vide.");
        }
        const mimeType = response.headers.get("content-type") || "application/pdf";
        createdUrl = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
        setPdfObjectUrl(createdUrl);
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

    return () => {
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
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

  if (pdfUnavailable || !pdfObjectUrl) {
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
                onTextSelected({ text: selectedText, pageNumber: page.pageNumber, pageEndNumber: null });
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {visualMode
            ? "Mode capture visuelle actif : trace un rectangle sur le croquis ou le schéma."
            : "Mode texte actif : sélectionne du texte, ou active la capture visuelle pour un croquis."}
        </div>
        <div className="flex items-center gap-2">
          {visualMode ? <Badge variant="secondary">Capture visuelle active</Badge> : null}
          <Button
            type="button"
            size="sm"
            variant={visualMode ? "default" : "outline"}
            onClick={() => {
              setVisualDraft(null);
              setVisualMode((current) => !current);
              window.getSelection?.()?.removeAllRanges();
            }}
          >
            {visualMode ? "Quitter la capture" : "Capturer une pièce visuelle"}
          </Button>
        </div>
      </div>
      <Document
        file={pdfObjectUrl}
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
            data-page-number={pageNumber}
            className="overflow-hidden rounded-xl border bg-background shadow-sm"
            onMouseUp={() => {
              const selection = window.getSelection?.();
              const selectedText = selection?.toString().trim();
              if (!selection || !selectedText) return;

              const anchorPage = resolveSelectionPageNumber(selection.anchorNode);
              const focusPage = resolveSelectionPageNumber(selection.focusNode);
              const pages = [anchorPage, focusPage, pageNumber].filter((value): value is number => Number.isFinite(value));
              const startPage = Math.min(...pages);
              const endPage = Math.max(...pages);

              onTextSelected({
                text: selectedText,
                pageNumber: startPage,
                pageEndNumber: endPage > startPage ? endPage : null,
              });
            }}
          >
            <div className="border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              {documentTitle} · page {pageNumber}
            </div>
            <div
              ref={(node) => {
                pageCanvasRefs.current[pageNumber] = node;
              }}
              className={cn("relative overflow-x-auto p-3", visualMode && "touch-none select-none cursor-crosshair")}
              onPointerDown={(event) => {
                if (!visualMode) return;
                const container = pageCanvasRefs.current[pageNumber];
                const canvas = container?.querySelector("canvas");
                if (!container || !canvas) return;
                event.preventDefault();
                const containerRect = container.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                const startX = clamp(event.clientX - canvasRect.left, 0, canvasRect.width);
                const startY = clamp(event.clientY - canvasRect.top, 0, canvasRect.height);
                setVisualDraft({
                  pageNumber,
                  startX,
                  startY,
                  currentX: startX,
                  currentY: startY,
                  canvasLeft: canvasRect.left - containerRect.left,
                  canvasTop: canvasRect.top - containerRect.top,
                });
              }}
            >
              <Page
                pageNumber={pageNumber}
                width={viewerWidth}
                renderAnnotationLayer
                renderTextLayer
              />
              {visualDraft && visualDraft.pageNumber === pageNumber ? (
                <div
                  className="pointer-events-none absolute rounded-md border-2 border-primary bg-primary/10"
                  style={{
                    left: visualDraft.canvasLeft + getRectBounds(visualDraft).left,
                    top: visualDraft.canvasTop + getRectBounds(visualDraft).top,
                    width: getRectBounds(visualDraft).width,
                    height: getRectBounds(visualDraft).height,
                  }}
                />
              ) : null}
            </div>
          </div>
        ))}
      </Document>
    </div>
  );
}
