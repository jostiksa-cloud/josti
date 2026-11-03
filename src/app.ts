import {
  accountActionSchema,
  adminPermissionsSchema,
  availabilityPatchSchema,
  brokerClearanceSchema,
  carrierRespondSchema,
  createRequestSchema,
  documentTypeSchema,
  driverCreateSchema,
  feePolicySchema,
  forgotPasswordSchema,
  incidentResolveSchema,
  incidentSchema,
  locationUpdateSchema,
  loginSchema,
  merchantBrokerLinkSchema,
  profilePatchSchema,
  pushTokenSchema,
  ratingSchema,
  registerSchema,
  releaseRequestSchema,
  resetPasswordSchema,
  reviewDocumentSchema,
  selectCarrierSchema,
  settlementSchema,
  tripTransitionSchema,
  updateRequestSchema,
  vehicleSchema,
} from "@josti/contracts";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { ZodType } from "zod/v3";
import type { AppConfig } from "./config";
import type { Sql } from "./db/sql";
import {
  type AppEnv,
  authenticate,
  browserOriginAllowed,
  clientIp,
  rateLimit,
  requireActor,
} from "./http";
import { AppError } from "./lib/errors";
import { log } from "./logger";
import { hasPermission, requirePermission } from "./services/access";
import { assertFinance, setAccountStatus, setAdminPermissions } from "./services/admin.service";
import {
  loadAccount,
  loginAccount,
  logoutSession,
  publicAccount,
  refreshSession,
  registerAccount,
  requestPasswordReset,
  resetPassword,
} from "./services/auth.service";
import {
  assignDriverVehicle,
  createDriverAccount,
  createVehicle,
  linkBroker,
  listBrokerLinks,
  listDrivers,
  listVehicles,
  rotateJoinCode,
  setAvailability,
  updateProfile,
} from "./services/directory.service";
import {
  canReadDocument,
  createDocument,
  listOwnDocuments,
  publicDocument,
  readAvatar,
  readObject,
  reviewDocument,
  saveAvatar,
} from "./services/documents.service";
import {
  createIntegration,
  deleteIntegration,
  integrationCreateSchema,
  integrationPatchSchema,
  listIntegrations,
  resolveRuntimeConfig,
  updateIntegration,
} from "./services/integrations.service";
import {
  brokerClearance,
  cancelRequest,
  createRequest,
  getRequest,
  getTrip,
  listAvailableRequests,
  listPublicMap,
  listRequests,
  listTrips,
  privateTracking,
  rateTrip,
  releaseRequest,
  reportIncident,
  respondToRequest,
  saveLoadingEvidence,
  selectCarrier,
  submitLocation,
  transitionTrip,
  updateRequest,
} from "./services/workflow.service";

async function readJson<T>(
  c: { req: { json: () => Promise<unknown> } },
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "The submitted data is invalid",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

function cookies(
  c: Parameters<typeof setCookie>[0],
  config: AppConfig,
  access: string,
  refresh: string,
) {
  const secure = config.env === "production";
  setCookie(c, "josti_access", access, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: config.accessTokenMinutes * 60,
  });
  setCookie(c, "josti_refresh", refresh, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/api/v1/auth",
    maxAge: config.refreshTokenDays * 86400,
  });
}

