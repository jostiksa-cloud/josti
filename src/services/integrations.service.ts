import { z } from "zod/v3";
import type { AppConfig } from "../config";
import type { Sql } from "../db/sql";
import { AppError } from "../lib/errors";
import type { Actor } from "./access";

type Json = Record<string, unknown>;

type IntegrationRow = {
  code: string;
  category: string;
  nameEn: string;
  nameAr: string;
  enabled: boolean;
  endpoint: string | null;
  publicConfig: Json | string | null;
  secrets: Json | string | null;
  notes: string | null;
  builtin: boolean;
  updatedAt: string | null;
};

type FieldKind = "text" | "number" | "boolean" | "secret";

type FieldDef = {
  key: string;
  kind: FieldKind;
  secret: boolean;
  labelEn: string;
  labelAr: string;
};

const CATEGORIES = ["maps", "messaging", "email", "storage", "operations", "other"] as const;

const BUILTIN_FIELDS: Record<string, FieldDef[]> = {
  map: [
    { key: "tileUrl", kind: "text", secret: false, labelEn: "Tile URL", labelAr: "رابط البلاط" },
    { key: "attribution", kind: "text", secret: false, labelEn: "Attribution", labelAr: "الإسناد" },
  ],
  fcm: [
    { key: "endpoint", kind: "text", secret: false, labelEn: "Endpoint", labelAr: "نقطة الإرسال" },
    { key: "serverKey", kind: "secret", secret: true, labelEn: "Server key", labelAr: "مفتاح الخادم" },
  ],
  apns: [
    { key: "keyId", kind: "text", secret: false, labelEn: "Key id", labelAr: "معرف المفتاح" },
    { key: "teamId", kind: "text", secret: false, labelEn: "Team id", labelAr: "معرف الفريق" },
    { key: "bundleId", kind: "text", secret: false, labelEn: "Bundle id", labelAr: "معرف التطبيق" },
    { key: "production", kind: "boolean", secret: false, labelEn: "Production", labelAr: "بيئة الإنتاج" },
    { key: "privateKey", kind: "secret", secret: true, labelEn: "Private key", labelAr: "المفتاح الخاص" },
  ],
  smtp: [
    { key: "host", kind: "text", secret: false, labelEn: "Host", labelAr: "الخادم" },
    { key: "port", kind: "number", secret: false, labelEn: "Port", labelAr: "المنفذ" },
    { key: "user", kind: "text", secret: false, labelEn: "Username", labelAr: "اسم المستخدم" },
    { key: "from", kind: "text", secret: false, labelEn: "From address", labelAr: "عنوان المرسل" },
    { key: "password", kind: "secret", secret: true, labelEn: "Password", labelAr: "كلمة المرور" },
  ],
  storage: [
    { key: "url", kind: "text", secret: false, labelEn: "Project URL", labelAr: "رابط المشروع" },
    { key: "bucket", kind: "text", secret: false, labelEn: "Private bucket", labelAr: "حاوية خاصة" },
    {
      key: "serviceRoleKey",
      kind: "secret",
      secret: true,
      labelEn: "Service role key",
      labelAr: "مفتاح الخدمة",
    },
  ],
};

const CUSTOM_FIELDS: FieldDef[] = [
  { key: "clientId", kind: "text", secret: false, labelEn: "Client id", labelAr: "معرف العميل" },
  { key: "apiKey", kind: "secret", secret: true, labelEn: "API key", labelAr: "مفتاح الربط" },
];

const valueSchema = z.union([z.string().max(2000), z.number(), z.boolean()]);

export const integrationPatchSchema = z.object({
  enabled: z.boolean(),
  endpoint: z.string().max(300).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  nameEn: z.string().min(2).max(80).optional(),
  nameAr: z.string().min(2).max(80).optional(),
  category: z.enum(CATEGORIES).optional(),
  publicConfig: z.record(valueSchema).default({}),
  secrets: z.record(z.string().max(8000)).optional(),
});

export const integrationCreateSchema = integrationPatchSchema.extend({
  nameEn: z.string().min(2).max(80),
  nameAr: z.string().min(2).max(80),
  category: z.enum(CATEGORIES).default("other"),
});

export type IntegrationPatch = z.input<typeof integrationPatchSchema>;
export type IntegrationCreate = z.input<typeof integrationCreateSchema>;

