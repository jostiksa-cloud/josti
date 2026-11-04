import { access } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { migrate } from "./db/migrate";
import { createPgliteSql, createPostgresSql } from "./db/sql";
import { startJobs } from "./jobs/scheduler";
import { log } from "./logger";

function configFailureApp(message: string) {
  const fallback = new Hono();
  fallback.all("*", (c) =>
    c.json(
      {
        error: {
          code: "CONFIG_INVALID",
          message,
        },
      },
      503,
    ),
  );
  return fallback;
}

async function boot() {
  const config = loadConfig();
  const sql =
    config.databaseMode === "postgres" && config.databaseUrl
      ? createPostgresSql(config.databaseUrl)
      : await createPgliteSql(config.pgliteDir);
  const migrationsDir = join(process.cwd(), "migrations");
  let applied: string[] = [];
  try {
    await access(migrationsDir);
    applied = await migrate(sql);
  } catch (error) {
    // Vercel Hono bundles omit the migrations folder. Apply schema out-of-band
    // (bun run db:migrate) and skip boot-time migrate when the directory is absent.
    if (!process.env.VERCEL) throw error;
    log("warn", "skipping boot migrate; migrations directory unavailable", {
      migrationsDir,
      err: error instanceof Error ? error.message : String(error),
    });
  }
  log("info", "database ready", { applied, mode: config.databaseMode, storage: config.storageMode });
  const app = createApp(sql, config);

  if (!process.env.VERCEL) {
    const stopJobs = startJobs(sql, config);
    const server = Bun.serve({
      hostname: config.host,
      port: config.port,
      fetch: app.fetch,
    });
    log("info", "josti api listening", { url: `http://${config.host}:${server.port}` });

    async function shutdown() {
      stopJobs();
      server.stop(true);
      await sql.close();
      process.exit(0);
    }
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  }

  return app;
}

let app: Awaited<ReturnType<typeof boot>> | ReturnType<typeof configFailureApp>;
try {
  app = await boot();
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "JOSTI cannot start because the production configuration is invalid";
  log("error", "josti boot failed", { err: message });
  // On Vercel, return JSON 503 instead of crashing the isolate with a non-JSON 500.
  if (process.env.VERCEL) app = configFailureApp(message);
  else throw error;
}

export default app;
