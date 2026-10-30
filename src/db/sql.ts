import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

const MONEY = /price|amount|avg|fee/i;

export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function camelize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const key = rawKey.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    if (value instanceof Date) out[key] = value.toISOString();
    else if (typeof value === "string" && MONEY.test(key) && /^-?\d+(\.\d+)?$/.test(value))
      out[key] = Number(value);
    else out[key] = value;
  }
  return out;
}

function mapRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => camelize(row) as T);
}

type PgQueryable = {
  unsafe: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  begin?: <T>(fn: (tx: PgQueryable) => Promise<T>) => Promise<T>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

function wrapPostgres(client: PgQueryable, close?: () => Promise<void>): Sql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await client.unsafe(text, params);
      return mapRows<T>(rows);
    },
    async exec(text: string) {
      await client.unsafe(text);
    },
    async begin<T>(fn: (tx: Sql) => Promise<T>) {
      if (!client.begin) throw new Error("Nested transactions are not supported");
      return client.begin((tx) => fn(wrapPostgres(tx)));
    },
    async close() {
      if (close) await close();
    },
  };
}

export function createPostgresSql(databaseUrl: string): Sql {
  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
    onnotice: () => undefined,
    connection: { application_name: "josti" },
  });
  return wrapPostgres(client as unknown as PgQueryable, () => client.end({ timeout: 5 }));
}

export async function createPgliteSql(dataDir?: string): Promise<Sql> {
  const db = new PGlite(dataDir);
  await db.waitReady;
  const wrap = (queryable: {
    query: PGlite["query"];
    exec: PGlite["exec"];
    transaction?: PGlite["transaction"];
  }): Sql => ({
    async query<T>(text: string, params: unknown[] = []) {
      const result = await queryable.query<Record<string, unknown>>(text, params);
      return mapRows<T>(result.rows);
    },
    async exec(text: string) {
      await queryable.exec(text);
    },
    async begin<T>(fn: (tx: Sql) => Promise<T>) {
      return db.transaction((tx) => fn(wrap(tx)));
    },
    async close() {
      await db.close();
    },
  });
  return wrap(db);
}

export function splitSql(script: string): string[] {
  const statements: string[] = [];
  let buffer = "";
  let dollar: string | null = null;
  let i = 0;
  while (i < script.length) {
    if (!dollar && script.startsWith("--", i)) {
      const newline = script.indexOf("\n", i);
      i = newline === -1 ? script.length : newline + 1;
      continue;
    }
    if (script[i] === "'") {
      buffer += script[i];
      i += 1;
      while (i < script.length) {
        buffer += script[i];
        if (script[i] === "'" && script[i + 1] === "'") {
          buffer += script[i + 1];
          i += 2;
          continue;
        }
        if (script[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (script[i] === "$") {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(script.slice(i));
      if (match) {
        const tag = match[0];
        if (!dollar) dollar = tag;
        else if (dollar === tag) dollar = null;
        buffer += tag;
        i += tag.length;
        continue;
      }
    }
    if (!dollar && script[i] === ";") {
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = "";
      i += 1;
      continue;
    }
    buffer += script[i];
    i += 1;
  }
  const rest = buffer.trim();
  if (rest) statements.push(rest);
  return statements;
}
