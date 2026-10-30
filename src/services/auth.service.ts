import type { RegisterInput } from "@josti/contracts";
import type { AppConfig } from "../config";
import type { Sql } from "../db/sql";
import { hashPassword, joinCode, randomToken, sha256, verifyPassword } from "../lib/crypto";
import { AppError, isUniqueViolation } from "../lib/errors";
import { signAccessToken } from "../lib/jwt";
import { log } from "../logger";
import { type Actor, toActor } from "./access";
import { resolveRuntimeConfig } from "./integrations.service";

const PORTS = ["JED", "RAB", "YAN", "DMM"];

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  account: Actor;
};

function assertRoleOrganization(input: RegisterInput): void {
  const { role, organization } = input;
  if (role === "merchant" && organization.type !== "merchant") {
    throw new AppError(
      422,
      "ROLE_CONFLICT",
      "A merchant account must belong to a merchant organization",
    );
  }
  if (role === "customs_broker" && organization.type !== "broker") {
    throw new AppError(
      422,
      "ROLE_CONFLICT",
      "A customs broker account must belong to a broker organization",
    );
  }
  if (
    role === "carrier" &&
    organization.type === "carrier_company" &&
    organization.carrierKind !== "company"
  ) {
    throw new AppError(422, "ROLE_CONFLICT", "A carrier company requires carrier kind company");
  }
  if (
    role === "carrier" &&
    organization.type === "independent_carrier" &&
    organization.carrierKind !== "independent"
  ) {
    throw new AppError(
      422,
      "ROLE_CONFLICT",
      "An independent carrier requires carrier kind independent",
    );
  }
  if (
    role === "carrier" &&
    !["carrier_company", "independent_carrier"].includes(organization.type)
  ) {
    throw new AppError(
      422,
      "ROLE_CONFLICT",
      "Carrier accounts cannot use a merchant or broker organization",
    );
  }
  if (role === "driver" && !organization.existingOrganizationId) {
    throw new AppError(422, "ROLE_CONFLICT", "A driver must join an existing carrier company");
  }
  if (role === "merchant" || role === "customs_broker") {
    if (organization.carrierKind)
      throw new AppError(422, "ROLE_CONFLICT", "This account cannot also be a carrier");
  }
}

async function issueSession(
  sql: Sql,
  config: AppConfig,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshToken = randomToken();
  const refreshHash = await sha256(refreshToken);
  const expires = new Date(Date.now() + config.refreshTokenDays * 86_400_000).toISOString();
  const rows = await sql.query<{ id: string }>(
    `INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, refreshHash, expires, meta.userAgent ?? null, meta.ip ?? null],
  );
  const session = rows[0];
  if (!session) throw new AppError(500, "SESSION_FAILED", "Could not create a session");
  const accessToken = await signAccessToken({ sub: userId, sid: session.id }, config);
  return { accessToken, refreshToken };
}

export async function loadAccount(sql: Sql, userId: string): Promise<Actor | null> {
  const rows = await sql.query<Parameters<typeof toActor>[0]>(
    `SELECT a.*, d.id AS driver_id, o.type AS organization_type, o.status AS organization_status
     FROM accounts a
     LEFT JOIN drivers d ON d.user_id = a.id
     LEFT JOIN organizations o ON o.id = a.organization_id
     WHERE a.id = $1`,
    [userId],
  );
  return rows[0] ? toActor(rows[0]) : null;
}

export async function registerAccount(
  sql: Sql,
  config: AppConfig,
  input: RegisterInput,
  meta: { userAgent?: string; ip?: string },
): Promise<SessionTokens> {
  assertRoleOrganization(input);
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password, config.argonMemoryCost);
  const userId = await sql.begin(async (tx) => {
    let organizationId = input.organization.existingOrganizationId ?? null;
    if (input.role === "driver") {
      const orgs = await tx.query<{
        id: string;
        type: string;
        joinCode: string | null;
        status: string;
      }>(`SELECT id, type, join_code, status FROM organizations WHERE id = $1`, [organizationId]);
      const org = orgs[0];
      if (!org || org.type !== "carrier_company") {
        throw new AppError(422, "INVALID_ORGANIZATION", "Drivers can join a carrier company only");
      }
      if (!input.organization.joinCode || org.joinCode !== input.organization.joinCode) {
        throw new AppError(403, "INVALID_JOIN_CODE", "The carrier join code is not valid");
      }
      if (org.status === "suspended")
        throw new AppError(403, "ORGANIZATION_SUSPENDED", "This carrier is suspended");
    } else {
      const regions =
        input.organization.serviceRegions && input.organization.serviceRegions.length > 0
          ? input.organization.serviceRegions
          : input.role === "carrier"
            ? PORTS
            : [];
      const ports =
        input.organization.supportedPorts && input.organization.supportedPorts.length > 0
          ? input.organization.supportedPorts
          : input.role === "customs_broker"
            ? PORTS
            : [];
      const created = await tx.query<{ id: string }>(
        `INSERT INTO organizations
          (type, legal_name, legal_name_ar, commercial_registration, tax_id, national_address, iban, phone,
           supported_ports, service_regions, carrier_kind, join_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          input.organization.type,
          input.organization.legalName,
          input.organization.legalNameAr ?? null,
          input.organization.commercialRegistration ?? null,
          input.organization.taxId ?? null,
          input.organization.nationalAddress ?? null,
          input.organization.iban ?? null,
          input.phone,
          ports,
          regions,
          input.organization.carrierKind ?? null,
          input.organization.type === "carrier_company" ? joinCode() : null,
        ],
      );
      organizationId = created[0]?.id ?? null;
    }
    if (!organizationId) throw new AppError(500, "ORG_FAILED", "Could not create the organization");
    try {
      const accounts = await tx.query<{ id: string }>(
        `INSERT INTO accounts
          (email, phone, password_hash, full_name, full_name_ar, preferred_locale, role, status, organization_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_verification',$8)
         RETURNING id`,
        [
          email,
          input.phone,
          passwordHash,
          input.fullName,
          input.fullNameAr ?? null,
          input.locale ?? "ar",
          input.role,
          organizationId,
        ],
      );
      const id = accounts[0]?.id;
      if (!id) throw new AppError(500, "ACCOUNT_FAILED", "Could not create the account");
      if (input.role === "driver" || input.organization.type === "independent_carrier") {
        await tx.query(
          `INSERT INTO drivers (user_id, organization_id, license_number, license_expiry, status, availability)
           VALUES ($1,$2,$3,$4,'pending_verification','unavailable')`,
          [id, organizationId, null, null],
        );
      }
      return id;
    } catch (error) {
      if (isUniqueViolation(error))
        throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
      throw error;
    }
  });
  const tokens = await issueSession(sql, config, userId, meta);
  const account = await loadAccount(sql, userId);
  if (!account) throw new AppError(500, "ACCOUNT_FAILED", "Could not load the new account");
  return { ...tokens, account };
}

