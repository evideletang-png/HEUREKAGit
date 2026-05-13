import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ProfessionalShell } from "@/components/layout/ProfessionalShell";

// Nouveaux composants
import { DossierFixedHeader } from "@/components/dossier/DossierFixedHeader";
import { DossierTabs, type DossierTabType } from "@/components/dossier/DossierTabs";
import { DossierTimelineFrise } from "@/components/dossier/DossierTimelineFrise";
import { DossierSummaryTab } from "@/components/dossier/tabs/DossierSummaryTab";
import { DossierAnalysisTab } from "@/components/dossier/tabs/DossierAnalysisTab";
import { DossierInstructionTab } from "@/components/dossier/tabs/DossierInstructionTab";
import { DossierHistoryTab } from "@/components/dossier/tabs/DossierHistoryTab";
import { DossierDecisionTab } from "@/components/dossier/tabs/DossierDecisionTab";

// Hooks métier
import { useDossierData } from "@/hooks/dossier/useDossierData";
import { useDossierConformity } from "@/hooks/dossier/useDossierConformity";
import { useDossierActions, type RequestedPieceState } from "@/hooks/dossier/useDossierActions";

// Services existants
import { OFFICIAL_PIECES } from "@/lib/urbanisme/cerfa/officialPieces.registry";
import { normalizeOfficialDossierType } from "@/lib/urbanisme/cerfa/resolveOfficialPieces";
import type { OfficialPiece } from "@/lib/urbanisme/cerfa/officialPieces.types";

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

function getOfficialPiecesForProcedure(type: any) {
  return [...(OFFICIAL_PIECES[type] || [])].sort((a, b) => {
    const aMatch = a.code.match(/^([A-Z]+)(\d+)(?:-(\d+))?/);
    const bMatch = b.code.match(/^([A-Z]+)(\d+)(?:-(\d+))?/);
    if (!aMatch || !bMatch) return 0;
    return Number(aMatch[2]) * 10 + Number(aMatch[3] || 0) - (Number(bMatch[2]) * 10 + Number(bMatch[3] || 0));
  });
}

function buildPieceRequestList(pieces: OfficialPiece[], states: Record<string, RequestedPieceState>) {
  return pieces
    .filter((piece) => states[piece.code])
    .map((piece) => `- ${piece.code} — ${piece.label} (${states[piece.code] === "missing" ? "pièce manquante" : "pièce incomplète"})`)
    .join("\n");
}

function findTemplate(settings: any, category: string) {
  const templates = settings?.templates?.length ? settings.templates : [];
  return templates.find((template: any) => template.category.toLowerCase().includes(category)) || templates[0];
}

function MairieDetailShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessionalShell portalType="mairie" contentClassName="mx-auto w-full max-w-7xl px-4 py-0 sm:px-6 lg:px-8">
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
  
  // État des onglets
  const [activeTab, setActiveTab] = useState<DossierTabType>("recapitulatif");
  
  // États pour les dialogs
  const [decisionDialog, setDecisionDialog] = useState<"accept" | "refuse" | null>(null);
  const [pieceDialogOpen, setPieceDialogOpen] = useState(false);
  const [conformityOpen, setConformityOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [pieceStates, setPieceStates] = useState<Record<string, RequestedPieceState>>({});
  const [pieceRequestNote, setPieceRequestNote] = useState("");

  // Hooks métier
  const { dossier, instruction, instructionTimeline, isLoading: isDossierLoading } = useDossierData(id || "");
  const conformityAnalysis = useDossierConformity(dossier);
  
  // Settings pour les lettres
  const selectedCommuneForSettings = parseFirstCommune((user as any)?.authorizedCommunes) || parseFirstCommune((user as any)?.communes) || "all";
  const settingsQuery = useQuery<{ settings: { formulas?: { letterSettings?: any } } | null }>({
    queryKey: ["mairie-dashboard-settings", selectedCommuneForSettings],
    queryFn: () => fetch(`/api/mairie/settings/${encodeURIComponent(selectedCommuneForSettings)}`, { credentials: "include" }).then(r => r.json()),
    enabled: selectedCommuneForSettings !== "all",
  });
  
  const letterSettings = settingsQuery.data?.settings?.formulas?.letterSettings;
  const { acceptDossier, refuseDossier, requestPieces, isPreparingSignature, signatureResult } = useDossierActions(dossier, user, letterSettings);

  // Gestion des pièces
  const dossierType = normalizeOfficialDossierType(dossier.typeProcedure || dossier.title || dossier.dossierNumber || "DPC");
  const allProcedurePieces = getOfficialPiecesForProcedure(dossierType);
  const selectedPieces = allProcedurePieces.filter((piece) => pieceStates[piece.code]);
  const pieceTemplate = findTemplate(letterSettings, "pieces");
  const requiredConfirmation = decisionDialog === "accept" ? "ACCEPTER" : decisionDialog === "refuse" ? "REFUSER" : "";
  const canConfirmDecision = !!decisionDialog && confirmationText.trim() === requiredConfirmation;

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !["mairie", "admin", "super_admin"].includes((user?.role as string) || ""))) {
      setLocation(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isAuthenticated, isLoading, setLocation, user]);

  const resetDecisionDialog = () => {
    setDecisionDialog(null);
    setConfirmationText("");
    setDecisionReason("");
  };

  const handleDecisionConfirm = async () => {
    if (!decisionDialog) return;
    if (decisionDialog === "accept") {
      await acceptDossier(decisionReason);
    } else {
      await refuseDossier(decisionReason);
    }
    resetDecisionDialog();
  };

  const handlePiecesRequest = async () => {
    const list = buildPieceRequestList(allProcedurePieces, pieceStates);
    if (!list) {
      toast({ title: "Aucune pièce sélectionnée", description: "Sélectionnez au moins une pièce manquante ou incomplète.", variant: "destructive" });
      return;
    }
    await requestPieces(list, pieceRequestNote);
    setPieceDialogOpen(false);
  };

  if (isLoading || isDossierLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f6] text-slate-500">
        Chargement du dossier...
      </div>
    );
  }

  return (
    <MairieDetailShell>
      {/* Lien de retour */}
      <div className="mb-8 px-4 py-9 sm:px-6 lg:px-8">
        <Link href="/dashboard-mairie" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>
      </div>

      {/* En-tête fixe du dossier */}
      <DossierFixedHeader dossier={dossier} />

      {/* Frise chronologique des délais */}
      <DossierTimelineFrise 
        instruction={instruction}
        pendingConsultations={[
          { service: "ABF", reason: "Périmètre de protection monument historique" }
        ]}
      />

      {/* Navigation par onglets */}
      <DossierTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Contenu principal */}
      <div className="px-4 py-8 sm:px-6 lg:px-8">
          {/* Contenu des onglets */}
          {activeTab === "recapitulatif" && (
            <DossierSummaryTab
              dossier={dossier}
              instruction={instruction}
              instructionTimeline={instructionTimeline}
              conformityAnalysis={conformityAnalysis}
              onShowConformityDetails={() => setConformityOpen(true)}
            />
          )}

          {activeTab === "analyse" && (
            <DossierAnalysisTab
              dossier={dossier}
              conformityAnalysis={conformityAnalysis}
            />
          )}

          {activeTab === "instruction" && (
            <DossierInstructionTab
              dossier={dossier}
              instruction={instruction}
              instructionTimeline={instructionTimeline}
            />
          )}

          {activeTab === "historique" && (
            <DossierHistoryTab dossier={dossier} />
          )}

          {activeTab === "decision" && (
            <DossierDecisionTab
              dossier={dossier}
              onAcceptDossier={() => setDecisionDialog("accept")}
              onRefuseDossier={() => setDecisionDialog("refuse")}
              onRequestPieces={() => setPieceDialogOpen(true)}
              isPreparingSignature={isPreparingSignature}
              signatureResult={signatureResult}
            />
          )}
      </div>

      {/* Dialog de décision */}
      <Dialog open={!!decisionDialog} onOpenChange={(open) => !open && resetDecisionDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {decisionDialog === "accept" ? "Confirmer l'acceptation du dossier" : "Confirmer le refus du dossier"}
            </DialogTitle>
            <DialogDescription>
              Cette action prépare une notification officielle depuis le modèle paramétré, puis l'envoie au parapheur pour signature.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

      {/* Sheet analyse détaillée conformité */}
      <Sheet open={conformityOpen} onOpenChange={setConformityOpen}>
        <SheetContent side="right" className="w-[min(96vw,46rem)] overflow-y-auto sm:max-w-none">
          <SheetHeader>
            <SheetTitle>Analyse détaillée de conformité</SheetTitle>
            <SheetDescription>
              Assistance à l'instruction : les constats restent des vigilances à vérifier par le service instructeur.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <p className="text-center text-slate-600">
              Analyse détaillée disponible dans l'onglet "Analyse du dossier"
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog demande de pièces */}
      <Dialog open={pieceDialogOpen} onOpenChange={setPieceDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Demander des pièces complémentaires</DialogTitle>
            <DialogDescription>
              Sélectionnez dans la nomenclature complète du dossier {dossierType}.
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
                          {piece.conditionLabel && <p className="mt-1 text-sm italic text-slate-600">{piece.conditionLabel}</p>}
                          {selectedState && (
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
                          )}
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
            <Button 
              disabled={selectedPieces.length === 0 || isPreparingSignature} 
              onClick={handlePiecesRequest} 
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {isPreparingSignature ? "Préparation..." : "Générer et envoyer au parapheur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MairieDetailShell>
  );
}