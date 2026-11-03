import type { Context, Next } from "hono";
import type { AppConfig } from "./config";
import type { Sql } from "./db/sql";
import { AppError } from "./lib/errors";
import { verifyAccessToken } from "./lib/jwt";
import type { Actor } from "./services/access";
import { loadAccount } from "./services/auth.service";

export type AppEnv = {
  Variables: {
    sql: Sql;
    config: AppConfig;
    actor: Actor | null;
    sessionId: string | null;
    requestId: string;
  };
};

const buckets = new Map<string, { count: number; reset: number }>();

export function clientIp(c: Context<AppEnv>, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return c.req.header("x-real-ip") ?? "local";
}

export function rateLimit(limit: number, windowMs: number) {
  return async (c: Context<AppEnv>, next: Next) => {
    if (c.get("config").env === "test") {
      await next();
      return;
    }
    if (buckets.size > 5000) buckets.clear();
    const key = `${limit}:${clientIp(c, c.get("config").trustProxy)}:${c.req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.reset < now) buckets.set(key, { count: 1, reset: now + windowMs });
    else if (bucket.count >= limit)
      throw new AppError(429, "RATE_LIMITED", "Too many requests. Try again shortly.");
    else bucket.count += 1;
    await next();
  };
}

export function browserOriginAllowed(origin: string | undefined, config: AppConfig): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  if (config.env === "production") return false;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    const parts = host.split(".").map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    )
      return false;
    if (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168)) return true;
    return parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31;
  } catch {
    return false;
  }
}

export async function authenticate(c: Context<AppEnv>, token: string | undefined, bearer: boolean) {
  if (!token) {
    c.set("actor", null);
    c.set("sessionId", null);
    return;
  }
  let claims: { sub: string; sid: string };
  try {
    claims = await verifyAccessToken(token, c.get("config"));
  } catch {
    throw new AppError(401, "INVALID_TOKEN", "The access token is invalid or expired");
  }
  const sessions = await c
    .get("sql")
    .query<{ revokedAt: string | null; expiresAt: string }>(
      `SELECT revoked_at, expires_at FROM sessions WHERE id = $1 AND user_id = $2`,
      [claims.sid, claims.sub],
    );
  const session = sessions[0];
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new AppError(401, "SESSION_EXPIRED", "Sign in again");
  }
  const actor = await loadAccount(c.get("sql"), claims.sub);
  if (!actor) throw new AppError(401, "INVALID_TOKEN", "Account not found");
  if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (
      c.req.header("x-josti-client") !== "web" ||
      !browserOriginAllowed(origin, c.get("config"))
    ) {
      throw new AppError(403, "CSRF_REJECTED", "The browser request was rejected");
    }
  }
  c.set("actor", actor);
  c.set("sessionId", claims.sid);
}

export function requireActor(c: Context<AppEnv>): Actor {
  const actor = c.get("actor");
  if (!actor) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required");
  return actor;
}
