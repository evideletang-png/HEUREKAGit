import { useMemo } from "react";
import { buildConformityAnalysis, type ConformityAnalysisResult } from "@/lib/urbanisme/conformity/conformityAnalysisService";
import { normalizeOfficialDossierType } from "@/lib/urbanisme/cerfa/resolveOfficialPieces";
import type { DossierDetail } from "./useDossierData";
import type {
  OrientationLocationConstraint,
} from "@/modules/orientation/orientation.types";

function inferDocumentCode(document: NonNullable<DossierDetail["documents"]>[number]) {
  const raw = `${document.title || ""} ${document.fileName || ""} ${document.documentType || ""}`;
  return raw.match(/\b(PCMI|DPC|DPA|PC|PA|PD)\s*[-_ ]?\s*(\d+(?:-\d+)?)\b/i)?.[0]?.replace(/\s+/g, "").toUpperCase();
}

function flagFromConstraints(constraints: OrientationLocationConstraint[], pattern: RegExp) {
  return constraints.some((constraint) => pattern.test(`${constraint.type} ${constraint.label}`));
}

export function useDossierConformity(dossier: DossierDetail | null) {
  const conformityAnalysis = useMemo(() => {
    if (!dossier) return null;
    const parcelAnalysis = dossier.metadata?.parcelAnalysis || {};
    const orientationContext = dossier.metadata?.orientationContext as {
      locationConstraints?: OrientationLocationConstraint[];
    } | undefined;
    
    const orientationConstraints = Array.isArray(orientationContext?.locationConstraints)
      ? orientationContext.locationConstraints.filter((constraint) => constraint.detected)
      : [];

    const zone = dossier.metadata?.zoneCode
      || dossier.metadata?.zone_code
      || parcelAnalysis.zoneCode
      || dossier.metadata?.pluAnalysis?.zone?.code
      || dossier.metadata?.pluAnalysis?.zone
      || "Non renseignée";

    const parcelRef = dossier.parcelRef || 
      parcelAnalysis.parcelRef || 
      dossier.metadata?.parcel_ref || 
      dossier.metadata?.parcelRef || null;

    const surface = dossier.metadata?.surfacePlancher || 
      dossier.metadata?.surface_plancher || 
      dossier.metadata?.requested_surface_m2 || 120;

    const documents = dossier.documents?.length ? dossier.documents : [];
    const dossierType = normalizeOfficialDossierType(dossier.typeProcedure || dossier.title || dossier.dossierNumber || "DPC");

    const projectContext = {
      dossierType,
      projectFlags: {
        ...(dossier.metadata?.projectFlags || {}),
        modifiesFacadesOrRoof: Boolean(dossier.metadata?.projectFlags?.modifiesFacadesOrRoof || /façade|facade|toiture|menuiserie/i.test(`${dossier.title || ""} ${dossier.metadata?.description || ""}`)),
        visibleFromPublicSpace: Boolean(dossier.metadata?.projectFlags?.visibleFromPublicSpace || flagFromConstraints(orientationConstraints, /abf|spr|monument/i)),
      },
      locationContext: {
        commune: dossier.commune || parcelAnalysis.commune,
        parcel: parcelRef || undefined,
        pluZone: zone === "Non renseignée" ? null : String(zone),
        abf: flagFromConstraints(orientationConstraints, /abf/i) || Boolean(parcelAnalysis.abf),
        spr: flagFromConstraints(orientationConstraints, /spr|site patrimonial/i) || Boolean(parcelAnalysis.spr),
        monumentHistoriqueAbords: flagFromConstraints(orientationConstraints, /abords|monument/i) || Boolean(parcelAnalysis.monumentHistoriqueAbords),
        natura2000: flagFromConstraints(orientationConstraints, /natura/i) || Boolean(parcelAnalysis.natura2000),
        pprRequiresStudy: flagFromConstraints(orientationConstraints, /ppri|pprn|pprt|inondation/i) || Boolean(parcelAnalysis.pprRequiresStudy || parcelAnalysis.ppri),
        sis: flagFromConstraints(orientationConstraints, /sis|sols/i) || Boolean(parcelAnalysis.sis),
        confidence: typeof parcelAnalysis.confidence === "number" ? parcelAnalysis.confidence : 0.72,
        unresolvedChecks: Array.isArray(parcelAnalysis.unresolvedChecks) ? parcelAnalysis.unresolvedChecks : [],
      },
    };

    return buildConformityAnalysis({
      projectContext,
      uploadedDocuments: documents.map((doc) => ({
        code: inferDocumentCode(doc),
        detectedCode: doc.documentType || undefined,
        filename: doc.fileName || doc.title || doc.documentType || "document",
        type: doc.documentType || doc.title || undefined,
        confidence: doc.status === "validated" ? 0.96 : 0.74,
      })),
      parcelAnalysis,
      orientationConstraints,
      projectFacts: {
        surface,
        height: dossier.metadata?.height || dossier.metadata?.hauteur,
        parking: dossier.metadata?.parking || dossier.metadata?.stationnement,
        destination: dossier.metadata?.destination || dossier.metadata?.projectDestination,
      },
    });
  }, [dossier]);

  return conformityAnalysis;
}