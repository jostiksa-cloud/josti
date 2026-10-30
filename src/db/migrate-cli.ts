import { loadConfig } from "../config";
import { migrate } from "./migrate";
import { createPgliteSql, createPostgresSql } from "./sql";

if (import.meta.main) {
  const config = loadConfig();
  const sql =
    config.databaseMode === "postgres" && config.databaseUrl
      ? createPostgresSql(config.databaseUrl)
      : await createPgliteSql(config.pgliteDir);
  const applied = await migrate(sql);
  console.log(JSON.stringify({ applied, mode: config.databaseMode }));
  await sql.close();
}