function asObject(value: Json | string | null | undefined): Json {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Json) : {};
    } catch {
      return {};
    }
  }
  return value;
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function hint(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function httpsUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(422, "INVALID_INTEGRATION", `${label} must be an https address`);
  }
  if (url.protocol !== "https:") {
    throw new AppError(422, "INVALID_INTEGRATION", `${label} must use https`);
  }
  return url.toString().replace(/\/$/, "");
}

function cleanTileUrl(value: string) {
  const url = httpsUrl(value, "The tile URL");
  if (!url.includes("{z}") || !url.includes("{x}") || !url.includes("{y}")) {
    throw new AppError(422, "INVALID_INTEGRATION", "The tile URL must include {z}, {x}, and {y}");
  }
  return url;
}

function integrationReady(
  code: string,
  fields: Array<{ key: string; configured: boolean; origin: string }>,
) {
  const set = (key: string) =>
    fields.some((field) => field.key === key && field.configured && field.origin !== "default");
  if (code === "map") return set("tileUrl");
  if (code === "fcm") return set("serverKey");
  if (code === "apns") return set("keyId") && set("teamId") && set("bundleId") && set("privateKey");
  if (code === "smtp") return set("host") && set("from");
  if (code === "storage") return set("url") && set("serviceRoleKey");
  return fields.some((field) => field.configured && field.origin !== "default");
}

function fieldsFor(code: string) {
  return BUILTIN_FIELDS[code] ?? CUSTOM_FIELDS;
}

function environmentValue(config: AppConfig, code: string, key: string): string {
  if (code === "map" && key === "tileUrl") return config.mapTileUrl;
  if (code === "map" && key === "attribution") return config.mapAttribution.replace(/<[^>]*>/g, "");
  if (code === "fcm" && key === "endpoint") return config.fcmEndpoint;
  if (code === "fcm" && key === "serverKey") return config.fcmServerKey ?? "";
  if (code === "apns" && key === "keyId") return config.apnsKeyId ?? "";
  if (code === "apns" && key === "teamId") return config.apnsTeamId ?? "";
  if (code === "apns" && key === "bundleId") return config.apnsBundleId ?? "";
  if (code === "apns" && key === "production") return config.apnsProduction ? "true" : "";
  if (code === "apns" && key === "privateKey") return config.apnsPrivateKey ?? "";
  if (code === "smtp" && key === "host") return config.smtp?.host ?? "";
  if (code === "smtp" && key === "port") return config.smtp ? String(config.smtp.port) : "";
  if (code === "smtp" && key === "user") return config.smtp?.user ?? "";
  if (code === "smtp" && key === "from") return config.smtp?.from ?? "";
  if (code === "smtp" && key === "password") return config.smtp?.password ?? "";
  if (code === "storage" && key === "url") return config.supabaseUrl ?? "";
  if (code === "storage" && key === "bucket") return config.supabaseBucket;
  if (code === "storage" && key === "serviceRoleKey") return config.supabaseServiceKey ?? "";
  return "";
}

function savedValue(row: IntegrationRow, field: FieldDef) {
  const bag = field.secret ? asObject(row.secrets) : asObject(row.publicConfig);
  if (field.key === "endpoint" && row.endpoint) return row.endpoint;
  return bag[field.key];
}

function presentIntegration(row: IntegrationRow, config: AppConfig) {
  const fields = fieldsFor(row.code).map((field) => {
    const stored = text(savedValue(row, field));
    const fromEnv = environmentValue(config, row.code, field.key);
    const fallback = stored || fromEnv;
    const origin = stored ? "saved" : fromEnv ? "environment" : "empty";
    return {
      key: field.key,
      kind: field.kind,
      secret: field.secret,
      labelEn: field.labelEn,
      labelAr: field.labelAr,
      value: field.secret ? "" : fallback,
      configured: Boolean(fallback),
      hint: field.secret ? hint(fallback) : "",
      origin,
    };
  });
  const ready = integrationReady(row.code, fields);
  return {
    code: row.code,
    category: row.category,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    enabled: row.enabled,
    endpoint: row.endpoint ?? "",
    notes: row.notes ?? "",
    builtin: row.builtin,
    updatedAt: row.updatedAt,
    status: !row.enabled ? "disabled" : ready ? "ready" : "incomplete",
    fields,
  };
}