export async function loginAccount(
  sql: Sql,
  config: AppConfig,
  email: string,
  password: string,
  meta: { userAgent?: string; ip?: string },
): Promise<SessionTokens> {
  const rows = await sql.query<{ id: string; passwordHash: string }>(
    `SELECT id, password_hash FROM accounts WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect");
  }
  await sql.query(`UPDATE accounts SET last_login_at = now() WHERE id = $1`, [row.id]);
  const tokens = await issueSession(sql, config, row.id, meta);
  const account = await loadAccount(sql, row.id);
  if (!account)
    throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect");
  return { ...tokens, account };
}

export async function refreshSession(
  sql: Sql,
  config: AppConfig,
  refreshToken: string,
  meta: { userAgent?: string; ip?: string },
): Promise<SessionTokens> {
  const hash = await sha256(refreshToken);
  const rows = await sql.query<{
    id: string;
    userId: string;
    expiresAt: string;
    revokedAt: string | null;
  }>(`SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_token_hash = $1`, [
    hash,
  ]);
  const session = rows[0];
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new AppError(401, "SESSION_EXPIRED", "Sign in again");
  }
  await sql.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [session.id]);
  const tokens = await issueSession(sql, config, session.userId, meta);
  const account = await loadAccount(sql, session.userId);
  if (!account) throw new AppError(401, "SESSION_EXPIRED", "Sign in again");
  return { ...tokens, account };
}

export async function logoutSession(sql: Sql, sessionId: string): Promise<void> {
  await sql.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
  ]);
}

export async function requestPasswordReset(
  sql: Sql,
  config: AppConfig,
  email: string,
): Promise<{ devToken?: string }> {
  const rows = await sql.query<{ id: string }>(
    `SELECT id FROM accounts WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  const user = rows[0];
  if (!user) return {};
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await sql.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expires],
  );
  const live = await resolveRuntimeConfig(sql, config);
  if (live.smtp) {
    log("info", "password reset requested", {
      userId: user.id,
      delivery: "smtp_not_sent_in_process",
    });
  } else if (config.allowDevResetToken) {
    log("warn", "password reset token issued for development", { userId: user.id });
    return { devToken: token };
  } else {
    log("warn", "password reset stored but no SMTP provider is configured", { userId: user.id });
  }
  return {};
}

export async function resetPassword(
  sql: Sql,
  config: AppConfig,
  token: string,
  password: string,
): Promise<void> {
  const tokenHash = await sha256(token);
  const rows = await sql.query<{
    id: string;
    userId: string;
    expiresAt: string;
    usedAt: string | null;
  }>(`SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`, [
    tokenHash,
  ]);
  const row = rows[0];
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) {
    throw new AppError(400, "INVALID_RESET_TOKEN", "The reset token is invalid or expired");
  }
  const passwordHash = await hashPassword(password, config.argonMemoryCost);
  await sql.begin(async (tx) => {
    await tx.query(`UPDATE accounts SET password_hash = $2 WHERE id = $1`, [
      row.userId,
      passwordHash,
    ]);
    await tx.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
    await tx.query(
      `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [row.userId],
    );
  });
}

export async function publicAccount(sql: Sql, actor: Actor) {
  const org = actor.organizationId
    ? (
        await sql.query(
          `SELECT id, type, legal_name, legal_name_ar, commercial_registration, tax_id, national_address, iban, phone,
                  status, supported_ports, service_regions, carrier_kind, join_code, rating_avg, rating_count
           FROM organizations WHERE id = $1`,
          [actor.organizationId],
        )
      )[0]
    : null;
  const avatar = await sql.query<{ avatarStorageKey: string | null }>(
    `SELECT avatar_storage_key FROM accounts WHERE id = $1`,
    [actor.id],
  );
  const safeOrg = org
    ? {
        ...org,
        iban:
          actor.role === "merchant" || actor.role === "administrator"
            ? org.iban
            : maskIban(org.iban as string | null),
        joinCode:
          actor.role === "carrier" && org.carrierKind === "company" ? org.joinCode : undefined,
      }
    : null;
  return {
    id: actor.id,
    email: actor.email,
    phone: actor.phone,
    fullName: actor.fullName,
    fullNameAr: actor.fullNameAr,
    locale: actor.locale,
    role: actor.role,
    status: actor.status,
    permissions: actor.permissions,
    driverId: actor.driverId,
    organization: safeOrg,
    hasAvatar: Boolean(avatar[0]?.avatarStorageKey),
  };
}

export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  return `${"*".repeat(Math.max(0, iban.length - 4))}${iban.slice(-4)}`;
}
