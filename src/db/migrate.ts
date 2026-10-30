import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../logger";
import { type Sql, splitSql } from "./sql";

export async function migrate(
  sql: Sql,
  migrationsDir = join(process.cwd(), "migrations"),
  options: { includeDemoData?: boolean } = {},
): Promise<string[]> {
  const includeDemoData =
    options.includeDemoData ??
    (process.env.NODE_ENV !== "test" && process.env.JOSTI_SKIP_DEMO_DATA !== "1");
  const reg = await sql.query<{ name: string | null }>(
    "SELECT to_regclass('public.schema_migrations') AS name",
  );
  const applied = new Set<string>();
  if (reg[0]?.name) {
    const rows = await sql.query<{ version: string }>("SELECT version FROM schema_migrations");
    for (const row of rows) applied.add(row.version);
  }
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => includeDemoData || !name.includes("demo_data"))
    .sort();
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const script = await readFile(join(migrationsDir, file), "utf8");
    const statements = splitSql(script);
    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.exec(statement);
      }
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
    });
    newlyApplied.push(file);
    log("info", "migration applied", { version: file });
  }
  return newlyApplied;
}
