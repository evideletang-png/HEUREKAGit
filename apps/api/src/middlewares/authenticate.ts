import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { AuthorizationService } from "../services/authorizationService.js";

export interface AuthRequest extends Request {
  user?: { userId: string; email: string; role: string };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.["heureka_token"] || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }
  const allowed = await AuthorizationService.hasPermission(req.user.userId, "users.manage");
  if (!allowed) {
    res.status(403).json({ error: "FORBIDDEN", message: "Accès administrateur requis." });
    return;
  }
  next();
}

export async function requireMairie(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }
  const allowed = await AuthorizationService.hasPermission(req.user.userId, "dossier.instruct")
    || await AuthorizationService.hasPermission(req.user.userId, "dossier.read");
  if (!allowed) {
    res.status(403).json({ error: "FORBIDDEN", message: "Accès réservé aux agents de mairie." });
    return;
  }
  next();
}