export async function listIntegrations(sql: Sql, config: AppConfig) {
  const rows = await sql.query<IntegrationRow>(
    `SELECT * FROM integrations ORDER BY builtin DESC, name_en`,
  );
  return rows.map((row) => presentIntegration(row, config));
}

function accepted(code: string, key: string, secret: boolean) {
  return fieldsFor(code).some((field) => field.key === key && field.secret === secret);
}

function normalizePublic(code: string, input: Json) {
  const output: Json = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!accepted(code, key, false)) continue;
    const field = fieldsFor(code).find((item) => item.key === key);
    if (!field) continue;
    if (field.kind === "boolean") {
      output[key] = raw === true || raw === "true";
      continue;
    }
    if (field.kind === "number") {
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new AppError(422, "INVALID_INTEGRATION", "The port must be between 1 and 65535");
      }
      output[key] = port;
      continue;
    }
    const value = text(raw);
    if (!value) continue;
    if (code === "map" && key === "tileUrl") output[key] = cleanTileUrl(value);
    else if (code === "map" && key === "attribution") output[key] = value.replace(/<[^>]*>/g, "").slice(0, 200);
    else if ((code === "fcm" && key === "endpoint") || (code === "storage" && key === "url"))
      output[key] = httpsUrl(value, field.labelEn);
    else if (code === "smtp" && key === "from" && !value.includes("@"))
      throw new AppError(422, "INVALID_INTEGRATION", "The from address must be an email");
    else output[key] = value.slice(0, 300);
  }
  return output;
}

function normalizeSecrets(code: string, input: Json | undefined, current: Json) {
  const output = { ...current };
  for (const [key, raw] of Object.entries(input ?? {})) {
    if (!accepted(code, key, true)) continue;
    const value = text(raw);
    if (!value) continue;
    output[key] = value;
  }
  return output;
}

export async function updateIntegration(
  sql: Sql,
  actor: Actor,
  code: string,
  input: IntegrationPatch,
) {
  const rows = await sql.query<IntegrationRow>(`SELECT * FROM integrations WHERE code = $1`, [code]);
  const row = rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "This integration was not found");
  const endpoint = text(input.endpoint);
  if (endpoint && !row.builtin) httpsUrl(endpoint, "The endpoint");
  const publicConfig = normalizePublic(row.code, input.publicConfig ?? {});
  const secrets = normalizeSecrets(row.code, input.secrets, asObject(row.secrets));
  await sql.query(
    `UPDATE integrations
     SET enabled = $2, endpoint = $3, notes = $4, public_config = $5::jsonb, secrets = $6::jsonb,
         name_en = CASE WHEN builtin THEN name_en ELSE COALESCE($7, name_en) END,
         name_ar = CASE WHEN builtin THEN name_ar ELSE COALESCE($8, name_ar) END,
         category = CASE WHEN builtin THEN category ELSE COALESCE($9, category) END,
         updated_by = $10, updated_at = now()
     WHERE code = $1`,
    [
      code,
      input.enabled,
      endpoint || null,
      text(input.notes) || null,
      JSON.stringify(publicConfig),
      JSON.stringify(secrets),
      input.nameEn ?? null,
      input.nameAr ?? null,
      row.builtin ? null : (input.category ?? null),
      actor.id,
    ],
  );
  await sql.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, 'integration.update', 'integration', $2, $3::jsonb)`,
    [
      actor.id,
      code,
      JSON.stringify({
        enabled: input.enabled,
        publicKeys: Object.keys(publicConfig),
        secretsUpdated: Object.keys(input.secrets ?? {}).filter((key) => text(input.secrets?.[key])),
      }),
    ],
  );
  const next = await sql.query<IntegrationRow>(`SELECT * FROM integrations WHERE code = $1`, [code]);
  return next[0];
}

export async function createIntegration(sql: Sql, actor: Actor, input: IntegrationCreate) {
  const code = `custom_${crypto.randomUUID().slice(0, 8)}`;
  const endpoint = text(input.endpoint);
  if (endpoint) httpsUrl(endpoint, "The endpoint");
  const publicConfig = normalizePublic(code, input.publicConfig ?? {});
  const secrets = normalizeSecrets(code, input.secrets, {});
  await sql.query(
    `INSERT INTO integrations
      (code, category, name_en, name_ar, enabled, endpoint, public_config, secrets, notes, builtin, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,false,$10)`,
    [
      code,
      input.category ?? "other",
      input.nameEn ?? "Platform",
      input.nameAr ?? "منصة",
      input.enabled,
      endpoint || null,
      JSON.stringify(publicConfig),
      JSON.stringify(secrets),
      text(input.notes) || null,
      actor.id,
    ],
  );
  await sql.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, 'integration.create', 'integration', $2, $3::jsonb)`,
    [actor.id, code, JSON.stringify({ category: input.category ?? "other" })],
  );
  return code;
}

