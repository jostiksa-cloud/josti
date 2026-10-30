import { writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const TABLES = [
  "organizations",
  "accounts",
  "merchant_broker_links",
  "drivers",
  "vehicles",
  "driver_vehicle_assignments",
  "transport_requests",
  "carrier_responses",
  "trips",
  "incidents",
  "documents",
  "customs_clearance_records",
  "status_events",
  "loading_evidence",
  "delivery_records",
  "ratings",
  "platform_fees",
  "settlements",
  "vehicle_locations",
  "location_updates",
  "notifications",
  "platform_settings",
  "audit_logs",
] as const;

const CONFLICT: Record<string, string> = {
  vehicle_locations: "vehicle_id",
  platform_settings: "id",
};

function literal(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) return `ARRAY[${value.map((item) => literal(item)).join(",")}]::text[]`;
  if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

const db = new PGlite(process.env.PGLITE_DIR || "./data/pglite");
await db.waitReady;
const chunks = [
  "-- Sample JOSTI data for an empty Supabase database.",
  "-- Apply migrations 001 through 004 first, then run this file once in the SQL editor.",
  "-- Demo logins: admin@josti.test / AdminPass123. Every other account uses Password123.",
  "-- Document rows point at local files. Upload those files again after Storage is connected.",
];
for (const table of TABLES) {
  const result = await db.query<Record<string, unknown>>(`SELECT * FROM ${table}`);
  if (!result.rows.length) continue;
  const columns = Object.keys(result.rows[0] ?? {});
  const conflict = CONFLICT[table] ?? "id";
  for (const row of result.rows) {
    const names = columns.map((column) => `"${column}"`).join(", ");
    const values = columns.map((column) => literal(row[column])).join(", ");
    chunks.push(
      `INSERT INTO ${table} (${names}) VALUES (${values}) ON CONFLICT (${conflict}) DO NOTHING;`,
    );
  }
}
const target = "migrations/005_demo_data.sql";
await writeFile(target, `${chunks.join("\n")}\n`);
console.log(`${target} ${chunks.length} statements`);
await db.close();
