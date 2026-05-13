import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { MockSignatureProvider } from "@/lib/urbanisme/signature/providers/mockSignatureProvider";
import { startSignatureWorkflow } from "@/lib/urbanisme/signature/signatureWorkflow";
import { getDossierTypeLabel } from "@/lib/urbanisme/dossier/dossierTypeLabels";
import type { SignatureWorkflowResult } from "@/lib/urbanisme/signature/signatureProvider.interface";
import type { DossierDetail } from "./useDossierData";

export type RequestedPieceState = "missing" | "incomplete";

export type LetterTemplateConfig = {
  id: string;
  title: string;
  category: string;
  body: string;
  delegatedSignatureRequired?: boolean;
};

export type LetterSettingsConfig = {
  templates?: LetterTemplateConfig[];
  signature?: {
    signerName?: string;
    signerTitle?: string;
    signerEmail?: string;
    delegationEnabled?: boolean;
    delegationReference?: string;
  };
};

const fallbackLetterSettings: LetterSettingsConfig = {
  templates: [
    {
      id: "acceptation-default",
      title: "Acceptation - dossier d'urbanisme",
      category: "acceptation",
      body: "Madame, Monsieur,\n\nAprès instruction du dossier {{dossier.numero}}, la demande relative à {{dossier.adresse}} reçoit une décision favorable.\n\n{{signature.fonction}}\n{{signature.nom}}",
    },
    {
      id: "refus-default",
      title: "Refus - dossier d'urbanisme",
      category: "refus",
      body: "Madame, Monsieur,\n\nAprès instruction du dossier {{dossier.numero}}, la demande relative à {{dossier.adresse}} ne peut recevoir une suite favorable pour les motifs indiqués dans la présente décision.\n\n{{signature.fonction}}\n{{signature.nom}}",
    },
    {
      id: "pieces-default",
      title: "Demande de pièces complémentaires",
      category: "pieces_complementaires",
      body: "Madame, Monsieur,\n\nL'instruction du dossier {{dossier.numero}} fait apparaître que les pièces suivantes doivent être complétées ou transmises :\n\n{{pieces.liste}}\n\nLe délai d'instruction est suspendu jusqu'à réception des éléments demandés.\n\n{{signature.fonction}}\n{{signature.nom}}",
    },
  ],
  signature: {
    signerName: "Maire de la commune",
    signerTitle: "Maire",
    signerEmail: "signature@mairie.local",
    delegationEnabled: false,
    delegationReference: "",
  },
};

function formatDate(value?: string | null) {
  if (!value) return "Non daté";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function findTemplate(settings: LetterSettingsConfig | undefined, category: string) {
  const templates = settings?.templates?.length ? settings.templates : fallbackLetterSettings.templates || [];
  return templates.find((template) => template.category.toLowerCase().includes(category))
    || templates.find((template) => template.id.toLowerCase().includes(category))
    || fallbackLetterSettings.templates?.find((template) => template.category.toLowerCase().includes(category))
    || templates[0];
}

function renderTemplate(template: string, dossier: DossierDetail, settings: LetterSettingsConfig, extras: Record<string, string> = {}) {
  const signature = { ...fallbackLetterSettings.signature, ...(settings.signature || {}) };
  const values: Record<string, string> = {
    "{{dossier.numero}}": dossier.dossierNumber || dossier.id,
    "{{dossier.type}}": getDossierTypeLabel(dossier.typeProcedure),
    "{{dossier.demandeur}}": dossier.userName || "Demandeur",
    "{{dossier.adresse}}": dossier.address || "Adresse non renseignée",
    "{{dossier.parcelle}}": dossier.parcelRef || dossier.metadata?.parcelRef || "Parcelle non renseignée",
    "{{decision.date}}": formatDate(new Date().toISOString()),
    "{{signature.nom}}": signature.signerName || "Signataire",
    "{{signature.fonction}}": signature.signerTitle || "Maire",
    ...extras,
  };

  return Object.entries(values).reduce((body, [token, value]) => body.replaceAll(token, value), template);
}

export function useDossierActions(dossier: DossierDetail, user: any, letterSettings: LetterSettingsConfig = fallbackLetterSettings) {
  const { toast } = useToast();
  const [isPreparingSignature, setIsPreparingSignature] = useState(false);
  const [signatureResult, setSignatureResult] = useState<SignatureWorkflowResult | null>(null);

  const sendToParapheur = async (kind: "accept" | "refuse" | "pieces", body: string) => {
    setIsPreparingSignature(true);
    try {
      const signature = { ...fallbackLetterSettings.signature, ...(letterSettings.signature || {}) };
      const filename = `${kind}-${dossier.dossierNumber || dossier.id}.pdf`.replace(/\s+/g, "-");
      const response = await startSignatureWorkflow({
        decisionDocument: {
          id: `notification-${kind}-${dossier.id}`,
          filename,
          mimeType: "application/pdf",
          contentHash: `heureka-${kind}-${dossier.id}-${body.length}`,
          isFinalPdf: true,
          generatedAt: new Date().toISOString(),
        },
        dossierId: dossier.id,
        signatory: {
          id: String(user?.id || "signataire-mairie"),
          fullName: signature.signerName || "Maire de la commune",
          role: signature.signerTitle || "Maire",
          email: signature.signerEmail || "signature@mairie.local",
          authorityDelegationReference: signature.delegationReference || (signature.signerTitle && !/maire/i.test(signature.signerTitle) ? "Délégation paramétrée Heureka" : undefined),
        },
        signatureLevel: "advanced",
        requireTimestamp: true,
        requireEvidenceFile: true,
        dossierReadyForSignature: true,
      }, new MockSignatureProvider());

      if (response.preflight.status === "blocked") {
        toast({
          title: "Envoi au parapheur bloqué",
          description: response.preflight.blockers.join(" "),
          variant: "destructive",
        });
        return;
      }

      setSignatureResult(response.result || null);
      toast({
        title: "Notification envoyée au parapheur",
        description: "Le courrier est préparé depuis le modèle paramétré et attend signature.",
      });
    } finally {
      setIsPreparingSignature(false);
    }
  };

  const acceptDossier = async (reason?: string) => {
    const template = findTemplate(letterSettings, "acceptation");
    if (!template) return;
    
    const body = renderTemplate(template.body, dossier, letterSettings, {
      "{{decision.motif}}": reason || "Motif à compléter dans le courrier de décision.",
    });
    await sendToParapheur("accept", body);
  };

  const refuseDossier = async (reason?: string) => {
    const template = findTemplate(letterSettings, "refus");
    if (!template) return;
    
    const body = renderTemplate(template.body, dossier, letterSettings, {
      "{{decision.motif}}": reason || "Motif à compléter dans le courrier de décision.",
    });
    await sendToParapheur("refuse", body);
  };

  const requestPieces = async (piecesList: string, note?: string) => {
    const template = findTemplate(letterSettings, "pieces");
    if (!template) return;
    
    const body = renderTemplate(template.body, dossier, letterSettings, {
      "{{pieces.liste}}": `${piecesList}${note ? `\n\nObservations : ${note}` : ""}`,
    });
    await sendToParapheur("pieces", body);
  };

  return {
    acceptDossier,
    refuseDossier,
    requestPieces,
    isPreparingSignature,
    signatureResult,
    setSignatureResult
  };
}