export function createApp(sql: Sql, config: AppConfig) {
  const app = new Hono<AppEnv>();
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    c.set("sql", sql);
    c.set("config", config);
    c.set("requestId", crypto.randomUUID());
    c.header("X-Request-Id", c.get("requestId"));
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > 12 * 1024 * 1024)
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "The upload exceeds the 10 MB limit");
    await next();
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (browserOriginAllowed(origin, config) ? origin : ""),
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization", "X-JOSTI-Client", "Idempotency-Key"],
    }),
  );
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        { error: { code: error.code, message: error.message, details: error.details ?? null } },
        error.status as 400,
      );
    }
    log("error", "unhandled error", { requestId: c.get("requestId"), err: error });
    return c.json({ error: { code: "INTERNAL", message: "An unexpected error occurred" } }, 500);
  });

  app.get("/health", (c) => c.json({ status: "ok", service: "josti-api" }));
  app.get("/ready", async (c) => {
    await sql.query("SELECT 1 AS ok");
    return c.json({ status: "ready", database: config.databaseMode, storage: config.storageMode });
  });

  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    const header = c.req.header("authorization");
    const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7) : undefined;
    const freshSession = [
      "/api/v1/auth/login",
      "/api/v1/auth/register",
      "/api/v1/auth/forgot-password",
      "/api/v1/auth/reset-password",
    ].includes(new URL(c.req.url).pathname);
    const token = bearer ?? (freshSession ? undefined : getCookie(c, "josti_access"));
    await authenticate(c, token, Boolean(bearer));
    await next();
  });
  api.use("*", rateLimit(300, 60_000));

  api.get("/health", (c) => c.json({ status: "ok", service: "josti-api" }));
  api.get("/ready", async (c) => {
    await sql.query("SELECT 1 AS ok");
    return c.json({ status: "ready" });
  });
  api.get("/public/ports", async (c) => {
    const ports = await sql.query(
      `SELECT code, name_en, name_ar, latitude, longitude FROM ports WHERE active = true ORDER BY code`,
    );
    const live = await resolveRuntimeConfig(sql, config);
    return c.json({
      data: ports,
      map: { tileUrl: live.mapTileUrl, attribution: live.mapAttribution },
    });
  });
  api.get("/public/catalog", async (c) => {
    const containers = await sql.query(`SELECT * FROM container_types ORDER BY code`);
    const trucks = await sql.query(`SELECT * FROM truck_types ORDER BY code`);
    const compatibility = await sql.query(`SELECT * FROM truck_container_compatibility`);
    return c.json({ data: { containers, trucks, compatibility } });
  });
  api.get("/public/brokers", async (c) => {
    const brokers = await sql.query(
      `SELECT id, legal_name, legal_name_ar, supported_ports FROM organizations WHERE type = 'broker' AND status = 'active' ORDER BY legal_name`,
    );
    return c.json({ data: brokers });
  });
  api.get("/public/map-style", async (c) => {
    const live = await resolveRuntimeConfig(sql, config);
    return c.json({ data: { tileUrl: live.mapTileUrl, attribution: live.mapAttribution } });
  });
  api.get("/public/map", async (c) => {
    const port = c.req.query("port");
    return c.json({ data: await listPublicMap(sql, port) });
  });

  api.post("/auth/register", rateLimit(10, 60_000), async (c) => {
    const input = await readJson(c, registerSchema);
    const session = await registerAccount(
      sql,
      config,
      { ...input, locale: input.locale ?? "ar" },
      { ip: clientIp(c, config.trustProxy), userAgent: c.req.header("user-agent") },
    );
    cookies(c, config, session.accessToken, session.refreshToken);
    return c.json({ data: session }, 201);
  });
  api.post("/auth/login", rateLimit(10, 60_000), async (c) => {
    const input = await readJson(c, loginSchema);
    const session = await loginAccount(sql, config, input.email, input.password, {
      ip: clientIp(c, config.trustProxy),
      userAgent: c.req.header("user-agent"),
    });
    cookies(c, config, session.accessToken, session.refreshToken);
    return c.json({ data: session });
  });
  api.post("/auth/refresh", rateLimit(30, 60_000), async (c) => {
    const body = await c.req.json().catch(() => ({}) as { refreshToken?: string });
    const token = body.refreshToken ?? getCookie(c, "josti_refresh");
    if (!token) throw new AppError(401, "SESSION_EXPIRED", "Sign in again");
    const session = await refreshSession(sql, config, token, {
      ip: clientIp(c, config.trustProxy),
      userAgent: c.req.header("user-agent"),
    });
    cookies(c, config, session.accessToken, session.refreshToken);
    return c.json({ data: session });
  });
  api.post("/auth/logout", async (c) => {
    const actor = c.get("actor");
    const sessionId = c.get("sessionId");
    if (actor && sessionId) await logoutSession(sql, sessionId);
    deleteCookie(c, "josti_access", { path: "/" });
    deleteCookie(c, "josti_refresh", { path: "/api/v1/auth" });
    return c.json({ data: { loggedOut: true } });
  });
  api.post("/auth/forgot-password", rateLimit(5, 60_000), async (c) => {
    const input = await readJson(c, forgotPasswordSchema);
    const started = Date.now();
    const result = await requestPasswordReset(sql, config, input.email);
    // Reduce timing enumeration between known and unknown emails.
    const elapsed = Date.now() - started;
    if (elapsed < 200) await Bun.sleep(200 - elapsed);
    return c.json({
      data: {
        message: "If the account exists, password recovery has been initiated.",
        ...(result.devToken ? { devToken: result.devToken } : {}),
      },
    });
  });
  api.post("/auth/reset-password", rateLimit(10, 60_000), async (c) => {
    const input = await readJson(c, resetPasswordSchema);
    await resetPassword(sql, config, input.token, input.password);
    return c.json({ data: { reset: true } });
  });
  api.get("/auth/me", async (c) => c.json({ data: await publicAccount(sql, requireActor(c)) }));
  api.patch("/me", async (c) => {
    const actor = requireActor(c);
    await updateProfile(sql, actor, await readJson(c, profilePatchSchema));
    const fresh = await loadAccount(sql, actor.id);
    return c.json({ data: await publicAccount(sql, fresh ?? actor) });
  });
  api.post("/me/avatar", async (c) => {
    const actor = requireActor(c);
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File))
      throw new AppError(422, "INVALID_FILE", "Choose a profile picture");
    await saveAvatar(
      sql,
      config,
      actor,
      file.name,
      file.type,
      new Uint8Array(await file.arrayBuffer()),
    );
    const fresh = await loadAccount(sql, actor.id);
    return c.json({ data: await publicAccount(sql, fresh ?? actor) });
  });
  api.get("/me/avatar", async (c) => {
    const image = await readAvatar(sql, config, requireActor(c));
    return new Response(image.bytes, {
      headers: { "Content-Type": image.mime, "Cache-Control": "private, no-store" },
    });
  });
  api.get("/brokers", async (c) => c.json({ data: await listBrokerLinks(sql, requireActor(c)) }));
  api.post("/brokers", async (c) => {
    const actor = requireActor(c);
    const input = await readJson(c, merchantBrokerLinkSchema);
    await linkBroker(sql, actor, input.brokerOrganizationId, input.isDefault ?? false);
    return c.json({ data: { linked: true } }, 201);
  });
  api.get("/vehicles", async (c) => c.json({ data: await listVehicles(sql, requireActor(c)) }));
  api.post("/vehicles", async (c) =>
    c.json(
      { data: await createVehicle(sql, requireActor(c), await readJson(c, vehicleSchema)) },
      201,
    ),
  );
  api.patch("/vehicles/:id/availability", async (c) => {
    const input = await readJson(c, availabilityPatchSchema);
    await setAvailability(sql, requireActor(c), "vehicle", c.req.param("id"), input.availability);
    return c.json({ data: { updated: true } });
  });
  api.get("/drivers", async (c) => c.json({ data: await listDrivers(sql, requireActor(c)) }));
  api.post("/drivers", async (c) => {
    const actor = requireActor(c);
    const input = await readJson(c, driverCreateSchema);
    return c.json(
      { data: await createDriverAccount(sql, actor, input, config.argonMemoryCost) },
      201,
    );
  });
  api.post("/assignments", async (c) => {
    const body = await readJson(c, carrierRespondSchema);
    await assignDriverVehicle(sql, requireActor(c), body.driverId, body.vehicleId);
    return c.json({ data: { assigned: true } });
  });
  api.post("/organization/join-code", async (c) =>
    c.json({ data: await rotateJoinCode(sql, requireActor(c)) }),
  );
  api.patch("/drivers/:id/availability", async (c) => {
    const input = await readJson(c, availabilityPatchSchema);
    await setAvailability(sql, requireActor(c), "driver", c.req.param("id"), input.availability);
    return c.json({ data: { updated: true } });
  });

  api.get("/documents", async (c) => {
    const docs = await listOwnDocuments(sql, requireActor(c));
    return c.json({ data: docs.map((doc) => publicDocument(doc)) });
  });
  api.post("/documents", async (c) => {
    const actor = requireActor(c);
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) throw new AppError(422, "INVALID_FILE", "Choose a file to upload");
    const parsedType = documentTypeSchema.safeParse(form.docType);
    if (!parsedType.success) {
      throw new AppError(422, "INVALID_FILE", "Choose a supported document type");
    }
    const docType = parsedType.data;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const field = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;
    const requestId = field(form.requestId);
    const tripId = field(form.tripId);
    if (requestId) {
      const requests = await sql.query<{ merchantOrgId: string; brokerOrgId: string }>(
        `SELECT merchant_org_id, broker_org_id FROM transport_requests WHERE id = $1`,
        [requestId],
      );
      const request = requests[0];
      if (
        !request ||
        (request.merchantOrgId !== actor.organizationId &&
          request.brokerOrgId !== actor.organizationId &&
          actor.role !== "administrator")
      ) {
        throw new AppError(403, "FORBIDDEN", "You cannot attach a document to this request");
      }
    }
    const doc = await createDocument(sql, config, actor, {
      docType,
      filename: file.name,
      mimeType: file.type,
      bytes,
      expiresOn: field(form.expiresOn),
      vehicleId: field(form.vehicleId),
      driverId: field(form.driverId),
      requestId,
      tripId,
      incidentId: typeof form.incidentId === "string" ? form.incidentId : null,
      replacesId: typeof form.replacesId === "string" ? form.replacesId : null,
    });
    if (docType === "loading_photo" && tripId)
      await saveLoadingEvidence(sql, actor, tripId, doc.id);
    return c.json({ data: publicDocument(doc) }, 201);
  });
  api.get("/documents/:id/download", async (c) => {
    const actor = requireActor(c);
    const docs = await sql.query<Parameters<typeof canReadDocument>[2]>(
      `SELECT * FROM documents WHERE id = $1`,
      [c.req.param("id")],
    );
    const doc = docs[0];
    if (!doc || !(await canReadDocument(sql, actor, doc)))
      throw new AppError(404, "NOT_FOUND", "Document not found");
    const bytes = await readObject(sql, config, doc.storageKey);
    return new Response(bytes, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
  api.post("/documents/:id/review", async (c) => {
    const input = await readJson(c, reviewDocumentSchema);
    await reviewDocument(
      sql,
      config,
      requireActor(c),
      c.req.param("id"),
      input.decision,
      input.notes,
      input.expiresOn,
    );
    return c.json({ data: { reviewed: true } });
  });

  api.get("/requests", async (c) => {
    const page = Number(c.req.query("page") ?? 1);
    const pageSize = Math.min(100, Number(c.req.query("pageSize") ?? 20));
    const data = await listRequests(sql, requireActor(c), {
      page,
      pageSize,
      q: c.req.query("q"),
      status: c.req.query("status"),
    });
    return c.json({ data, meta: { page, pageSize } });
  });
  api.get("/requests/available", async (c) =>
    c.json({ data: await listAvailableRequests(sql, requireActor(c)) }),
  );
  api.post("/requests", async (c) => {
    const input = await readJson(c, createRequestSchema);
    return c.json(
      {
        data: await createRequest(sql, config, requireActor(c), {
          ...input,
          useDefaultBroker: input.useDefaultBroker ?? false,
        }),
      },
      201,
    );
  });
  api.get("/requests/:id", async (c) =>
    c.json({ data: await getRequest(sql, requireActor(c), c.req.param("id")) }),
  );
  api.patch("/requests/:id", async (c) => {
    await updateRequest(
      sql,
      config,
      requireActor(c),
      c.req.param("id"),
      await readJson(c, updateRequestSchema),
    );
    return c.json({ data: { updated: true } });
  });
  api.post("/requests/:id/cancel", async (c) => {
    const body = await c.req.json().catch(() => ({}) as { reason?: string });
    await cancelRequest(sql, requireActor(c), c.req.param("id"), body.reason);
    return c.json({ data: { cancelled: true } });
  });
  api.post("/requests/:id/clearance", async (c) => {
    await brokerClearance(
      sql,
      config,
      requireActor(c),
      c.req.param("id"),
      await readJson(c, brokerClearanceSchema),
    );
    return c.json({ data: { saved: true } });
  });
  api.post("/requests/:id/release", async (c) => {
    const input = await readJson(c, releaseRequestSchema);
    await releaseRequest(sql, config, requireActor(c), c.req.param("id"), input.notes);
    return c.json({ data: { released: true } });
  });
  api.post("/requests/:id/responses", async (c) => {
    const input = await readJson(c, carrierRespondSchema);
    return c.json(
      {
        data: await respondToRequest(
          sql,
          config,
          requireActor(c),
          c.req.param("id"),
          input.vehicleId,
          input.driverId,
        ),
      },
      201,
    );
  });
  api.post("/requests/:id/select", async (c) => {
    const actor = requireActor(c);
    const input = await readJson(c, selectCarrierSchema);
    const key = c.req.header("idempotency-key");
    if (key) {
      const existing = await sql.query<{ responseStatus: number; responseBody: unknown }>(
        `SELECT response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
        [actor.id, key],
      );
      if (existing[0]) return c.json(existing[0].responseBody, existing[0].responseStatus as 200);
    }
    const trip = await selectCarrier(sql, config, actor, c.req.param("id"), input.responseId);
    const body = { data: trip };
    if (key) {
      await sql.query(
        `INSERT INTO idempotency_keys (key, user_id, request_hash, response_status, response_body) VALUES ($1,$2,$3,201,$4::jsonb)`,
        [key, actor.id, input.responseId, JSON.stringify(body)],
      );
    }
    return c.json(body, 201);
  });

  api.get("/trips", async (c) => c.json({ data: await listTrips(sql, requireActor(c)) }));
  api.get("/trips/:id", async (c) =>
    c.json({ data: await getTrip(sql, requireActor(c), c.req.param("id")) }),
  );
  api.post("/trips/:id/transition", async (c) => {
    const input = await readJson(c, tripTransitionSchema);
    await transitionTrip(sql, config, requireActor(c), c.req.param("id"), input.toStatus, input);
    return c.json({ data: { updated: true } });
  });
  api.get("/trips/:id/tracking", async (c) =>
    c.json({ data: await privateTracking(sql, requireActor(c), c.req.param("id")) }),
  );
  api.post("/tracking", async (c) =>
    c.json({
      data: await submitLocation(sql, requireActor(c), await readJson(c, locationUpdateSchema)),
    }),
  );
  api.post("/trips/:id/ratings", async (c) => {
    const input = await readJson(c, ratingSchema);
    await rateTrip(
      sql,
      requireActor(c),
      c.req.param("id"),
      input.targetRole,
      input.score,
      input.comment,
    );
    return c.json({ data: { rated: true } }, 201);
  });
  api.post("/trips/:id/incidents", async (c) => {
    const input = await readJson(c, incidentSchema);
    return c.json(
      {
        data: await reportIncident(
          sql,
          config,
          requireActor(c),
          c.req.param("id"),
          input.incidentType,
          input.description,
        ),
      },
      201,
    );
  });
  api.get("/notifications", async (c) => {
    const actor = requireActor(c);
    const rows = await sql.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [actor.id],
    );
    return c.json({ data: rows });
  });
  api.post("/notifications/:id/read", async (c) => {
    const actor = requireActor(c);
    await sql.query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2`, [
      c.req.param("id"),
      actor.id,
    ]);
    return c.json({ data: { read: true } });
  });
  api.post("/notifications/read-all", async (c) => {
    await sql.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [requireActor(c).id],
    );
    return c.json({ data: { read: true } });
  });
  api.post("/push-tokens", async (c) => {
    const actor = requireActor(c);
    const input = await readJson(c, pushTokenSchema);
    await sql.query(
      `INSERT INTO push_tokens (user_id, platform, token) VALUES ($1,$2,$3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, disabled_at = NULL`,
      [actor.id, input.platform, input.token],
    );
    return c.json({ data: { registered: true } }, 201);
  });
  api.delete("/push-tokens", async (c) => {
    const actor = requireActor(c);
    const input = await readJson(c, pushTokenSchema.pick({ token: true }));
    await sql.query(
      `UPDATE push_tokens SET disabled_at = now() WHERE user_id = $1 AND token = $2`,
      [actor.id, input.token],
    );
    return c.json({ data: { removed: true } });
  });

  const admin = new Hono<AppEnv>();
  admin.use("*", async (c, next) => {
    const actor = requireActor(c);
    if (actor.role !== "administrator" || actor.status !== "active") {
      throw new AppError(403, "FORBIDDEN", "Administrator access is required");
    }
    await next();
  });
  admin.get("/users", async (c) => {
    requirePermission(requireActor(c), "verification");
    const q = c.req.query("q")?.replace(/[%_\\]/g, "") ?? "";
    const status = c.req.query("status");
    const rows = await sql.query(
      `SELECT id, email, full_name, role, status, organization_id, admin_permissions, phone, created_at
       FROM accounts
       WHERE ($1 = '' OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC LIMIT 100`,
      [q, status ?? null],
    );
    return c.json({ data: rows });
  });
  admin.patch("/users/:id/status", async (c) => {
    const input = await readJson(c, accountActionSchema);
    await setAccountStatus(sql, requireActor(c), c.req.param("id"), input.status, input.reason);
    return c.json({ data: { updated: true } });
  });
  admin.patch("/users/:id/permissions", async (c) => {
    const input = await readJson(c, adminPermissionsSchema);
    await setAdminPermissions(sql, requireActor(c), c.req.param("id"), input.permissions);
    return c.json({ data: { updated: true } });
  });
  admin.patch("/vehicles/:id/status", async (c) => {
    requirePermission(requireActor(c), "verification");
    const input = await readJson(c, accountActionSchema);
    if (input.status === "active") {
      const missing = await sql.query(
        `SELECT required.doc_type FROM (VALUES ('vehicle_registration'),('vehicle_operating_card'),('operating_license'),('insurance'),('periodic_inspection')) AS required(doc_type)
         WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.vehicle_id = $1 AND d.doc_type = required.doc_type AND d.status = 'approved' AND (d.expires_on IS NULL OR d.expires_on >= CURRENT_DATE))`,
        [c.req.param("id")],
      );
      if (missing.length)
        throw new AppError(
          422,
          "VERIFICATION_INCOMPLETE",
          "Vehicle documents are incomplete",
          missing,
        );
    }
    await sql.query(`UPDATE vehicles SET status = $2 WHERE id = $1`, [
      c.req.param("id"),
      input.status,
    ]);
    return c.json({ data: { updated: true } });
  });
  admin.patch("/drivers/:id/status", async (c) => {
    requirePermission(requireActor(c), "verification");
    const input = await readJson(c, accountActionSchema);
    if (input.status === "active") {
      const missing = await sql.query(
        `SELECT required.doc_type FROM (VALUES ('driver_license'),('residence_permit'),('passport')) AS required(doc_type)
         WHERE NOT EXISTS (SELECT 1 FROM documents d WHERE d.driver_id = $1 AND d.doc_type = required.doc_type AND d.status = 'approved')`,
        [c.req.param("id")],
      );
      if (missing.length)
        throw new AppError(
          422,
          "VERIFICATION_INCOMPLETE",
          "Driver documents are incomplete",
          missing,
        );
    }
    await sql.query(`UPDATE drivers SET status = $2 WHERE id = $1`, [
      c.req.param("id"),
      input.status,
    ]);
    return c.json({ data: { updated: true } });
  });
  admin.get("/documents", async (c) => {
    requirePermission(requireActor(c), "verification");
    const rows = await sql.query(
      `SELECT id, doc_type, status, original_filename, organization_id, vehicle_id, driver_id, expires_on, created_at
       FROM documents ORDER BY created_at DESC LIMIT 200`,
    );
    return c.json({ data: rows });
  });
  admin.get("/expiry", async (c) => {
    requirePermission(requireActor(c), "verification");
    const rows = await sql.query(
      `SELECT id, doc_type, owner_user_id, expires_on, status FROM documents
       WHERE expires_on IS NOT NULL AND expires_on <= CURRENT_DATE + 30 AND status IN ('approved', 'needs_update')
       ORDER BY expires_on`,
    );
    return c.json({ data: rows });
  });
  admin.get("/requests", async (c) => {
    requirePermission(requireActor(c), "operations");
    const rows = await sql.query(
      `SELECT * FROM transport_requests ORDER BY created_at DESC LIMIT 200`,
    );
    return c.json({ data: rows });
  });
  admin.get("/trips", async (c) => {
    requirePermission(requireActor(c), "operations");
    const rows = await sql.query(`SELECT * FROM trips ORDER BY created_at DESC LIMIT 200`);
    return c.json({ data: rows });
  });
  admin.get("/map", async (c) => {
    requirePermission(requireActor(c), "operations");
    const rows = await sql.query(
      `SELECT v.id AS vehicle_id, v.plate_number, v.truck_type, v.availability, loc.latitude, loc.longitude, loc.recorded_at, loc.trip_id
       FROM vehicle_locations loc JOIN vehicles v ON v.id = loc.vehicle_id`,
    );
    return c.json({ data: rows });
  });
  admin.get("/incidents", async (c) => {
    requirePermission(requireActor(c), "operations");
    const rows = await sql.query(`SELECT * FROM incidents ORDER BY created_at DESC LIMIT 200`);
    return c.json({ data: rows });
  });
  admin.post("/incidents/:id/resolve", async (c) => {
    const actor = requireActor(c);
    requirePermission(actor, "operations");
    const input = await readJson(c, incidentResolveSchema);
    await sql.query(
      `UPDATE incidents SET status = $2, resolution = $3, resolved_by = $4, resolved_at = CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE resolved_at END WHERE id = $1`,
      [c.req.param("id"), input.status, input.resolution ?? null, actor.id],
    );
    await sql.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'incident.resolve','incident',$2,$3::jsonb)`,
      [actor.id, c.req.param("id"), JSON.stringify({ status: input.status })],
    );
    return c.json({ data: { updated: true } });
  });
  admin.get("/fees", async (c) => {
    assertFinance(requireActor(c));
    const rows = await sql.query(
      `SELECT f.*, t.reference AS trip_reference, s.external_reference, s.settled_at
       FROM platform_fees f JOIN trips t ON t.id = f.trip_id
       LEFT JOIN settlements s ON s.fee_id = f.id
       ORDER BY f.created_at DESC LIMIT 200`,
    );
    return c.json({ data: rows });
  });
  admin.post("/fees/:id/settlements", async (c) => {
    const actor = requireActor(c);
    assertFinance(actor);
    const input = await readJson(c, settlementSchema);
    await sql.begin(async (tx) => {
      const fees = await tx.query<{ id: string; amount: number; currency: string; status: string }>(
        `SELECT id, amount, currency, status FROM platform_fees WHERE id = $1 FOR UPDATE`,
        [c.req.param("id")],
      );
      const fee = fees[0];
      if (!fee) throw new AppError(404, "NOT_FOUND", "Fee not found");
      if (fee.status !== "pending")
        throw new AppError(409, "FEE_NOT_PENDING", "Only a pending fee can be settled externally");
      await tx.query(
        `INSERT INTO settlements (fee_id, amount, currency, external_reference, notes, recorded_by, settled_at)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now()))`,
        [
          fee.id,
          fee.amount,
          fee.currency,
          input.externalReference,
          input.notes ?? null,
          actor.id,
          input.settledAt ?? null,
        ],
      );
      await tx.query(`UPDATE platform_fees SET status = 'settled' WHERE id = $1`, [fee.id]);
      await tx.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'fee.settle','platform_fee',$2,$3::jsonb)`,
        [actor.id, fee.id, JSON.stringify({ externalReference: input.externalReference })],
      );
    });
    return c.json({ data: { settled: true } });
  });
  admin.patch("/fee-policy", async (c) => {
    const actor = requireActor(c);
    assertFinance(actor);
    const input = await readJson(c, feePolicySchema);
    if (
      input.freePeriodActive &&
      (!input.freePeriodStartsOn || !input.freePeriodEndsOn || !input.freePeriodEligibility)
    ) {
      throw new AppError(
        422,
        "POLICY_INCOMPLETE",
        "An active free period needs a start, an end, and an eligibility rule",
      );
    }
    await sql.query(
      `UPDATE platform_settings SET fee_amount = $1, fee_currency = $2, free_period_active = $3,
        free_period_starts_on = $4, free_period_ends_on = $5, free_period_eligibility = $6, updated_by = $7, updated_at = now()
       WHERE id = true`,
      [
        input.amount,
        input.currency,
        input.freePeriodActive,
        input.freePeriodStartsOn ?? null,
        input.freePeriodEndsOn ?? null,
        input.freePeriodEligibility ?? null,
        actor.id,
      ],
    );
    await sql.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'fee.policy','platform_settings','current',$2::jsonb)`,
      [actor.id, JSON.stringify(input)],
    );
    return c.json({ data: { updated: true } });
  });
  admin.get("/fee-policy", async (c) => {
    assertFinance(requireActor(c));
    const rows = await sql.query(`SELECT * FROM platform_settings WHERE id = true`);
    return c.json({ data: rows[0] });
  });
  admin.get("/integrations", async (c) => {
    requirePermission(requireActor(c), "general");
    return c.json({ data: await listIntegrations(sql, config) });
  });
  admin.patch("/integrations/:code", async (c) => {
    const actor = requireActor(c);
    requirePermission(actor, "general");
    const input = await readJson(c, integrationPatchSchema);
    await updateIntegration(sql, actor, c.req.param("code"), input);
    const rows = await listIntegrations(sql, config);
    const row = rows.find((item) => item.code === c.req.param("code"));
    return c.json({ data: row ?? { updated: true } });
  });
  admin.post("/integrations", async (c) => {
    const actor = requireActor(c);
    requirePermission(actor, "general");
    const input = await readJson(c, integrationCreateSchema);
    const code = await createIntegration(sql, actor, input);
    const rows = await listIntegrations(sql, config);
    return c.json({ data: rows.find((item) => item.code === code) }, 201);
  });
  admin.delete("/integrations/:code", async (c) => {
    const actor = requireActor(c);
    requirePermission(actor, "general");
    await deleteIntegration(sql, actor, c.req.param("code"));
    return c.json({ data: { removed: true } });
  });
  admin.get("/audit", async (c) => {
    requirePermission(requireActor(c), "general");
    const rows = await sql.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`);
    return c.json({ data: rows });
  });
  admin.get("/reports/summary", async (c) => {
    const actor = requireActor(c);
    if (!hasPermission(actor, "operations") && !hasPermission(actor, "finance")) {
      throw new AppError(403, "FORBIDDEN", "Missing administrative permission");
    }
    const from = c.req.query("from") ?? "2000-01-01";
    const to = c.req.query("to") ?? "2100-01-01";
    const totals = await sql.query(
      `SELECT status, COUNT(*)::int AS count FROM trips WHERE created_at::date BETWEEN $1::date AND $2::date GROUP BY status ORDER BY status`,
      [from, to],
    );
    const carriers = await sql.query(
      `SELECT o.legal_name, COUNT(t.id)::int AS trips, ROUND(AVG(r.score)::numeric, 2) AS rating
       FROM organizations o
       LEFT JOIN trips t ON t.carrier_org_id = o.id AND t.created_at::date BETWEEN $1::date AND $2::date
       LEFT JOIN ratings r ON r.target_org_id = o.id AND r.target_role = 'carrier'
       WHERE o.type IN ('carrier_company', 'independent_carrier')
       GROUP BY o.id ORDER BY trips DESC`,
      [from, to],
    );
    const fees = await sql.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS amount FROM platform_fees GROUP BY status`,
    );
    const requestsByStatus = await sql.query(
      `SELECT status, COUNT(*)::int AS count FROM transport_requests GROUP BY status ORDER BY status`,
    );
    const pulse = await sql.query<{
      requests: number;
      waitingRelease: number;
      openIncidents: number;
      activeTrips: number;
      vehiclesLive: number;
      noticesDay: number;
      accounts: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM transport_requests) AS requests,
         (SELECT COUNT(*)::int FROM transport_requests WHERE status = 'ready_for_admin_review') AS waiting_release,
         (SELECT COUNT(*)::int FROM incidents WHERE status = 'open') AS open_incidents,
         (SELECT COUNT(*)::int FROM trips WHERE status NOT IN ('closed', 'cancelled')) AS active_trips,
         (SELECT COUNT(*)::int FROM vehicle_locations WHERE recorded_at >= now() - interval '15 minutes') AS vehicles_live,
         (SELECT COUNT(*)::int FROM notifications WHERE created_at >= now() - interval '24 hours') AS notices_day,
         (SELECT COUNT(*)::int FROM accounts WHERE role <> 'administrator') AS accounts`,
    );
    return c.json({
      data: {
        tripsByStatus: totals,
        carrierPerformance: carriers,
        fees,
        live: {
          generatedAt: new Date().toISOString(),
          requestsByStatus,
          ...(pulse[0] ?? {}),
        },
      },
    });
  });
  admin.get("/exports/trips.csv", async (c) => {
    requirePermission(requireActor(c), "operations");
    const rows = await sql.query<Record<string, unknown>>(
      `SELECT reference, status, agreed_price, currency, confirmed_at, closed_at FROM trips ORDER BY created_at DESC`,
    );
    return c.text(toCsv(rows), 200, { "Content-Type": "text/csv; charset=utf-8" });
  });
  admin.get("/exports/fees.csv", async (c) => {
    assertFinance(requireActor(c));
    const rows = await sql.query<Record<string, unknown>>(
      `SELECT t.reference, f.amount, f.currency, f.status, f.exemption_reason, f.created_at FROM platform_fees f JOIN trips t ON t.id = f.trip_id`,
    );
    return c.text(toCsv(rows), 200, { "Content-Type": "text/csv; charset=utf-8" });
  });

  api.route("/admin", admin);
  app.route("/api/v1", api);
  return app;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const first = rows[0];
  if (!first) return "";
  const headers = Object.keys(first);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","),
    );
  }
  return lines.join("\n");
}
