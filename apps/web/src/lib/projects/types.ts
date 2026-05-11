export type ProjectCard = {
  id: string;
  source: "project" | "analysis" | "dossier";
  legacyId?: string;
  name: string;
  description?: string | null;
  address?: string | null;
  parcelReferences: string[];
  coordinates?: { lat: number; lon: number } | null;
  commune?: string | null;
  status: string;
  projectType?: string | null;
  progress: number;
  detectedConstraints: string[];
  mainPluZone?: string | null;
  usedModules: string[];
  alerts: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  routes?: {
    analysis?: string;
    dossier?: string;
  };
};

export type ProjectTimelineEvent = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  createdAt: string;
};
