import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useGeocodeAddress } from "@workspace/api-client-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { checkCompleteness } from "@/lib/urbanisme/compliance/checkCompleteness";
import {
  getCerfaSectionStatus,
  getCerfaSections,
  getMissingRequiredFields,
  type CerfaSectionDefinition,
  type CerfaSectionStatus,
} from "@/lib/urbanisme/cerfa/cerfaFormSchema";
import {
  getProjectFlagsFromCerfaValues,
  mergeCerfaValuesWithPrefill,
  type CerfaFormValues,
} from "@/lib/urbanisme/cerfa/cerfaFieldMapping";
import { downloadBlob, generateCerfaPdf, getCerfaFormDescriptor } from "@/lib/urbanisme/cerfa/generateCerfaPdf";
import { importCerfaPdf } from "@/lib/urbanisme/cerfa/importCerfaPdf";
import { normalizeOfficialDossierType, resolveOfficialPieces } from "@/lib/urbanisme/cerfa/resolveOfficialPieces";
import type { DossierType, ProjectContext, ResolvedPiece } from "@/lib/urbanisme/cerfa/officialPieces.types";
import { triggerSourceLabel } from "@/lib/urbanisme/cerfa/pieceTriggers";
import { computeInstructionTimeline } from "@/lib/urbanisme/timeline/computeInstructionTimeline";
import { analyzeParcelContext, type ParcelContextAnalysis } from "@/lib/location-intelligence/analyzeParcelContext";
import { getRequiredPieces, normalizeProcedureType } from "@/lib/pieceRequirements";
import { CerfaInteractiveForm } from "@/components/dossier/CerfaInteractiveForm";
import { CerfaSectionSidebar } from "@/components/dossier/CerfaSectionSidebar";
import { DossierActionRail } from "@/components/dossier/DossierActionRail";
import { ParcelContextDetails } from "@/components/location/ParcelContextDetails";
import { ParcelContextSummary } from "@/components/location/ParcelContextSummary";
import { ParcelDetectionLoader } from "@/components/location/ParcelDetectionLoader";
import { demoDossier, demoProjectContext, demoUploadedDocuments } from "@/demo/demoSeedData";
import { isDemoSessionActive } from "@/demo/demoModeStore";
import { ORIENTATION_STORAGE_KEY, type OrientationResultPayload } from "@/modules/orientation/orientation.types";

const DOSSIER_TYPES: { value: DossierType; label: string }[] = [
  { value: "PCMI", label: "PCMI - Permis de construire maison individuelle" },
  { value: "PC", label: "PC - Permis de construire" },
  { value: "DPC", label: "DP - Déclaration préalable constructions/travaux" },
  { value: "DPA", label: "DP - Déclaration préalable installations/aménagements" },
  { value: "PA", label: "PA - Permis d'aménager" },
  { value: "PD", label: "PD - Permis de démolir" },
];

const CITIZEN_DRAFT_KEY = "heureka.citizenDraft";
const CITIZEN_DRAFT_DB = "heureka-citizen-draft";
const CITIZEN_DRAFT_FILES_STORE = "files";

type UploadedDossierFile = {
  id: string;
  file: File;
  pieceCode?: string;
};

type StoredDraftFile = {
  id: string;
  file: File;
  pieceCode?: string;
};

function fileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CITIZEN_DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CITIZEN_DRAFT_FILES_STORE)) {
        db.createObjectStore(CITIZEN_DRAFT_FILES_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDraftFiles(files: UploadedDossierFile[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CITIZEN_DRAFT_FILES_STORE, "readwrite");
    const store = tx.objectStore(CITIZEN_DRAFT_FILES_STORE);
    store.clear();
    files.forEach((item) => store.put({ id: item.id, file: item.file, pieceCode: item.pieceCode } satisfies StoredDraftFile));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadDraftFiles(): Promise<UploadedDossierFile[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDraftDb();
  const files = await new Promise<UploadedDossierFile[]>((resolve, reject) => {
    const tx = db.transaction(CITIZEN_DRAFT_FILES_STORE, "readonly");
    const request = tx.objectStore(CITIZEN_DRAFT_FILES_STORE).getAll();
    request.onsuccess = () => resolve((request.result as StoredDraftFile[]).map((item) => ({ id: item.id, file: item.file, pieceCode: item.pieceCode })));
    request.onerror = () => reject(request.error);
  });
  db.close();
  return files;
}

async function clearDraftFiles() {
  if (typeof indexedDB === "undefined") return;
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CITIZEN_DRAFT_FILES_STORE, "readwrite");
    tx.objectStore(CITIZEN_DRAFT_FILES_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function getAddressCoordinates(address: any) {
  const lat = Number(address?.lat ?? address?.latitude ?? address?.y);
  const lon = Number(address?.lon ?? address?.lng ?? address?.longitude ?? address?.x);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

function documentTypeForProcedure(type: string) {
  const normalized = normalizeProcedureType(type);
  if (normalized === "DPC" || normalized === "DPA") return "declaration_prealable";
  if (normalized === "PA") return "permis_amenager";
  if (normalized === "PD") return "permis_demolir";
  return "permis_de_construire";
}

function extractDetectedCode(filename: string) {
  return filename.match(/\b(?:PCMI|DPC|DPA|PC|PA|PD)\s*[-_ ]?\s*\d+(?:-\d+)?\b/i)?.[0]?.replace(/\s+/g, "").replace("_", "-");
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / 1024 / 1024).toFixed(1)} Mo`;
}

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "dossier";
}

function getParcelAreaM2(parcelAnalysis: any) {
  const primaryParcel = parcelAnalysis?.primaryParcel || parcelAnalysis?.parcels?.[0] || {};
  const candidates = [
    parcelAnalysis?.contenanceM2,
    parcelAnalysis?.parcelSurfaceM2,
    parcelAnalysis?.surfaceM2,
    parcelAnalysis?.surface_m2,
    parcelAnalysis?.areaM2,
    parcelAnalysis?.metadata?.contenance,
    parcelAnalysis?.metadata?.contenanceM2,
    primaryParcel?.contenanceM2,
    primaryParcel?.contenance,
    primaryParcel?.surfaceM2,
    primaryParcel?.feature?.properties?.contenance,
  ];
  const area = candidates.map(Number).find((value) => Number.isFinite(value) && value > 0);
  return area ? Math.round(area) : "";
}

function constraintsFrom(parcelAnalysis: any) {
  const values = [
    ...(Array.isArray(parcelAnalysis?.constraints) ? parcelAnalysis.constraints : []),
    ...(Array.isArray(parcelAnalysis?.geoConstraints) ? parcelAnalysis.geoConstraints : []),
  ].map((value) => String(value).toLowerCase());
  return {
    abf: values.some((value) => value.includes("abf") || value.includes("monument") || value.includes("patrimoine")),
    monumentHistoriqueAbords: values.some((value) => value.includes("abords") || value.includes("monument")),
    spr: values.some((value) => value.includes("spr") || value.includes("patrimonial remarquable")),
    natura2000: values.some((value) => value.includes("natura")),
    pprRequiresStudy: values.some((value) => value.includes("ppr") || value.includes("risque")),
  };
}

function buildLocationContext(args: {
  selectedAddress: any;
  parcelAnalysis: any;
  isAnalyzing: boolean;
}): ProjectContext["locationContext"] {
  const constraints = constraintsFrom(args.parcelAnalysis);
  const hasUnresolved = args.isAnalyzing || !args.parcelAnalysis?.zoneCode;
  return {
    commune: args.selectedAddress?.city || args.parcelAnalysis?.commune || undefined,
    parcel: args.parcelAnalysis?.parcelRef || args.selectedAddress?.parcelles?.[0] || undefined,
    pluZone: args.parcelAnalysis?.zoneCode || null,
    confidence: args.parcelAnalysis?.zoneCode ? 0.82 : 0.5,
    unresolvedChecks: hasUnresolved ? ["pluZone", "servitudes", "risks"] : [],
    ...constraints,
  };
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Brouillon",
    complete: "Complet",
    incomplete: "En cours",
    submitted: "Transmis",
    in_instruction: "En instruction",
  };
  return labels[status] || status;
}

function PieceRow(props: {
  piece: ResolvedPiece;
  matched: boolean;
  onAdd: (pieceCode?: string) => void;
}) {
  const stateLabel = props.piece.requirementState === "required" ? "Requis" : "À confirmer";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-md bg-primary px-2.5 py-1 text-xs">{props.piece.code}</Badge>
            <Badge variant={props.piece.status === "mandatory" ? "default" : "outline"}>
              {props.piece.status === "mandatory" ? "Obligatoire" : "Conditionnelle"}
            </Badge>
            <Badge variant={props.matched ? "secondary" : props.piece.requirementState === "required" ? "destructive" : "outline"}>
              {props.matched ? "Ajoutée" : stateLabel}
            </Badge>
          </div>
          <h3 className="mt-3 text-sm font-semibold leading-6 text-slate-950">{props.piece.label}</h3>
          {props.piece.conditionLabel ? <p className="mt-2 text-xs italic text-slate-600">Condition : {props.piece.conditionLabel}</p> : null}
          {props.piece.legalReference ? <p className="mt-2 text-xs text-slate-500">Base réglementaire : {props.piece.legalReference}</p> : null}
          <p className="mt-2 text-xs text-slate-600">{props.piece.explanation}</p>
          {props.piece.matchedTriggers.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              Déclenché par : {props.piece.matchedTriggers.map(triggerSourceLabel).join(", ")}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => props.onAdd(props.piece.code)} className="shrink-0 gap-2">
          <Upload className="h-4 w-4" />
          Ajouter
        </Button>
      </div>
    </div>
  );
}

function PiecesSection(props: {
  pieces: ResolvedPiece[];
  files: UploadedDossierFile[];
  matchedCodes: Set<string>;
  onAdd: (pieceCode?: string) => void;
  onRemoveFile: (index: number) => void;
}) {
  const mandatory = props.pieces.filter((piece) => piece.status === "mandatory");
  const required = props.pieces.filter((piece) => piece.status === "conditional" && piece.requirementState === "required");
  const potential = props.pieces.filter((piece) => piece.requirementState === "potentially_required");
  const groups = [
    { title: "Pièces obligatoires pour tous les dossiers", pieces: mandatory },
    { title: "Pièces complémentaires requises", pieces: required },
    { title: "Pièces potentiellement requises", pieces: potential },
  ];

  return (
    <div className="space-y-6" data-demo="official-pieces-checklist">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Pièces à joindre à votre dossier</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bordereau officiel du CERFA, recalculé selon le type de dossier, les réponses et les contraintes détectées.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
        <Upload className="mx-auto h-8 w-8 text-slate-500" />
        <p className="mt-2 text-sm font-semibold text-slate-900">Ajouter des pièces justificatives</p>
        <p className="mt-1 text-xs text-slate-500">Le code officiel dans le nom du fichier améliore le contrôle : PCMI1-plan-situation.pdf.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => props.onAdd()}>
          Sélectionner des documents
        </Button>
      </div>

      {props.files.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Documents ajoutés ({props.files.length})</p>
          <div className="mt-3 grid gap-2">
            {props.files.map((file, index) => (
              <div key={file.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{file.file.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(file.file.size)}
                      {file.pieceCode ? ` · rattaché à ${file.pieceCode}` : ""}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => props.onRemoveFile(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
          {group.pieces.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Aucune pièce dans cette catégorie pour le contexte actuel.</p>
          ) : (
            group.pieces.map((piece) => (
              <PieceRow key={piece.code} piece={piece} matched={props.matchedCodes.has(piece.code)} onAdd={props.onAdd} />
            ))
          )}
        </section>
      ))}
    </div>
  );
}

function VerificationSection(props: {
  missingFields: ReturnType<typeof getMissingRequiredFields>;
  missingPieces: ResolvedPiece[];
  unresolvedChecks: string[];
  timeline: ReturnType<typeof computeInstructionTimeline>;
}) {
  const hasIssues = props.missingFields.length > 0 || props.missingPieces.length > 0;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Vérification avant transmission</h2>
        <p className="mt-1 text-sm text-slate-600">Heureka contrôle les champs obligatoires, les pièces CERFA et les points à confirmer.</p>
      </div>

      <div className={`rounded-lg border p-4 ${hasIssues ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex items-start gap-3">
          {hasIssues ? <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />}
          <div>
            <p className="font-semibold text-slate-950">
              {hasIssues ? "Votre dossier ne peut pas encore être transmis." : "Votre dossier est complet au regard des contrôles identifiés."}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Délai indicatif : {props.timeline.totalDelay} mois, date limite estimée {props.timeline.legalDeadlineDate.toLocaleDateString("fr-FR")}.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Champs manquants</h3>
          {props.missingFields.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Aucun champ obligatoire manquant.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {props.missingFields.map((item) => (
                <li key={`${item.sectionId}-${item.field.id}`}>• {item.sectionTitle} — {item.field.label}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Pièces manquantes</h3>
          {props.missingPieces.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Aucune pièce requise manquante.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {props.missingPieces.map((piece) => (
                <li key={piece.code}>• {piece.code} — {piece.label}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-950">Contraintes et données à confirmer</h3>
        {props.unresolvedChecks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Les contrôles de localisation principaux sont renseignés.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Analyse réglementaire en cours : {props.unresolvedChecks.join(", ")}. Les pièces liées à l'adresse seront recalculées automatiquement.
          </p>
        )}
      </div>
    </div>
  );
}

export default function CitoyenNewDossierPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPieceCodeRef = useRef<string | undefined>(undefined);
  const [files, setFiles] = useState<UploadedDossierFile[]>([]);
  const [address, setAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [docType, setDocType] = useState<DossierType>("PCMI");
  const [projectFlags, setProjectFlags] = useState<ProjectContext["projectFlags"]>({});
  const [title, setTitle] = useState("");
  const [cerfaValues, setCerfaValues] = useState<CerfaFormValues>({});
  const [activeSectionId, setActiveSectionId] = useState("receipt");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [transmissionAccepted, setTransmissionAccepted] = useState(false);
  const lastAutoTerrainAreaRef = useRef<number | "">("");
  const [orientationResult, setOrientationResult] = useState<OrientationResultPayload | null>(null);
  const [parcelAnalysis, setParcelAnalysis] = useState<any>(null);
  const [parcelAnalysisError, setParcelAnalysisError] = useState<string | null>(null);
  const [parcelAnalysisLoading, setParcelAnalysisLoading] = useState(false);
  const [locationIntelligence, setLocationIntelligence] = useState<ParcelContextAnalysis | null>(null);
  const [showLocationDetails, setShowLocationDetails] = useState(false);
  const [parcelAnalysisRetryToken, setParcelAnalysisRetryToken] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);

  const geocode = useGeocodeAddress({ q: address }, { query: { enabled: address.length > 5 } } as any);
  const selectedCoordinates = useMemo(() => getAddressCoordinates(selectedAddress), [selectedAddress]);

  useEffect(() => {
    let cancelled = false;
    async function restoreDraft() {
      if (isDemoSessionActive()) {
        setDraftRestored(true);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get("orientation") === "guided") {
        setDraftRestored(true);
        return;
      }
      try {
        const raw = localStorage.getItem(CITIZEN_DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (cancelled) return;
        if (draft.docType) setDocType(normalizeOfficialDossierType(draft.docType));
        if (typeof draft.title === "string") setTitle(draft.title);
        if (typeof draft.address === "string") setAddress(draft.address);
        if (draft.selectedAddress) setSelectedAddress(draft.selectedAddress);
        if (draft.parcelAnalysis) setParcelAnalysis(draft.parcelAnalysis);
        if (draft.locationIntelligence) setLocationIntelligence(draft.locationIntelligence);
        if (draft.orientationResult) setOrientationResult(draft.orientationResult);
        if (draft.projectFlags) setProjectFlags(draft.projectFlags);
        if (draft.cerfaValues) setCerfaValues(draft.cerfaValues);
        if (draft.savedAt) setLastSavedAt(new Date(draft.savedAt));
        const restoredFiles = await loadDraftFiles().catch(() => []);
        if (!cancelled && restoredFiles.length > 0) setFiles(restoredFiles);
      } finally {
        if (!cancelled) setDraftRestored(true);
      }
    }
    void restoreDraft();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeFromQuery = params.get("type");
    if (typeFromQuery) {
      const normalized = normalizeOfficialDossierType(typeFromQuery);
      setDocType(normalized);
      setCerfaValues((current) => ({ ...current, "project.dossierType": normalized }));
    }

    const rawOrientation = params.get("orientation") === "guided" ? sessionStorage.getItem(ORIENTATION_STORAGE_KEY) : null;
    if (!rawOrientation) return;
    try {
      const orientation = JSON.parse(rawOrientation) as OrientationResultPayload;
      setOrientationResult(orientation);
      if (orientation.recommendedDossierType === "PCMI" || orientation.recommendedDossierType === "PC" || orientation.recommendedDossierType === "DPC" || orientation.recommendedDossierType === "DPA" || orientation.recommendedDossierType === "PA" || orientation.recommendedDossierType === "PD") {
        setDocType(orientation.recommendedDossierType);
        setProjectFlags((current) => ({ ...current, ...orientation.projectFlags }));
        setCerfaValues((current) => ({
          ...current,
          "project.dossierType": orientation.recommendedDossierType,
          "works.createsConstruction": orientation.projectFlags.createsConstruction,
          "works.modifiesFacadesOrRoof": orientation.projectFlags.modifiesFacadesOrRoof,
          "works.modifiesTerrainProfile": orientation.projectFlags.modifiesTerrainProfile,
          "works.visibleFromPublicSpace": orientation.projectFlags.visibleFromPublicSpace,
          "demolition.demolitionRequired": orientation.projectFlags.demolitionRequired,
          "demolition.pcIncludesDemolition": orientation.projectFlags.pcIncludesDemolition,
          "related.deforestationRequired": orientation.projectFlags.deforestationRequired,
          "related.lotissement": orientation.projectFlags.lotissement,
          "terrain.commune": orientation.locationFlags.commune,
          "terrain.parcel": orientation.locationFlags.parcel,
          "terrain.pluZone": orientation.locationFlags.pluZone || "",
        }));
      }
    } catch {
      sessionStorage.removeItem(ORIENTATION_STORAGE_KEY);
    }
  }, [location]);

  useEffect(() => {
    if (!draftRestored || isDemoSessionActive()) return;
    const hasDraftContent = !!title || !!address || !!selectedAddress || Object.keys(cerfaValues).length > 0 || files.length > 0;
    if (!hasDraftContent) return;

    const timeout = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const payload = {
        docType,
        title,
        address,
        selectedAddress,
        parcelAnalysis,
        locationIntelligence,
        orientationResult,
        projectFlags,
        cerfaValues,
        activeSectionId,
        files: files.map((item) => ({
          id: item.id,
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
          lastModified: item.file.lastModified,
          pieceCode: item.pieceCode,
        })),
        savedAt,
      };
      localStorage.setItem(CITIZEN_DRAFT_KEY, JSON.stringify(payload));
      void saveDraftFiles(files).catch(() => undefined);
      setLastSavedAt(new Date(savedAt));
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [draftRestored, docType, title, address, selectedAddress, parcelAnalysis, locationIntelligence, orientationResult, projectFlags, cerfaValues, activeSectionId, files]);

  const uploadedDocumentsForCompleteness = useMemo(
    () => files.map((item) => ({
      code: item.pieceCode,
      filename: item.file.name,
      type: item.file.type,
      detectedCode: extractDetectedCode(item.file.name),
      confidence: item.pieceCode ? 0.98 : extractDetectedCode(item.file.name) ? 0.78 : undefined,
    })),
    [files],
  );

  useEffect(() => {
    const nextType = normalizeOfficialDossierType(cerfaValues["project.dossierType"] as string || docType);
    if (nextType !== docType) setDocType(nextType);
  }, [cerfaValues, docType]);

  useEffect(() => {
    setCerfaValues((current) => ({
      ...current,
      "project.title": title,
      "project.dossierType": docType,
    }));
  }, [title, docType]);

  useEffect(() => {
    const areaM2 = getParcelAreaM2(parcelAnalysis);
    const prefill = {
      "terrain.address": selectedAddress?.label || address,
      "terrain.commune": selectedAddress?.city || parcelAnalysis?.commune || "",
      "terrain.parcel": parcelAnalysis?.parcelRef || selectedAddress?.parcelles?.[0] || "",
      "terrain.pluZone": parcelAnalysis?.zoneCode || "",
      "terrain.area": areaM2,
    };
    setCerfaValues((current) => {
      const next = mergeCerfaValuesWithPrefill(current, prefill);
      const currentArea = current["terrain.area"];
      const canRefreshAutoArea = currentArea === undefined
        || currentArea === null
        || currentArea === ""
        || Number(currentArea) === lastAutoTerrainAreaRef.current;
      if (areaM2 && canRefreshAutoArea) {
        next["terrain.area"] = areaM2;
        lastAutoTerrainAreaRef.current = areaM2;
      }
      return next;
    });
  }, [address, selectedAddress, parcelAnalysis]);

  useEffect(() => {
    if (!isDemoSessionActive()) return;
    setTitle(demoDossier.title);
    setDocType("PCMI");
    setProjectFlags(demoProjectContext.projectFlags);
    setCerfaValues((current) => ({
      ...current,
      "project.title": demoDossier.title,
      "project.dossierType": "PCMI",
      "applicant.fullName": "Jean Martin",
      "applicant.email": "jean.martin.demo@heureka.local",
      "terrain.address": demoDossier.address,
      "terrain.commune": demoDossier.commune,
      "terrain.parcel": demoDossier.parcelRef,
      "terrain.pluZone": demoDossier.zoneCode,
      "terrain.area": 650,
      "works.description": "Extension d'une maison individuelle et modification de façade.",
      "works.createsConstruction": true,
      "works.modifiesFacadesOrRoof": true,
      "works.visibleFromPublicSpace": true,
      "surfaces.created": 28,
      "legal.ownerAuthorization": true,
      "engagement.accepted": true,
    }));
    setAddress(demoDossier.address);
    setSelectedAddress({
      id: "demo-ban-commune-demo-12-tilleuls",
      label: demoDossier.address,
      city: demoDossier.commune,
      postcode: "37000",
      lat: 47.394,
      lon: 0.684,
      parcelles: [demoDossier.parcelRef],
    });
    setParcelAnalysis({
      parcelRef: demoDossier.parcelRef,
      parcelId: "demo-cadastre-ab-123",
      section: "AB",
      number: "123",
      commune: demoDossier.commune,
      postcode: "37000",
      zoneCode: demoDossier.zoneCode,
      zoningLabel: demoDossier.zoneLabel,
      constraints: ["Abords monument historique", "Consultation ABF"],
      geoConstraints: ["Abords monument historique"],
      source: "demoParcelProvider",
      contenanceM2: 650,
    });
    void analyzeParcelContext({
      address: demoDossier.address,
      parcelId: demoDossier.parcelRef,
      commune: demoDossier.commune,
      dossierType: "PCMI",
      projectFlags: demoProjectContext.projectFlags,
      demo: true,
    }).then(setLocationIntelligence);
    setLastSavedAt(new Date());
    if (files.length === 0 && typeof File !== "undefined") {
      setFiles(demoUploadedDocuments.map((document) => {
        const file = new File(["demo"], document.fileName, { type: "application/pdf" });
        return { id: fileId(file), file, pieceCode: document.code };
      }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadParcelPreview() {
      if (isDemoSessionActive()) return;
      setParcelAnalysis(null);
      setLocationIntelligence(null);
      setParcelAnalysisError(null);
      setParcelAnalysisLoading(false);
      if (!selectedAddress || selectedCoordinates.lat === null || selectedCoordinates.lon === null) return;
      try {
        setParcelAnalysisLoading(true);
        const response = await fetch("/api/analyses/parcel-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: selectedCoordinates.lat,
            lng: selectedCoordinates.lon,
            banId: selectedAddress.id,
            label: selectedAddress.label,
            banParcelles: selectedAddress.parcelles || selectedAddress.banParcelles || [],
          }),
        });
        if (!response.ok) throw new Error("Analyse parcelle indisponible");
        const preview = await response.json();
        if (!cancelled) {
          const primaryParcel = preview.primaryParcel || preview.parcels?.[0] || {};
          const nextParcelAnalysis = {
            ...preview,
            constraints: preview.constraints || preview.geoConstraints || [],
            geoConstraints: preview.geoConstraints || preview.constraints || [],
            parcelRef: primaryParcel.parcelRef || primaryParcel.id || selectedAddress.parcelles?.[0] || null,
            parcelId: primaryParcel.id || null,
            section: primaryParcel.section || null,
            number: primaryParcel.numero || primaryParcel.number || null,
            contenanceM2: primaryParcel.contenanceM2 || primaryParcel.contenance || null,
            commune: selectedAddress.city || preview.commune || null,
            postcode: selectedAddress.postcode || null,
            lat: selectedCoordinates.lat,
            lon: selectedCoordinates.lon,
            zoneCode: preview.zoningPreview?.zoneCode || null,
            zoningLabel: preview.zoningPreview?.zoningLabel || null,
            source: "parcel-analysis",
          };
          const intelligence = await analyzeParcelContext({
            address: selectedAddress.label,
            parcelId: nextParcelAnalysis.parcelRef,
            coordinates: { lat: selectedCoordinates.lat, lon: selectedCoordinates.lon },
            banId: selectedAddress.id,
            banParcelles: selectedAddress.parcelles || selectedAddress.banParcelles || [],
            commune: selectedAddress.city || nextParcelAnalysis.commune || undefined,
            existingParcelAnalysis: nextParcelAnalysis,
            dossierType: docType,
            projectFlags,
          });
          setLocationIntelligence(intelligence);
          setParcelAnalysis({
            ...nextParcelAnalysis,
            locationIntelligence: intelligence,
            constraints: [
              ...(nextParcelAnalysis.constraints || []),
              ...Object.entries(intelligence.detectedConstraints)
                .filter(([, value]) => value === true)
                .map(([key]) => key),
            ],
            zoneCode: intelligence.pluZone?.code || nextParcelAnalysis.zoneCode,
            zoningLabel: intelligence.pluZone?.label || nextParcelAnalysis.zoningLabel,
            commune: intelligence.commune || nextParcelAnalysis.commune,
            codeInsee: intelligence.codeInsee || nextParcelAnalysis.codeInsee,
            parcelRef: intelligence.parcel?.fullReference || nextParcelAnalysis.parcelRef,
            contenanceM2: intelligence.parcel?.surfaceM2 || nextParcelAnalysis.contenanceM2,
          });
        }
      } catch (error) {
        if (!cancelled) setParcelAnalysisError(error instanceof Error ? error.message : "Analyse parcelle indisponible");
      } finally {
        if (!cancelled) setParcelAnalysisLoading(false);
      }
    }
    loadParcelPreview();
    return () => { cancelled = true; };
  }, [selectedAddress, selectedCoordinates.lat, selectedCoordinates.lon, parcelAnalysisRetryToken, docType, projectFlags]);

  const sections = useMemo(() => getCerfaSections(docType), [docType]);
  const activeSection = sections.find((section) => section.id === activeSectionId) || sections[0];
  const derivedProjectFlags = useMemo(
    () => ({ ...projectFlags, ...getProjectFlagsFromCerfaValues(cerfaValues) }),
    [projectFlags, cerfaValues],
  );
  const locationContext = useMemo(
    () => {
      const live = buildLocationContext({ selectedAddress, parcelAnalysis, isAnalyzing: parcelAnalysisLoading });
      const intelligenceConstraints = locationIntelligence?.detectedConstraints;
      const intelligenceLocation = locationIntelligence ? {
        commune: locationIntelligence.commune || undefined,
        parcel: locationIntelligence.parcel?.fullReference || undefined,
        pluZone: locationIntelligence.pluZone?.code || null,
        abf: intelligenceConstraints?.abf,
        monumentHistoriqueAbords: intelligenceConstraints?.monumentHistoriqueAbords,
        spr: intelligenceConstraints?.spr,
        siteClasse: intelligenceConstraints?.siteClasse,
        siteInscrit: intelligenceConstraints?.siteInscrit,
        parcNationalCore: intelligenceConstraints?.parcNationalCore,
        natura2000: intelligenceConstraints?.natura2000,
        pprRequiresStudy: intelligenceConstraints?.pprRequiresStudy,
        sis: intelligenceConstraints?.sis,
        formerIcpe: intelligenceConstraints?.formerIcpe,
        confidence: locationIntelligence.confidence,
        unresolvedChecks: locationIntelligence.unresolvedChecks,
      } : {};
      const liveEntries = Object.entries(live).filter(([, value]) => value !== undefined && value !== null && value !== "");
      return {
        ...Object.fromEntries(liveEntries),
        ...orientationResult?.locationFlags,
        ...intelligenceLocation,
      };
    },
    [selectedAddress, parcelAnalysis, parcelAnalysisLoading, orientationResult, locationIntelligence],
  );
  const projectContext: ProjectContext = useMemo(
    () => ({ dossierType: docType, projectFlags: derivedProjectFlags, locationContext }),
    [docType, derivedProjectFlags, locationContext],
  );
  const cerfaDescriptor = useMemo(() => getCerfaFormDescriptor(docType), [docType]);
  const resolvedPieces = useMemo(() => resolveOfficialPieces(projectContext), [projectContext]);
  const completeness = useMemo(
    () => checkCompleteness({ requiredPieces: resolvedPieces, uploadedDocuments: uploadedDocumentsForCompleteness }),
    [resolvedPieces, uploadedDocumentsForCompleteness],
  );
  const matchedCodes = useMemo(() => new Set(completeness.matchedPieces.map((match) => match.piece.code)), [completeness]);
  const missingRequiredFields = useMemo(() => getMissingRequiredFields(sections, cerfaValues), [sections, cerfaValues]);
  const timeline = useMemo(
    () => computeInstructionTimeline({ dossierType: docType, locationContext, projectFlags: derivedProjectFlags }),
    [docType, locationContext, derivedProjectFlags],
  );
  const hasBlockingErrors = missingRequiredFields.length > 0 || completeness.status === "incomplete";
  const sectionStatuses = useMemo(
    () => sections.reduce<Record<string, CerfaSectionStatus>>((acc, section) => {
      acc[section.id] = getCerfaSectionStatus({
        section,
        values: cerfaValues,
        missingPieceCodes: completeness.missingPieces.map((piece) => piece.code),
        resolvedPieces,
        hasBlockingErrors,
      });
      return acc;
    }, {}),
    [sections, cerfaValues, completeness.missingPieces, resolvedPieces, hasBlockingErrors],
  );
  const completedSections = Object.values(sectionStatuses).filter((status) => status === "complete" || status === "not_applicable").length;
  const sectionRate = sections.length === 0 ? 0 : (completedSections / sections.length) * 100;
  const pieceRate = resolvedPieces.filter((piece) => piece.requirementState === "required").length === 0
    ? 100
    : (completeness.matchedPieces.length / resolvedPieces.filter((piece) => piece.requirementState === "required").length) * 100;
  const completionRate = Math.round((sectionRate * 0.55) + (pieceRate * 0.45));
  const canTransmit = !hasBlockingErrors && !!selectedAddress && !!title;
  const dossierStatus = canTransmit ? "complete" : title || selectedAddress ? "incomplete" : "draft";
  const transmissionPackageSignature = useMemo(
    () => JSON.stringify({
      docType,
      title,
      cerfaValues,
      files: files.map((item) => ({ id: item.id, name: item.file.name, size: item.file.size, pieceCode: item.pieceCode })),
      completeness: completeness.status,
    }),
    [docType, title, cerfaValues, files, completeness.status],
  );

  useEffect(() => {
    setTransmissionAccepted(false);
  }, [transmissionPackageSignature]);

  const upload = useMutation({
    mutationFn: async ({ formData, dossierId }: { formData: FormData; dossierId: string }) => {
      formData.append("dossierId", dossierId);
      const r = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    const pieceCode = pendingPieceCodeRef.current;
    if (selectedFiles.length > 0) {
      setFiles((prev) => [
        ...prev,
        ...selectedFiles.map((file) => ({ id: fileId(file), file, pieceCode })),
      ]);
    }
    pendingPieceCodeRef.current = undefined;
    event.target.value = "";
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const imported = await importCerfaPdf(file);
    setDocType(imported.dossierType);
    setCerfaValues((current) => ({ ...current, ...imported.values, "project.dossierType": imported.dossierType }));
    if (imported.values["project.title"]) setTitle(String(imported.values["project.title"]));
    toast({
      title: "CERFA importé partiellement",
      description: imported.warnings[0],
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const saveDraft = () => {
    const savedAt = new Date().toISOString();
    const payload = {
      docType,
      title,
      address,
      selectedAddress,
      parcelAnalysis,
      locationIntelligence,
      orientationResult,
      projectFlags,
      cerfaValues,
      activeSectionId,
      files: files.map((item) => ({
        id: item.id,
        name: item.file.name,
        size: item.file.size,
        type: item.file.type,
        lastModified: item.file.lastModified,
        pieceCode: item.pieceCode,
      })),
      savedAt,
    };
    localStorage.setItem(CITIZEN_DRAFT_KEY, JSON.stringify(payload));
    void saveDraftFiles(files).catch(() => undefined);
    const now = new Date();
    setLastSavedAt(now);
    toast({ title: "Brouillon sauvegardé", description: `Dernière sauvegarde à ${now.toLocaleTimeString("fr-FR")}.` });
  };

  const exportDossier = async () => {
    const blob = await generateCerfaPdf({ dossierType: docType, values: cerfaValues, title });
    downloadBlob(blob, `${docType}-${title || "dossier"}.pdf`);
  };

  const generateCerfaFile = async () => {
    const blob = await generateCerfaPdf({ dossierType: docType, values: cerfaValues, title });
    return new File([blob], `${docType}-${safeFilePart(title)}-cerfa-prefilled.pdf`, { type: "application/pdf" });
  };

  const downloadGeneratedCerfa = async () => {
    const file = await generateCerfaFile();
    downloadBlob(file, file.name);
  };

  const verifyDossier = () => {
    setVerificationRequested(true);
    setActiveSectionId("verification");
    toast({
      title: hasBlockingErrors ? "Dossier à compléter" : "Dossier vérifié",
      description: hasBlockingErrors ? "La rubrique Vérification liste les points bloquants." : "Aucun blocage identifié avant transmission.",
    });
  };

  const submitDossier = async () => {
    if (!canTransmit) {
      verifyDossier();
      return;
    }
    if (!transmissionAccepted) {
      setActiveSectionId("transmission");
      toast({
        title: "Acceptation requise",
        description: "Téléchargez ou relisez le CERFA prérempli, puis confirmez l'accord de transmission.",
        variant: "destructive",
      });
      return;
    }
    try {
      const cerfaFile = await generateCerfaFile();
      const pieceChecklist = getRequiredPieces({ procedureType: docType, parcelAnalysis, selectedAddress, projectDetails: derivedProjectFlags });
      const createResponse = await fetch("/api/dossiers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeProcedure: docType,
          title,
          address: selectedAddress.label,
          commune: selectedAddress.city || parcelAnalysis?.commune || "",
          metadata: {
            cerfaValues,
            normalizedAddress: selectedAddress.label,
            address: {
              label: selectedAddress.label,
              city: selectedAddress.city || null,
              postcode: selectedAddress.postcode || null,
              lat: selectedCoordinates.lat,
              lon: selectedCoordinates.lon,
            },
            parcelAnalysis,
            locationIntelligence,
            locationContext,
            orientationContext: orientationResult ? {
              locationConstraints: orientationResult.locationConstraints,
              expectedConsultations: orientationResult.expectedConsultations,
              estimatedInstructionTimeline: orientationResult.estimatedInstructionTimeline,
              reasons: orientationResult.reasons,
              warnings: orientationResult.warnings,
            } : null,
            officialPieces: resolvedPieces,
            completeness,
            pieceChecklist,
            projectFlags: derivedProjectFlags,
            generatedCerfa: {
              fileName: cerfaFile.name,
              generatedAt: new Date().toISOString(),
              dossierType: docType,
              formFamily: cerfaDescriptor.formFamily,
              officialName: cerfaDescriptor.officialName,
              servicePublicCode: cerfaDescriptor.servicePublicCode || null,
              templateStatus: cerfaDescriptor.templateStatus,
              acceptedForTransmission: true,
            },
            annexes: files.map((item) => ({
              fileName: item.file.name,
              size: item.file.size,
              mimeType: item.file.type,
              pieceCode: item.pieceCode || null,
            })),
          },
        }),
      });
      if (!createResponse.ok) throw new Error((await createResponse.json().catch(() => ({}))).message || "Création du dossier impossible.");
      const created = await createResponse.json();
      const dossierId = created.dossier.id as string;

      const formData = new FormData();
      formData.append("files", cerfaFile);
      formData.append("pieceCodes", "CERFA");
      files.forEach((item) => {
        formData.append("files", item.file);
        formData.append("pieceCodes", item.pieceCode || "");
      });
      formData.append("adresse", selectedAddress.label);
      formData.append("commune", selectedAddress.city || parcelAnalysis?.commune || "");
      formData.append("title", title);
      formData.append("documentType", documentTypeForProcedure(docType));
      await upload.mutateAsync({ formData, dossierId });

      const submitResponse = await fetch(`/api/dossiers/${dossierId}/submit`, { method: "PATCH", credentials: "include" });
      if (!submitResponse.ok) throw new Error((await submitResponse.json().catch(() => ({}))).message || "Soumission impossible.");
      const submitted = await submitResponse.json();
      localStorage.removeItem(CITIZEN_DRAFT_KEY);
      void clearDraftFiles().catch(() => undefined);
      toast({
        title: submitted.dossier?.status === "INCOMPLET" ? "Dossier transmis, pièces à compléter" : "Dossier transmis",
        description: "Votre demande, le CERFA prérempli et les pièces annexes ont été envoyés au service instructeur.",
      });
      downloadBlob(cerfaFile, cerfaFile.name);
      setLocation("/citoyen");
    } catch (error: any) {
      toast({
        title: "Erreur lors du dépôt",
        description: error?.message || "Une erreur est survenue lors de l'envoi du dossier.",
        variant: "destructive",
      });
    }
  };

  const updateCerfaValues = (values: CerfaFormValues) => {
    setCerfaValues(values);
    if (typeof values["project.title"] === "string") setTitle(values["project.title"]);
    if (typeof values["project.dossierType"] === "string") setDocType(normalizeOfficialDossierType(values["project.dossierType"]));
  };

  const renderActiveSection = (section: CerfaSectionDefinition) => {
    if (section.kind === "pieces") {
      return (
        <PiecesSection
          pieces={resolvedPieces}
          files={files}
          matchedCodes={matchedCodes}
          onAdd={(pieceCode) => {
            pendingPieceCodeRef.current = pieceCode;
            fileInputRef.current?.click();
          }}
          onRemoveFile={removeFile}
        />
      );
    }
    if (section.kind === "verification") {
      return (
        <VerificationSection
          missingFields={missingRequiredFields}
          missingPieces={completeness.missingPieces}
          unresolvedChecks={locationContext.unresolvedChecks || []}
          timeline={timeline}
        />
      );
    }
    if (section.kind === "transmission") {
      const annexFiles = files.filter((item) => item.pieceCode);
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Transmission</h2>
            <p className="mt-1 text-sm text-slate-600">Relisez la synthèse, vérifiez le dossier puis transmettez la demande à la mairie.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">Dossier généré avant transmission</p>
                <p className="mt-1 text-sm text-slate-600">
                  Heureka produit le CERFA prérempli avec les informations saisies et joint les pièces annexes codées CERFA au dépôt.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={downloadGeneratedCerfa}>
                <FileText className="mr-2 h-4 w-4" />
                Télécharger le CERFA prérempli
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CERFA</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{docType} - {cerfaDescriptor.formFamily}</p>
                <p className="mt-1 text-xs text-slate-500">{cerfaDescriptor.officialName}</p>
                {cerfaDescriptor.templateStatus === "app_export" ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Export applicatif en attente de branchement du PDF officiel remplissable.
                  </p>
                ) : null}
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pièces annexes</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {annexFiles.length} pièce{annexFiles.length > 1 ? "s" : ""} codée{annexFiles.length > 1 ? "s" : ""} CERFA
                </p>
                <p className="mt-1 text-xs text-slate-500">Les fichiers ajoutés sont transmis avec leur code officiel quand il est renseigné.</p>
              </div>
            </div>
            {files.length > 0 ? (
              <div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
                {files.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-800">{item.file.name}</span>
                    <span className="text-slate-500">{item.pieceCode || "Pièce non codée"} · {formatFileSize(item.file.size)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <label className="mt-4 flex gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={transmissionAccepted}
                onChange={(event) => setTransmissionAccepted(event.target.checked)}
              />
              <span>
                J'ai vérifié le CERFA prérempli et les pièces annexes listées ci-dessus, et j'accepte que ce dossier soit transmis au service instructeur.
              </span>
            </label>
          </div>
          <div className={`rounded-lg border p-5 ${canTransmit ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="font-semibold text-slate-950">
              {canTransmit ? "Votre dossier peut être transmis." : "Transmission désactivée tant que le dossier est incomplet."}
            </p>
            <p className="mt-2 text-sm text-slate-600">{completeness.message}</p>
            <Button type="button" className="mt-4" disabled={!canTransmit || !transmissionAccepted || upload.isPending} onClick={submitDossier}>
              {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              J'accepte et je transmets ma demande
            </Button>
          </div>
        </div>
      );
    }
    return <CerfaInteractiveForm section={section} values={cerfaValues} onValuesChange={updateCerfaValues} />;
  };

  return (
    <AppShell className="bg-slate-50 pb-12" mainClassName="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
      <input ref={importInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleImportChange} />

      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/citoyen">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Plus className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Nouveau dépôt de dossier</h1>
          <p className="text-sm text-slate-600">Formulaire CERFA interactif, pièces officielles et vérification avant transmission.</p>
        </div>
      </div>

      <Card className="mb-6 border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-xl">{title || "Dossier sans titre"}</CardTitle>
              <CardDescription>{DOSSIER_TYPES.find((type) => type.value === docType)?.label}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={canTransmit ? "default" : "outline"}>{statusLabel(dossierStatus)}</Badge>
              <Badge variant="outline">{completionRate}% complété</Badge>
              <Badge variant="outline">{lastSavedAt ? `Sauvé ${lastSavedAt.toLocaleTimeString("fr-FR")}` : "Non sauvegardé"}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-5">
          <div>
            <p className="text-xs font-medium text-slate-500">Commune</p>
            <p className="font-semibold text-slate-950">{locationContext.commune || "À renseigner"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Adresse</p>
            <p className="truncate font-semibold text-slate-950">{selectedAddress?.label || address || "À renseigner"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Parcelle</p>
            <p className="font-semibold text-slate-950">{locationContext.parcel || (parcelAnalysisLoading ? "En recherche" : "Non déterminée")}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Zone PLU</p>
            <p className="font-semibold text-slate-950">{locationContext.pluZone || (parcelAnalysisLoading ? "En recherche" : "Non déterminée")}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Analyse</p>
            <p className="font-semibold text-slate-950">{locationContext.unresolvedChecks?.length ? "En cours" : "Localisation renseignée"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[270px_minmax(0,1fr)_240px]">
        <CerfaSectionSidebar
          sections={sections}
          activeSectionId={activeSection.id}
          statuses={sectionStatuses}
          onSelect={setActiveSectionId}
        />

        <main className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          {activeSection.id === "terrain" ? (
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4" data-demo="location-analysis">
              <Label htmlFor="address-search">Recherche d'adresse</Label>
              <div className="relative mt-2">
                <Input
                  id="address-search"
                  value={address}
                  placeholder="Cherchez une adresse..."
                  onChange={(event) => {
                    setAddress(event.target.value);
                    if (selectedAddress) {
                      setSelectedAddress(null);
                      setParcelAnalysis(null);
                      setParcelAnalysisError(null);
                    }
                  }}
                  className="pl-10"
                  autoComplete="off"
                />
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                {geocode.isLoading ? <Loader2 className="absolute right-3.5 top-3 h-4 w-4 animate-spin text-slate-500" /> : null}
              </div>
              {geocode.data?.results && address.length > 5 && !selectedAddress ? (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {geocode.data.results.map((result: any, index: number) => (
                    <button
                      key={index}
                      type="button"
                      className="block w-full border-b px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                      onClick={() => {
                        setSelectedAddress(result);
                        setAddress(result.label);
                        setCerfaValues((current) => ({
                          ...current,
                          "terrain.address": result.label,
                          "terrain.commune": result.city || "",
                        }));
                      }}
                    >
                      <span className="block text-sm font-semibold text-slate-950">{result.label}</span>
                      <span className="text-xs text-slate-500">{result.city} ({result.postcode})</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedAddress ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Adresse validée : {selectedAddress.city}
                  </Badge>
                  {parcelAnalysisError ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setParcelAnalysisRetryToken((token) => token + 1)}>
                      Relancer l'analyse
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {parcelAnalysisError ? <p className="mt-2 text-sm text-amber-700">{parcelAnalysisError}</p> : null}
              <div className="mt-4 space-y-4">
                {parcelAnalysisLoading ? <ParcelDetectionLoader /> : null}
                <ParcelContextSummary
                  analysis={locationIntelligence}
                  error={parcelAnalysisError}
                  onRetry={() => setParcelAnalysisRetryToken((token) => token + 1)}
                  onShowDetails={() => setShowLocationDetails((value) => !value)}
                />
                {showLocationDetails ? <ParcelContextDetails analysis={locationIntelligence} /> : null}
              </div>
            </div>
          ) : null}

          {verificationRequested && activeSection.kind !== "verification" && hasBlockingErrors ? (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              La vérification a détecté des points bloquants. Ouvrez la rubrique Vérification pour les corriger.
            </div>
          ) : null}

          {renderActiveSection(activeSection)}
        </main>

        <DossierActionRail
          completionRate={completionRate}
          canTransmit={canTransmit && transmissionAccepted}
          isTransmitting={upload.isPending}
          onImport={() => importInputRef.current?.click()}
          onExport={exportDossier}
          onVerify={verifyDossier}
          onSave={saveDraft}
          onTransmit={submitDossier}
          onBack={() => setLocation("/citoyen")}
        />
      </div>
    </AppShell>
  );
}
