import type { NextFunction, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, dossiersTable, permissionProfilesTable, userAssignmentsTable, usersTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/authenticate.js";

export const STANDARD_PERMISSIONS = [
  "dossier.read",
  "dossier.write",
  "dossier.instruct",
  "dossier.assign",
  "dossier.request_pieces",
  "dossier.generate_decision",
  "dossier.consult_services",
  "message.read",
  "message.write",
  "plu.read",
  "plu.write",
  "fiscalite.read",
  "fiscalite.write",
  "settings.read",
  "settings.write",
  "users.manage",
  "demo.access",
] as const;

export type StandardPermission = typeof STANDARD_PERMISSIONS[number];
export type ActorType = "extra_super_admin" | "collectivite" | "metropole" | "abf" | "sdis";
export type RoleKey = "super_admin" | "admin" | "instructeur" | "consultation";
export type ScopeType = "global" | "commune" | "epci" | "service";

export type AuthorizationScope = {
  type?: ScopeType;
  id?: string | null;
  dossierId?: string | null;
  communeId?: string | null;
};

export type UserAssignmentView = {
  id?: string;
  userId: string;
  actorType: ActorType;
  roleKey: RoleKey;
  profileKey?: string | null;
  scopeType: ScopeType;
  scopeId: string | null;
  permissions: string[];
  overridePermissions?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  source?: "db" | "fallback";
};

export type PermissionProfileView = {
  id?: string;
  key: string;
  label: string;
  description: string | null;
  actorType: ActorType;
  roleKey: RoleKey;
  permissions: string[];
  source?: "system" | "db";
};

const ALL_PERMISSIONS = [...STANDARD_PERMISSIONS];
const READ_ONLY_PERMISSIONS = ["dossier.read", "message.read", "plu.read", "settings.read"];
const SERVICE_OPINION_PERMISSIONS = ["dossier.read", "dossier.instruct", "message.read", "message.write", "plu.read"];
const INSTRUCTEUR_PERMISSIONS = [
  "dossier.read",
  "dossier.write",
  "dossier.instruct",
  "dossier.request_pieces",
  "dossier.generate_decision",
  "dossier.consult_services",
  "message.read",
  "message.write",
  "plu.read",
  "fiscalite.read",
  "settings.read",
];
const ADMIN_COLLECTIVITE_PERMISSIONS = [
  ...INSTRUCTEUR_PERMISSIONS,
  "dossier.assign",
  "plu.write",
  "fiscalite.write",
  "settings.write",
];
const SUPER_ADMIN_COLLECTIVITE_PERMISSIONS = [...ADMIN_COLLECTIVITE_PERMISSIONS, "users.manage"];

export const SYSTEM_PERMISSION_PROFILES: PermissionProfileView[] = [
  {
    key: "extra_super_admin",
    label: "Extra Super Admin",
    description: "Accès global à la plateforme et à tous les paramétrages.",
    actorType: "extra_super_admin",
    roleKey: "super_admin",
    permissions: ALL_PERMISSIONS,
    source: "system",
  },
  {
    key: "super_admin_collectivite",
    label: "Super Admin Collectivité",
    description: "Gestion des utilisateurs, paramètres et dossiers de la collectivité.",
    actorType: "collectivite",
    roleKey: "super_admin",
    permissions: SUPER_ADMIN_COLLECTIVITE_PERMISSIONS,
    source: "system",
  },
  {
    key: "admin_collectivite",
    label: "Admin Collectivité",
    description: "Gestion des dossiers, affectations et réglages métier de sa commune.",
    actorType: "collectivite",
    roleKey: "admin",
    permissions: ADMIN_COLLECTIVITE_PERMISSIONS,
    source: "system",
  },
  {
    key: "instructeur",
    label: "Instructeur",
    description: "Instruction des dossiers autorisés sur son périmètre.",
    actorType: "collectivite",
    roleKey: "instructeur",
    permissions: INSTRUCTEUR_PERMISSIONS,
    source: "system",
  },
  {
    key: "consultation",
    label: "Consultation",
    description: "Lecture seule des dossiers et éléments de contexte.",
    actorType: "collectivite",
    roleKey: "consultation",
    permissions: READ_ONLY_PERMISSIONS,
    source: "system",
  },
  {
    key: "metropole_instructeur",
    label: "Métropole instructeur",
    description: "Instruction uniquement sur les communes explicitement autorisées.",
    actorType: "metropole",
    roleKey: "instructeur",
    permissions: INSTRUCTEUR_PERMISSIONS,
    source: "system",
  },
  {
    key: "service_consulte",
    label: "Service consulté",
    description: "Avis de service extérieur sur les dossiers consultés ou communes autorisées.",
    actorType: "abf",
    roleKey: "consultation",
    permissions: SERVICE_OPINION_PERMISSIONS,
    source: "system",
  },
];

function normalize(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function parseCommunes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return unique(parsed.map(String));
    if (typeof parsed === "string") return unique([parsed]);
  } catch {
    return unique(raw.split(","));
  }
  return [];
}

