import { loadConfig } from "../src/config";
import { migrate } from "../src/db/migrate";
import { createPgliteSql, createPostgresSql } from "../src/db/sql";
import { hashPassword } from "../src/lib/crypto";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const name = process.env.ADMIN_NAME || "JOSTI Administrator";
const permissions = (process.env.ADMIN_PERMISSIONS || "general")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
if (!email || password.length < 10) {
  throw new Error(
    "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) in the environment. The password is not stored in the repository.",
  );
}
const config = loadConfig();
const sql =
  config.databaseMode === "postgres" && config.databaseUrl
    ? createPostgresSql(config.databaseUrl)
    : await createPgliteSql(config.pgliteDir);
await migrate(sql);
const passwordHash = await hashPassword(password, config.argonMemoryCost);
await sql.query(
  `INSERT INTO accounts (email, phone, password_hash, full_name, role, status, admin_permissions)
   VALUES ($1, '0500000000', $2, $3, 'administrator', 'active', $4)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, admin_permissions = EXCLUDED.admin_permissions, status = 'active'`,
  [email, passwordHash, name, permissions],
);
console.log(`Administrator ${email} is active with permissions: ${permissions.join(", ")}`);
await sql.close();
