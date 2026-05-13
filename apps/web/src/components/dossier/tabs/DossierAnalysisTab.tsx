import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { DocumentAnalysisCard, type DocumentAnalysisData } from "../pieces/DocumentAnalysisCard";
import type { DossierDetail } from "@/hooks/dossier/useDossierData";
import type { ConformityAnalysisResult } from "@/lib/urbanisme/conformity/conformityAnalysisService";
import { OFFICIAL_PIECES } from "@/lib/urbanisme/cerfa/officialPieces.registry";
import { normalizeOfficialDossierType } from "@/lib/urbanisme/cerfa/resolveOfficialPieces";
import type { DossierType } from "@/lib/urbanisme/cerfa/officialPieces.types";

interface DossierAnalysisTabProps {
  dossier: DossierDetail;
  conformityAnalysis: ConformityAnalysisResult;
}

function inferDocumentCode(document: NonNullable<DossierDetail["documents"]>[number]) {
  const raw = `${document.title || ""} ${document.fileName || ""} ${document.documentType || ""}`;
  return raw.match(/\b(PCMI|DPC|DPA|PC|PA|PD)\s*[-_ ]?\s*(\d+(?:-\d+)?)\b/i)?.[0]?.replace(/\s+/g, "").toUpperCase();
}

function getOfficialPiecesForProcedure(type: DossierType) {
  const pieces = OFFICIAL_PIECES[type] || [];
  return [...pieces].sort((a, b) => {
    const aMatch = a.code.match(/^([A-Z]+)(\d+)(?:-(\d+))?/);
    const bMatch = b.code.match(/^([A-Z]+)(\d+)(?:-(\d+))?/);
    if (!aMatch || !bMatch) return 0;
    return Number(aMatch[2]) * 10 + Number(aMatch[3] || 0) - (Number(bMatch[2]) * 10 + Number(bMatch[3] || 0));
  });
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function DossierAnalysisTab({ dossier, conformityAnalysis }: DossierAnalysisTabProps) {
  const dossierType = normalizeOfficialDossierType(dossier.typeProcedure || dossier.title || dossier.dossierNumber || "DPC");
  const officialPieces = getOfficialPiecesForProcedure(dossierType);
  
  // Transformer les documents en données d'analyse
  const documentsAnalysis = useMemo(() => {
    const documents = dossier.documents || [];
    const analysisData: DocumentAnalysisData[] = [];

    // Documents déposés
    documents.forEach((doc) => {
      const detectedCode = inferDocumentCode(doc);
      const matchedPiece = conformityAnalysis.completeness.matchedPieces.find(
        match => match.document.filename === (doc.fileName || doc.title || doc.documentType)
      );
      const ambiguousMatch = conformityAnalysis.completeness.ambiguousMatches.find(
        match => match.document?.filename === (doc.fileName || doc.title || doc.documentType)
      );

      let status: DocumentAnalysisData["status"] = "detected";
      let score = 70;
      let aiPreAnalysis = "Document détecté et en cours d'analyse.";
      let alerts: string[] = [];

      if (doc.status === "validated") {
        status = "validated";
        score = 95;
        aiPreAnalysis = "Document validé manuellement par l'instructeur.";
      } else if (matchedPiece) {
        status = "detected";
        score = Math.round(matchedPiece.confidence * 100);
        aiPreAnalysis = `Document identifié comme ${matchedPiece.piece.label}. Correspondance automatique avec ${matchedPiece.confidence > 0.8 ? 'forte' : 'modérée'} confiance.`;
      } else if (ambiguousMatch) {
        status = "incomplete";
        score = 45;
        aiPreAnalysis = ambiguousMatch.reason;
        alerts.push("Correspondance ambiguë détectée - vérification manuelle recommandée");
      }

      analysisData.push({
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        documentType: doc.documentType,
        detectedCode,
        status,
        score,
        confidence: matchedPiece?.confidence || 0.7,
        aiPreAnalysis,
        alerts,
        createdAt: doc.createdAt
      });
    });

    // Pièces manquantes
    conformityAnalysis.completeness.missingPieces.forEach((piece) => {
      analysisData.push({
        id: `missing-${piece.code}`,
        title: `${piece.code} - ${piece.label}`,
        documentType: piece.code,
        detectedCode: piece.code,
        status: "missing",
        score: 0,
        confidence: 1.0,
        aiPreAnalysis: `Pièce obligatoire manquante selon la réglementation ${dossierType}.`,
        alerts: piece.conditionLabel ? [`Condition: ${piece.conditionLabel}`] : [],
      });
    });

    return analysisData.sort((a, b) => {
      if (a.status === "missing" && b.status !== "missing") return 1;
      if (a.status !== "missing" && b.status === "missing") return -1;
      return a.title?.localeCompare(b.title || "") || 0;
    });
  }, [dossier.documents, conformityAnalysis, dossierType]);

  const statusCounts = useMemo(() => {
    const counts = {
      validated: 0,
      detected: 0,
      incomplete: 0,
      missing: 0,
      incoherent: 0,
    };
    documentsAnalysis.forEach(doc => counts[doc.status]++);
    return counts;
  }, [documentsAnalysis]);

  const handleValidateDocument = (documentId: string) => {
    console.log("Valider document:", documentId);
    // TODO: Implement document validation
  };

  const handleRequestCorrection = (documentId: string, note: string) => {
    console.log("Demander correction:", documentId, note);
    // TODO: Implement correction request
  };

  const handleAnnotateDocument = (documentId: string, annotation: string) => {
    console.log("Annoter document:", documentId, annotation);
    // TODO: Implement document annotation
  };

  const handleViewDocument = (documentId: string) => {
    console.log("Voir document:", documentId);
    // TODO: Implement document viewer
  };

  return (
    <div className="space-y-6">
      {/* Vue d'ensemble */}
      <InfoCard title="Vue d'ensemble des pièces">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{statusCounts.validated}</p>
            <p className="text-sm text-slate-600">Validées</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{statusCounts.detected}</p>
            <p className="text-sm text-slate-600">Détectées</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{statusCounts.incomplete}</p>
            <p className="text-sm text-slate-600">Incomplètes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{statusCounts.missing}</p>
            <p className="text-sm text-slate-600">Absentes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-600">{statusCounts.incoherent}</p>
            <p className="text-sm text-slate-600">Incohérentes</p>
          </div>
        </div>
      </InfoCard>

      {/* Nomenclature de référence */}
      <InfoCard title={`Nomenclature ${dossierType}`}>
        <div className="mb-4 text-sm text-slate-600">
          Cette nomenclature liste les pièces officielles requises pour un dossier {dossierType}.
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {officialPieces.slice(0, 9).map((piece) => (
            <div key={piece.code} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
              <Badge 
                variant={piece.status === "mandatory" ? "default" : "outline"} 
                className="font-mono text-xs"
              >
                {piece.code}
              </Badge>
              <span className="text-sm text-slate-700 truncate">{piece.label}</span>
            </div>
          ))}
          {officialPieces.length > 9 && (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
              +{officialPieces.length - 9} autres pièces
            </div>
          )}
        </div>
      </InfoCard>

      {/* Analyse pièce par pièce */}
      <InfoCard title="Analyse détaillée par pièce">
        <div className="space-y-4">
          {documentsAnalysis.length > 0 ? (
            documentsAnalysis.map((document) => (
              <DocumentAnalysisCard
                key={document.id}
                document={document}
                onValidate={handleValidateDocument}
                onRequestCorrection={handleRequestCorrection}
                onAnnotate={handleAnnotateDocument}
                onView={handleViewDocument}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              Aucun document trouvé pour l'analyse.
            </div>
          )}
        </div>
      </InfoCard>
    </div>
  );
}