import type { DossierStatus } from "@/lib/urbanisme/dossier/statusWorkflow";
import type { ProjectContext } from "@/lib/urbanisme/cerfa/officialPieces.types";

export type DemoUserRole = "citizen" | "mairie" | "metropole" | "abf" | "sdis" | "signatory";

export type DemoSeedUser = {
  id: string;
  name: string;
  email: string;
  role: "citoyen" | "mairie" | "metropole" | "abf" | "admin";
  demoRole: DemoUserRole;
  createdAt: string;
  assignments?: Array<{ actorType: string; label: string }>;
};

export type DemoSeedDocument = {
  id: string;
  code: string;
  title: string;
  fileName: string;
  documentType: string;
  status: string;
  pieceCode: string;
  pieceStatus: string;
  detectedCode: string;
  confidence: number;
  createdAt: string;
};

export const DEMO_DOSSIER_ID = "demo-dossier-pcmi";
export const DEMO_MAIRIE_DETAIL_ID = "d2";

export const demoSeedUsers: Record<DemoUserRole, DemoSeedUser> = {
  citizen: {
    id: "demo-user-citizen",
    name: "Jean Martin",
    email: "jean.martin.demo@heureka.local",
    role: "citoyen",
    demoRole: "citizen",
    createdAt: "2026-05-05T08:30:00.000Z",
  },
  mairie: {
    id: "demo-user-mairie",
    name: "Claire Dubois",
    email: "urbanisme@mairie-demo.fr",
    role: "mairie",
    demoRole: "mairie",
    createdAt: "2026-05-05T08:30:00.000Z",
    assignments: [{ actorType: "collectivite", label: "Commune Demo" }],
  },
  metropole: {
    id: "demo-user-metropole",
    name: "Nadia Bensaid",
    email: "instruction@metropole-demo.fr",
    role: "metropole",
    demoRole: "metropole",
    createdAt: "2026-05-05T08:30:00.000Z",
    assignments: [{ actorType: "metropole", label: "Metropole Demo" }],
  },
  abf: {
    id: "demo-user-abf",
    name: "Paul Lefevre",
    email: "abf@culture-demo.fr",
    role: "abf",
    demoRole: "abf",
    createdAt: "2026-05-05T08:30:00.000Z",
    assignments: [{ actorType: "abf", label: "UDAP Demo" }],
  },
  sdis: {
    id: "demo-user-sdis",
    name: "Sophie Renaud",
    email: "sdis@services-demo.fr",
    role: "admin",
    demoRole: "sdis",
    createdAt: "2026-05-05T08:30:00.000Z",
    assignments: [{ actorType: "sdis", label: "SDIS Demo" }],
  },
  signatory: {
    id: "demo-user-signatory",
    name: "Maire de Commune Demo",
    email: "maire@commune-demo.fr",
    role: "mairie",
    demoRole: "signatory",
    createdAt: "2026-05-05T08:30:00.000Z",
    assignments: [{ actorType: "collectivite", label: "Commune Demo" }],
  },
};

export const demoLocationContext: ProjectContext["locationContext"] = {
  commune: "Commune Demo",
  parcel: "AB 123",
  pluZone: "UB",
  abf: true,
  spr: false,
  monumentHistoriqueAbords: true,
  natura2000: false,
  lotissement: false,
  confidence: 0.92,
  unresolvedChecks: [],
};

export const demoProjectContext: ProjectContext = {
  dossierType: "PCMI",
  projectFlags: {
    createsConstruction: true,
    modifiesConstructionVolume: true,
    modifiesFacadesOrRoof: true,
    visibleFromPublicSpace: true,
  },
  locationContext: demoLocationContext,
};

export const demoUploadedDocuments: DemoSeedDocument[] = [
  "PCMI1",
  "PCMI2",
  "PCMI3",
  "PCMI4",
  "PCMI5",
  "PCMI6",
  "PCMI7",
  "PCMI8",
].map((code, index) => ({
  id: `demo-doc-${code.toLowerCase()}`,
  code,
  title: `${code} - piece deposee`,
  fileName: `${code}_Jean_Martin_extension.pdf`,
  documentType: "permis_de_construire",
  status: "analyzed",
  pieceCode: code,
  pieceStatus: "valide",
  detectedCode: code,
  confidence: 0.96,
  createdAt: new Date(Date.UTC(2026, 4, 5, 9, 15 + index)).toISOString(),
}));

export const demoConsultations = [
  {
    service: "ABF",
    required: true,
    reason: "Terrain situe aux abords d'un monument historique.",
    status: "received",
    sentAt: "2026-05-05T10:30:00.000Z",
    receivedAt: "2026-05-05T15:20:00.000Z",
    response: "Avis favorable sous reserve de conserver une teinte mate et des menuiseries ton pierre.",
  },
  {
    service: "Métropole",
    required: true,
    reason: "Coordination instructeur metropolitaine.",
    status: "received",
    sentAt: "2026-05-05T10:35:00.000Z",
    receivedAt: "2026-05-05T13:10:00.000Z",
    response: "Avis favorable. Aucun reseau metropolitain impacte.",
  },
  {
    service: "SDIS",
    required: false,
    reason: "Pas d'ERP ni d'enjeu incendie specifique detecte.",
    status: "received",
    sentAt: null,
    receivedAt: null,
    response: "Non requis pour ce scenario.",
  },
];

