import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const r = await db.query("select gen_random_uuid() as id, now() as ts");
console.log(r.rows);
await db.exec(
  "create table t(id uuid primary key default gen_random_uuid(), tags text[] not null, price numeric(12,2) not null); insert into t(tags, price) values (array['a','b'], 50);",
);
const q = await db.query("select * from t");
console.log(JSON.stringify(q.rows));
await db.close();
