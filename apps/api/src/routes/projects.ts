import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  analysesTable,
  dossiersTable,
  projectTimelineEventsTable,
  projectsTable,
} from "@workspace/db/schema";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";

const router: IRouter = Router();

const DEFAULT_MODULES = [
  "parcel_analysis",
  "project_qualification",
  "project_ged",
  "administrative_dossier",
];

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeProject(row: any) {
  return {
    id: row.id,
    source: "project",
    name: row.name,
    description: row.description,
    address: row.address,
    parcelReferences: asArray(row.parcelReferences),
    coordinates: row.latitude && row.longitude ? { lat: row.latitude, lon: row.longitude } : null,
    commune: row.commune,
    status: row.status,
    projectType: row.projectType || "urbanisme",
    progress: row.progress || 0,
    detectedConstraints: asArray(row.detectedConstraints),
    mainPluZone: row.mainPluZone,
    usedModules: asArray(row.usedModules),
    alerts: asArray(row.alerts),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function analysisAsProject(analysis: any) {
  const alerts = analysis.status === "failed" ? ["Analyse parcellaire en échec"] : [];
  const usedModules = ["parcel_analysis"];
  if (analysis.status === "completed") usedModules.push("ai_summary");
  return {
    id: `analysis:${analysis.id}`,
    legacyId: analysis.id,
    source: "analysis",
    name: analysis.title || `Projet ${analysis.address}`,
    description: analysis.summary || null,
    address: analysis.address,
    parcelReferences: analysis.parcelRef ? [analysis.parcelRef] : [],
    coordinates: null,
    commune: analysis.city,
    status: analysis.status === "completed" ? "analysis_completed" : "analysis_in_progress",
    projectType: "urbanisme",
    progress: analysis.status === "completed" ? 45 : 20,
    detectedConstraints: [],
    mainPluZone: analysis.zoneCode,
    usedModules,
    alerts,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt,
    routes: { analysis: `/analyses/${analysis.id}` },
  };
}

function dossierAsProject(dossier: any) {
  const metadata = (dossier.metadata || {}) as Record<string, any>;
  const locationContext = metadata.locationContext || {};
  const constraints = Object.entries(locationContext)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  return {
    id: `dossier:${dossier.id}`,
    legacyId: dossier.id,
    source: "dossier",
    name: dossier.title || dossier.dossierNumber || "Projet dossier",
    description: metadata?.cerfaValues?.["works.description"] || null,
    address: dossier.address,
    parcelReferences: locationContext.parcel ? [locationContext.parcel] : [],
    coordinates: metadata?.address?.lat && metadata?.address?.lon ? { lat: metadata.address.lat, lon: metadata.address.lon } : null,
    commune: dossier.commune,
    status: String(dossier.status || "draft").toLowerCase(),
    projectType: dossier.typeProcedure,
    progress: dossier.status === "EN_INSTRUCTION" || dossier.status === "SUBMITTED" ? 70 : 55,
    detectedConstraints: constraints,
    mainPluZone: locationContext.pluZone || metadata?.parcelAnalysis?.zoneCode || null,
    usedModules: ["project_qualification", "administrative_dossier"],
    alerts: dossier.status === "INCOMPLET" ? ["Pièces complémentaires ou corrections attendues"] : [],
    createdAt: dossier.createdAt,
    updatedAt: dossier.updatedAt,
    routes: { dossier: `/citoyen/dossier/${dossier.id}` },
  };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const userId = req.user.userId;

  const [projects, analyses, dossiers] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.userId, userId)).orderBy(desc(projectsTable.updatedAt)).limit(100),
    db.select().from(analysesTable).where(eq(analysesTable.userId, userId)).orderBy(desc(analysesTable.updatedAt)).limit(100),
    db.select().from(dossiersTable).where(eq(dossiersTable.userId, userId)).orderBy(desc(dossiersTable.updatedAt)).limit(100),
  ]);

  const items = [
    ...projects.map(normalizeProject),
    ...analyses.map(analysisAsProject),
    ...dossiers.map(dossierAsProject),
  ].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  return res.json({ projects: items });
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const body = req.body || {};
  const name = String(body.name || "").trim();
  if (!name) return res.status(400).json({ error: "PROJECT_NAME_REQUIRED", message: "Le nom du projet est obligatoire." });

  const [project] = await db.insert(projectsTable).values({
    userId: req.user.userId,
    name,
    description: body.description || null,
    address: body.address || null,
    commune: body.commune || null,
    parcelReferences: Array.isArray(body.parcelReferences) ? body.parcelReferences : [],
    latitude: typeof body.latitude === "number" ? body.latitude : null,
    longitude: typeof body.longitude === "number" ? body.longitude : null,
    projectType: body.projectType || "urbanisme",
    status: "draft",
    progress: 5,
    usedModules: [],
    alerts: [],
    detectedConstraints: [],
    mainPluZone: body.mainPluZone || null,
    metadata: body.metadata || {},
  }).returning();

  await db.insert(projectTimelineEventsTable).values({
    projectId: project.id,
    type: "project_created",
    title: "Projet créé",
    description: "Création de l'espace projet urbanistique.",
    actorId: req.user.userId,
  });

  return res.status(201).json({ project: normalizeProject(project) });
});

router.get("/:id/modules", authenticate, async (_req: AuthRequest, res) => {
  return res.json({
    modules: DEFAULT_MODULES,
    registry: [
      "parcel_analysis",
      "project_qualification",
      "assisted_site_plan",
      "section_plan",
      "landscape_insertion",
      "project_ged",
      "administrative_dossier",
      "appeals_and_modifications",
    ],
  });
});

router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  const id = String(req.params.id || "");
  const userId = req.user.userId;

  if (id.startsWith("analysis:")) {
    const analysisId = id.slice("analysis:".length);
    const [analysis] = await db.select().from(analysesTable)
      .where(and(eq(analysesTable.id, analysisId), eq(analysesTable.userId, userId)))
      .limit(1);
    if (!analysis) return res.status(404).json({ error: "PROJECT_NOT_FOUND" });
    return res.json({ project: analysisAsProject(analysis), timeline: [] });
  }

  if (id.startsWith("dossier:")) {
    const dossierId = id.slice("dossier:".length);
    const [dossier] = await db.select().from(dossiersTable)
      .where(and(eq(dossiersTable.id, dossierId as any), eq(dossiersTable.userId, userId)))
      .limit(1);
    if (!dossier) return res.status(404).json({ error: "PROJECT_NOT_FOUND" });
    return res.json({ project: dossierAsProject(dossier), timeline: [] });
  }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, id as any), eq(projectsTable.userId, userId)))
    .limit(1);
  if (!project) return res.status(404).json({ error: "PROJECT_NOT_FOUND" });

  const timeline = await db.select().from(projectTimelineEventsTable)
    .where(eq(projectTimelineEventsTable.projectId, project.id))
    .orderBy(desc(projectTimelineEventsTable.createdAt))
    .limit(50);

  return res.json({ project: normalizeProject(project), timeline });
});
export default router;
