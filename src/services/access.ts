import { AppError } from "../lib/errors";

export type Actor = {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  fullNameAr: string | null;
  locale: "ar" | "en";
  role: string;
  status: string;
  organizationId: string | null;
  permissions: string[];
  driverId: string | null;
  organizationType: string | null;
  organizationStatus: string | null;
};

type AccountRow = {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  fullNameAr: string | null;
  preferredLocale: "ar" | "en";
  role: string;
  status: string;
  organizationId: string | null;
  adminPermissions: string[] | null;
  driverId?: string | null;
  organizationType?: string | null;
  organizationStatus?: string | null;
};

export function toActor(row: AccountRow): Actor {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    fullName: row.fullName,
    fullNameAr: row.fullNameAr,
    locale: row.preferredLocale,
    role: row.role,
    status: row.status,
    organizationId: row.organizationId,
    permissions: row.adminPermissions ?? [],
    driverId: row.driverId ?? null,
    organizationType: row.organizationType ?? null,
    organizationStatus: row.organizationStatus ?? null,
  };
}

export function requireAuth(actor: Actor | null): Actor {
  if (!actor) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required");
  return actor;
}

export function assertNotSuspended(actor: Actor): void {
  if (actor.status === "suspended") {
    throw new AppError(403, "SUSPENDED", "This account is suspended");
  }
}

export function requireActive(actor: Actor): void {
  assertNotSuspended(actor);
  if (actor.status !== "active") {
    throw new AppError(
      403,
      "ACCOUNT_NOT_ACTIVE",
      "Only active accounts can perform this operation",
    );
  }
  if (
    actor.role !== "administrator" &&
    actor.organizationStatus &&
    actor.organizationStatus !== "active"
  ) {
    throw new AppError(403, "ORGANIZATION_NOT_ACTIVE", "The organization is not active");
  }
}

export function requireRoles(actor: Actor, roles: string[]): void {
  if (!roles.includes(actor.role)) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this operation");
  }
}

export function hasPermission(actor: Actor, permission: string): boolean {
  return (
    actor.role === "administrator" &&
    (actor.permissions.includes("general") || actor.permissions.includes(permission))
  );
}

export function requirePermission(actor: Actor, permission: string): void {
  requireRoles(actor, ["administrator"]);
  if (actor.status !== "active") {
    throw new AppError(
      403,
      "ACCOUNT_NOT_ACTIVE",
      "Only active administrators can perform this operation",
    );
  }
  if (!hasPermission(actor, permission)) {
    throw new AppError(403, "FORBIDDEN", "Missing administrative permission");
  }
}

export function sameOrg(actor: Actor, organizationId: string | null | undefined): boolean {
  return !!actor.organizationId && actor.organizationId === organizationId;
}
