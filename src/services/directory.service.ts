import type { Sql } from "../db/sql";
import { hashPassword, joinCode } from "../lib/crypto";
import { AppError, isUniqueViolation } from "../lib/errors";
import type { Actor } from "./access";
import { assertNotSuspended, requireActive, requireRoles, sameOrg } from "./access";

export async function updateProfile(sql: Sql, actor: Actor, patch: ProfilePatch) {
  if (actor.status === "suspended")
    throw new AppError(403, "SUSPENDED", "This account is suspended");
  await sql.query(
    `UPDATE accounts SET
      full_name = COALESCE($2, full_name),
      full_name_ar = COALESCE($3, full_name_ar),
      phone = COALESCE($4, phone),
      preferred_locale = COALESCE($5, preferred_locale)
     WHERE id = $1`,
    [
      actor.id,
      patch.fullName ?? null,
      patch.fullNameAr ?? null,
      patch.phone ?? null,
      patch.locale ?? null,
    ],
  );
  if (actor.organizationId) {
    await sql.query(
      `UPDATE organizations SET
        legal_name = COALESCE($2, legal_name),
        legal_name_ar = COALESCE($3, legal_name_ar),
        commercial_registration = COALESCE($4, commercial_registration),
        tax_id = COALESCE($5, tax_id),
        national_address = COALESCE($6, national_address),
        iban = COALESCE($7, iban),
        phone = COALESCE($8, phone),
        supported_ports = COALESCE($9, supported_ports),
        service_regions = COALESCE($10, service_regions)
       WHERE id = $1`,
      [
        actor.organizationId,
        patch.legalName ?? null,
        patch.legalNameAr ?? null,
        patch.commercialRegistration ?? null,
        patch.taxId ?? null,
        patch.nationalAddress ?? null,
        patch.iban ?? null,
        patch.phone ?? null,
        patch.supportedPorts ?? null,
        patch.serviceRegions ?? null,
      ],
    );
  }
}

export async function linkBroker(
  sql: Sql,
  actor: Actor,
  brokerOrganizationId: string,
  isDefault: boolean,
) {
  requireActive(actor);
  requireRoles(actor, ["merchant"]);
  const brokers = await sql.query<{ id: string; type: string; status: string }>(
    `SELECT id, type, status FROM organizations WHERE id = $1`,
    [brokerOrganizationId],
  );
  const broker = brokers[0];
  if (!broker || broker.type !== "broker" || broker.status !== "active") {
    throw new AppError(422, "BROKER_NOT_AVAILABLE", "Choose a verified, active customs broker");
  }
  await sql.begin(async (tx) => {
    if (isDefault && actor.organizationId) {
      await tx.query(
        `UPDATE merchant_broker_links SET is_default = false WHERE merchant_org_id = $1 AND status = 'active'`,
        [actor.organizationId],
      );
    }
    await tx.query(
      `INSERT INTO merchant_broker_links (merchant_org_id, broker_org_id, is_default)
       VALUES ($1, $2, $3)
       ON CONFLICT (merchant_org_id, broker_org_id)
       DO UPDATE SET is_default = EXCLUDED.is_default, status = 'active'`,
      [actor.organizationId, brokerOrganizationId, isDefault],
    );
  });
}

export async function listBrokerLinks(sql: Sql, actor: Actor) {
  requireRoles(actor, ["merchant"]);
  return sql.query(
    `SELECT l.id, l.broker_org_id, l.is_default, o.legal_name, o.legal_name_ar, o.supported_ports, o.status
     FROM merchant_broker_links l
     JOIN organizations o ON o.id = l.broker_org_id
     WHERE l.merchant_org_id = $1 AND l.status = 'active'
     ORDER BY l.is_default DESC, o.legal_name`,
    [actor.organizationId],
  );
}