export const demoMessages = [
  {
    id: "demo-message-mairie-abf",
    dossierId: DEMO_DOSSIER_ID,
    fromRole: "mairie",
    content: "Bonjour @ABF, pouvez-vous confirmer l'acceptabilite des teintes proposees en facade et menuiseries ?",
    createdAt: "2026-05-05T10:42:00.000Z",
    linkedPieces: ["PCMI4", "PCMI5", "PCMI6"],
  },
  {
    id: "demo-message-abf-reply",
    dossierId: DEMO_DOSSIER_ID,
    fromRole: "abf",
    content: "Avis favorable sous reserve de conserver une teinte mate et des menuiseries ton pierre.",
    createdAt: "2026-05-05T15:18:00.000Z",
    linkedPieces: ["PCMI4", "PCMI5", "PCMI6"],
  },
];

export const demoPluAnalysis = {
  zone: "UB",
  conclusion: "CONFORME_AVEC_POINTS_ATTENTION",
  rulesChecked: [
    { article: "Article 6", rule: "Implantation par rapport aux voies", compliant: true, explanation: "Le recul declare reste compatible avec les prescriptions de la zone UB." },
    { article: "Article 7", rule: "Implantation en limites separatives", compliant: true, explanation: "A verifier sur plan cote avant signature, sans non-conformite detectee." },
    { article: "Article 9", rule: "Emprise au sol", compliant: true, explanation: "L'extension de 28 m2 reste dans l'enveloppe admise." },
    { article: "Article 10", rule: "Hauteur maximale", compliant: true, explanation: "Hauteur declaree de 6,20 m compatible avec la zone." },
    { article: "Article 11", rule: "Aspect exterieur", compliant: true, explanation: "Conforme sous reserve de respecter la prescription ABF sur teinte mate et menuiseries ton pierre." },
    { article: "Article 12", rule: "Stationnement", compliant: true, explanation: "Stationnement conserve sur la parcelle." },
  ],
};

export const demoDecision = {
  decision: "conditional",
  title: "Arrete accordant un permis de construire avec prescriptions",
  legalText:
    "Accord avec prescriptions. Les prescriptions ABF relatives aux teintes mates et aux menuiseries ton pierre sont annexees a la decision. Aucune regle PLU non conforme n'a ete constatee dans les donnees de demonstration.",
  signedDocumentUrl: "/demo/mock/decision-signee.pdf",
  evidenceFileUrl: "/demo/mock/dossier-preuve-signature.pdf",
};

export const demoDossier = {
  id: DEMO_DOSSIER_ID,
  title: "Extension maison individuelle et modification de facade",
  dossierNumber: "PCMI-DEMO-2026-0001",
  typeProcedure: "PCMI",
  documentType: "permis_de_construire",
  status: "submitted" as DossierStatus,
  instructionStatus: "submitted",
  timelineStep: "instruction",
  commune: "Commune Demo",
  address: "12 rue des Tilleuls, 37000 Commune Demo",
  parcelRef: "AB 123",
  zoneCode: "UB",
  zoneLabel: "Zone urbaine pavillonnaire",
  userName: "Jean Martin",
  createdAt: "2026-05-05T09:10:00.000Z",
  updatedAt: "2026-05-05T15:45:00.000Z",
  dateDepot: "2026-05-05T09:10:00.000Z",
  dateCompletude: "2026-05-05T09:25:00.000Z",
  dateLimiteInstruction: "2026-08-05T21:59:59.000Z",
  isAbfConcerned: true,
  anomalyCount: 0,
  documentCount: demoUploadedDocuments.length,
  assignedMetropoleId: "demo-metropole",
  documents: demoUploadedDocuments,
  metadata: {
    summary: "Dossier PCMI complet pour extension de maison individuelle de 28 m2, situe en zone UB et aux abords d'un monument historique.",
    normalizedAddress: "12 rue des Tilleuls, 37000 Commune Demo",
    parcelAnalysis: {
      parcelRef: "AB 123",
      section: "AB",
      number: "123",
      commune: "Commune Demo",
      zoneCode: "UB",
      zoningLabel: "Zone urbaine pavillonnaire",
      constraints: ["Abords monument historique", "Consultation ABF"],
      geoConstraints: ["Abords monument historique"],
    },
    locationContext: demoLocationContext,
    projectFlags: demoProjectContext.projectFlags,
    pluAnalysis: demoPluAnalysis,
    consultations: demoConsultations,
    decisionDraft: demoDecision,
    generatedDecision: demoDecision,
    signatureSignatory: {
      id: demoSeedUsers.signatory.id,
      fullName: demoSeedUsers.signatory.name,
      role: "Maire de Commune Demo",
      email: demoSeedUsers.signatory.email,
      authorityDelegationReference: "Maire signataire direct",
    },
    signature: {
      signerName: demoSeedUsers.signatory.name,
      signerTitle: "Maire de Commune Demo",
      signerEmail: demoSeedUsers.signatory.email,
      delegationReference: "Maire signataire direct",
    },
    financialAnalysis: {
      prix_m2_moyen: 3150,
      valeur_projet: 84000,
    },
  },
};

export function getDemoDossierForStatus(status?: DossierStatus | "signature_pending") {
  return {
    ...demoDossier,
    status: status || demoDossier.status,
    metadata: {
      ...demoDossier.metadata,
      demoStatusLabel: status || demoDossier.status,
    },
  };
}

export function getDemoCitizenPortalContext() {
  return {
    commune: "Commune Demo",
    townHallName: "Mairie de Commune Demo",
    addressLine1: "1 place de la Mairie",
    addressLine2: null,
    postalCode: "37000",
    city: "Commune Demo",
    phone: "02 47 00 00 00",
    email: "urbanisme@mairie-demo.fr",
    hours: "Accueil urbanisme : lundi, mercredi et vendredi matin",
    source: "demo",
  };
}
