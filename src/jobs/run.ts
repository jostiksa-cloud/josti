import type { AppConfig } from "../config";
import type { Sql } from "../db/sql";
import { runMaintenance } from "./scheduler";

const config = { env: "development" } as AppConfig;
void config;
void runMaintenance;

export { runMaintenance };

if (import.meta.main) {
  const { loadConfig } = await import("../config");
  const { createPgliteSql, createPostgresSql } = await import("../db/sql");
  const loaded = loadConfig();
  const sql: Sql =
    loaded.databaseMode === "postgres" && loaded.databaseUrl
      ? createPostgresSql(loaded.databaseUrl)
      : await createPgliteSql(loaded.pgliteDir);
  await runMaintenance(sql, loaded);
  await sql.close();
}
