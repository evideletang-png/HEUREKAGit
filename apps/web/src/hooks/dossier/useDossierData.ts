import { useQuery } from "@tanstack/react-query";
import { isDemoSessionActive, readDemoState } from "@/demo/demoModeStore";
import { getDemoDossierForStatus } from "@/demo/demoSeedData";

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

export function useDossierData(id: string) {
  const demoActive = isDemoSessionActive();

  const query = useQuery<DossierDetail>({
    queryKey: ["mairie-full-dossier", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id)}`),
    enabled: !!id && !demoActive,
  });

  const instructionQuery = useQuery<InstructionPayload>({
    queryKey: ["mairie-dossier-instruction", id],
    queryFn: () => apiFetch(`/api/mairie/dossiers/${encodeURIComponent(id)}/instruction`),
    enabled: !!id && !demoActive && !!query.data,
  });

  const demoDossier = demoActive ? getDemoDossierForStatus(readDemoState().dossierStatus) as unknown as DossierDetail : null;

  const dossier = demoActive ? demoDossier : (query.data ?? null);

  const instruction = dossier ? {
    instructionStatus: dossier.instructionStatus || null,
    dateDepot: dossier.dateDepot || dossier.createdAt || null,
    dateCompletude: dossier.dateCompletude || null,
    dateLimiteInstruction: dossier.dateLimiteInstruction || null,
    isTacite: !!dossier.isTacite,
    alerts: [],
  } : null;

  const fallbackTimeline: InstructionPayload["timeline"] = [];
  if (instruction?.dateDepot) {
    fallbackTimeline.push({ id: "depot", type: "depot", description: "Dossier déposé", createdAt: instruction.dateDepot });
  }
  if (instruction?.dateCompletude) {
    fallbackTimeline.push({ id: "completude", type: "piece_recue", description: "Dossier complet", createdAt: instruction.dateCompletude });
  }
  const instructionTimeline = instructionQuery.data?.timeline || fallbackTimeline;

  return {
    dossier,
    instruction,
    instructionTimeline,
    isLoading: !demoActive && query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}