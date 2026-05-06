import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck2, FileDown, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import { MockSignatureProvider } from "@/lib/urbanisme/signature/providers/mockSignatureProvider";
import {
  isLegallySigned,
  refreshSignatureWorkflow,
  startSignatureWorkflow,
  validateSignaturePreflight,
} from "@/lib/urbanisme/signature/signatureWorkflow";
import type { SignatureWorkflowResult } from "@/lib/urbanisme/signature/signatureProvider.interface";

export function SignatureWorkflowPanel({
  dossierId,
  decisionGenerated,
  signatory,
  dossierReadyForSignature,
}: {
  dossierId: string;
  decisionGenerated?: boolean;
  signatory?: { id?: string; fullName?: string; role?: string; email?: string; authorityDelegationReference?: string };
  dossierReadyForSignature?: boolean;
}) {
  const [result, setResult] = useState<SignatureWorkflowResult | null>(null);
  const provider = useMemo(() => new MockSignatureProvider(), []);
  const input = useMemo(() => ({
    dossierId,
    decisionDocument: {
      id: `decision-${dossierId}`,
      filename: `decision-${dossierId}.pdf`,
      mimeType: "application/pdf",
      isFinalPdf: decisionGenerated === true,
      contentHash: decisionGenerated ? `sha256-demo-${dossierId}` : "",
      generatedAt: decisionGenerated ? new Date().toISOString() : undefined,
    },
    signatory: {
      id: signatory?.id || "",
      fullName: signatory?.fullName || "",
      role: signatory?.role || "",
      email: signatory?.email || "",
      authorityDelegationReference: signatory?.authorityDelegationReference,
    },
    signatureLevel: "advanced" as const,
    requireTimestamp: true as const,
    requireEvidenceFile: true as const,
    dossierReadyForSignature,
  }), [decisionGenerated, dossierId, dossierReadyForSignature, signatory]);
  const preflight = useMemo(() => validateSignaturePreflight(input), [input]);
  const legallySigned = isLegallySigned(result);

  async function sendToParapheur() {
    const response = await startSignatureWorkflow(input, provider);
    if (response.result) setResult(response.result);
  }

  async function refreshStatus() {
    if (!result) return;
    setResult(await refreshSignatureWorkflow(result.signatureRequestId, provider));
  }

  return (
    <Card className="rounded-3xl border-slate-100 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-900">
              <ShieldCheck className="h-4 w-4 text-slate-700" />
              Signature électronique eIDAS
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Heureka orchestre la signature via un parapheur compatible eIDAS. La validation interne ne vaut pas signature électronique.
            </p>
          </div>
          <Badge variant={result?.status === "signed" ? "default" : result ? "secondary" : "outline"} className="w-fit rounded-md">
            {result?.status === "signed" ? "Signé" : result?.status === "sent" ? "En attente de signature" : "Non envoyé"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {provider.isDemoProvider ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            Simulation de signature — non opposable juridiquement.
          </div>
        ) : null}

        {preflight.status === "blocked" ? (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-red-800">
              <ShieldAlert className="h-4 w-4" />
              Envoi au parapheur bloqué
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">
              {preflight.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
            Prêt pour envoi au parapheur.
          </div>
        )}

        {result?.status === "signed" ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="font-bold text-slate-900">
              Signé électroniquement le {result.timestamp ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.timestamp)) : "date inconnue"} par {input.signatory.fullName || "signataire"}.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Statut juridique Heureka : {legallySigned ? "signature juridiquement exploitable" : "simulation ou retour prestataire non qualifié"}.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!result ? (
            <Button disabled={preflight.status === "blocked"} onClick={sendToParapheur} className="gap-2 rounded-xl">
              <Send className="h-4 w-4" />
              Envoyer au parapheur
            </Button>
          ) : (
            <Button variant="outline" onClick={refreshStatus} className="gap-2 rounded-xl">
              <FileCheck2 className="h-4 w-4" />
              Actualiser la signature
            </Button>
          )}
          <Button variant="outline" disabled={!result?.signedDocumentUrl} className="gap-2 rounded-xl">
            <FileDown className="h-4 w-4" />
            Télécharger le document signé
          </Button>
          <Button variant="outline" disabled={!result?.evidenceFileUrl} className="gap-2 rounded-xl">
            <FileDown className="h-4 w-4" />
            Télécharger le dossier de preuve
          </Button>
        </div>

        {result?.auditTrail.length ? (
          <div className="space-y-2 border-l border-slate-200 pl-3">
            {result.auditTrail.map((event, index) => (
              <div key={`${event.type}-${event.at}-${index}`} className="relative text-xs text-slate-600">
                <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-slate-400" />
                <p className="font-semibold text-slate-800">{event.type} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.at))}</p>
                <p>{event.message}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
