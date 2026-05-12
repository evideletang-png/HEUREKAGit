import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Map,
  MessageSquare,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { DeadlineWidget } from "@/components/instruction/DeadlineWidget";
import { InstructionTimeline } from "@/components/instruction/InstructionTimeline";
import { LegalAlerts, type LegalAlert } from "@/components/instruction/LegalAlerts";
import { ProfessionalShell } from "@/components/layout/ProfessionalShell";
import { DossierStatusBadge } from "@/components/dossier/DossierStatusBadge";
import { getDemoDossierForStatus } from "@/demo/demoSeedData";
import { isDemoSessionActive, readDemoState } from "@/demo/demoModeStore";
import { OFFICIAL_PIECES } from "@/lib/urbanisme/cerfa/officialPieces.registry";
import { normalizeOfficialDossierType } from "@/lib/urbanisme/cerfa/resolveOfficialPieces";
import type { DossierType, OfficialPiece } from "@/lib/urbanisme/cerfa/officialPieces.types";
import { MockSignatureProvider } from "@/lib/urbanisme/signature/providers/mockSignatureProvider";
import { startSignatureWorkflow } from "@/lib/urbanisme/signature/signatureWorkflow";
import type { SignatureWorkflowResult } from "@/lib/urbanisme/signature/signatureProvider.interface";
import type {
  OrientationEstimatedTimeline,
  OrientationExpectedConsultation,
  OrientationLocationConstraint,
} from "@/modules/orientation/orientation.types";

type DossierDetail = {
  id: string;
  title?: string | null;
  dossierNumber?: string | null;
  typeProcedure?: string | null;
  status?: string | null;
  userName?: string | null;
  address?: string | null;
  commune?: string | null;
  parcelRef?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, any> | null;
  instructionStatus?: string | null;
  dateDepot?: string | null;
  dateCompletude?: string | null;
  dateLimiteInstruction?: string | null;
  isTacite?: boolean | null;
  documents?: Array<{
    id: string;
    title?: string | null;
    fileName?: string | null;
    documentType?: string | null;
    status?: string | null;
    createdAt?: string | null;
  }>;
  messages?: Array<{ id: string | number; content?: string | null; createdAt?: string | null }>;
};

type InstructionPayload = {
  instruction: {
    instructionStatus?: string | null;
    dateDepot?: string | null;
    dateCompletude?: string | null;
    dateLimiteInstruction?: string | null;
    isTacite?: boolean;
    alerts?: LegalAlert[];
  };
  timeline: Array<{
    id: string;
    type?: string;
    description?: string;
    createdAt?: string;
    metadata?: Record<string, any> | null;
  }>;
};

type LetterTemplateConfig = {
  id: string;
  title: string;
  category: string;
  body: string;
  delegatedSignatureRequired?: boolean;
};

type LetterSettingsConfig = {
  templates?: LetterTemplateConfig[];
  signature?: {
    signerName?: string;
    signerTitle?: string;
    signerEmail?: string;
    delegationEnabled?: boolean;
    delegationReference?: string;
  };
};

type RequestedPieceState = "missing" | "incomplete";

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

async function apiFetch(path: string) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return response.json();
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
    "{{dossier.type}}": dossier.typeProcedure || dossier.title || "Dossier d'urbanisme",
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

function codeSortValue(code: string) {
  const match = code.match(/^([A-Z]+)(\d+)(?:-(\d+))?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) * 10 + Number(match[3] || 0);
}

function getOfficialPiecesForProcedure(type: DossierType) {
  return [...(OFFICIAL_PIECES[type] || [])].sort((a, b) => codeSortValue(a.code) - codeSortValue(b.code));
}

function buildPieceRequestList(pieces: OfficialPiece[], states: Record<string, RequestedPieceState>) {
  return pieces
    .filter((piece) => states[piece.code])
    .map((piece) => `- ${piece.code} — ${piece.label} (${states[piece.code] === "missing" ? "pièce manquante" : "pièce incomplète"})`)
    .join("\n");
}

