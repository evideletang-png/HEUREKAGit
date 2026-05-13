import { useQuery } from "@tanstack/react-query";
import { getDemoDossierForStatus } from "@/demo/demoSeedData";
import { isDemoSessionActive, readDemoState } from "@/demo/demoModeStore";

export type DossierDetail = {
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

export type InstructionPayload = {
  instruction: {
    instructionStatus?: string | null;
    dateDepot?: string | null;
    dateCompletude?: string | null;
    dateLimiteInstruction?: string | null;
    isTacite?: boolean;
    alerts?: Array<{
      id: string;
      level: string;
      title: string;
      message: string;
      source?: string;
    }>;
  };
  timeline: Array<{
    id: string;
    type?: string;
    description?: string;
    createdAt?: string;
    metadata?: Record<string, any> | null;
  }>;
};

async function apiFetch(path: string) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return response.json();
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

export function useDossierData(id: string) {
  const demoActive = isDemoSessionActive();
  
  const query = useQuery<DossierDetail>({
    queryKey: ["mairie-full-dossier", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id)}`),
    enabled: !!id && !id.startsWith("demo-") && id !== "d2",
  });

  const instructionQuery = useQuery<InstructionPayload>({
    queryKey: ["mairie-dossier-instruction", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id)}/instruction`),
    enabled: !!id && !id.startsWith("demo-") && id !== "d2",
  });

  // Données démo ou fallback
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

  return {
    dossier,
    instruction,
    instructionTimeline,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}