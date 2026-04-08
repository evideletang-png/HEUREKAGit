import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";

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

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
    res.status(403).json({ error: "FORBIDDEN", message: "Admin access required" });
    return;
  }
  next();
}

export function requireMairie(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== "mairie" && req.user?.role !== "admin" && req.user?.role !== "super_admin") {
    res.status(403).json({ error: "FORBIDDEN", message: "Accès réservé aux agents de mairie." });
    return;
  }
  next();
}
