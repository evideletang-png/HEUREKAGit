import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.js";
import type { AuthRequest } from "../middlewares/authenticate.js";
import { authenticate } from "../middlewares/authenticate.js";

const router: IRouter = Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body as { email: string; password: string; name: string };

    if (!email || !password || !name) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Email, mot de passe et nom sont requis." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Le mot de passe doit contenir au moins 8 caractères." });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "CONFLICT", message: "Cet email est déjà utilisé." });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: "user",
    }).returning();

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.cookie("heureka_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, communes: user.communes, createdAt: user.createdAt },
      token,
    });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Email et mot de passe requis." });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.cookie("heureka_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, communes: user.communes, createdAt: user.createdAt },
      token,
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("heureka_token");
  res.json({ success: true, message: "Déconnexion réussie." });
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Utilisateur non trouvé." });
      return;
    }
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, communes: user.communes, createdAt: user.createdAt });
  } catch (err) {
    console.error("[auth/me]", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Erreur serveur." });
  }
});

export default router;
