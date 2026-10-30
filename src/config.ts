import { z } from "zod/v3";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.string().default("http://127.0.0.1:5173"),
  ADMIN_URL: z.string().default("http://127.0.0.1:5174"),
  API_PUBLIC_URL: z.string().default("http://127.0.0.1:3000"),
  CORS_ORIGINS: z
    .string()
    .default(
      "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174",
    ),
  DATABASE_URL: z.string().optional(),
  DATABASE_MODE: z.enum(["postgres", "pglite"]).optional(),
  PGLITE_DIR: z.string().default("./data/pglite"),
  JWT_SECRET: z.string().optional(),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  STORAGE_LOCAL_DIR: z.string().default("./data/storage"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("josti-private"),
  SUPABASE_ANON_KEY: z.string().optional(),
  MAP_TILE_URL: z.string().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  MAP_ATTRIBUTION: z.string().default("&copy; OpenStreetMap contributors"),
  FCM_SERVER_KEY: z.string().optional(),
  FCM_ENDPOINT: z.string().default("https://fcm.googleapis.com/fcm/send"),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(),
  APNS_PRODUCTION: z.enum(["true", "false"]).default("false"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ALLOW_DEV_RESET_TOKEN: z.enum(["true", "false"]).default("false"),
  ARGON_MEMORY_COST: z.coerce.number().int().min(2048).max(262144).default(19456),
  JOB_INTERVAL_MS: z.coerce.number().int().min(5000).default(60000),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

export type AppConfig = {
  env: "development" | "test" | "staging" | "production";
  host: string;
  port: number;
  appUrl: string;
  adminUrl: string;
  apiPublicUrl: string;
  corsOrigins: string[];
  databaseUrl?: string;
  databaseMode: "postgres" | "pglite";
  pgliteDir: string;
  jwtSecret: string;
  accessTokenMinutes: number;
  refreshTokenDays: number;
  localStorageDir: string;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  supabaseBucket: string;
  supabaseAnonKey?: string;
  mapTileUrl: string;
  mapAttribution: string;
  fcmServerKey?: string;
  fcmEndpoint: string;
  apnsKeyId?: string;
  apnsTeamId?: string;
  apnsBundleId?: string;
  apnsPrivateKey?: string;
  apnsProduction: boolean;
  smtp?: { host: string; port: number; user?: string; password?: string; from: string };
  allowDevResetToken: boolean;
  argonMemoryCost: number;
  jobIntervalMs: number;
  trustProxy: boolean;
  storageMode: "supabase" | "local";
};

const PLACEHOLDER_SECRETS = new Set([
  "",
  "change-me",
  "change-me-to-a-random-string-at-least-32-chars",
  "replace-with-a-random-string-of-at-least-32-characters",
]);

export function loadConfig(source: NodeJS.Dict<string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${details.join("\n")}`);
  }
  const env = parsed.data;
  const missing: string[] = [];
  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32 || PLACEHOLDER_SECRETS.has(jwtSecret)) {
    missing.push("JWT_SECRET (minimum 32 characters, not a placeholder)");
  }
  const databaseMode = env.DATABASE_MODE ?? (env.DATABASE_URL ? "postgres" : "pglite");
  if (databaseMode === "postgres" && !env.DATABASE_URL) {
    missing.push("DATABASE_URL (required when DATABASE_MODE=postgres)");
  }
  if (
    (env.NODE_ENV === "production" || env.NODE_ENV === "staging") &&
    databaseMode !== "postgres"
  ) {
    missing.push(
      "DATABASE_URL and DATABASE_MODE=postgres (embedded PGlite is only for development and tests)",
    );
  }
  if (missing.length && env.NODE_ENV !== "test") {
    throw new Error(
      `JOSTI cannot start. Missing or invalid configuration:\n- ${missing.join("\n- ")}\nCopy .env.example to .env and set the values. No external Supabase project is assumed.`,
    );
  }
  if (missing.length && env.NODE_ENV === "test" && jwtSecret.length < 32) {
    throw new Error(`Test configuration is incomplete:\n- ${missing.join("\n- ")}`);
  }
  const smtp =
    env.SMTP_HOST && env.SMTP_FROM
      ? {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT ?? 587,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          from: env.SMTP_FROM,
        }
      : undefined;
  const supabaseReady = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    appUrl: env.APP_URL,
    adminUrl: env.ADMIN_URL,
    apiPublicUrl: env.API_PUBLIC_URL,
    corsOrigins: env.CORS_ORIGINS.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    databaseUrl: env.DATABASE_URL,
    databaseMode,
    pgliteDir: env.PGLITE_DIR,
    jwtSecret,
    accessTokenMinutes: env.ACCESS_TOKEN_MINUTES,
    refreshTokenDays: env.REFRESH_TOKEN_DAYS,
    localStorageDir: env.STORAGE_LOCAL_DIR,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: env.SUPABASE_STORAGE_BUCKET,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    mapTileUrl: env.MAP_TILE_URL,
    mapAttribution: env.MAP_ATTRIBUTION,
    fcmServerKey: env.FCM_SERVER_KEY,
    fcmEndpoint: env.FCM_ENDPOINT,
    apnsKeyId: env.APNS_KEY_ID,
    apnsTeamId: env.APNS_TEAM_ID,
    apnsBundleId: env.APNS_BUNDLE_ID,
    apnsPrivateKey: env.APNS_PRIVATE_KEY,
    apnsProduction: env.APNS_PRODUCTION === "true",
    smtp,
    allowDevResetToken: env.ALLOW_DEV_RESET_TOKEN === "true" && env.NODE_ENV !== "production",
    argonMemoryCost: env.ARGON_MEMORY_COST,
    jobIntervalMs: env.JOB_INTERVAL_MS,
    trustProxy: env.TRUST_PROXY === "true",
    storageMode: supabaseReady ? "supabase" : "local",
  };
}