function assignmentFromLegacyUser(user: typeof usersTable.$inferSelect): UserAssignmentView[] {
  const communes = parseCommunes(user.communes);
  const makeScoped = (actorType: ActorType, roleKey: RoleKey, permissions: string[]) => {
    if (communes.length === 0) {
      return [{
        userId: user.id,
        actorType,
        roleKey,
        profileKey: `${actorType}_${roleKey}`,
        scopeType: "global" as const,
        scopeId: null,
        permissions,
        source: "fallback" as const,
      }];
    }
    return communes.map((commune) => ({
      userId: user.id,
      actorType,
      roleKey,
      profileKey: `${actorType}_${roleKey}`,
      scopeType: "commune" as const,
      scopeId: commune,
      permissions,
      source: "fallback" as const,
    }));
  };

  if (user.role === "super_admin") {
    return [{
      userId: user.id,
      actorType: "extra_super_admin",
      roleKey: "super_admin",
      profileKey: "extra_super_admin",
      scopeType: "global",
      scopeId: null,
      permissions: ALL_PERMISSIONS,
      source: "fallback",
    }];
  }

  if (user.role === "admin") {
    return [{
      userId: user.id,
      actorType: "collectivite",
      roleKey: "super_admin",
      profileKey: "super_admin_collectivite",
      scopeType: "global",
      scopeId: null,
      permissions: ALL_PERMISSIONS,
      source: "fallback",
    }];
  }

  if (user.role === "mairie") return makeScoped("collectivite", "instructeur", INSTRUCTEUR_PERMISSIONS);
  if (user.role === "metropole") return makeScoped("metropole", "instructeur", INSTRUCTEUR_PERMISSIONS);
  if (user.role === "abf") return makeScoped("abf", "consultation", SERVICE_OPINION_PERMISSIONS);
  return [];
}

function hasGlobalAccess(assignments: UserAssignmentView[]) {
  return assignments.some((assignment) => assignment.actorType === "extra_super_admin" || assignment.scopeType === "global");
}

function assignmentHasPermission(assignment: UserAssignmentView, permission: string) {
  return assignment.permissions.includes(permission) || assignment.permissions.includes("*");
}

function matchesScope(assignment: UserAssignmentView, scope?: AuthorizationScope) {
  if (!scope || assignment.scopeType === "global") return true;
  const expectedType = scope.type || (scope.communeId ? "commune" : undefined);
  const expectedId = scope.id || scope.communeId || null;
  if (!expectedType || !expectedId) return true;
  return assignment.scopeType === expectedType && normalize(assignment.scopeId) === normalize(expectedId);
}

export class AuthorizationService {
  static standardPermissions = STANDARD_PERMISSIONS;

