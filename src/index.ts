import { createApp } from "./app";
import { loadConfig } from "./config";
import { migrate } from "./db/migrate";
import { createPgliteSql, createPostgresSql } from "./db/sql";
import { startJobs } from "./jobs/scheduler";
import { log } from "./logger";

const config = loadConfig();
const sql =
  config.databaseMode === "postgres" && config.databaseUrl
    ? createPostgresSql(config.databaseUrl)
    : await createPgliteSql(config.pgliteDir);
const applied = await migrate(sql);
log("info", "database ready", { applied, mode: config.databaseMode, storage: config.storageMode });
const app = createApp(sql, config);

// Vercel Hono preset requires a default export. Do not start Bun.serve or in-process
// jobs inside the serverless/Fluid runtime.
export default app;

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