export async function deleteIntegration(sql: Sql, actor: Actor, code: string) {
  const rows = await sql.query<{ builtin: boolean }>(
    `DELETE FROM integrations WHERE code = $1 AND builtin = false RETURNING builtin`,
    [code],
  );
  if (!rows.length) {
    throw new AppError(404, "NOT_FOUND", "Only an added platform can be removed");
  }
  await sql.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, 'integration.delete', 'integration', $2, '{}'::jsonb)`,
    [actor.id, code],
  );
}

function chosen(row: IntegrationRow | undefined, key: string, secret = false) {
  if (!row) return "";
  const bag = secret ? asObject(row.secrets) : asObject(row.publicConfig);
  return text(bag[key]);
}

export async function resolveRuntimeConfig(sql: Sql, config: AppConfig): Promise<AppConfig> {
  const rows = await sql.query<IntegrationRow>(`SELECT * FROM integrations WHERE builtin = true`);
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const map = byCode.get("map");
  const fcm = byCode.get("fcm");
  const apns = byCode.get("apns");
  const smtp = byCode.get("smtp");
  const storage = byCode.get("storage");
  const tile = map?.enabled ? chosen(map, "tileUrl") || config.mapTileUrl : config.mapTileUrl;
  const attribution = (
    map?.enabled ? chosen(map, "attribution") || config.mapAttribution : config.mapAttribution
  ).replace(/<[^>]*>/g, "");
  const fcmOn = fcm?.enabled !== false;
  const apnsOn = apns?.enabled !== false;
  const smtpOn = smtp?.enabled !== false;
  const storageOn = storage?.enabled !== false;
  const smtpHost = chosen(smtp, "host") || config.smtp?.host || "";
  const smtpFrom = chosen(smtp, "from") || config.smtp?.from || "";
  const smtpPort = Number(chosen(smtp, "port") || config.smtp?.port || 587);
  const smtpUser = chosen(smtp, "user") || config.smtp?.user;
  const smtpPassword = chosen(smtp, "password", true) || config.smtp?.password;
  const supabaseUrl = chosen(storage, "url") || config.supabaseUrl || "";
  const supabaseKey = chosen(storage, "serviceRoleKey", true) || config.supabaseServiceKey || "";
  const supabaseBucket = chosen(storage, "bucket") || config.supabaseBucket;
  const storageReady = storageOn && Boolean(supabaseUrl && supabaseKey);
  return {
    ...config,
    mapTileUrl: tile,
    mapAttribution: attribution,
    fcmEndpoint: (fcmOn ? chosen(fcm, "endpoint") : "") || config.fcmEndpoint,
    fcmServerKey: fcmOn ? chosen(fcm, "serverKey", true) || config.fcmServerKey : undefined,
    apnsKeyId: apnsOn ? chosen(apns, "keyId") || config.apnsKeyId : undefined,
    apnsTeamId: apnsOn ? chosen(apns, "teamId") || config.apnsTeamId : undefined,
    apnsBundleId: apnsOn ? chosen(apns, "bundleId") || config.apnsBundleId : undefined,
    apnsPrivateKey: apnsOn ? chosen(apns, "privateKey", true) || config.apnsPrivateKey : undefined,
    apnsProduction: apnsOn
      ? chosen(apns, "production")
        ? chosen(apns, "production") === "true"
        : config.apnsProduction
      : false,
    smtp:
      smtpOn && smtpHost && smtpFrom
        ? { host: smtpHost, port: smtpPort, user: smtpUser, password: smtpPassword, from: smtpFrom }
        : undefined,
    supabaseUrl: storageReady ? supabaseUrl : config.supabaseUrl,
    supabaseServiceKey: storageReady ? supabaseKey : config.supabaseServiceKey,
    supabaseBucket,
    storageMode: storageReady ? "supabase" : config.storageMode === "supabase" && storageOn ? "supabase" : "local",
  };
}
