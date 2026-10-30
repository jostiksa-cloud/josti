import { beforeAll, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { type AppConfig, loadConfig } from "../src/config";
import { migrate } from "../src/db/migrate";
import { createPgliteSql, type Sql } from "../src/db/sql";
import { hashPassword } from "../src/lib/crypto";
import { notify } from "../src/services/notify.service";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

type ApiApp = ReturnType<typeof createApp>;

type ApiResult = {
  status: number;
  json: { data?: unknown; error?: { code?: string; details?: unknown } };
};

async function boot() {
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-must-be-at-least-32-characters",
    ALLOW_DEV_RESET_TOKEN: "true",
    ARGON_MEMORY_COST: "2048",
    DATABASE_MODE: "pglite",
    CORS_ORIGINS: "http://127.0.0.1:5173",
  });
  const sql = await createPgliteSql();
  await migrate(sql);
  return { app: createApp(sql, config), sql, config };
}

async function api(
  app: ApiApp,
  method: string,
  path: string,
  options: { token?: string; json?: unknown; form?: FormData } = {},
): Promise<ApiResult> {
  const headers = new Headers();
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  let body: string | FormData | undefined;
  if (options.json) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  if (options.form) body = options.form;
  const response = await app.request(path, { method, headers, body });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : {} };
}

function tokenOf(result: ApiResult): string {
  const token = (result.json.data as { accessToken?: unknown } | undefined)?.accessToken;
  if (typeof token !== "string")
    throw new Error(`missing token ${result.status} ${JSON.stringify(result.json)}`);
  return token;
}

const org = (type: string, legalName: string, extra: Record<string, unknown> = {}) => ({
  type,
  legalName,
  nationalAddress: "Riyadh, Olaya",
  iban: type === "merchant" ? "SA0380000000608010167519" : undefined,
  carrierKind:
    type === "carrier_company"
      ? "company"
      : type === "independent_carrier"
        ? "independent"
        : undefined,
  ...extra,
});

async function register(
  app: ApiApp,
  role: string,
  email: string,
  organization: Record<string, unknown>,
) {
  return api(app, "POST", "/api/v1/auth/register", {
    json: {
      email,
      password: "Password123",
      fullName: email,
      phone: "0550000000",
      locale: "ar",
      role,
      organization,
    },
  });
}