export async function createVehicle(sql: Sql, actor: Actor, input: VehicleInput) {
  assertNotSuspended(actor);
  requireRoles(actor, ["carrier"]);
  try {
    const rows = await sql.query(
      `INSERT INTO vehicles
        (organization_id, plate_number, truck_type, supported_container_types, registration_expiry, insurance_expiry, inspection_expiry, operating_card_expiry, public_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        actor.organizationId,
        input.plateNumber,
        input.truckType,
        input.supportedContainerTypes,
        input.registrationExpiry ?? null,
        input.insuranceExpiry ?? null,
        input.inspectionExpiry ?? null,
        input.operatingCardExpiry ?? null,
        input.plateNumber.slice(-4),
      ],
    );
    return rows[0];
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(409, "PLATE_IN_USE", "This plate number is already registered");
    throw error;
  }
}

export async function listVehicles(sql: Sql, actor: Actor) {
  requireRoles(actor, ["carrier", "driver", "administrator"]);
  if (actor.role === "administrator")
    return sql.query(`SELECT * FROM vehicles ORDER BY created_at DESC LIMIT 200`);
  return sql.query(`SELECT * FROM vehicles WHERE organization_id = $1 ORDER BY created_at DESC`, [
    actor.organizationId,
  ]);
}

export async function setAvailability(
  sql: Sql,
  actor: Actor,
  kind: "vehicle" | "driver",
  id: string,
  availability: string,
) {
  requireActive(actor);
  if (kind === "vehicle") {
    requireRoles(actor, ["carrier"]);
    const rows = await sql.query<{ organizationId: string }>(
      `SELECT organization_id FROM vehicles WHERE id = $1`,
      [id],
    );
    if (!rows[0] || !sameOrg(actor, rows[0].organizationId))
      throw new AppError(404, "NOT_FOUND", "Vehicle not found");
    await sql.query(`UPDATE vehicles SET availability = $2 WHERE id = $1`, [id, availability]);
    return;
  }
  if (actor.role !== "carrier" && actor.driverId !== id) {
    throw new AppError(403, "FORBIDDEN", "You cannot change this driver availability");
  }
  const rows = await sql.query<{ organizationId: string }>(
    `SELECT organization_id FROM drivers WHERE id = $1`,
    [id],
  );
  if (!rows[0] || !sameOrg(actor, rows[0].organizationId))
    throw new AppError(404, "NOT_FOUND", "Driver not found");
  await sql.query(`UPDATE drivers SET availability = $2 WHERE id = $1`, [id, availability]);
}

export async function createDriverAccount(
  sql: Sql,
  actor: Actor,
  input: DriverCreate,
  memoryCost: number,
) {
  assertNotSuspended(actor);
  requireRoles(actor, ["carrier"]);
  if (actor.organizationType !== "carrier_company") {
    throw new AppError(
      403,
      "INDEPENDENT_RESTRICTION",
      "Independent carriers cannot add separate driver accounts",
    );
  }
  const passwordHash = await hashPassword(input.password, memoryCost);
  try {
    return await sql.begin(async (tx) => {
      const accounts = await tx.query<{ id: string }>(
        `INSERT INTO accounts (email, phone, password_hash, full_name, full_name_ar, role, status, organization_id)
         VALUES (lower($1),$2,$3,$4,$5,'driver','pending_verification',$6) RETURNING id`,
        [
          input.email,
          input.phone,
          passwordHash,
          input.fullName,
          input.fullNameAr ?? null,
          actor.organizationId,
        ],
      );
      const userId = accounts[0]?.id;
      if (!userId) throw new AppError(500, "ACCOUNT_FAILED", "Could not create the driver");
      const drivers = await tx.query(
        `INSERT INTO drivers (user_id, organization_id, license_number, license_expiry, status)
         VALUES ($1,$2,$3,$4,'pending_verification') RETURNING *`,
        [userId, actor.organizationId, input.licenseNumber, input.licenseExpiry],
      );
      return drivers[0];
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists");
    throw error;
  }
}

export async function listDrivers(sql: Sql, actor: Actor) {
  requireRoles(actor, ["carrier", "administrator"]);
  if (actor.role === "administrator") {
    return sql.query(
      `SELECT d.*, a.full_name, a.email, a.phone, a.status AS account_status FROM drivers d JOIN accounts a ON a.id = d.user_id ORDER BY d.created_at DESC LIMIT 200`,
    );
  }
  return sql.query(
    `SELECT d.*, a.full_name, a.email, a.status AS account_status FROM drivers d JOIN accounts a ON a.id = d.user_id WHERE d.organization_id = $1`,
    [actor.organizationId],
  );
}

export async function assignDriverVehicle(
  sql: Sql,
  actor: Actor,
  driverId: string,
  vehicleId: string,
) {
  assertNotSuspended(actor);
  requireRoles(actor, ["carrier"]);
  const drivers = await sql.query<{ organizationId: string }>(
    `SELECT organization_id FROM drivers WHERE id = $1`,
    [driverId],
  );
  const vehicles = await sql.query<{ organizationId: string }>(
    `SELECT organization_id FROM vehicles WHERE id = $1`,
    [vehicleId],
  );
  if (
    !drivers[0] ||
    !vehicles[0] ||
    !sameOrg(actor, drivers[0].organizationId) ||
    !sameOrg(actor, vehicles[0].organizationId)
  ) {
    throw new AppError(404, "NOT_FOUND", "Driver or vehicle not found in your organization");
  }
  if (
    actor.organizationType === "independent_carrier" &&
    drivers[0].organizationId !== actor.organizationId
  ) {
    throw new AppError(
      403,
      "INDEPENDENT_RESTRICTION",
      "Independent carriers can assign only their own vehicle and driver profile",
    );
  }
  await sql.begin(async (tx) => {
    await tx.query(
      `UPDATE driver_vehicle_assignments SET is_current = false, unassigned_at = now()
       WHERE is_current = true AND (driver_id = $1 OR vehicle_id = $2)`,
      [driverId, vehicleId],
    );
    await tx.query(
      `INSERT INTO driver_vehicle_assignments (driver_id, vehicle_id, assigned_by, is_current) VALUES ($1,$2,$3,true)`,
      [driverId, vehicleId, actor.id],
    );
  });
}

export async function rotateJoinCode(sql: Sql, actor: Actor) {
  requireActive(actor);
  requireRoles(actor, ["carrier"]);
  if (actor.organizationType !== "carrier_company") {
    throw new AppError(
      403,
      "INDEPENDENT_RESTRICTION",
      "Independent carriers do not use driver join codes",
    );
  }
  const code = joinCode();
  await sql.query(`UPDATE organizations SET join_code = $2 WHERE id = $1`, [
    actor.organizationId,
    code,
  ]);
  return { joinCode: code };
}

export type DriverCreate = {
  email: string;
  password: string;
  fullName: string;
  fullNameAr?: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
};

export type VehicleInput = {
  plateNumber: string;
  truckType: string;
  supportedContainerTypes: string[];
  registrationExpiry?: string;
  insuranceExpiry?: string;
  inspectionExpiry?: string;
  operatingCardExpiry?: string;
};

export type ProfilePatch = {
  fullName?: string;
  fullNameAr?: string;
  phone?: string;
  locale?: "ar" | "en";
  legalName?: string;
  legalNameAr?: string;
  commercialRegistration?: string;
  taxId?: string;
  nationalAddress?: string;
  iban?: string;
  supportedPorts?: string[];
  serviceRegions?: string[];
};
