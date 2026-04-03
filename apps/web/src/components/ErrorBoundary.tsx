import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
    // Chunk load failures (after a new deploy) → force a full page reload once
    const msg = error instanceof Error ? error.message : String(error);
    const isChunkError = msg.includes("Failed to fetch dynamically imported module")
      || msg.includes("Importing a module script failed")
      || msg.includes("ChunkLoadError")
      || msg.toLowerCase().includes("loading chunk");
    if (isChunkError && !sessionStorage.getItem("chunk_reload_attempted")) {
      sessionStorage.setItem("chunk_reload_attempted", "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <h1 className="text-2xl font-bold mb-2">Une erreur inattendue s'est produite</h1>
            <p className="text-muted-foreground mb-6 text-sm font-mono break-all">{this.state.message}</p>
            <Button onClick={() => { this.setState({ hasError: false, message: "" }); window.location.href = "/"; }}>
              Retour à l'accueil
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