  static async getPermissionProfiles(): Promise<PermissionProfileView[]> {
    const rows = await db.select().from(permissionProfilesTable).orderBy(permissionProfilesTable.label);
    const custom = rows.map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      description: row.description,
      actorType: row.actorType as ActorType,
      roleKey: row.roleKey as RoleKey,
      permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
      source: "db" as const,
    }));
    const customKeys = new Set(custom.map((profile) => profile.key));
    return [...SYSTEM_PERMISSION_PROFILES.filter((profile) => !customKeys.has(profile.key)), ...custom];
  }

  static async getPermissionProfile(key: string | null | undefined) {
    if (!key) return null;
    const profiles = await AuthorizationService.getPermissionProfiles();
    return profiles.find((profile) => profile.key === key) || null;
  }

  static async getUserAssignments(userId: string): Promise<UserAssignmentView[]> {
    const rows = await db.select().from(userAssignmentsTable).where(eq(userAssignmentsTable.userId, userId));
    if (rows.length > 0) {
      const profiles = await AuthorizationService.getPermissionProfiles();
      return rows.map((row) => {
        const overridePermissions = Array.isArray(row.permissions) ? row.permissions.map(String) : [];
        const profile = profiles.find((item) => item.key === row.profileKey)
          || profiles.find((item) => item.actorType === row.actorType && item.roleKey === row.roleKey);
        return {
          id: row.id,
          userId: row.userId,
          actorType: row.actorType as ActorType,
          roleKey: row.roleKey as RoleKey,
          profileKey: row.profileKey,
          scopeType: row.scopeType as ScopeType,
          scopeId: row.scopeId,
          permissions: unique([...(profile?.permissions || []), ...overridePermissions]),
          overridePermissions,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          source: "db",
        };
      });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    return user ? assignmentFromLegacyUser(user) : [];
  }

  static async getAuthorizationSummary(userId: string) {
    const assignments = await AuthorizationService.getUserAssignments(userId);
    return {
      assignments,
      permissions: unique(assignments.flatMap((assignment) => assignment.permissions)),
      authorizedCommunes: unique(
        assignments
          .filter((assignment) => assignment.scopeType === "commune")
          .map((assignment) => assignment.scopeId),
      ),
      hasGlobalAccess: hasGlobalAccess(assignments),
    };
  }

  static async canAccessCommune(userId: string, communeId: string | null | undefined) {
    const assignments = await AuthorizationService.getUserAssignments(userId);
    if (!communeId) return hasGlobalAccess(assignments);
    if (hasGlobalAccess(assignments)) return true;
    return assignments.some((assignment) => (
      assignment.scopeType === "commune"
      && normalize(assignment.scopeId) === normalize(communeId)
      && (assignmentHasPermission(assignment, "dossier.read") || assignmentHasPermission(assignment, "settings.read") || assignmentHasPermission(assignment, "plu.read"))
    ));
  }

  static async canAccessDossier(userId: string, dossierId: string) {
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, dossierId as any)).limit(1);
    if (!dossier) return false;
    if (dossier.userId === userId) return true;
    if (dossier.assignedMetropoleId === userId || dossier.assignedAbfId === userId) return true;
    if (dossier.isAbfConcerned) {
      const assignments = await AuthorizationService.getUserAssignments(userId);
      if (assignments.some((assignment) => assignment.actorType === "abf" && assignmentHasPermission(assignment, "dossier.read"))) return true;
    }
    if (!dossier.commune) return AuthorizationService.hasPermission(userId, "dossier.read", { type: "global" });
    return AuthorizationService.hasPermission(userId, "dossier.read", { type: "commune", id: dossier.commune });
  }

  static async hasPermission(userId: string, permission: string, scope?: AuthorizationScope) {
    const assignments = await AuthorizationService.getUserAssignments(userId);
    if (scope?.dossierId && permission.startsWith("dossier.")) {
      const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, scope.dossierId as any)).limit(1);
      if (!dossier) return false;
      if (dossier.userId === userId && permission === "dossier.read") return true;
      if ((dossier.assignedMetropoleId === userId || dossier.assignedAbfId === userId) && assignments.some((assignment) => assignmentHasPermission(assignment, permission))) return true;
      if (dossier.isAbfConcerned && assignments.some((assignment) => assignment.actorType === "abf" && assignmentHasPermission(assignment, permission))) return true;
      scope = dossier.commune ? { type: "commune", id: dossier.commune } : { type: "global" };
    }
    return assignments.some((assignment) => assignmentHasPermission(assignment, permission) && matchesScope(assignment, scope));
  }

  static requirePermission(permission: string) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
        return;
      }
      const scope: AuthorizationScope = {};
      if (typeof req.params.id === "string" && req.baseUrl.includes("dossiers")) scope.dossierId = req.params.id;
      if (typeof req.query.commune === "string") {
        scope.type = "commune";
        scope.id = req.query.commune;
      }
      const allowed = await AuthorizationService.hasPermission(req.user.userId, permission, scope);
      if (!allowed) {
        res.status(403).json({ error: "FORBIDDEN", message: "Droit insuffisant pour cette action." });
        return;
      }
      next();
    };
  }

  static async createAssignment(input: {
    userId: string;
    actorType: ActorType;
    roleKey: RoleKey;
    profileKey?: string | null;
    scopeType: ScopeType;
    scopeId?: string | null;
    permissions: string[];
  }) {
    const permissions = input.permissions.filter((permission) => STANDARD_PERMISSIONS.includes(permission as StandardPermission));
    const [assignment] = await db.insert(userAssignmentsTable).values({
      userId: input.userId,
      actorType: input.actorType,
      roleKey: input.roleKey,
      profileKey: input.profileKey || null,
      scopeType: input.scopeType,
      scopeId: input.scopeType === "global" ? null : input.scopeId || null,
      permissions,
      updatedAt: new Date(),
    }).returning();
    return assignment;
  }

  static async createPermissionProfile(input: {
    key: string;
    label: string;
    description?: string | null;
    actorType: ActorType;
    roleKey: RoleKey;
    permissions: string[];
  }) {
    const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    const permissions = input.permissions.filter((permission) => STANDARD_PERMISSIONS.includes(permission as StandardPermission));
    const [profile] = await db.insert(permissionProfilesTable).values({
      key,
      label: input.label.trim(),
      description: input.description?.trim() || null,
      actorType: input.actorType,
      roleKey: input.roleKey,
      permissions,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: permissionProfilesTable.key,
      set: {
        label: input.label.trim(),
        description: input.description?.trim() || null,
        actorType: input.actorType,
        roleKey: input.roleKey,
        permissions,
        updatedAt: new Date(),
      },
    }).returning();
    return profile;
  }

  static async deleteAssignment(userId: string, assignmentId: string) {
    const [deleted] = await db.delete(userAssignmentsTable)
      .where(and(eq(userAssignmentsTable.id, assignmentId), eq(userAssignmentsTable.userId, userId)))
      .returning();
    return deleted || null;
  }
}

export const getUserAssignments = AuthorizationService.getUserAssignments;
export const canAccessCommune = AuthorizationService.canAccessCommune;
export const canAccessDossier = AuthorizationService.canAccessDossier;
export const hasPermission = AuthorizationService.hasPermission;
export const requirePermission = AuthorizationService.requirePermission;