async function upload(
  app: ApiApp,
  token: string,
  docType: string,
  fields: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("docType", docType);
  form.set("file", new File([PNG], `${docType}.png`, { type: "image/png" }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return api(app, "POST", "/api/v1/documents", { token, form });
}

let app: ApiApp;
let sql: Sql;
let config: AppConfig;
let adminToken = "";

beforeAll(async () => {
  const started = await boot();
  app = started.app;
  sql = started.sql;
  config = started.config;
  const hash = await hashPassword("AdminPass123", config.argonMemoryCost);
  await sql.query(
    `INSERT INTO accounts (email, phone, password_hash, full_name, role, status, admin_permissions)
     VALUES ('admin@josti.test','0500000000',$1,'Platform Admin','administrator','active',$2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, admin_permissions = EXCLUDED.admin_permissions, status = 'active'`,
    [hash, ["general"]],
  );
  const login = await api(app, "POST", "/api/v1/auth/login", {
    json: { email: "admin@josti.test", password: "AdminPass123" },
  });
  adminToken = tokenOf(login);
});

test("health, migrations, and duplicate container protection", async () => {
  const health = await api(app, "GET", "/health");
  expect(health.status).toBe(200);
  const ready = await api(app, "GET", "/ready");
  expect(ready.status).toBe(200);
  const versions = await sql.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  expect(versions.map((row) => row.version)).toEqual([
    "001_schema.sql",
    "002_reference.sql",
    "003_active_trip_uniqueness.sql",
    "004_profile_avatar.sql",
    "006_integrations.sql",
  ]);
});

test("journey A and B, authorization, concurrency, fees, and evidence", async () => {
  const merchant = await register(
    app,
    "merchant",
    "merchant@josti.test",
    org("merchant", "Merchant One"),
  );
  const broker = await register(
    app,
    "customs_broker",
    "broker@josti.test",
    org("broker", "Broker One"),
  );
  const otherBroker = await register(
    app,
    "customs_broker",
    "broker2@josti.test",
    org("broker", "Broker Two"),
  );
  const carrier = await register(
    app,
    "carrier",
    "carrier@josti.test",
    org("carrier_company", "Carrier One"),
  );
  const carrierB = await register(
    app,
    "carrier",
    "carrierb@josti.test",
    org("carrier_company", "Carrier Two"),
  );
  const independent = await register(
    app,
    "carrier",
    "indie@josti.test",
    org("independent_carrier", "Indie Carrier"),
  );
  expect(merchant.status).toBe(201);
  const merchantToken = tokenOf(merchant);
  const brokerToken = tokenOf(broker);
  const otherBrokerToken = tokenOf(otherBroker);
  tokenOf(carrier);
  tokenOf(carrierB);
  tokenOf(independent);
  const merchantId = String((merchant.json.data as { account: { id: string } }).account.id);
  const brokerOrg = String(
    (broker.json.data as { account: { organizationId: string } }).account.organizationId,
  );
  const otherBrokerOrg = String(
    (otherBroker.json.data as { account: { organizationId: string } }).account.organizationId,
  );

  for (const type of [
    "commercial_registration",
    "tax_identification",
    "national_address",
    "iban_certificate",
  ]) {
    expect((await upload(app, merchantToken, type)).status).toBe(201);
  }
  for (const type of [
    "customs_clearance_license",
    "office_commercial_registration",
    "fasah_account_evidence",
    "broker_national_address",
  ]) {
    expect((await upload(app, brokerToken, type)).status).toBe(201);
    expect((await upload(app, otherBrokerToken, type)).status).toBe(201);
  }

  const vehicleDocs = [
    "vehicle_registration",
    "vehicle_operating_card",
    "operating_license",
    "insurance",
    "periodic_inspection",
  ];
  const driverDocs = ["driver_license", "residence_permit", "passport"];
  const fleet: { token: string; vehicleId: string; driverId: string }[] = [];

  await approveEverything();
  await activate(merchantId);
  const brokerUser = String((broker.json.data as { account: { id: string } }).account.id);
  const otherBrokerUser = String((otherBroker.json.data as { account: { id: string } }).account.id);
  const carrierUser = String((carrier.json.data as { account: { id: string } }).account.id);
  const carrierBUser = String((carrierB.json.data as { account: { id: string } }).account.id);
  const indieUser = String((independent.json.data as { account: { id: string } }).account.id);
  for (const id of [brokerUser, otherBrokerUser, carrierUser, carrierBUser]) await activate(id);

  const relogin = async (email: string) =>
    tokenOf(
      await api(app, "POST", "/api/v1/auth/login", { json: { email, password: "Password123" } }),
    );
  const merchantToken2 = await relogin("merchant@josti.test");
  const brokerToken2 = await relogin("broker@josti.test");
  await relogin("broker2@josti.test");
  const carrierToken2 = await relogin("carrier@josti.test");
  const carrierBToken2 = await relogin("carrierb@josti.test");
  const indieToken2 = await relogin("indie@josti.test");

  for (const [token, plate] of [
    [carrierToken2, "ABC1234"],
    [carrierBToken2, "XYZ9876"],
  ] as const) {
    const vehicle = await api(app, "POST", "/api/v1/vehicles", {
      token,
      json: {
        plateNumber: plate,
        truckType: "container_chassis",
        supportedContainerTypes: ["40ft", "20ft"],
      },
    });
    expect(vehicle.status).toBe(201);
    const vehicleId = String((vehicle.json.data as { id: string }).id);
    const driver = await api(app, "POST", "/api/v1/drivers", {
      token,
      json: {
        email: `driver-${plate}@josti.test`,
        password: "Password123",
        fullName: `Driver ${plate}`,
        phone: "0551111111",
        licenseNumber: plate,
        licenseExpiry: "2030-01-01",
      },
    });
    expect(driver.status).toBe(201);
    const driverId = String((driver.json.data as { id: string }).id);
    const driverUserId = String((driver.json.data as { userId: string }).userId);
    for (const type of vehicleDocs)
      expect((await upload(app, token, type, { vehicleId })).status).toBe(201);
    for (const type of driverDocs)
      expect((await upload(app, token, type, { driverId })).status).toBe(201);
    fleet.push({ token, vehicleId, driverId });
    await approveEverything();
    await api(app, "PATCH", `/api/v1/admin/vehicles/${vehicleId}/status`, {
      token: adminToken,
      json: { status: "active" },
    });
    await api(app, "PATCH", `/api/v1/admin/drivers/${driverId}/status`, {
      token: adminToken,
      json: { status: "active" },
    });
    await activate(driverUserId);
    expect(
      (await api(app, "POST", "/api/v1/assignments", { token, json: { vehicleId, driverId } }))
        .status,
    ).toBe(200);
    expect(
      (
        await api(app, "PATCH", `/api/v1/vehicles/${vehicleId}/availability`, {
          token,
          json: { availability: "available" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(app, "PATCH", `/api/v1/drivers/${driverId}/availability`, {
          token,
          json: { availability: "available" },
        })
      ).status,
    ).toBe(200);
  }

  const indieProfile = await api(app, "GET", "/api/v1/auth/me", { token: indieToken2 });
  const indieDriverId = String((indieProfile.json.data as { driverId: string }).driverId);
  const indieVehicle = await api(app, "POST", "/api/v1/vehicles", {
    token: indieToken2,
    json: {
      plateNumber: "IND1001",
      truckType: "container_chassis",
      supportedContainerTypes: ["40ft"],
    },
  });
  const indieVehicleId = String((indieVehicle.json.data as { id: string }).id);
  for (const type of vehicleDocs)
    expect((await upload(app, indieToken2, type, { vehicleId: indieVehicleId })).status).toBe(201);
  for (const type of driverDocs)
    expect((await upload(app, indieToken2, type, { driverId: indieDriverId })).status).toBe(201);
  await approveEverything();
  await api(app, "PATCH", `/api/v1/admin/vehicles/${indieVehicleId}/status`, {
    token: adminToken,
    json: { status: "active" },
  });
  await api(app, "PATCH", `/api/v1/admin/drivers/${indieDriverId}/status`, {
    token: adminToken,
    json: { status: "active" },
  });
  await activate(indieUser);
  const separate = await api(app, "POST", "/api/v1/drivers", {
    token: indieToken2,
    json: {
      email: "not-allowed@josti.test",
      password: "Password123",
      fullName: "Nope",
      phone: "0552222222",
      licenseNumber: "NOPE",
      licenseExpiry: "2030-01-01",
    },
  });
  expect(separate.status).toBe(403);

  expect(
    (
      await api(app, "POST", "/api/v1/brokers", {
        token: merchantToken2,
        json: { brokerOrganizationId: brokerOrg, isDefault: true },
      })
    ).status,
  ).toBe(201);
  const schedule = {
    portCode: "JED",
    containerNumber: "ABCD1234567",
    containerType: "40ft",
    truckType: "container_chassis",
    loadingLocation: "Jeddah Islamic Port gate 3",
    destination: "Riyadh warehouse 12",
    scheduledLoadingAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
    expectedDeliveryAt: new Date(Date.now() + 30 * 3600_000).toISOString(),
    instructions: "Call on arrival",
    proposedPrice: 1800,
  };
  const created = await api(app, "POST", "/api/v1/requests", {
    token: merchantToken2,
    json: { ...schedule, useDefaultBroker: true },
  });
  expect(created.status).toBe(201);
  const requestId = String((created.json.data as { id: string }).id);
  expect((created.json.data as { status: string }).status).toBe("customs_clearance");
  expect((created.json.data as { brokerOrgId: string }).brokerOrgId).toBe(brokerOrg);
  expect((created.json.data as { usedDefaultBroker: boolean }).usedDefaultBroker).toBe(true);
  const duplicate = await api(app, "POST", "/api/v1/requests", {
    token: merchantToken2,
    json: { ...schedule, useDefaultBroker: true },
  });
  expect(duplicate.status).toBe(409);

  const hidden = await api(app, "GET", `/api/v1/requests/${requestId}`, { token: carrierToken2 });
  expect(hidden.status).toBe(404);
  const availableEarly = await api(app, "GET", "/api/v1/requests/available", {
    token: carrierToken2,
  });
  expect(availableEarly.json.data).toEqual([]);

  const stranger = await register(
    app,
    "merchant",
    "other-merchant@josti.test",
    org("merchant", "Other Merchant"),
  );
  const strangerToken = tokenOf(stranger);
  expect(
    (await api(app, "GET", `/api/v1/requests/${requestId}`, { token: strangerToken })).status,
  ).toBe(404);

  expect((await upload(app, brokerToken2, "clearance_evidence", { requestId })).status).toBe(201);
  const notReady = await api(app, "POST", `/api/v1/requests/${requestId}/clearance`, {
    token: brokerToken2,
    json: { confirmReady: true },
  });
  expect(notReady.status).toBe(422);
  const cleared = await api(app, "POST", `/api/v1/requests/${requestId}/clearance`, {
    token: brokerToken2,
    json: {
      approvedPrice: 2500,
      externalPaymentConfirmed: true,
      permitsConfirmed: true,
      confirmReady: true,
      progressNote: "Cleared externally",
    },
  });
  expect(cleared.status).toBe(200);
  expect(
    (await api(app, "GET", "/api/v1/requests/available", { token: carrierToken2 })).json.data,
  ).toEqual([]);
  const financeOnly = await makeFinanceAdmin();
  expect(
    (
      await api(app, "POST", `/api/v1/requests/${requestId}/release`, {
        token: financeOnly,
        json: {},
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await api(app, "POST", `/api/v1/requests/${requestId}/release`, {
        token: adminToken,
        json: { notes: "Released after review" },
      })
    ).status,
  ).toBe(200);

  const open = await api(app, "GET", "/api/v1/requests/available", { token: carrierToken2 });
  expect((open.json.data as unknown[]).length).toBe(1);
  const priceHidden = (open.json.data as { proposedPrice?: number }[])[0];
  expect(priceHidden?.proposedPrice).toBeUndefined();
  const first = fleet[0];
  const second = fleet[1];
  if (!first || !second) throw new Error("fleet missing");
  const responseA = await api(app, "POST", `/api/v1/requests/${requestId}/responses`, {
    token: carrierToken2,
    json: { vehicleId: first.vehicleId, driverId: first.driverId },
  });
  const responseB = await api(app, "POST", `/api/v1/requests/${requestId}/responses`, {
    token: carrierBToken2,
    json: { vehicleId: second.vehicleId, driverId: second.driverId },
  });
  expect(responseA.status).toBe(201);
  expect(responseB.status).toBe(201);
  expect(
    (
      await api(app, "POST", `/api/v1/requests/${requestId}/responses`, {
        token: carrierToken2,
        json: { vehicleId: first.vehicleId, driverId: first.driverId },
      })
    ).status,
  ).toBe(409);
  const candidateNote = await api(app, "GET", "/api/v1/notifications", { token: merchantToken2 });
  expect(JSON.stringify(candidateNote.json.data)).toContain("not a final assignment");

  const responseAId = String((responseA.json.data as { id: string }).id);
  const responseBId = String((responseB.json.data as { id: string }).id);
  const [win, lose] = await Promise.all([
    api(app, "POST", `/api/v1/requests/${requestId}/select`, {
      token: merchantToken2,
      json: { responseId: responseAId },
    }),
    api(app, "POST", `/api/v1/requests/${requestId}/select`, {
      token: brokerToken2,
      json: { responseId: responseBId },
    }),
  ]);
  const statuses = [win.status, lose.status].sort();
  expect(statuses).toEqual([201, 409]);
  const winner = win.status === 201 ? win : lose;
  const tripId = String((winner.json.data as { id: string }).id);
  const tripRef = String((winner.json.data as { reference: string }).reference);
  expect(tripRef).toMatch(/^JST-\d{6}$/);
  const trips = await sql.query(`SELECT id FROM trips WHERE request_id = $1`, [requestId]);
  expect(trips.length).toBe(1);
  expect(
    (
      await api(app, "POST", `/api/v1/requests/${requestId}/cancel`, {
        token: merchantToken2,
        json: {},
      })
    ).status,
  ).toBe(409);

  const driverEmail =
    win.status === 201 ? "driver-ABC1234@josti.test" : "driver-XYZ9876@josti.test";
  const winningVehicle = win.status === 201 ? first.vehicleId : second.vehicleId;
  const driverToken = tokenOf(
    await api(app, "POST", "/api/v1/auth/login", {
      json: { email: driverEmail, password: "Password123" },
    }),
  );
  const otherDriverToken = tokenOf(
    await api(app, "POST", "/api/v1/auth/login", {
      json: {
        email: driverEmail.startsWith("driver-ABC")
          ? "driver-XYZ9876@josti.test"
          : "driver-ABC1234@josti.test",
        password: "Password123",
      },
    }),
  );
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: otherDriverToken,
        json: { toStatus: "arrived_at_port" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: driverToken,
        json: { toStatus: "loaded" },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: driverToken,
        json: { toStatus: "arrived_at_port" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: driverToken,
        json: { toStatus: "loaded" },
      })
    ).status,
  ).toBe(409);
  expect((await upload(app, driverToken, "loading_photo", { tripId })).status).toBe(201);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: driverToken,
        json: { toStatus: "loaded" },
      })
    ).status,
  ).toBe(200);
  for (const status of ["trip_started", "in_transit", "arrived_at_destination"]) {
    expect(
      (
        await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
          token: driverToken,
          json: { toStatus: status },
        })
      ).status,
    ).toBe(200);
  }
  const now = new Date().toISOString();
  const older = new Date(Date.now() - 60_000).toISOString();
  const ping = await api(app, "POST", "/api/v1/tracking", {
    token: driverToken,
    json: {
      tripId,
      vehicleId: winningVehicle,
      latitude: 21.49,
      longitude: 39.19,
      recordedAt: now,
      accuracyM: 12,
    },
  });
  expect(ping.status).toBe(200);
  const stalePing = await api(app, "POST", "/api/v1/tracking", {
    token: driverToken,
    json: { tripId, vehicleId: winningVehicle, latitude: 21.2, longitude: 39.0, recordedAt: older },
  });
  expect((stalePing.json.data as { applied: boolean }).applied).toBe(false);
  const track = await api(app, "GET", `/api/v1/trips/${tripId}/tracking`, {
    token: merchantToken2,
  });
  expect((track.json.data as { stale: boolean }).stale).toBe(false);
  expect(
    (await api(app, "GET", `/api/v1/trips/${tripId}/tracking`, { token: strangerToken })).status,
  ).toBe(404);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: driverToken,
        json: {
          toStatus: "delivered",
          recipientName: "Noura",
          deliveredAt: new Date().toISOString(),
        },
      })
    ).status,
  ).toBe(409);
  expect((await upload(app, driverToken, "delivery_note", { tripId })).status).toBe(201);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: driverToken,
        json: {
          toStatus: "delivered",
          recipientName: "Noura Saleh",
          deliveredAt: new Date().toISOString(),
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: driverToken,
        json: { toStatus: "closed" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: adminToken,
        json: { toStatus: "closed" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/transition`, {
        token: adminToken,
        json: { toStatus: "closed" },
      })
    ).status,
  ).toBe(409);
  const fees = await sql.query(`SELECT id, status, amount FROM platform_fees WHERE trip_id = $1`, [
    tripId,
  ]);
  expect(fees.length).toBe(1);
  expect(fees[0]).toMatchObject({ status: "pending", amount: 50 });
  let duplicateFee = false;
  try {
    await sql.query(
      `INSERT INTO platform_fees (trip_id, amount, currency, status) VALUES ($1, 50, 'SAR', 'pending')`,
      [tripId],
    );
  } catch {
    duplicateFee = true;
  }
  expect(duplicateFee).toBe(true);

  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/ratings`, {
        token: merchantToken2,
        json: { tripId, targetRole: "carrier", score: 5, comment: "On time" },
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/ratings`, {
        token: merchantToken2,
        json: { tripId, targetRole: "carrier", score: 4 },
      })
    ).status,
  ).toBe(409);
  const carrierRater = win.status === 201 ? carrierToken2 : carrierBToken2;
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/ratings`, {
        token: carrierRater,
        json: { tripId, targetRole: "merchant", score: 4 },
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await api(app, "POST", `/api/v1/trips/${tripId}/ratings`, {
        token: brokerToken2,
        json: { tripId, targetRole: "carrier", score: 5 },
      })
    ).status,
  ).toBe(201);
  const incident = await api(app, "POST", `/api/v1/trips/${tripId}/incidents`, {
    token: merchantToken2,
    json: { tripId, incidentType: "delay", description: "Arrival window slipped by two hours" },
  });
  expect(incident.status).toBe(201);
  const incidentId = String((incident.json.data as { id: string }).id);
  expect(
    (
      await api(app, "POST", `/api/v1/admin/incidents/${incidentId}/resolve`, {
        token: adminToken,
        json: { status: "resolved", resolution: "Noted, no penalty" },
      })
    ).status,
  ).toBe(200);
  const tripAfterIncident = await api(app, "GET", `/api/v1/trips/${tripId}`, {
    token: merchantToken2,
  });
  expect((tripAfterIncident.json.data as { status: string }).status).toBe("closed");

  const feeId = String((fees[0] as { id: string }).id);
  expect(
    (
      await api(app, "POST", `/api/v1/admin/fees/${feeId}/settlements`, {
        token: merchantToken2,
        json: { externalReference: "BANK-1" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await api(app, "POST", `/api/v1/admin/fees/${feeId}/settlements`, {
        token: adminToken,
        json: { externalReference: "BANK-1" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api(app, "POST", `/api/v1/admin/fees/${feeId}/settlements`, {
        token: adminToken,
        json: { externalReference: "BANK-2" },
      })
    ).status,
  ).toBe(409);

  const chosen = await api(app, "POST", "/api/v1/requests", {
    token: merchantToken2,
    json: {
      ...schedule,
      containerNumber: "EFGH7654321",
      brokerOrganizationId: otherBrokerOrg,
      useDefaultBroker: false,
    },
  });
  expect(chosen.status).toBe(201);
  expect((chosen.json.data as { brokerOrgId: string }).brokerOrgId).toBe(otherBrokerOrg);
  expect((chosen.json.data as { usedDefaultBroker: boolean }).usedDefaultBroker).toBe(false);

  const suspended = await api(app, "PATCH", `/api/v1/admin/users/${merchantId}/status`, {
    token: adminToken,
    json: { status: "suspended", reason: "Review" },
  });
  expect(suspended.status).toBe(200);
  const merchantToken3 = tokenOf(
    await api(app, "POST", "/api/v1/auth/login", {
      json: { email: "merchant@josti.test", password: "Password123" },
    }),
  );
  expect(
    (
      await api(app, "POST", "/api/v1/requests", {
        token: merchantToken3,
        json: { ...schedule, containerNumber: "IJKL1234567", useDefaultBroker: true },
      })
    ).status,
  ).toBe(403);

  const reset = await api(app, "POST", "/api/v1/auth/forgot-password", {
    json: { email: "broker@josti.test" },
  });
  const devToken = String((reset.json.data as { devToken?: unknown } | undefined)?.devToken);
  expect(
    (
      await api(app, "POST", "/api/v1/auth/reset-password", {
        json: { token: devToken, password: "Password1234" },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api(app, "POST", "/api/v1/auth/login", {
        json: { email: "broker@josti.test", password: "Password123" },
      })
    ).status,
  ).toBe(401);

  const publicMap = await api(app, "GET", "/api/v1/public/map?port=JED");
  const mapBody = JSON.stringify(publicMap.json.data);
  expect(mapBody).not.toContain("055");
  if ((publicMap.json.data as { latitude?: number }[]).length > 0) {
    const point = (publicMap.json.data as { latitude: number }[])[0];
    expect(String(point?.latitude).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  }
}, 120000);

async function approveEverything() {
  const docs = await sql.query<{ id: string }>(`SELECT id FROM documents WHERE status = 'pending'`);
  for (const doc of docs) {
    const review = await api(app, "POST", `/api/v1/documents/${doc.id}/review`, {
      token: adminToken,
      json: { decision: "approved" },
    });
    expect(review.status).toBe(200);
  }
}

async function activate(userId: string) {
  const verified = await api(app, "PATCH", `/api/v1/admin/users/${userId}/status`, {
    token: adminToken,
    json: { status: "verified" },
  });
  expect(verified.status).toBe(200);
  const active = await api(app, "PATCH", `/api/v1/admin/users/${userId}/status`, {
    token: adminToken,
    json: { status: "active" },
  });
  if (active.status !== 200)
    throw new Error(`activate failed ${active.status} ${JSON.stringify(active.json)}`);
}

async function makeFinanceAdmin() {
  const hash = await hashPassword("FinancePass123", config.argonMemoryCost);
  await sql.query(
    `INSERT INTO accounts (email, phone, password_hash, full_name, role, status, admin_permissions)
     VALUES ('finance@josti.test','0500000001',$1,'Finance Admin','administrator','active',$2)`,
    [hash, ["finance"]],
  );
  return tokenOf(
    await api(app, "POST", "/api/v1/auth/login", {
      json: { email: "finance@josti.test", password: "FinancePass123" },
    }),
  );
}

test("administrators can save integration data without revealing secrets", async () => {
  const listed = await api(app, "GET", "/api/v1/admin/integrations", { token: adminToken });
  expect(listed.status).toBe(200);
  const rows = listed.json.data as Array<{ code: string; fields: Array<{ key: string; secret: boolean; value: string }> }>;
  expect(rows.some((row) => row.code === "map")).toBe(true);
  const saved = await api(app, "PATCH", "/api/v1/admin/integrations/fcm", {
    token: adminToken,
    json: {
      enabled: true,
      publicConfig: { endpoint: "https://fcm.googleapis.com/fcm/send" },
      secrets: { serverKey: "super-secret-server-key" },
    },
  });
  expect(saved.status).toBe(200);
  const secret = (saved.json.data as { fields: Array<{ key: string; value: string; configured: boolean; hint: string }> }).fields.find(
    (field) => field.key === "serverKey",
  );
  expect(secret?.value).toBe("");
  expect(secret?.configured).toBe(true);
  expect(secret?.hint.endsWith("key")).toBe(true);
  expect(JSON.stringify(saved.json)).not.toContain("super-secret-server-key");
  const created = await api(app, "POST", "/api/v1/admin/integrations", {
    token: adminToken,
    json: {
      nameEn: "Port community",
      nameAr: "مجتمع الميناء",
      category: "operations",
      endpoint: "https://example.com/port",
      enabled: true,
      publicConfig: { clientId: "port-client" },
      secrets: { apiKey: "port-secret-value" },
    },
  });
  expect(created.status).toBe(201);
  const code = (created.json.data as { code: string }).code;
  const removed = await api(app, "DELETE", `/api/v1/admin/integrations/${code}`, { token: adminToken });
  expect(removed.status).toBe(200);
  const builtin = await api(app, "DELETE", "/api/v1/admin/integrations/map", { token: adminToken });
  expect(builtin.status).toBe(404);
});

test("push provider errors disable invalid tokens and are not marked sent", async () => {
  const mock = Bun.serve({
    port: 0,
    fetch() {
      return Response.json({ failure: 1, results: [{ error: "NotRegistered" }] });
    },
  });
  const mockEndpoint = `http://127.0.0.1:${mock.port}`;
  const pushed = {
    ...config,
    fcmServerKey: "test-key",
    fcmEndpoint: mockEndpoint,
  };
  // Prefer the local mock over any FCM endpoint saved by earlier admin integration tests.
  await sql.query(
    `UPDATE integrations
     SET endpoint = $1,
         public_config = COALESCE(public_config, '{}'::jsonb) || jsonb_build_object('endpoint', $1::text),
         secrets = COALESCE(secrets, '{}'::jsonb) || jsonb_build_object('serverKey', 'test-key'),
         enabled = true
     WHERE code = 'fcm'`,
    [mockEndpoint],
  );
  const user = await sql.query<{ id: string }>(
    `SELECT id FROM accounts WHERE email = 'admin@josti.test'`,
  );
  const userId = user[0]?.id;
  if (!userId) throw new Error("admin missing");
  await sql.query(
    `INSERT INTO push_tokens (user_id, platform, token) VALUES ($1, 'android', 'dead-token')
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, disabled_at = NULL, last_error = NULL`,
    [userId],
  );
  await notify(sql, pushed, {
    userIds: [userId],
    type: "provider_test",
    titleEn: "Test",
    titleAr: "اختبار",
    bodyEn: "Body",
    bodyAr: "النص",
    dedupeKey: "provider-test",
  });
  const notes = await sql.query<{ pushStatus: string }>(
    `SELECT push_status FROM notifications WHERE user_id = $1 AND dedupe_key = 'provider-test'`,
    [userId],
  );
  expect(notes[0]?.pushStatus).toBe("failed");
  const tokens = await sql.query<{ disabledAt: string | null }>(
    `SELECT disabled_at FROM push_tokens WHERE token = 'dead-token'`,
  );
  expect(tokens[0]?.disabledAt).toBeTruthy();
  mock.stop(true);
});