const demoDossier: DossierDetail = {
  id: "d2",
  dossierNumber: "PC-13120-26-00123",
  typeProcedure: "Permis de Construire",
  status: "En instruction",
  userName: "Jean Dupont",
  address: "12 avenue de la République, 13120 Gardanne",
  commune: "Gardanne",
  parcelRef: "CD-0118",
  createdAt: "2026-03-15",
  updatedAt: "2026-03-18",
  metadata: {
    zoneCode: "UB",
    surfacePlancher: 120,
    pluAnalysis: { zone: "UB" },
  },
  instructionStatus: "complet",
  dateDepot: "2026-03-15",
  dateCompletude: "2026-03-18",
  dateLimiteInstruction: "2026-05-18",
  isTacite: false,
  documents: [
    { id: "cerfa", title: "Formulaire CERFA", documentType: "cerfa" },
    { id: "plan", title: "Plan de masse", documentType: "plan" },
    { id: "notice", title: "Notice descriptive", documentType: "notice" },
  ],
};

function formatDate(value?: string | null) {
  if (!value) return "Non daté";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function parseFirstCommune(raw: unknown) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ? String(raw[0]) : null;
  if (typeof raw === "string") {
    if (raw.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed[0] ? String(parsed[0]) : null;
      } catch {
        return null;
      }
    }
    return raw.split(",").map((item) => item.trim()).filter(Boolean)[0] || null;
  }
  return null;
}

function MairieDetailShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalShell portalType="mairie" contentClassName="mx-auto w-full max-w-7xl px-4 py-9 sm:px-6 lg:px-8">
      {children}
    </ProfessionalShell>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function DossierMairieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"instruction" | "parcelle" | "historique">("instruction");
  const [decisionDialog, setDecisionDialog] = useState<"accept" | "refuse" | null>(null);
  const [pieceDialogOpen, setPieceDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [pieceStates, setPieceStates] = useState<Record<string, RequestedPieceState>>({});
  const [pieceRequestNote, setPieceRequestNote] = useState("");
  const [signatureResult, setSignatureResult] = useState<SignatureWorkflowResult | null>(null);
  const [isPreparingSignature, setIsPreparingSignature] = useState(false);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !["mairie", "admin", "super_admin"].includes((user?.role as string) || ""))) {
      setLocation(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isAuthenticated, isLoading, setLocation, user]);

  const query = useQuery<DossierDetail>({
    queryKey: ["mairie-full-dossier", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id || "")}`),
    enabled: !!id && !id.startsWith("demo-") && id !== "d2",
  });
  const instructionQuery = useQuery<InstructionPayload>({
    queryKey: ["mairie-dossier-instruction", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id || "")}/instruction`),
    enabled: !!id && !id.startsWith("demo-") && id !== "d2",
  });
  const selectedCommuneForSettings = parseFirstCommune((user as any)?.authorizedCommunes) || parseFirstCommune((user as any)?.communes) || "all";
  const settingsQuery = useQuery<{ settings: { formulas?: { letterSettings?: LetterSettingsConfig } } | null }>({
    queryKey: ["mairie-dashboard-settings", selectedCommuneForSettings],
    queryFn: () => apiFetch(`/api/mairie/settings/${encodeURIComponent(selectedCommuneForSettings)}`),
    enabled: selectedCommuneForSettings !== "all",
  });

  const demoActive = isDemoSessionActive();
  const seededDemoDossier = getDemoDossierForStatus(readDemoState().dossierStatus) as any as DossierDetail;
  const dossier = query.data || (demoActive ? seededDemoDossier : demoDossier);
  const instruction = instructionQuery.data?.instruction || {
    instructionStatus: dossier.instructionStatus || demoDossier.instructionStatus,
    dateDepot: dossier.dateDepot || dossier.createdAt || demoDossier.dateDepot,
    dateCompletude: dossier.dateCompletude || demoDossier.dateCompletude,
    dateLimiteInstruction: dossier.dateLimiteInstruction || demoDossier.dateLimiteInstruction,
    isTacite: !!dossier.isTacite,
    alerts: [],
  };
  const instructionTimeline = instructionQuery.data?.timeline || [
    { id: "depot", type: "depot", description: "Dossier déposé", createdAt: instruction.dateDepot || demoDossier.dateDepot },
    { id: "completude", type: "piece_recue", description: "Dossier complet", createdAt: instruction.dateCompletude || demoDossier.dateCompletude },
  ];
  const parcelAnalysis = dossier.metadata?.parcelAnalysis || {};
  const zone = dossier.metadata?.zoneCode
    || dossier.metadata?.zone_code
    || parcelAnalysis.zoneCode
    || dossier.metadata?.pluAnalysis?.zone?.code
    || dossier.metadata?.pluAnalysis?.zone
    || "Non renseignée";
  const zoneLabel = parcelAnalysis.zoneLabel || parcelAnalysis.zoningLabel || dossier.metadata?.pluAnalysis?.zone?.label;
  const parcelRef = dossier.parcelRef || parcelAnalysis.parcelRef || dossier.metadata?.parcel_ref || dossier.metadata?.parcelRef || null;
  const orientationContext = dossier.metadata?.orientationContext as {
    locationConstraints?: OrientationLocationConstraint[];
    expectedConsultations?: OrientationExpectedConsultation[];
    estimatedInstructionTimeline?: OrientationEstimatedTimeline;
  } | undefined;
  const orientationConstraints = Array.isArray(orientationContext?.locationConstraints)
    ? orientationContext.locationConstraints.filter((constraint) => constraint.detected)
    : [];
  const orientationConsultations = Array.isArray(orientationContext?.expectedConsultations)
    ? orientationContext.expectedConsultations
    : [];
  const orientationTimeline = orientationContext?.estimatedInstructionTimeline;
  const locationConstraints = [
    ...(Array.isArray(parcelAnalysis.constraints) ? parcelAnalysis.constraints : []),
    ...(Array.isArray(parcelAnalysis.overlays) ? parcelAnalysis.overlays : []),
    ...orientationConstraints.map((constraint) => constraint.label),
  ];
  const surface = dossier.metadata?.surfacePlancher || dossier.metadata?.surface_plancher || dossier.metadata?.requested_surface_m2 || 120;
  const documents = dossier.documents?.length ? dossier.documents : demoDossier.documents || [];
  const dossierType = normalizeOfficialDossierType(dossier.typeProcedure || dossier.title || dossier.dossierNumber || "DPC");
  const allProcedurePieces = useMemo(() => getOfficialPiecesForProcedure(dossierType), [dossierType]);
  const selectedPieces = useMemo(() => allProcedurePieces.filter((piece) => pieceStates[piece.code]), [allProcedurePieces, pieceStates]);
  const letterSettings = settingsQuery.data?.settings?.formulas?.letterSettings || fallbackLetterSettings;
  const currentDecisionTemplate = decisionDialog
    ? findTemplate(letterSettings, decisionDialog === "accept" ? "acceptation" : "refus")
    : undefined;
  const pieceTemplate = findTemplate(letterSettings, "pieces");
  const requiredConfirmation = decisionDialog === "accept" ? "ACCEPTER" : decisionDialog === "refuse" ? "REFUSER" : "";
  const canConfirmDecision = !!decisionDialog && confirmationText.trim() === requiredConfirmation;

  const resetDecisionDialog = () => {
    setDecisionDialog(null);
    setConfirmationText("");
    setDecisionReason("");
  };

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
          id: String((user as any)?.id || "signataire-mairie"),
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

  const handleDecisionConfirm = async () => {
    if (!decisionDialog || !currentDecisionTemplate) return;
    const body = renderTemplate(currentDecisionTemplate.body, dossier, letterSettings, {
      "{{decision.motif}}": decisionReason || "Motif à compléter dans le courrier de décision.",
    });
    await sendToParapheur(decisionDialog, body);
    resetDecisionDialog();
  };

  const handlePiecesRequest = async () => {
    const list = buildPieceRequestList(allProcedurePieces, pieceStates);
    if (!list) {
      toast({ title: "Aucune pièce sélectionnée", description: "Sélectionnez au moins une pièce manquante ou incomplète.", variant: "destructive" });
      return;
    }
    const body = renderTemplate(pieceTemplate?.body || fallbackLetterSettings.templates![2].body, dossier, letterSettings, {
      "{{pieces.liste}}": `${list}${pieceRequestNote ? `\n\nObservations : ${pieceRequestNote}` : ""}`,
    });
    await sendToParapheur("pieces", body);
    setPieceDialogOpen(false);
  };

  const projectFacts = useMemo(() => [
    ["Type de demande", dossier.typeProcedure || "Permis de Construire"],
    ["Date de dépôt", formatDate(dossier.createdAt || demoDossier.createdAt)],
    ["Surface de plancher", `${surface} m²`],
    ["Zonage PLU", zone === "Non renseignée" ? "Zone non renseignée" : `Zone ${zone}${zoneLabel ? ` — ${zoneLabel}` : ""}`],
  ], [dossier, surface, zone]);

  if (isLoading || query.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f6] text-slate-500">Chargement du dossier...</div>;
  }

  return (
    <MairieDetailShell>
      <div className="mb-8">
        <Link href="/dashboard-mairie" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base text-slate-500">Dossier n° {dossier.dossierNumber || dossier.id}</p>
              <h1 className="mt-2 max-w-2xl text-4xl font-bold tracking-tight">{dossier.typeProcedure || dossier.title || "Dossier urbanisme"}</h1>
              <p className="mt-4 text-lg text-slate-600">Demandeur : {dossier.userName || "Demandeur"}</p>
              <p className="mt-1 max-w-xl text-lg text-slate-600">{dossier.address || "Adresse non renseignée"}</p>
            </div>
            <DossierStatusBadge status={dossier.status || "in_instruction"} className="px-6 py-4 text-lg" />
          </div>

          <InfoCard title="Actions">
            <div className="grid gap-3 sm:grid-cols-3">
              <Button onClick={() => setDecisionDialog("accept")} className="h-20 rounded-lg bg-green-600 text-base font-bold text-white hover:bg-green-700">Accepter le dossier</Button>
              <Button onClick={() => setDecisionDialog("refuse")} className="h-20 rounded-lg bg-red-600 text-base font-bold text-white hover:bg-red-700">Refuser le dossier</Button>
              <Button onClick={() => setPieceDialogOpen(true)} className="h-20 rounded-lg bg-amber-600 text-base font-bold text-white hover:bg-amber-700">Demander des pièces</Button>
            </div>
            {signatureResult ? (
              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
                <p className="font-bold">Parapheur : {signatureResult.status === "sent" ? "en attente de signature" : signatureResult.status}</p>
                <p className="mt-1">Demande {signatureResult.signatureRequestId} préparée via {signatureResult.provider}.</p>
                {signatureResult.legalNotice ? <p className="mt-1 text-xs">{signatureResult.legalNotice}</p> : null}
              </div>
            ) : null}
          </InfoCard>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <nav className="grid sm:grid-cols-3">
              {[
                ["instruction", "Instruction du dossier", FileText],
                ["parcelle", "Analyse de parcelle", Map],
                ["historique", "Historique & Messages", MessageSquare],
              ].map(([key, label, Icon]) => (
                <button
                  key={key as string}
                  type="button"
                  onClick={() => setTab(key as any)}
                  className={`flex min-h-16 items-center justify-center gap-2 border-b-2 px-4 text-sm font-bold ${tab === key ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label as string}
                </button>
              ))}
            </nav>
          </div>

          {tab === "instruction" && (
            <div className="grid gap-6 xl:grid-cols-2">
              <InfoCard title="Instruction">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
                    Statut : {instruction.instructionStatus || "depose"}
                  </span>
                  <span className={`rounded-full px-4 py-2 text-sm font-bold ${instruction.isTacite ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {instruction.isTacite ? "Risque de décision tacite" : "Instruction suivie"}
                  </span>
                </div>
                <InstructionTimeline
                  events={instructionTimeline}
                  dates={[
                    { label: "Dépôt", value: instruction.dateDepot },
                    { label: "Complétude", value: instruction.dateCompletude },
                    { label: "Limite", value: instruction.dateLimiteInstruction },
                  ]}
                />
              </InfoCard>

              <InfoCard title="Délais & Alertes">
                <div className="space-y-5">
                  <DeadlineWidget deadline={instruction.dateLimiteInstruction} isTacite={instruction.isTacite} />
                  <LegalAlerts alerts={instruction.alerts || []} />
                </div>
              </InfoCard>

              <InfoCard title="Informations du projet">
                <div className="grid gap-5 sm:grid-cols-2">
                  {projectFacts.map(([label, value]) => (
                    <div key={label}>
                      <p className="text-sm font-medium text-slate-500">{label}</p>
                      <p className="mt-1 text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Analyse de contexte">
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Contraintes détectées</p>
                    {orientationConstraints.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {orientationConstraints.map((constraint) => (
                          <div key={`${constraint.type}-${constraint.label}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-slate-900">{constraint.label}</p>
                              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">{constraint.confidence}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">Source : {constraint.source}</p>
                            {constraint.impact.decisionImpact ? <p className="mt-1 text-sm text-slate-700">{constraint.impact.decisionImpact}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">Aucune contrainte issue de l'orientation n'a été transmise.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Services à consulter</p>
                    {orientationConsultations.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {orientationConsultations.map((consultation) => (
                          <div key={`${consultation.service}-${consultation.reason}`} className="rounded-lg border border-slate-200 p-3">
                            <p className="font-semibold text-slate-950">{consultation.service}</p>
                            <p className="mt-1 text-sm text-slate-600">{consultation.reason}</p>
                            <p className="mt-1 text-xs text-slate-500">{consultation.required ? "Consultation probable" : "À confirmer"}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">Aucun service additionnel proposé à ce stade.</p>
                    )}
                  </div>
                  {orientationTimeline ? (
                    <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                      Délai indicatif orientation : {orientationTimeline.baseDelay.durationMonths} mois de base
                      {orientationTimeline.possibleMajorations.length > 0 ? `, ${orientationTimeline.possibleMajorations.length} majoration(s) possible(s)` : ""}.
                    </div>
                  ) : null}
                </div>
              </InfoCard>

              <InfoCard title="Documents">
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="font-semibold">{doc.title || doc.fileName || doc.documentType || "Document"}</span>
                      <Button variant="ghost" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Avis des services">
                <div className="mb-4">
                  <Button variant="outline" className="gap-2 rounded-lg border-slate-300">
                    <Plus className="h-4 w-4" />
                    Consulter un autre service
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg bg-emerald-50 p-4 text-emerald-950">
                    <p className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Métropole - Avis favorable</p>
                    <p className="mt-2 text-sm">Reçu le 20 mars 2026</p>
                    <p className="mt-2 text-sm italic text-emerald-800">Motif : Surface &gt; 40m² en zone urbaine</p>
                    <p className="mt-2">Le projet respecte les règles d'urbanisme applicables.</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-4 text-amber-950">
                    <p className="flex items-center gap-2 text-lg font-bold"><Clock3 className="h-5 w-5 text-amber-600" /> ABF - En attente</p>
                    <p className="mt-2 text-sm">Demandé le 18 mars 2026</p>
                    <p className="mt-2 text-sm italic text-amber-800">Motif : Périmètre de protection monument historique</p>
                    <p className="mt-2">Avis de l'Architecte des Bâtiments de France en attente.</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <strong>Consultations automatiques :</strong> Le système détermine automatiquement les services à consulter selon les caractéristiques du projet. Vous pouvez ajouter manuellement d'autres services si nécessaire.
                  </div>
                </div>
              </InfoCard>
            </div>
          )}

          {tab === "parcelle" && (
            <InfoCard title="Analyse de localisation">
              {parcelRef || zone !== "Non renseignée" || parcelAnalysis.source ? (
                <div className="grid gap-5 sm:grid-cols-3">
                  <div><p className="text-sm text-slate-500">Adresse</p><p className="mt-1 text-lg font-semibold">{dossier.address || "Non renseignée"}</p></div>
                  <div><p className="text-sm text-slate-500">Parcelle</p><p className="mt-1 text-lg font-semibold">{parcelRef || "Non renseignée"}</p></div>
                  <div><p className="text-sm text-slate-500">Zone PLU</p><p className="mt-1 text-lg font-semibold">{zone === "Non renseignée" ? "Non renseignée" : `Zone ${zone}${zoneLabel ? ` — ${zoneLabel}` : ""}`}</p></div>
                  <div><p className="text-sm text-slate-500">Commune</p><p className="mt-1 text-lg font-semibold">{parcelAnalysis.commune || dossier.commune || "Non renseignée"}</p></div>
                  <div><p className="text-sm text-slate-500">Source</p><p className="mt-1 text-lg font-semibold">{parcelAnalysis.source || "Dossier"}</p></div>
                  <div><p className="text-sm text-slate-500">Contraintes</p><p className="mt-1 text-lg font-semibold">{locationConstraints.length || "Aucune contrainte remontée"}</p></div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-slate-600">
                  Analyse de localisation non disponible — relancer l'analyse.
                </div>
              )}
              <div className="mt-5">
                <Button variant="outline" className="rounded-lg" disabled>
                  Relancer analyse parcelle
                </Button>
              </div>
              <div className="mt-6 flex h-72 items-center justify-center rounded-lg bg-slate-100 text-slate-500">Carte parcellaire à venir</div>
            </InfoCard>
          )}

          {tab === "historique" && (
            <div className="grid gap-6 xl:grid-cols-2">
              <InfoCard title="Historique">
                <div className="space-y-5">
                  <div className="flex gap-3"><span className="mt-2 h-3 w-3 rounded-full bg-green-700" /><div><p className="font-bold">Dossier complet</p><p className="text-slate-500">18 mars 2026</p></div></div>
                  <div className="flex gap-3"><span className="mt-2 h-3 w-3 rounded-full bg-green-700" /><div><p className="font-bold">Dossier déposé</p><p className="text-slate-500">{formatDate(dossier.createdAt || demoDossier.createdAt)}</p></div></div>
                </div>
              </InfoCard>
              <InfoCard title="Contacter le demandeur">
                <Textarea placeholder="Votre message..." className="min-h-32 rounded-lg border-slate-300" />
                <Button className="mt-4 gap-2 rounded-lg bg-slate-950 text-white hover:bg-slate-800">
                  <Send className="h-4 w-4" />
                  Envoyer
                </Button>
              </InfoCard>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <InfoCard title="Délais">
            <div className="rounded-lg bg-blue-50 p-5 text-blue-900">
              <p className="text-sm font-medium">Délai restant</p>
              <p className="mt-2 text-4xl font-bold">42 jours</p>
            </div>
            <p className="mt-4 text-sm text-slate-500">Délai d'instruction de 2 mois à compter de la réception du dossier complet.</p>
          </InfoCard>
          <InfoCard title="Points d'attention">
            <div className="space-y-3">
              <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><Clock3 className="h-4 w-4 shrink-0" /> Avis ABF en attente.</p>
              <p className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"><XCircle className="h-4 w-4 shrink-0" /> Vérifier les pièces complémentaires si le dossier devient incomplet.</p>
            </div>
          </InfoCard>
        </aside>
      </div>

      <Dialog open={!!decisionDialog} onOpenChange={(open) => !open && resetDecisionDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{decisionDialog === "accept" ? "Confirmer l'acceptation du dossier" : "Confirmer le refus du dossier"}</DialogTitle>
            <DialogDescription>
              Cette action prépare une notification officielle depuis le modèle paramétré, puis l'envoie au parapheur pour signature. Pour éviter une décision accidentelle, saisissez le mot de confirmation demandé.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Modèle utilisé</p>
              <p className="mt-1 text-sm text-slate-600">{currentDecisionTemplate?.title || "Modèle par défaut"}</p>
              <p className="mt-2 text-xs text-slate-500">Les champs dynamiques du paramétrage seront remplacés avant l'envoi au parapheur.</p>
            </div>

            <Label className="block">
              Motif ou prescription à intégrer au courrier
              <Textarea
                className="mt-2 min-h-28 rounded-lg border-slate-300"
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                placeholder={decisionDialog === "accept" ? "Ex. Accord sous réserve des prescriptions ABF..." : "Ex. Non-conformité à l'article applicable du règlement..."}
              />
            </Label>

            <Label className="block">
              Saisissez <span className="font-black text-slate-950">{requiredConfirmation}</span> pour confirmer
              <Input
                className="mt-2 rounded-lg border-slate-300"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={requiredConfirmation}
              />
            </Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetDecisionDialog}>Annuler</Button>
            <Button
              disabled={!canConfirmDecision || isPreparingSignature}
              onClick={handleDecisionConfirm}
              className={decisionDialog === "accept" ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700"}
            >
              {isPreparingSignature ? "Préparation..." : "Envoyer au parapheur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pieceDialogOpen} onOpenChange={setPieceDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Demander des pièces complémentaires</DialogTitle>
            <DialogDescription>
              Sélectionnez dans la nomenclature complète du dossier {dossierType}. La demande peut porter sur une pièce manquante ou sur une pièce déjà transmise mais incomplète.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <ScrollArea className="h-[520px] rounded-lg border border-slate-200">
              <div className="divide-y divide-slate-200">
                {allProcedurePieces.map((piece) => {
                  const selectedState = pieceStates[piece.code];
                  return (
                    <div key={piece.code} className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={!!selectedState}
                          onCheckedChange={(checked) => {
                            setPieceStates((current) => {
                              const next = { ...current };
                              if (checked) next[piece.code] = next[piece.code] || "missing";
                              else delete next[piece.code];
                              return next;
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-black">{piece.code}</Badge>
                            <Badge className={piece.status === "mandatory" ? "bg-slate-950 text-white" : "bg-amber-100 text-amber-900"}>
                              {piece.status === "mandatory" ? "Obligatoire" : "Conditionnelle"}
                            </Badge>
                          </div>
                          <p className="mt-2 font-semibold text-slate-950">{piece.label}</p>
                          {piece.conditionLabel ? <p className="mt-1 text-sm italic text-slate-600">{piece.conditionLabel}</p> : null}
                          {piece.legalReference ? <p className="mt-1 text-xs text-slate-500">{piece.legalReference}</p> : null}
                          {selectedState ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={selectedState === "missing" ? "default" : "outline"}
                                onClick={() => setPieceStates((current) => ({ ...current, [piece.code]: "missing" }))}
                              >
                                Manquante
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={selectedState === "incomplete" ? "default" : "outline"}
                                onClick={() => setPieceStates((current) => ({ ...current, [piece.code]: "incomplete" }))}
                              >
                                Incomplète
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-950">Synthèse</p>
                <p className="mt-2 text-3xl font-black text-primary">{selectedPieces.length}</p>
                <p className="text-sm text-slate-600">pièce{selectedPieces.length > 1 ? "s" : ""} sélectionnée{selectedPieces.length > 1 ? "s" : ""}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm font-bold text-slate-950">Modèle utilisé</p>
                <p className="mt-1 text-sm text-slate-600">{pieceTemplate?.title || "Demande de pièces complémentaires"}</p>
              </div>
              <Label className="block">
                Observation complémentaire
                <Textarea
                  className="mt-2 min-h-36 rounded-lg border-slate-300"
                  value={pieceRequestNote}
                  onChange={(event) => setPieceRequestNote(event.target.value)}
                  placeholder="Précisez les attendus, formats, pages ou incohérences constatées."
                />
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPieceDialogOpen(false)}>Annuler</Button>
            <Button disabled={selectedPieces.length === 0 || isPreparingSignature} onClick={handlePiecesRequest} className="bg-amber-600 text-white hover:bg-amber-700">
              {isPreparingSignature ? "Préparation..." : "Générer et envoyer au parapheur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MairieDetailShell>
  );
}
