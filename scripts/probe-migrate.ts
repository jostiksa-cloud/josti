import { migrate } from "../src/db/migrate";
import { createPgliteSql } from "../src/db/sql";

const sql = await createPgliteSql();
const applied = await migrate(sql);
console.log("applied", applied);
const ports = await sql.query("SELECT code, name_en FROM ports ORDER BY code");
console.log(ports);
const dup = sql.query(
  "INSERT INTO transport_requests (reference, merchant_org_id, merchant_user_id, broker_org_id, port_code, container_number, container_type, truck_type, loading_location, destination, scheduled_loading_at, expected_delivery_at, status) VALUES ('X', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'JED', 'ABCD1234567', '40ft', 'flatbed', 'Port', 'Warehouse', now(), now() + interval '1 day', 'customs_clearance')",
);
await dup.catch((error) =>
  console.log("expected fk or similar", (error as Error).message.slice(0, 180)),
);
await sql.close();
