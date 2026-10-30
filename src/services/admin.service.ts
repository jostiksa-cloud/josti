import { BROKER_REQUIRED_DOCS, MERCHANT_REQUIRED_DOCS } from "@josti/contracts";
import type { Sql } from "../db/sql";
import { AppError } from "../lib/errors";
import type { Actor } from "./access";
import { hasPermission, requirePermission } from "./access";

export async function activationGaps(sql: Sql, actor: Actor): Promise<string[]> {
  if (!actor.organizationId) return actor.role === "administrator" ? [] : ["organization"];
  const orgs = await sql.query<{
    phone: string | null;
    nationalAddress: string | null;
    iban: string | null;
    supportedPorts: string[];
    type: string;
  }>(
    `SELECT phone, national_address, iban, supported_ports, type FROM organizations WHERE id = $1`,
    [actor.organizationId],
  );
  const org = orgs[0];
  const gaps: string[] = [];
  if (!org?.phone) gaps.push("business_mobile");
  const docs = await sql.query<{ docType: string }>(
    `SELECT DISTINCT doc_type FROM documents
     WHERE organization_id = $1 AND status = 'approved' AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)`,
    [actor.organizationId],
  );
  const approved = new Set(docs.map((doc) => doc.docType));
  const required =
    org?.type === "merchant"
      ? MERCHANT_REQUIRED_DOCS
      : org?.type === "broker"
        ? BROKER_REQUIRED_DOCS
        : [];
  if (org?.type === "merchant" || org?.type === "broker") {
    if (!org.nationalAddress) gaps.push("national_address_field");
  }
  if (org?.type === "merchant" && !org.iban) gaps.push("iban");
  if (org?.type === "broker" && (!org.supportedPorts || org.supportedPorts.length === 0))
    gaps.push("supported_ports");
  for (const docType of required) {
    if (!approved.has(docType)) gaps.push(docType);
  }
  if (org?.type === "independent_carrier") {
    const driverDocs = await sql.query<{ docType: string }>(
      `SELECT DISTINCT doc_type FROM documents WHERE driver_id = $1 AND status = 'approved'`,
      [actor.driverId],
    );
    const have = new Set(driverDocs.map((doc) => doc.docType));
    for (const docType of ["driver_license", "residence_permit", "passport"]) {
      if (!have.has(docType)) gaps.push(docType);
    }
  }
  return gaps;
}

export async function setAccountStatus(
  sql: Sql,
  actor: Actor,
  userId: string,
  status: string,
  reason?: string,
) {
  if (actor.id === userId)
    throw new AppError(403, "FORBIDDEN", "You cannot change your own account status");
  const users = await sql.query<{
    id: string;
    role: string;
    status: string;
    organizationId: string | null;
  }>(`SELECT id, role, status, organization_id FROM accounts WHERE id = $1`, [userId]);
  const user = users[0];
  if (!user) throw new AppError(404, "NOT_FOUND", "Account not found");
  if (status === "active") {
    requirePermission(actor, "general");
    if (
      !["verified", "suspended", "needs_update"].includes(user.status) &&
      user.role !== "administrator"
    ) {
      throw new AppError(409, "INVALID_LIFECYCLE", "Activate an account only after it is verified");
    }
    if (user.role !== "administrator" && user.status !== "suspended") {
      const profile = await sql.query<{ driverId: string | null; organizationType: string | null }>(
        `SELECT d.id AS driver_id, o.type AS organization_type
         FROM accounts a
         LEFT JOIN drivers d ON d.user_id = a.id
         LEFT JOIN organizations o ON o.id = a.organization_id
         WHERE a.id = $1`,
        [userId],
      );
      const gaps = await activationGaps(sql, {
        id: userId,
        role: user.role,
        organizationId: user.organizationId,
        driverId: profile[0]?.driverId ?? null,
        email: "",
        phone: "",
        fullName: "",
        fullNameAr: null,
        locale: "ar",
        status: user.status,
        permissions: [],
        organizationType: profile[0]?.organizationType ?? null,
        organizationStatus: null,
      });
      if (gaps.length) {
        throw new AppError(
          422,
          "VERIFICATION_INCOMPLETE",
          "Required documents or profile fields are missing",
          gaps,
        );
      }
    }
  } else if (status === "verified" || status === "needs_update") {
    requirePermission(actor, "verification");
  } else if (status === "suspended" || status === "pending_verification") {
    requirePermission(actor, "verification");
  } else {
    throw new AppError(422, "INVALID_STATUS", "Unsupported account status");
  }
  await sql.query(`UPDATE accounts SET status = $2, suspended_reason = $3 WHERE id = $1`, [
    userId,
    status,
    status === "suspended" ? (reason ?? null) : null,
  ]);
  if (user.organizationId && user.role !== "driver") {
    await sql.query(`UPDATE organizations SET status = $2 WHERE id = $1`, [
      user.organizationId,
      status,
    ]);
  }
  if (status === "active" || status === "suspended" || status === "needs_update") {
    await sql.query(`UPDATE drivers SET status = $2 WHERE user_id = $1`, [userId, status]);
  }
  await sql.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'account.status','account',$2,$3::jsonb)`,
    [actor.id, userId, JSON.stringify({ status, reason: reason ?? null })],
  );
}

export async function setAdminPermissions(
  sql: Sql,
  actor: Actor,
  userId: string,
  permissions: string[],
) {
  requirePermission(actor, "general");
  if (actor.id === userId)
    throw new AppError(403, "FORBIDDEN", "You cannot change your own permissions");
  const users = await sql.query<{ role: string }>(`SELECT role FROM accounts WHERE id = $1`, [
    userId,
  ]);
  if (users[0]?.role !== "administrator")
    throw new AppError(422, "INVALID_ACCOUNT", "Permissions apply to administrators only");
  await sql.query(`UPDATE accounts SET admin_permissions = $2 WHERE id = $1`, [
    userId,
    permissions,
  ]);
  await sql.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'account.permissions','account',$2,$3::jsonb)`,
    [actor.id, userId, JSON.stringify({ permissions })],
  );
}

export function assertFinance(actor: Actor) {
  if (!hasPermission(actor, "finance"))
    throw new AppError(403, "FORBIDDEN", "Missing administrative permission");
}
