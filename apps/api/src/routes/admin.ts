import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { analysesTable, usersTable, aiPromptsTable, communesTable, municipalityLearningsTable, globalConfigsTable } from "@workspace/db";
import { desc, count, eq, ilike, or, and, sql } from "drizzle-orm";
import { authenticate, requireAdmin, type AuthRequest } from "../middlewares/authenticate.js";
import { DEFAULT_PROMPTS } from "../services/promptLoader.js";
import { townHallDocumentsTable } from "@workspace/db";
import { AdminStatsService } from "../services/adminStatsService.js";
import { logger } from "../utils/logger.js";

function parseCommunes(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

const router: IRouter = Router();

router.use(authenticate, requireAdmin);

router.get("/analyses", async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string || "1");
    const limit = parseInt(req.query.limit as string || "50");
    const status = req.query.status as string;
    const city = req.query.city as string;
    const search = req.query.search as string;
    const offset = (page - 1) * limit;

    let whereClause: any = undefined;
    const { and, eq, or, ilike } = await import("drizzle-orm");
    
    const conditions = [];
    if (status) conditions.push(eq(analysesTable.status, status as any));
    if (city) conditions.push(eq(analysesTable.city, city));
    if (search) {
      conditions.push(or(
        ilike(analysesTable.address, `%${search}%`),
        ilike(analysesTable.id, `%${search}%`)
      ));
    }
    
    if (conditions.length > 0) {
      whereClause = and(...conditions);
    }

    const items = await db.select().from(analysesTable)
      .where(whereClause)
      .orderBy(desc(analysesTable.createdAt))
      .limit(limit).offset(offset);

    const [{ total }] = await db.select({ total: count() }).from(analysesTable).where(whereClause);

    return res.json({ analyses: items, total: Number(total), page, limit });
  } catch (err) {
    console.error("[admin/analyses]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.get("/users", async (req: AuthRequest, res) => {
  try {
    const communeFilter = req.query.commune as string;
    const searchFilter = req.query.search as string;

    const conditions = [];
    if (searchFilter) {
      conditions.push(or(
        ilike(usersTable.name, `%${searchFilter}%`),
        ilike(usersTable.email, `%${searchFilter}%`)
      ));
    }
    if (communeFilter) {
      // Postgres jsonb containment check: communes @> '["Tours"]'
      conditions.push(sql`${usersTable.communes}::jsonb @> ${JSON.stringify([communeFilter])}::jsonb`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const users = await db.select().from(usersTable).where(whereClause).orderBy(desc(usersTable.createdAt));

    const usersWithCounts = await Promise.all(users.map(async (u) => {
      const [{ analysisCount }] = await db.select({ analysisCount: count() }).from(analysesTable)
        .where(eq(analysesTable.userId, u.id));
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        communes: parseCommunes(u.communes),
        createdAt: u.createdAt,
        analysisCount: Number(analysisCount),
      };
    }));

    return res.json(usersWithCounts);
  } catch (err) {
    console.error("[admin/users]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.get("/communes", async (_req, res) => {
  try {
    const rows = await db.select().from(communesTable).orderBy(communesTable.name);
    return res.json(rows);
  } catch (err) {
    console.error("[admin/communes]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/communes", async (req: AuthRequest, res) => {
  try {
    const { name, zipCode, inseeCode, jurisdictionId } = req.body as { name?: string; zipCode?: string, inseeCode?: string, jurisdictionId?: string };
    if (!name || !inseeCode || !jurisdictionId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Nom, INSEE et Jurisdiction ID requis." });
    }

    const [row] = await db.insert(communesTable).values({
      name: name.trim(),
      zipCode: zipCode?.trim() || null,
      inseeCode: inseeCode.trim(),
      jurisdictionId: jurisdictionId.trim()
    }).returning();
    return res.status(201).json(row);
  } catch (err) {
    console.error("[admin/communes POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.delete("/communes/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as { id: string };
    await db.delete(communesTable).where(eq(communesTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error("[admin/communes DELETE]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/communes/legacy", async (_req, res) => {
  try {
    const docCommunes = await db.select({ commune: townHallDocumentsTable.commune }).from(townHallDocumentsTable);
    const analysisCommunes = await db.select({ commune: analysesTable.city }).from(analysesTable);
    const all = new Set<string>();
    docCommunes.forEach(d => { if (d.commune) all.add(d.commune); });
    analysisCommunes.forEach(a => { if (a.commune) all.add(a.commune); });
    return res.json(Array.from(all).sort());
  } catch (err) {
    console.error("[admin/communes/legacy]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

const VALID_ROLES = ["user", "admin", "mairie", "metropole", "abf"] as const;
type ValidRole = typeof VALID_ROLES[number];

router.patch("/users/:id/role", async (req: AuthRequest, res) => {
  try {
    const { role } = req.body as { role?: string };
    if (!role || !(VALID_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Rôle invalide." });
      return;
    }
    const { id } = req.params as { id: string };
    await db.update(usersTable).set({ role: role as ValidRole, updatedAt: new Date() }).where(eq(usersTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error("[admin/users/:id/role]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── FULL USER UPDATE ────────────────────────────────────────────────────────

router.patch("/users/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as { id: string };
    const { email, name, role, password, communes } = req.body as {
      email?: string; name?: string; role?: string; password?: string; communes?: string[];
    };

    const existing = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!existing.length) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Utilisateur introuvable." });
      return;
    }

    const updates: any = { updatedAt: new Date() };

    if (name) updates.name = name.trim();
    if (role && (VALID_ROLES as readonly string[]).includes(role)) {
      updates.role = role as any;
    }
    if (Array.isArray(communes)) {
      updates.communes = JSON.stringify(communes.map(c => c.trim()).filter(c => c.length > 0));
    }

    if (email && email.toLowerCase() !== existing[0].email.toLowerCase()) {
      const { ne, and } = await import("drizzle-orm");
      const duplicate = await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.email, email.toLowerCase()), ne(usersTable.id, id))).limit(1);
      if (duplicate.length) {
    return res.status(409).json({ error: "CONFLICT", message: "Cet email est déjà utilisé par un autre compte." });
        return;
      }
      updates.email = email.toLowerCase();
    }

    if (password && password.length >= 8) {
      const { hashPassword } = await import("../lib/auth.js");
      updates.passwordHash = await hashPassword(password);
    } else if (password && password.length > 0) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Le mot de passe doit faire au moins 8 caractères." });
      return;
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.id, id));
    return res.json({ success: true, message: "Utilisateur mis à jour." });
  } catch (err) {
    console.error("[admin/users/:id PATCH]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// ─── CREATE USER ─────────────────────────────────────────────────────────────

router.post("/users", async (_req, res) => {
  try {
    const { email, password, name, role } = _req.body as {
      email?: string; password?: string; name?: string; role?: string;
    };

    if (!email || !password || !name) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Email, mot de passe et nom sont requis." });
      return;
    }
    if (password.length < 8) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Le mot de passe doit contenir au moins 8 caractères." });
      return;
    }

    const VALID_ROLES = ["user", "admin", "mairie", "metropole", "abf"] as const;
    const finalRole: typeof VALID_ROLES[number] = (VALID_ROLES as readonly string[]).includes(role ?? "") ? (role as typeof VALID_ROLES[number]) : "user";

    const existing = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length) {
    return res.status(409).json({ error: "CONFLICT", message: "Cet email est déjà utilisé." });
      return;
    }

    const { hashPassword } = await import("../lib/auth.js");
    const passwordHash = await hashPassword(password);

    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase(),
      passwordHash,
      name: name.trim(),
      role: finalRole,
    }).returning({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role, createdAt: usersTable.createdAt });

    return res.status(201).json({ user });
  } catch (err) {
    console.error("[admin/users POST]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

// ─── MAIRIE COMMUNES ─────────────────────────────────────────────────────────

router.get("/mairie/:userId/communes", async (req, res) => {
  try {
    const { userId } = req.params;
    const userIdStr = userId as string;
    const rows = await db.select({ communes: usersTable.communes, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, userIdStr)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    
    // Allowed for Mairie, Metropole, ABF
    const allowedRoles = ["mairie", "metropole", "abf"];
    if (!allowedRoles.includes(rows[0].role as string)) { 
    return res.status(400).json({ error: "BAD_REQUEST", message: "Cet utilisateur n'est pas un profil expert territorial." }); 
      return; 
    }
    return res.json({ communes: parseCommunes(rows[0].communes) });
  } catch (err) {
    console.error("[admin/mairie/:userId/communes]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.put("/mairie/:userId/communes", async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { communes } = req.body as { communes?: string[] };

    if (!Array.isArray(communes)) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "communes doit être un tableau de chaînes." });
      return;
    }
    const cleaned = communes.map(c => c.trim()).filter(c => c.length > 0);

    const userIdStr = userId as string;
    await db.update(usersTable)
      .set({ communes: JSON.stringify(cleaned), updatedAt: new Date() })
      .where(eq(usersTable.id, userIdStr));

    return res.json({ success: true, communes: cleaned });
  } catch (err) {
    console.error("[admin/mairie/:userId/communes PUT]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── AI PROMPTS ──────────────────────────────────────────────────────────────

router.get("/prompts", async (_req, res) => {
  try {
    const rows = await db.select().from(aiPromptsTable);
    const keySet = new Set(rows.map(r => r.key));
    const defaults = Object.entries(DEFAULT_PROMPTS)
      .filter(([k]) => !keySet.has(k))
      .map(([key, d]) => ({ key, label: d.label, description: d.description, content: d.content, updatedAt: null }));
    return res.json([...rows, ...defaults]);
  } catch (err) {
    console.error("[admin/prompts]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.put("/prompts/:key", async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;
    const { content } = req.body as { content?: string };
    if (!content || content.trim().length < 10) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Le contenu du prompt est trop court." });
      return;
    }
    const keyStr = key as string;
    if (!DEFAULT_PROMPTS[keyStr]) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Clé de prompt inconnue." });
      return;
    }
    const def = DEFAULT_PROMPTS[keyStr];
    await db.insert(aiPromptsTable).values({
      key: keyStr, label: def.label, description: def.description, content: content.trim(), updatedAt: new Date(),
    }).onConflictDoUpdate({ target: aiPromptsTable.key, set: { content: content.trim(), updatedAt: new Date() } });
    return res.json({ success: true, key: keyStr });
  } catch (err) {
    console.error("[admin/prompts/:key]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.delete("/prompts/:key", async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;
    await db.delete(aiPromptsTable).where(eq(aiPromptsTable.key, key as string));
    return res.json({ success: true, message: "Prompt réinitialisé aux valeurs par défaut." });
  } catch (err) {
    console.error("[admin/prompts/:key/reset]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─── CONTINUOUS AI IMPROVEMENT ───────────────────────────────────────────────

router.post("/learnings/override", async (req: AuthRequest, res) => {
  try {
    const { commune, category, originalRule, humanCorrection, reason } = req.body as {
      commune?: string;
      category?: string;
      originalRule?: string;
      humanCorrection?: string;
      reason?: string;
    };

    if (!commune || !category || !humanCorrection) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Commune, Catégorie et Correction sont requis." });
       return;
    }

    const newOverride = {
      category,
      originalRule: originalRule || "Non spécifié",
      humanCorrection,
      reason: reason || "Forcé par Super Admin",
      date: new Date().toISOString(),
      adminId: req.user!.userId
    };

    const existing = await db.select().from(municipalityLearningsTable).where(eq(municipalityLearningsTable.commune, commune)).limit(1);

    if (existing.length > 0) {
      // Append to JSONB array using sql
      await db.execute(sql`
        UPDATE ${municipalityLearningsTable} 
        SET overrides = COALESCE(overrides, '[]'::jsonb) || ${JSON.stringify([newOverride])}::jsonb,
            updated_at = NOW()
        WHERE commune = ${commune}
      `);
    } else {
      // Insert new row if commune has no learnings yet
      await db.insert(municipalityLearningsTable).values({
        commune,
        overrides: [newOverride]
      });
    }

    return res.json({ success: true, message: "Correction de l'IA enregistrée pour cette commune." });
  } catch (err) {
    console.error("[admin/learnings/override]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur lors de l'enregistrement de l'override." });
  }
});

// ─── ADMIN STATISTICS ────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const stats = await AdminStatsService.getDashboardStats();
    return res.json(stats);
  } catch (err) {
    console.error("[admin/stats]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur lors du calcul des statistiques." });
  }
});

// ─── DYNAMIC FINANCE ENGINE (Module 12) ──────────────────────────────────────

router.get("/formulas", async (_req, res) => {
  try {
    const { DEFAULT_FORMULAS } = await import("../services/financialAnalysis.js");
    let formulas = DEFAULT_FORMULAS;

    const [config] = await db.select().from(globalConfigsTable)
      .where(eq(globalConfigsTable.key, "finance_formulas")).limit(1);

    if (config && typeof config.value === 'object') {
      formulas = config.value as any;
    }

    return res.json(formulas);
  } catch (err) {
    console.error("[admin/formulas GET]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.put("/formulas", async (req: AuthRequest, res) => {
  try {
    const newFormulas = req.body;
    if (!newFormulas || typeof newFormulas !== 'object') {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Le payload doit être un objet clé-valeur de formules." });
    }

    // Basic syntax check with MathJS could go here, but omitted for simplicity
    
    await db.insert(globalConfigsTable).values({
      key: "finance_formulas",
      value: newFormulas,
      updatedAt: new Date()
    }).onConflictDoUpdate({
      target: globalConfigsTable.key,
      set: { value: newFormulas, updatedAt: new Date() }
    });

    return res.json({ success: true, formulas: newFormulas });
  } catch (err) {
    console.error("[admin/formulas PUT]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur lors de la sauvegarde." });
  }
});

console.log("[admin.ts] Router initialized");

router.use((req, res) => {
  console.log(`[admin.ts] Unmatched route: ${req.method} ${req.originalUrl}`);
    return res.status(404).json({ error: "NOT_FOUND", message: `Admin route not found: ${req.originalUrl}` });
});

import { queryRelevantChunks } from "../services/embeddingService.js";
import { JurisdictionContext, GLOBAL_POOL_ID } from "@workspace/ai-core";

// ... existing code ...

/**
 * INTERNAL RETRIEVAL DEBUG ENDPOINT
 * Allows auditing of ranking, jurisdiction scoping, and boundary enforcement.
 */
router.get("/debug/retrieval", async (req: AuthRequest, res) => {
  try {
    const { query, insee, zone, articleId, includeTrace = "true" } = req.query;

    if (!query || !insee) {
      return res.status(400).json({ error: "MISSING_PARAMS", message: "query and insee are required." });
    }

    logger.info(`[Admin/Debug] Auditing retrieval for ${insee} - Query: "${query}"`);

    // 1. Resolve Jurisdiction Context (Logic replicated from orchestrator or imported)
    const [communeRecord] = await db.select().from(communesTable).where(eq(communesTable.inseeCode, insee as string)).limit(1);
    
    const jurisdictionContext: JurisdictionContext = communeRecord ? {
      commune_insee: communeRecord.inseeCode,
      jurisdiction_id: communeRecord.jurisdictionId,
      name: communeRecord.name,
      plan_scope: "local",
      active_pool_ids: [
        `${communeRecord.inseeCode}-PLU-ACTIVE`,
        `${communeRecord.jurisdictionId}-PLUi-ACTIVE`,
        GLOBAL_POOL_ID
      ]
    } : {
      commune_insee: insee as string,
      jurisdiction_id: "GLOBAL",
      name: "Unknown",
      plan_scope: "national",
      active_pool_ids: [GLOBAL_POOL_ID]
    };

    // 2. Execute Scoped Search with Trace
    const results = await queryRelevantChunks(query as string, {
      municipalityId: insee as string,
      zoneCode: zone as string,
      articleId: articleId as string,
      jurisdictionContext,
      includeTrace: includeTrace === "true",
      limit: 10
    });

    // 3. Contamination Check Summary
    const crossCityLeaks = results.filter(r => {
       const meta = r.metadata as any;
       return meta.commune && meta.commune !== insee && meta.commune !== "NATIONAL";
    });

    return res.json({
      jurisdiction: jurisdictionContext,
      query_params: { query, insee, zone, articleId },
      diagnostics: {
        total_retrieved: results.length,
        contamination_detected: crossCityLeaks.length > 0,
        leaked_ids: crossCityLeaks.map(l => l.id),
        active_pools_searched: jurisdictionContext.active_pool_ids
      },
      results: results.map(r => ({
        id: r.id,
        score: (r as any).trace?.final_rank_score || 0,
        content_snippet: r.content.substring(0, 200) + "...",
        metadata: r.metadata,
        trace: (r as any).trace
      }))
    });

  } catch (err) {
    logger.error("[Admin/Debug/Retrieval] Error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: (err as Error).message });
  }
});

export default router;
