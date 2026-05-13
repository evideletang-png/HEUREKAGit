import { useState } from "react";
import { Eye, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DocumentScoreIndicator, type DocumentStatus } from "./DocumentScoreIndicator";

export interface DocumentAnalysisData {
  id: string;
  title?: string | null;
  fileName?: string | null;
  documentType?: string | null;
  detectedCode?: string;
  status: DocumentStatus;
  score?: number;
  confidence?: number;
  aiPreAnalysis?: string;
  alerts?: string[];
  createdAt?: string | null;
}

interface DocumentAnalysisCardProps {
  document: DocumentAnalysisData;
  onValidate?: (documentId: string) => void;
  onRequestCorrection?: (documentId: string, note: string) => void;
  onAnnotate?: (documentId: string, annotation: string) => void;
  onView?: (documentId: string) => void;
}

export function DocumentAnalysisCard({ 
  document, 
  onValidate, 
  onRequestCorrection, 
  onAnnotate,
  onView 
}: DocumentAnalysisCardProps) {
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");

  const handleAnnotate = () => {
    if (annotation.trim() && onAnnotate) {
      onAnnotate(document.id, annotation);
      setAnnotation("");
      setIsAnnotating(false);
    }
  };

  const handleRequestCorrection = () => {
    if (correctionNote.trim() && onRequestCorrection) {
      onRequestCorrection(document.id, correctionNote);
      setCorrectionNote("");
      setIsRequesting(false);
    }
  };

  const displayName = document.title || document.fileName || document.documentType || "Document sans titre";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {/* En-tête document */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{displayName}</h3>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              {document.detectedCode && (
                <Badge variant="outline" className="font-mono text-xs">
                  {document.detectedCode}
                </Badge>
              )}
              {document.documentType && (
                <span className="text-slate-500">
                  Type: {document.documentType}
                </span>
              )}
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={() => onView?.(document.id)}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Statut et score */}
      <div className="mb-4">
        <DocumentScoreIndicator 
          status={document.status}
          score={document.score}
          confidence={document.confidence}
        />
      </div>

      {/* Pré-analyse IA */}
      {document.aiPreAnalysis && (
        <div className="mb-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Pré-analyse IA :</p>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {document.aiPreAnalysis}
          </div>
        </div>
      )}

      {/* Alertes et incohérences */}
      {document.alerts && document.alerts.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Alertes détectées :</p>
          <div className="space-y-2">
            {document.alerts.map((alert, index) => (
              <div key={index} className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                {alert}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {document.status !== "validated" && (
            <Button 
              size="sm" 
              variant="default" 
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onValidate?.(document.id)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Valider comme conforme
            </Button>
          )}
          
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => setIsAnnotating(!isAnnotating)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Annoter
          </Button>
          
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => setIsRequesting(!isRequesting)}
          >
            <Send className="h-4 w-4 mr-2" />
            Demander correction
          </Button>
        </div>

        {/* Zone d'annotation */}
        {isAnnotating && (
          <div className="space-y-2">
            <Textarea
              placeholder="Ajouter une annotation..."
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              className="min-h-20"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAnnotate}>
                Ajouter annotation
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsAnnotating(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* Zone de demande de correction */}
        {isRequesting && (
          <div className="space-y-2">
            <Textarea
              placeholder="Motif de la demande de correction..."
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              className="min-h-20"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleRequestCorrection}>
                Envoyer demande
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsRequesting(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}