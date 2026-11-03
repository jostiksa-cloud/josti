import { TRIP_TRANSITIONS } from "@josti/contracts";
import type { AppConfig } from "../config";
import type { Sql } from "../db/sql";
import { AppError, isUniqueViolation } from "../lib/errors";
import type { Actor } from "./access";
import { requireActive, requirePermission, requireRoles, sameOrg } from "./access";
import { notify } from "./notify.service";

type RequestRow = {
  id: string;
  reference: string;
  merchantOrgId: string;
  merchantUserId: string;
  brokerOrgId: string;
  usedDefaultBroker: boolean;
  portCode: string;
  containerNumber: string;
  containerType: string;
  truckType: string;
  loadingLocation: string;
  destination: string;
  scheduledLoadingAt: string;
  expectedDeliveryAt: string;
  instructions: string | null;
  proposedPrice: number | null;
  approvedPrice: number | null;
  currency: string;
  status: string;
  externalPaymentConfirmed: boolean;
  permitsConfirmed: boolean;
  brokerReadyAt: string | null;
  releasedAt: string | null;
  releaseNotes: string | null;
  returnedReason: string | null;
  createdAt: string;
};

type TripRow = {
  id: string;
  reference: string;
  requestId: string;
  carrierOrgId: string;
  carrierUserId: string;
  driverId: string;
  vehicleId: string;
  responseId: string;
  agreedPrice: number;
  currency: string;
  confirmedBy: string;
  confirmedAt: string;
  status: string;
  closedBy: string | null;
  closedAt: string | null;
};

const ELIGIBLE_SQL = `
SELECT v.id AS vehicle_id, dr.id AS driver_id, o.id AS organization_id, a.id AS carrier_user_id,
       o.legal_name, o.rating_avg, o.rating_count, v.truck_type, v.plate_number,
       v.availability AS vehicle_availability, dr.availability AS driver_availability,
       loc.latitude, loc.longitude, loc.recorded_at,
       p.latitude AS port_latitude, p.longitude AS port_longitude
FROM transport_requests r
JOIN ports p ON p.code = r.port_code
JOIN vehicles v ON v.truck_type = r.truck_type AND r.container_type = ANY (v.supported_container_types)
JOIN organizations o ON o.id = v.organization_id
JOIN accounts a ON a.organization_id = o.id AND a.role = 'carrier' AND a.status = 'active'
JOIN driver_vehicle_assignments asg ON asg.vehicle_id = v.id AND asg.is_current = true
JOIN drivers dr ON dr.id = asg.driver_id AND dr.organization_id = o.id AND dr.status = 'active'
LEFT JOIN vehicle_locations loc ON loc.vehicle_id = v.id
WHERE r.id = $1
  AND ($2::uuid IS NULL OR o.id = $2::uuid)
  AND ($3::uuid IS NULL OR v.id = $3::uuid)
  AND ($4::uuid IS NULL OR dr.id = $4::uuid)
  AND o.status = 'active'
  AND o.type IN ('carrier_company', 'independent_carrier')
  AND v.status = 'active'
  AND r.port_code = ANY (o.service_regions)
  AND v.availability IN ('available', 'waiting')
  AND dr.availability IN ('available', 'waiting')
  AND EXISTS (
    SELECT 1 FROM truck_container_compatibility c
    WHERE c.truck_type = v.truck_type AND c.container_type = r.container_type
  )
  AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.vehicle_id = v.id AND t.status <> 'closed')
  AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = dr.id AND t.status <> 'closed')
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('vehicle_registration'), ('vehicle_operating_card'), ('operating_license'), ('insurance'), ('periodic_inspection')
    ) AS required(doc_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM documents d
      WHERE d.vehicle_id = v.id AND d.doc_type = required.doc_type AND d.status = 'approved'
        AND (d.expires_on IS NULL OR d.expires_on >= CURRENT_DATE)
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES ('driver_license'), ('residence_permit'), ('passport')) AS required(doc_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM documents d
      WHERE d.driver_id = dr.id AND d.doc_type = required.doc_type AND d.status = 'approved'
        AND (d.expires_on IS NULL OR d.expires_on >= CURRENT_DATE)
    )
  )
`;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

type Eligible = {
  vehicleId: string;
  driverId: string;
  organizationId: string;
  carrierUserId: string;
  legalName: string;
  ratingAvg: number;
  ratingCount: number;
  truckType: string;
  plateNumber: string;
  latitude: number | null;
  longitude: number | null;
  recordedAt: string | null;
  portLatitude: number;
  portLongitude: number;
};

async function eligible(
  sql: Sql,
  requestId: string,
  orgId: string | null,
  vehicleId: string | null,
  driverId: string | null,
) {
  return sql.query<Eligible>(ELIGIBLE_SQL, [requestId, orgId, vehicleId, driverId]);
}

function rankEligible(rows: Eligible[]) {
  const freshMs = 6 * 60 * 60 * 1000;
  return rows
    .map((row) => {
      const fresh = !!row.recordedAt && Date.now() - new Date(row.recordedAt).getTime() < freshMs;
      const distanceKm =
        fresh && row.latitude != null && row.longitude != null
          ? Math.round(
              haversine(row.portLatitude, row.portLongitude, row.latitude, row.longitude) * 10,
            ) / 10
          : null;
      return { ...row, distanceKm, plateNumber: undefined, publicPlate: row.plateNumber.slice(-4) };
    })
    .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999) || b.ratingAvg - a.ratingAvg);
}

async function recordStatus(
  sql: Sql,
  input: {
    entityType: "request" | "trip";
    entityId: string;
    requestId?: string | null;
    tripId?: string | null;
    previous: string | null;
    next: string;
    actorId: string;
    reason?: string | null;
  },
) {
  await sql.query(
    `INSERT INTO status_events (entity_type, entity_id, request_id, trip_id, previous_status, new_status, actor_user_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.entityType,
      input.entityId,
      input.requestId ?? null,
      input.tripId ?? null,
      input.previous,
      input.next,
      input.actorId,
      input.reason ?? null,
    ],
  );
}

async function orgUsers(sql: Sql, organizationId: string, role: string) {
  const rows = await sql.query<{ id: string }>(
    `SELECT id FROM accounts WHERE organization_id = $1 AND role = $2 AND status <> 'suspended'`,
    [organizationId, role],
  );
  return rows.map((row) => row.id);
}

export function visibleRequest(actor: Actor, request: RequestRow) {
  const carrierView = actor.role === "carrier" || actor.role === "driver";
  return {
    ...request,
    proposedPrice: carrierView ? undefined : request.proposedPrice,
  };
}

async function assertRequestVisible(sql: Sql, actor: Actor, request: RequestRow) {
  if (actor.role === "administrator") return;
  if (actor.role === "merchant" && sameOrg(actor, request.merchantOrgId)) return;
  if (actor.role === "customs_broker" && sameOrg(actor, request.brokerOrgId)) return;
  if (
    actor.role === "carrier" &&
    [
      "released_to_carriers",
      "candidate_responses",
      "carrier_selected",
      "trip_confirmed",
      "completed",
    ].includes(request.status)
  ) {
    const own = await sql.query(
      `SELECT id FROM carrier_responses WHERE request_id = $1 AND carrier_org_id = $2
       UNION
       SELECT id FROM trips WHERE request_id = $1 AND carrier_org_id = $2`,
      [request.id, actor.organizationId],
    );
    const open = await eligible(sql, request.id, actor.organizationId, null, null);
    if (
      own[0] ||
      (open[0] && ["released_to_carriers", "candidate_responses"].includes(request.status))
    )
      return;
  }
  throw new AppError(404, "NOT_FOUND", "Request not found");
}

export async function createRequest(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  input: {
    brokerOrganizationId?: string;
    useDefaultBroker: boolean;
    portCode: string;
    containerNumber: string;
    containerType: string;
    truckType: string;
    loadingLocation: string;
    destination: string;
    scheduledLoadingAt: string;
    expectedDeliveryAt: string;
    instructions?: string;
    proposedPrice?: number;
  },
) {
  requireActive(actor);
  requireRoles(actor, ["merchant"]);
  if (
    new Date(input.expectedDeliveryAt).getTime() <= new Date(input.scheduledLoadingAt).getTime()
  ) {
    throw new AppError(
      422,
      "INVALID_SCHEDULE",
      "Expected delivery must be after the scheduled loading time",
    );
  }
  let brokerId = input.brokerOrganizationId ?? null;
  let usedDefault = false;
  if (input.useDefaultBroker) {
    const links = await sql.query<{ brokerOrgId: string }>(
      `SELECT l.broker_org_id FROM merchant_broker_links l
       JOIN organizations o ON o.id = l.broker_org_id
       WHERE l.merchant_org_id = $1 AND l.is_default = true AND l.status = 'active' AND o.status = 'active' AND o.type = 'broker'`,
      [actor.organizationId],
    );
    brokerId = links[0]?.brokerOrgId ?? null;
    usedDefault = true;
    if (!brokerId)
      throw new AppError(
        422,
        "NO_DEFAULT_BROKER",
        "Save an active default customs broker before using this option",
      );
  }
  const brokers = await sql.query<{ id: string }>(
    `SELECT id FROM organizations WHERE id = $1 AND type = 'broker' AND status = 'active'`,
    [brokerId],
  );
  if (!brokers[0])
    throw new AppError(422, "BROKER_NOT_AVAILABLE", "Choose a verified, active customs broker");
  try {
    const created = await sql.begin(async (tx) => {
      const rows = await tx.query<RequestRow>(
        `INSERT INTO transport_requests
          (reference, merchant_org_id, merchant_user_id, broker_org_id, used_default_broker, port_code, container_number,
           container_type, truck_type, loading_location, destination, scheduled_loading_at, expected_delivery_at,
           instructions, proposed_price, status)
         VALUES ('REQ-' || lpad(nextval('request_ref_seq')::text, 6, '0'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'customs_clearance')
         RETURNING *`,
        [
          actor.organizationId,
          actor.id,
          brokerId,
          usedDefault,
          input.portCode,
          input.containerNumber.toUpperCase(),
          input.containerType,
          input.truckType,
          input.loadingLocation,
          input.destination,
          input.scheduledLoadingAt,
          input.expectedDeliveryAt,
          input.instructions ?? null,
          input.proposedPrice ?? null,
        ],
      );
      const request = rows[0];
      if (!request) throw new AppError(500, "REQUEST_FAILED", "Could not create the request");
      await recordStatus(tx, {
        entityType: "request",
        entityId: request.id,
        requestId: request.id,
        previous: "new_request",
        next: "customs_clearance",
        actorId: actor.id,
        reason: "Request submitted to the selected customs broker",
      });
      return request;
    });
    const brokersUsers = await orgUsers(sql, created.brokerOrgId, "customs_broker");
    await notify(sql, config, {
      userIds: brokersUsers,
      type: "request_created",
      titleEn: "New clearance request",
      titleAr: "طلب تخليص جديد",
      bodyEn: `${created.reference} is waiting for customs clearance.`,
      bodyAr: `${created.reference} بانتظار إجراءات التخليص.`,
      data: { requestId: created.id },
      dedupeKey: `request_created:${created.id}`,
    });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        "DUPLICATE_CONTAINER",
        "An open request already exists for this container number",
      );
    }
    throw error;
  }
}

export async function updateRequest(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  requestId: string,
  patch: Record<string, unknown>,
) {
  requireActive(actor);
  requireRoles(actor, ["merchant"]);
  const rows = await sql.query<RequestRow>(`SELECT * FROM transport_requests WHERE id = $1`, [
    requestId,
  ]);
  const request = rows[0];
  if (!request || !sameOrg(actor, request.merchantOrgId))
    throw new AppError(404, "NOT_FOUND", "Request not found");
  if (!["customs_clearance", "returned_for_correction"].includes(request.status)) {
    throw new AppError(409, "LOCKED", "This request can no longer be edited");
  }

  const resubmit = patch.resubmit === true;
  if (resubmit && request.status !== "returned_for_correction") {
    throw new AppError(
      409,
      "INVALID_TRANSITION",
      "Only requests returned for correction can be resubmitted",
    );
  }

  // Save field corrections without forcing resubmit while still returned.
  const keepReturned = request.status === "returned_for_correction" && !resubmit;
  const nextStatus = keepReturned ? "returned_for_correction" : "customs_clearance";

  await sql.query(
    `UPDATE transport_requests SET
      port_code = COALESCE($2, port_code),
      container_number = COALESCE($3, container_number),
      container_type = COALESCE($4, container_type),
      truck_type = COALESCE($5, truck_type),
      loading_location = COALESCE($6, loading_location),
      destination = COALESCE($7, destination),
      scheduled_loading_at = COALESCE($8, scheduled_loading_at),
      expected_delivery_at = COALESCE($9, expected_delivery_at),
      instructions = COALESCE($10, instructions),
      proposed_price = COALESCE($11, proposed_price),
      status = $12,
      broker_ready_at = CASE WHEN $13 THEN NULL ELSE broker_ready_at END,
      broker_ready_by = CASE WHEN $13 THEN NULL ELSE broker_ready_by END,
      external_payment_confirmed = CASE WHEN $13 THEN false ELSE external_payment_confirmed END,
      permits_confirmed = CASE WHEN $13 THEN false ELSE permits_confirmed END,
      approved_price = CASE WHEN $13 THEN NULL ELSE approved_price END,
      returned_reason = CASE WHEN $13 THEN NULL ELSE returned_reason END
     WHERE id = $1`,
    [
      requestId,
      patch.portCode ?? null,
      typeof patch.containerNumber === "string" ? patch.containerNumber.toUpperCase() : null,
      patch.containerType ?? null,
      patch.truckType ?? null,
      patch.loadingLocation ?? null,
      patch.destination ?? null,
      patch.scheduledLoadingAt ?? null,
      patch.expectedDeliveryAt ?? null,
      patch.instructions ?? null,
      patch.proposedPrice ?? null,
      nextStatus,
      !keepReturned,
    ],
  );

  if (resubmit) {
    await recordStatus(sql, {
      entityType: "request",
      entityId: requestId,
      requestId,
      previous: request.status,
      next: "customs_clearance",
      actorId: actor.id,
      reason: "Merchant resubmitted corrections",
    });
    const brokers = await orgUsers(sql, request.brokerOrgId, "customs_broker");
    await notify(sql, config, {
      userIds: brokers,
      type: "request_resubmitted",
      titleEn: "Request resubmitted after correction",
      titleAr: "أُعيد إرسال الطلب بعد التصحيح",
      bodyEn: `${request.reference} was corrected and returned to customs clearance.`,
      bodyAr: `تم تصحيح ${request.reference} وإعادته إلى التخليص الجمركي.`,
      data: { requestId },
      dedupeKey: `resubmit:${requestId}:${Date.now()}`,
    });
  }
}

export async function cancelRequest(sql: Sql, actor: Actor, requestId: string, reason?: string) {
  requireActive(actor);
  const rows = await sql.query<RequestRow>(`SELECT * FROM transport_requests WHERE id = $1`, [
    requestId,
  ]);
  const request = rows[0];
  if (!request) throw new AppError(404, "NOT_FOUND", "Request not found");
  const allowed =
    (actor.role === "merchant" && sameOrg(actor, request.merchantOrgId)) ||
    (actor.role === "customs_broker" && sameOrg(actor, request.brokerOrgId));
  if (!allowed) throw new AppError(404, "NOT_FOUND", "Request not found");
  if (["trip_confirmed", "completed", "cancelled"].includes(request.status)) {
    throw new AppError(
      409,
      "CANCELLATION_DISABLED",
      "Ordinary cancellation is disabled after trip confirmation",
    );
  }
  await sql.query(
    `UPDATE transport_requests SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`,
    [requestId, reason ?? null],
  );
  await recordStatus(sql, {
    entityType: "request",
    entityId: requestId,
    requestId,
    previous: request.status,
    next: "cancelled",
    actorId: actor.id,
    reason,
  });
}

export async function getRequest(sql: Sql, actor: Actor, requestId: string) {
  const rows = await sql.query<RequestRow>(`SELECT * FROM transport_requests WHERE id = $1`, [
    requestId,
  ]);
  const request = rows[0];
  if (!request) throw new AppError(404, "NOT_FOUND", "Request not found");
  await assertRequestVisible(sql, actor, request);
  const responses = ["merchant", "customs_broker", "administrator"].includes(actor.role)
    ? await sql.query(
        `SELECT cr.*, o.legal_name, o.rating_avg, o.rating_count
         FROM carrier_responses cr JOIN organizations o ON o.id = cr.carrier_org_id
         WHERE cr.request_id = $1 ORDER BY cr.created_at`,
        [requestId],
      )
    : await sql.query(
        `SELECT * FROM carrier_responses WHERE request_id = $1 AND carrier_org_id = $2`,
        [requestId, actor.organizationId],
      );
  const history = await sql.query(
    `SELECT * FROM status_events WHERE request_id = $1 ORDER BY created_at`,
    [requestId],
  );
  const linked = await sql.query<{
    id: string;
    reference: string;
    status: string;
    carrierOrgId: string;
    driverUserId: string;
  }>(
    `SELECT t.id, t.reference, t.status, t.carrier_org_id, d.user_id AS driver_user_id
     FROM trips t JOIN drivers d ON d.id = t.driver_id WHERE t.request_id = $1`,
    [requestId],
  );
  let trip: { id: string; reference: string; status: string } | null = null;
  if (linked[0]) {
    try {
      await assertTripAccess(actor, {
        merchantOrgId: request.merchantOrgId,
        brokerOrgId: request.brokerOrgId,
        carrierOrgId: linked[0].carrierOrgId,
        driverUserId: linked[0].driverUserId,
      });
      trip = { id: linked[0].id, reference: linked[0].reference, status: linked[0].status };
    } catch {
      trip = null;
    }
  }
  return { ...visibleRequest(actor, request), responses, history, trip };
}

export async function listRequests(
  sql: Sql,
  actor: Actor,
  filters: { page: number; pageSize: number; q?: string; status?: string },
) {
  const offset = (filters.page - 1) * filters.pageSize;
  const params: unknown[] = [];
  const where: string[] = [];
  if (actor.role === "merchant") {
    params.push(actor.organizationId);
    where.push(`merchant_org_id = $${params.length}`);
  } else if (actor.role === "customs_broker") {
    params.push(actor.organizationId);
    where.push(`broker_org_id = $${params.length}`);
  } else if (actor.role === "carrier") {
    params.push(actor.organizationId);
    where.push(
      `id IN (SELECT request_id FROM carrier_responses WHERE carrier_org_id = $${params.length} UNION SELECT request_id FROM trips WHERE carrier_org_id = $${params.length})`,
    );
  } else if (actor.role === "administrator") {
    where.push("TRUE");
  } else {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this operation");
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q.replace(/[%_\\]/g, "")}%`);
    where.push(
      `(reference ILIKE $${params.length} OR container_number ILIKE $${params.length} OR destination ILIKE $${params.length})`,
    );
  }
  params.push(filters.pageSize, offset);
  const rows = await sql.query<RequestRow>(
    `SELECT * FROM transport_requests WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map((row) => visibleRequest(actor, row));
}

export async function listAvailableRequests(sql: Sql, actor: Actor) {
  requireActive(actor);
  requireRoles(actor, ["carrier"]);
  const rows = await sql.query<RequestRow>(
    `SELECT * FROM transport_requests
     WHERE status IN ('released_to_carriers', 'candidate_responses')
       AND id NOT IN (SELECT request_id FROM carrier_responses WHERE carrier_org_id = $1 AND status <> 'withdrawn')
     ORDER BY created_at DESC`,
    [actor.organizationId],
  );
  const visible: RequestRow[] = [];
  for (const request of rows) {
    const matches = await eligible(sql, request.id, actor.organizationId, null, null);
    if (matches[0]) visible.push(request);
  }
  return visible.map((row) => visibleRequest(actor, row));
}

export async function brokerClearance(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  requestId: string,
  input: {
    progressNote?: string;
    approvedPrice?: number;
    externalPaymentConfirmed?: boolean;
    permitsConfirmed?: boolean;
    confirmReady?: boolean;
    returnForCorrection?: boolean;
    returnReason?: string;
  },
) {
  requireActive(actor);
  requireRoles(actor, ["customs_broker"]);
  const rows = await sql.query<RequestRow>(`SELECT * FROM transport_requests WHERE id = $1`, [
    requestId,
  ]);
  const request = rows[0];
  if (!request || !sameOrg(actor, request.brokerOrgId))
    throw new AppError(404, "NOT_FOUND", "Request not found");
  if (input.returnForCorrection) {
    if (!["customs_clearance", "ready_for_admin_review"].includes(request.status)) {
      throw new AppError(409, "INVALID_TRANSITION", "This request cannot be returned");
    }
    await sql.query(
      `UPDATE transport_requests SET status = 'returned_for_correction', returned_reason = $2, broker_ready_at = NULL WHERE id = $1`,
      [requestId, input.returnReason ?? null],
    );
    await recordStatus(sql, {
      entityType: "request",
      entityId: requestId,
      requestId,
      previous: request.status,
      next: "returned_for_correction",
      actorId: actor.id,
      reason: input.returnReason,
    });
    await notify(sql, config, {
      userIds: [request.merchantUserId],
      type: "request_returned",
      titleEn: "Request returned for correction",
      titleAr: "أُعيد الطلب للتصحيح",
      bodyEn: input.returnReason || request.reference,
      bodyAr: input.returnReason || request.reference,
      data: { requestId },
    });
    return;
  }
  if (request.status !== "customs_clearance" && request.status !== "returned_for_correction") {
    throw new AppError(409, "LOCKED", "Clearance can no longer be changed");
  }
  const price = input.approvedPrice ?? request.approvedPrice;
  const payment = input.externalPaymentConfirmed ?? request.externalPaymentConfirmed;
  const permits = input.permitsConfirmed ?? request.permitsConfirmed;
  await sql.query(
    `UPDATE transport_requests SET
      approved_price = COALESCE($2, approved_price),
      external_payment_confirmed = $3,
      permits_confirmed = $4,
      status = 'customs_clearance'
     WHERE id = $1`,
    [requestId, input.approvedPrice ?? null, payment, permits],
  );
  await sql.query(
    `INSERT INTO customs_clearance_records
      (request_id, broker_user_id, progress_note, external_payment_confirmed, permits_confirmed, approved_price)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [requestId, actor.id, input.progressNote ?? null, payment, permits, price],
  );
  if (!input.confirmReady) return;
  const docs = await sql.query(
    `SELECT id FROM documents WHERE request_id = $1 AND doc_type = 'clearance_evidence' LIMIT 1`,
    [requestId],
  );
  if (!price || !payment || !permits || !docs[0]) {
    throw new AppError(
      422,
      "CLEARANCE_INCOMPLETE",
      "Price, clearance evidence, external payment confirmation, and permits are required",
    );
  }
  await sql.query(
    `UPDATE transport_requests SET status = 'ready_for_admin_review', broker_ready_at = now(), broker_ready_by = $2 WHERE id = $1`,
    [requestId, actor.id],
  );
  await recordStatus(sql, {
    entityType: "request",
    entityId: requestId,
    requestId,
    previous: request.status,
    next: "ready_for_admin_review",
    actorId: actor.id,
  });
  const admins = await sql.query<{ id: string }>(
    `SELECT id FROM accounts WHERE role = 'administrator' AND status = 'active'
     AND (admin_permissions && ARRAY['operations','general']::text[])`,
  );
  await notify(sql, config, {
    userIds: admins.map((row) => row.id),
    type: "ready_for_release",
    titleEn: "Request ready for release",
    titleAr: "طلب جاهز للإفراج",
    bodyEn: `${request.reference} is waiting for administrative release. Carriers cannot see it yet.`,
    bodyAr: `${request.reference} بانتظار الإفراج الإداري. الناقلون لا يرونه بعد.`,
    data: { requestId },
    dedupeKey: `ready:${requestId}`,
  });
}

export async function releaseRequest(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  requestId: string,
  notes?: string,
) {
  requirePermission(actor, "operations");
  const request = await sql.begin(async (tx) => {
    const rows = await tx.query<RequestRow>(
      `SELECT * FROM transport_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    const current = rows[0];
    if (!current) throw new AppError(404, "NOT_FOUND", "Request not found");
    if (current.status !== "ready_for_admin_review") {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        "Only requests ready for administrative review can be released",
      );
    }
    await tx.query(
      `UPDATE transport_requests SET status = 'released_to_carriers', released_by = $2, released_at = now(), release_notes = $3 WHERE id = $1`,
      [requestId, actor.id, notes ?? null],
    );
    await recordStatus(tx, {
      entityType: "request",
      entityId: requestId,
      requestId,
      previous: current.status,
      next: "released_to_carriers",
      actorId: actor.id,
      reason: notes,
    });
    await tx.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'request.release','request',$2,$3::jsonb)`,
      [actor.id, requestId, JSON.stringify({ notes: notes ?? null })],
    );
    return current;
  });
  const matches = rankEligible(await eligible(sql, requestId, null, null, null));
  const carriers = [...new Set(matches.map((row) => row.carrierUserId))];
  await notify(sql, config, {
    userIds: [...carriers, request.merchantUserId],
    type: "request_released",
    titleEn: "Request released to carriers",
    titleAr: "تم إفراج الطلب للناقلين",
    bodyEn: `${request.reference} is now visible to eligible carriers. A response is only a candidate.`,
    bodyAr: `${request.reference} أصبح ظاهرًا للناقلين المؤهلين. الرد ترشيح فقط وليس تعيينًا.`,
    data: { requestId },
    dedupeKey: `released:${requestId}`,
  });
}

export async function respondToRequest(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  requestId: string,
  vehicleId: string,
  driverId: string,
) {
  requireActive(actor);
  requireRoles(actor, ["carrier"]);
  const rows = await sql.query<RequestRow>(`SELECT * FROM transport_requests WHERE id = $1`, [
    requestId,
  ]);
  const request = rows[0];
  if (
    !request ||
    !["released_to_carriers", "candidate_responses"].includes(request.status) ||
    request.approvedPrice == null
  ) {
    throw new AppError(404, "NOT_FOUND", "Request not found");
  }
  const matches = await eligible(sql, requestId, actor.organizationId, vehicleId, driverId);
  if (!matches[0])
    throw new AppError(
      403,
      "NOT_ELIGIBLE",
      "This vehicle and driver are not eligible for the request",
    );
  try {
    const response = await sql.begin(async (tx) => {
      const locked = await tx.query<RequestRow>(
        `SELECT * FROM transport_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      );
      const current = locked[0];
      if (!current || !["released_to_carriers", "candidate_responses"].includes(current.status)) {
        throw new AppError(409, "STALE_REQUEST", "This request is no longer open for candidates");
      }
      const inserted = await tx.query(
        `INSERT INTO carrier_responses
          (request_id, carrier_org_id, carrier_user_id, vehicle_id, driver_id, status, accepted_price)
         VALUES ($1,$2,$3,$4,$5,'candidate',$6) RETURNING *`,
        [requestId, actor.organizationId, actor.id, vehicleId, driverId, current.approvedPrice],
      );
      if (current.status === "released_to_carriers") {
        await tx.query(
          `UPDATE transport_requests SET status = 'candidate_responses' WHERE id = $1`,
          [requestId],
        );
        await recordStatus(tx, {
          entityType: "request",
          entityId: requestId,
          requestId,
          previous: current.status,
          next: "candidate_responses",
          actorId: actor.id,
          reason: "Carrier accepted the approved price as a candidate",
        });
      }
      return inserted[0];
    });
    const brokers = await orgUsers(sql, request.brokerOrgId, "customs_broker");
    await notify(sql, config, {
      userIds: [request.merchantUserId, ...brokers],
      type: "candidate_accepted",
      titleEn: "Candidate accepted the price",
      titleAr: "ناقل قبل السعر كمرشح",
      bodyEn: `A carrier joined the candidate list for ${request.reference}. This is not a final assignment.`,
      bodyAr: `انضم ناقل إلى قائمة المرشحين للطلب ${request.reference}. هذا ليس تعيينًا نهائيًا.`,
      data: { requestId, responseId: (response as { id?: string } | undefined)?.id },
      dedupeKey: `candidate:${requestId}:${actor.organizationId}`,
    });
    return response;
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(
        409,
        "DUPLICATE_RESPONSE",
        "This carrier already responded to the request",
      );
    throw error;
  }
}

export async function selectCarrier(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  requestId: string,
  responseId: string,
) {
  requireActive(actor);
  const result = await sql.begin(async (tx) => {
    const settings = await tx.query<{ selectionPolicy: string }>(
      `SELECT selection_policy FROM platform_settings WHERE id = true`,
    );
    if (settings[0]?.selectionPolicy !== "merchant_or_broker") {
      throw new AppError(409, "POLICY_UNDEFINED", "Carrier selection policy is not approved");
    }
    const locked = await tx.query<RequestRow>(
      `SELECT * FROM transport_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    const request = locked[0];
    if (!request) throw new AppError(404, "NOT_FOUND", "Request not found");
    const allowed =
      (actor.role === "merchant" && sameOrg(actor, request.merchantOrgId)) ||
      (actor.role === "customs_broker" && sameOrg(actor, request.brokerOrgId));
    if (!allowed)
      throw new AppError(403, "FORBIDDEN", "You cannot select a carrier for this request");
    if (request.status !== "candidate_responses")
      throw new AppError(409, "INVALID_TRANSITION", "Candidate selection is not open");
    if (
      !request.approvedPrice ||
      !request.permitsConfirmed ||
      !request.externalPaymentConfirmed ||
      !request.brokerReadyAt
    ) {
      throw new AppError(
        409,
        "NOT_READY",
        "Permits, payment confirmation, and the approved price must still be in place",
      );
    }
    if (new Date(request.expectedDeliveryAt).getTime() <= Date.now()) {
      throw new AppError(409, "INVALID_SCHEDULE", "The expected delivery time is no longer valid");
    }
    const responses = await tx.query<{
      id: string;
      status: string;
      carrierOrgId: string;
      carrierUserId: string;
      vehicleId: string;
      driverId: string;
      acceptedPrice: number;
    }>(`SELECT * FROM carrier_responses WHERE id = $1 AND request_id = $2 FOR UPDATE`, [
      responseId,
      requestId,
    ]);
    const response = responses[0];
    if (!response || response.status !== "candidate")
      throw new AppError(409, "STALE_CANDIDATE", "This candidate is no longer available");
    if (Number(response.acceptedPrice) !== Number(request.approvedPrice)) {
      throw new AppError(
        409,
        "PRICE_CHANGED",
        "The approved price changed after the candidate response",
      );
    }
    const matches = await eligible(
      tx,
      requestId,
      response.carrierOrgId,
      response.vehicleId,
      response.driverId,
    );
    if (!matches[0])
      throw new AppError(
        409,
        "NOT_ELIGIBLE",
        "The carrier, driver, or vehicle is no longer eligible",
      );
    const existing = await tx.query(`SELECT id FROM trips WHERE request_id = $1`, [requestId]);
    if (existing[0])
      throw new AppError(409, "ALREADY_ASSIGNED", "A carrier has already been assigned");
    const referenceRows = await tx.query<{ reference: string }>(
      `SELECT 'JST-' || lpad(nextval('trip_ref_seq')::text, 6, '0') AS reference`,
    );
    const reference = referenceRows[0]?.reference;
    if (!reference) throw new AppError(500, "TRIP_FAILED", "Could not allocate a trip reference");
    await tx.query(`UPDATE transport_requests SET status = 'carrier_selected' WHERE id = $1`, [
      requestId,
    ]);
    await recordStatus(tx, {
      entityType: "request",
      entityId: requestId,
      requestId,
      previous: "candidate_responses",
      next: "carrier_selected",
      actorId: actor.id,
    });
    const trips = await tx.query<TripRow>(
      `INSERT INTO trips
        (reference, request_id, carrier_org_id, carrier_user_id, driver_id, vehicle_id, response_id, agreed_price, confirmed_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'en_route_to_port')
       RETURNING *`,
      [
        reference,
        requestId,
        response.carrierOrgId,
        response.carrierUserId,
        response.driverId,
        response.vehicleId,
        response.id,
        request.approvedPrice,
        actor.id,
      ],
    );
    const trip = trips[0];
    if (!trip) throw new AppError(500, "TRIP_FAILED", "Could not confirm the trip");
    await tx.query(`UPDATE transport_requests SET status = 'trip_confirmed' WHERE id = $1`, [
      requestId,
    ]);
    await tx.query(`UPDATE carrier_responses SET status = 'selected' WHERE id = $1`, [response.id]);
    await tx.query(
      `UPDATE carrier_responses SET status = 'not_selected' WHERE request_id = $1 AND id <> $2 AND status = 'candidate'`,
      [requestId, response.id],
    );
    await tx.query(`UPDATE drivers SET availability = 'on_trip' WHERE id = $1`, [
      response.driverId,
    ]);
    await tx.query(`UPDATE vehicles SET availability = 'on_trip' WHERE id = $1`, [
      response.vehicleId,
    ]);
    await recordStatus(tx, {
      entityType: "request",
      entityId: requestId,
      requestId,
      tripId: trip.id,
      previous: "carrier_selected",
      next: "trip_confirmed",
      actorId: actor.id,
    });
    await recordStatus(tx, {
      entityType: "trip",
      entityId: trip.id,
      requestId,
      tripId: trip.id,
      previous: null,
      next: "en_route_to_port",
      actorId: actor.id,
      reason: "Trip confirmed",
    });
    return { trip, request, response };
  });
  const driver = await sql.query<{ userId: string }>(`SELECT user_id FROM drivers WHERE id = $1`, [
    result.response.driverId,
  ]);
  const brokers = await orgUsers(sql, result.request.brokerOrgId, "customs_broker");
  await notify(sql, config, {
    userIds: [
      result.request.merchantUserId,
      result.response.carrierUserId,
      driver[0]?.userId ?? "",
      ...brokers,
    ],
    type: "carrier_assigned",
    titleEn: "Carrier assigned and trip confirmed",
    titleAr: "تم تعيين الناقل وتأكيد الرحلة",
    bodyEn: `${result.trip.reference} is confirmed at the approved price. This is the final assignment, not a candidate response.`,
    bodyAr: `تم تأكيد ${result.trip.reference} بالسعر المعتمد. هذا تعيين نهائي وليس قبول ترشيح.`,
    data: { tripId: result.trip.id, requestId },
    dedupeKey: `assigned:${result.trip.id}`,
  });
  return result.trip;
}

async function tripParties(sql: Sql, tripId: string) {
  const rows = await sql.query<{
    trip: TripRow;
    request: RequestRow;
    driverUserId: string;
  }>(
    `SELECT t.id, t.reference, t.request_id, t.carrier_org_id, t.carrier_user_id, t.driver_id, t.vehicle_id, t.response_id,
            t.agreed_price, t.currency, t.confirmed_by, t.confirmed_at, t.status, t.closed_by, t.closed_at,
            r.merchant_org_id, r.merchant_user_id, r.broker_org_id, r.reference AS request_reference, r.status AS request_status,
            d.user_id AS driver_user_id
     FROM trips t
     JOIN transport_requests r ON r.id = t.request_id
     JOIN drivers d ON d.id = t.driver_id
     WHERE t.id = $1`,
    [tripId],
  );
  return rows[0] as
    | (TripRow & RequestRow & { driverUserId: string; requestReference?: string })
    | undefined;
}

export async function assertTripAccess(
  actor: Actor,
  row: { merchantOrgId: string; brokerOrgId: string; carrierOrgId: string; driverUserId: string },
) {
  if (actor.role === "administrator") return;
  if (actor.role === "merchant" && sameOrg(actor, row.merchantOrgId)) return;
  if (actor.role === "customs_broker" && sameOrg(actor, row.brokerOrgId)) return;
  if (actor.role === "carrier" && sameOrg(actor, row.carrierOrgId)) return;
  if (actor.id === row.driverUserId) return;
  throw new AppError(404, "NOT_FOUND", "Trip not found");
}

export async function listTrips(sql: Sql, actor: Actor) {
  if (actor.role === "driver" || actor.driverId) {
    return sql.query(`SELECT t.* FROM trips t WHERE t.driver_id = $1 ORDER BY t.created_at DESC`, [
      actor.driverId,
    ]);
  }
  if (actor.role === "merchant")
    return sql.query(
      `SELECT t.* FROM trips t JOIN transport_requests r ON r.id = t.request_id WHERE r.merchant_org_id = $1 ORDER BY t.created_at DESC`,
      [actor.organizationId],
    );
  if (actor.role === "customs_broker")
    return sql.query(
      `SELECT t.* FROM trips t JOIN transport_requests r ON r.id = t.request_id WHERE r.broker_org_id = $1 ORDER BY t.created_at DESC`,
      [actor.organizationId],
    );
  if (actor.role === "carrier")
    return sql.query(`SELECT * FROM trips WHERE carrier_org_id = $1 ORDER BY created_at DESC`, [
      actor.organizationId,
    ]);
  if (actor.role === "administrator")
    return sql.query(`SELECT * FROM trips ORDER BY created_at DESC LIMIT 200`);
  throw new AppError(403, "FORBIDDEN", "You do not have access to this operation");
}

export async function getTrip(sql: Sql, actor: Actor, tripId: string) {
  const row = await loadTripBundle(sql, tripId);
  await assertTripAccess(actor, row);
  const history = await sql.query(
    `SELECT * FROM status_events WHERE trip_id = $1 ORDER BY created_at`,
    [tripId],
  );
  const loading = await sql.query(
    `SELECT id, document_id, uploaded_at FROM loading_evidence WHERE trip_id = $1`,
    [tripId],
  );
  const delivery = await sql.query(
    `SELECT id, recipient_name, delivered_at, document_id FROM delivery_records WHERE trip_id = $1`,
    [tripId],
  );
  const fees = await sql.query(
    `SELECT id, amount, currency, status, exemption_reason, created_at FROM platform_fees WHERE trip_id = $1`,
    [tripId],
  );
  return {
    ...row,
    history,
    loadingEvidence: loading[0] ?? null,
    delivery: delivery[0] ?? null,
    fee: fees[0] ?? null,
  };
}

async function loadTripBundle(sql: Sql, tripId: string) {
  const rows = await sql.query<
    TripRow & {
      merchantOrgId: string;
      brokerOrgId: string;
      merchantUserId: string;
      driverUserId: string;
      requestReference: string;
    }
  >(
    `SELECT t.*, r.merchant_org_id, r.broker_org_id, r.merchant_user_id, r.reference AS request_reference, d.user_id AS driver_user_id
     FROM trips t
     JOIN transport_requests r ON r.id = t.request_id
     JOIN drivers d ON d.id = t.driver_id
     WHERE t.id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Trip not found");
  return row;
}

export async function transitionTrip(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  tripId: string,
  toStatus: string,
  extras: { reason?: string; recipientName?: string; deliveredAt?: string },
) {
  const row = await loadTripBundle(sql, tripId);
  const expected = TRIP_TRANSITIONS[row.status as keyof typeof TRIP_TRANSITIONS];
  if (expected !== toStatus)
    throw new AppError(409, "INVALID_TRANSITION", "This status change is not allowed");
  if (toStatus === "closed") {
    requirePermission(actor, "operations");
    const settings = await sql.query<{ closureAuthority: string }>(
      `SELECT closure_authority FROM platform_settings WHERE id = true`,
    );
    if (settings[0]?.closureAuthority !== "admin_operations_or_general") {
      throw new AppError(409, "POLICY_UNDEFINED", "Final closure authority has not been approved");
    }
    const loading = await sql.query(`SELECT id FROM loading_evidence WHERE trip_id = $1`, [tripId]);
    const delivery = await sql.query(`SELECT id FROM delivery_records WHERE trip_id = $1`, [
      tripId,
    ]);
    if (!loading[0] || !delivery[0] || row.status !== "delivered") {
      throw new AppError(
        409,
        "CLOSURE_BLOCKED",
        "Loading evidence and a delivery record are required before closure",
      );
    }
  } else {
    if (actor.driverId !== row.driverId)
      throw new AppError(403, "FORBIDDEN", "Only the assigned driver can update this trip");
    requireActive(actor);
  }
  if (toStatus === "loaded") {
    const loading = await sql.query(`SELECT id FROM loading_evidence WHERE trip_id = $1`, [tripId]);
    if (!loading[0])
      throw new AppError(
        409,
        "EVIDENCE_REQUIRED",
        "A loading photograph is required before this step",
      );
  }
  await sql.begin(async (tx) => {
    if (toStatus === "delivered") {
      if (!extras.recipientName || !extras.deliveredAt) {
        throw new AppError(
          422,
          "DELIVERY_INCOMPLETE",
          "Recipient name and delivery time are required",
        );
      }
      const notes = await tx.query<{ id: string }>(
        `SELECT id FROM documents WHERE trip_id = $1 AND doc_type = 'delivery_note' ORDER BY created_at DESC LIMIT 1`,
        [tripId],
      );
      if (!notes[0])
        throw new AppError(
          409,
          "EVIDENCE_REQUIRED",
          "A Delivery Note is required and a loading photo cannot replace it",
        );
      await tx.query(
        `INSERT INTO delivery_records (trip_id, recipient_name, delivered_at, document_id, uploader_user_id) VALUES ($1,$2,$3,$4,$5)`,
        [tripId, extras.recipientName, extras.deliveredAt, notes[0].id, actor.id],
      );
    }
    await tx.query(
      `UPDATE trips SET status = $2, closed_by = $3, closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END WHERE id = $1`,
      [tripId, toStatus, toStatus === "closed" ? actor.id : null],
    );
    await recordStatus(tx, {
      entityType: "trip",
      entityId: tripId,
      requestId: row.requestId,
      tripId,
      previous: row.status,
      next: toStatus,
      actorId: actor.id,
      reason: extras.reason,
    });
    if (toStatus === "closed") {
      await tx.query(
        `UPDATE transport_requests SET status = 'completed', closed_at = now() WHERE id = $1`,
        [row.requestId],
      );
      await tx.query(`UPDATE drivers SET availability = 'available' WHERE id = $1`, [row.driverId]);
      await tx.query(`UPDATE vehicles SET availability = 'available' WHERE id = $1`, [
        row.vehicleId,
      ]);
      const settings = await tx.query<{
        feeAmount: number;
        feeCurrency: string;
        freePeriodActive: boolean;
        freePeriodStartsOn: string | null;
        freePeriodEndsOn: string | null;
        freePeriodEligibility: string | null;
      }>(
        `SELECT fee_amount, fee_currency, free_period_active, free_period_starts_on, free_period_ends_on, free_period_eligibility FROM platform_settings WHERE id = true FOR UPDATE`,
      );
      const policy = settings[0];
      if (!policy) throw new AppError(500, "FEE_FAILED", "Fee policy is missing");
      const today = new Date().toISOString().slice(0, 10);
      const start = policy.freePeriodStartsOn?.slice(0, 10);
      const end = policy.freePeriodEndsOn?.slice(0, 10);
      const exempt =
        policy.freePeriodActive &&
        policy.freePeriodEligibility === "all_completed_trips" &&
        !!start &&
        !!end &&
        today >= start &&
        today <= end;
      await tx.query(
        `INSERT INTO platform_fees (trip_id, amount, currency, status, exemption_reason) VALUES ($1,$2,$3,$4,$5)`,
        [
          tripId,
          policy.feeAmount,
          policy.feeCurrency,
          exempt ? "exempt" : "pending",
          exempt ? "free_period" : null,
        ],
      );
      await tx.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'trip.close','trip',$2,$3::jsonb)`,
        [actor.id, tripId, JSON.stringify({ feeStatus: exempt ? "exempt" : "pending" })],
      );
    }
  });
  const brokers = await orgUsers(sql, row.brokerOrgId, "customs_broker");
  const titles: Record<string, [string, string]> = {
    arrived_at_port: ["Arrived at port", "وصل إلى الميناء"],
    loaded: ["Container loaded", "تم التحميل"],
    trip_started: ["Trip started", "بدأت الرحلة"],
    in_transit: ["In transit", "في الطريق"],
    arrived_at_destination: ["Arrived at destination", "وصل إلى الوجهة"],
    delivered: ["Delivery completed", "اكتمل التسليم"],
    closed: ["Trip closed", "أُغلقت الرحلة"],
  };
  const title = titles[toStatus] ?? [toStatus, toStatus];
  await notify(sql, config, {
    userIds: [row.merchantUserId, row.carrierUserId, row.driverUserId, ...brokers],
    type: "trip_status",
    titleEn: title[0],
    titleAr: title[1],
    bodyEn: `${row.reference}: ${title[0]}`,
    bodyAr: `${row.reference}: ${title[1]}`,
    data: { tripId, status: toStatus },
    dedupeKey: `trip:${tripId}:${toStatus}`,
  });
}

export async function saveLoadingEvidence(
  sql: Sql,
  actor: Actor,
  tripId: string,
  documentId: string,
) {
  const row = await loadTripBundle(sql, tripId);
  if (actor.driverId !== row.driverId)
    throw new AppError(403, "FORBIDDEN", "Only the assigned driver can upload loading evidence");
  if (row.status !== "arrived_at_port")
    throw new AppError(409, "INVALID_TRANSITION", "Loading evidence is collected at the port");
  const docs = await sql.query<{ docType: string }>(
    `SELECT doc_type FROM documents WHERE id = $1 AND trip_id = $2`,
    [documentId, tripId],
  );
  if (docs[0]?.docType !== "loading_photo")
    throw new AppError(422, "EVIDENCE_REQUIRED", "A loading photograph is required");
  try {
    await sql.query(
      `INSERT INTO loading_evidence (trip_id, document_id, uploader_user_id) VALUES ($1,$2,$3)`,
      [tripId, documentId, actor.id],
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await sql.query(
      `UPDATE loading_evidence SET document_id = $2, uploader_user_id = $3, uploaded_at = now() WHERE trip_id = $1`,
      [tripId, documentId, actor.id],
    );
  }
}

export async function rateTrip(
  sql: Sql,
  actor: Actor,
  tripId: string,
  targetRole: "carrier" | "merchant" | "customs_broker",
  score: number,
  comment?: string,
) {
  requireActive(actor);
  const row = await loadTripBundle(sql, tripId);
  await assertTripAccess(actor, row);
  if (!["delivered", "closed"].includes(row.status))
    throw new AppError(409, "NOT_READY", "Ratings open after delivery");
  const settings = await sql.query<{ brokerRatingTargets: string[] }>(
    `SELECT broker_rating_targets FROM platform_settings WHERE id = true`,
  );
  const targets = settings[0]?.brokerRatingTargets ?? ["carrier"];
  let targetOrg: string | null = null;
  if (actor.role === "merchant" && sameOrg(actor, row.merchantOrgId) && targetRole === "carrier")
    targetOrg = row.carrierOrgId;
  if (actor.role === "carrier" && sameOrg(actor, row.carrierOrgId) && targetRole === "merchant")
    targetOrg = row.merchantOrgId;
  if (
    actor.role === "customs_broker" &&
    sameOrg(actor, row.brokerOrgId) &&
    targets.includes(targetRole)
  ) {
    targetOrg =
      targetRole === "carrier"
        ? row.carrierOrgId
        : targetRole === "merchant"
          ? row.merchantOrgId
          : row.brokerOrgId;
  }
  if (!targetOrg || targetOrg === actor.organizationId) {
    throw new AppError(403, "FORBIDDEN", "You cannot submit this rating");
  }
  try {
    await sql.begin(async (tx) => {
      await tx.query(
        `INSERT INTO ratings (trip_id, rater_user_id, rater_role, target_org_id, target_role, score, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tripId, actor.id, actor.role, targetOrg, targetRole, score, comment ?? null],
      );
      await tx.query(
        `UPDATE organizations o SET rating_avg = sub.avg, rating_count = sub.count
         FROM (SELECT ROUND(AVG(score)::numeric, 2) AS avg, COUNT(*)::int AS count FROM ratings WHERE target_org_id = $1) sub
         WHERE o.id = $1`,
        [targetOrg],
      );
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError(409, "DUPLICATE_RATING", "You already rated this party for the trip");
    throw error;
  }
}

export async function reportIncident(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  tripId: string,
  incidentType: string,
  description: string,
) {
  requireActive(actor);
  const row = await loadTripBundle(sql, tripId);
  await assertTripAccess(actor, row);
  const inserted = await sql.query<{ id: string }>(
    `INSERT INTO incidents (trip_id, request_id, reporter_user_id, incident_type, description) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [tripId, row.requestId, actor.id, incidentType, description],
  );
  const admins = await sql.query<{ id: string }>(
    `SELECT id FROM accounts WHERE role = 'administrator' AND status = 'active' AND (admin_permissions && ARRAY['operations','general']::text[])`,
  );
  await notify(sql, config, {
    userIds: admins.map((item) => item.id),
    type: "incident_opened",
    titleEn: "Incident reported",
    titleAr: "تم تسجيل بلاغ",
    bodyEn: `${row.reference}: ${incidentType}. The trip was not cancelled.`,
    bodyAr: `${row.reference}: ${incidentType}. لم تُلغَ الرحلة تلقائيًا.`,
    data: { tripId, incidentId: inserted[0]?.id },
  });
  return inserted[0];
}

export async function listPublicMap(sql: Sql, portCode?: string) {
  const rows = await sql.query<{
    vehicleId: string;
    truckType: string;
    supportedContainerTypes: string[];
    availability: string;
    latitude: number;
    longitude: number;
    recordedAt: string;
    ratingAvg: number;
    ratingCount: number;
    plateNumber: string;
    portCode: string;
    portLatitude: number;
    portLongitude: number;
    legalName: string;
    status: string;
  }>(
    `SELECT v.id AS vehicle_id, v.truck_type, v.supported_container_types, v.availability, v.plate_number,
            loc.latitude, loc.longitude, loc.recorded_at, o.rating_avg, o.rating_count, o.legal_name, o.status,
            p.code AS port_code, p.latitude AS port_latitude, p.longitude AS port_longitude
     FROM vehicle_locations loc
     JOIN vehicles v ON v.id = loc.vehicle_id
     JOIN organizations o ON o.id = v.organization_id
     JOIN ports p ON ($1::text IS NULL OR p.code = $1)
     WHERE loc.recorded_at > now() - interval '24 hours'
       AND o.type IN ('carrier_company', 'independent_carrier')
       AND (p.code = ANY (o.service_regions))
       AND ($1::text IS NULL OR $1 = ANY (o.service_regions))`,
    [portCode ?? null],
  );
  const staleMinutes = 15;
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const key = `${row.vehicleId}:${row.portCode}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const distance = haversine(row.portLatitude, row.portLongitude, row.latitude, row.longitude);
    return [
      {
        vehicleId: row.vehicleId,
        carrierName: row.legalName,
        truckType: row.truckType,
        supportedContainerTypes: row.supportedContainerTypes,
        availability: row.availability,
        verified: row.status === "active",
        ratingAvg: row.ratingAvg,
        ratingCount: row.ratingCount,
        distanceKm: Math.round(distance * 10) / 10,
        portCode: row.portCode,
        latitude: Math.round(row.latitude * 100) / 100,
        longitude: Math.round(row.longitude * 100) / 100,
        recordedAt: row.recordedAt,
        stale: Date.now() - new Date(row.recordedAt).getTime() > staleMinutes * 60 * 1000,
        publicPlate: row.plateNumber.slice(-4),
      },
    ];
  });
}

export async function submitLocation(
  sql: Sql,
  actor: Actor,
  input: {
    tripId?: string;
    vehicleId: string;
    latitude: number;
    longitude: number;
    accuracyM?: number;
    recordedAt: string;
    availability?: string;
  },
) {
  requireActive(actor);
  if (!actor.driverId && actor.role !== "carrier")
    throw new AppError(403, "FORBIDDEN", "Only a driver or carrier can submit locations");
  const vehicles = await sql.query<{ organizationId: string }>(
    `SELECT organization_id FROM vehicles WHERE id = $1`,
    [input.vehicleId],
  );
  if (!vehicles[0] || !sameOrg(actor, vehicles[0].organizationId))
    throw new AppError(404, "NOT_FOUND", "Vehicle not found");
  if (input.tripId) {
    const trips = await sql.query<{ driverId: string; vehicleId: string; status: string }>(
      `SELECT driver_id, vehicle_id, status FROM trips WHERE id = $1`,
      [input.tripId],
    );
    const trip = trips[0];
    if (
      !trip ||
      trip.vehicleId !== input.vehicleId ||
      (actor.driverId && trip.driverId !== actor.driverId) ||
      trip.status === "closed"
    ) {
      throw new AppError(403, "FORBIDDEN", "You cannot update this trip location");
    }
  }
  try {
    await sql.query(
      `INSERT INTO location_updates (vehicle_id, driver_id, trip_id, latitude, longitude, accuracy_m, recorded_at, applied)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
      [
        input.vehicleId,
        actor.driverId,
        input.tripId ?? null,
        input.latitude,
        input.longitude,
        input.accuracyM ?? null,
        input.recordedAt,
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { duplicate: true, applied: false };
    throw error;
  }
  const current = await sql.query<{ recordedAt: string }>(
    `SELECT recorded_at FROM vehicle_locations WHERE vehicle_id = $1`,
    [input.vehicleId],
  );
  const incoming = new Date(input.recordedAt).getTime();
  const previous = current[0] ? new Date(current[0].recordedAt).getTime() : 0;
  if (incoming >= previous) {
    await sql.query(
      `INSERT INTO vehicle_locations (vehicle_id, driver_id, trip_id, latitude, longitude, accuracy_m, availability, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'available'),$8)
       ON CONFLICT (vehicle_id) DO UPDATE SET
         driver_id = EXCLUDED.driver_id,
         trip_id = EXCLUDED.trip_id,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         accuracy_m = EXCLUDED.accuracy_m,
         availability = EXCLUDED.availability,
         recorded_at = EXCLUDED.recorded_at,
         received_at = now()`,
      [
        input.vehicleId,
        actor.driverId,
        input.tripId ?? null,
        input.latitude,
        input.longitude,
        input.accuracyM ?? null,
        input.availability ?? null,
        input.recordedAt,
      ],
    );
    return { duplicate: false, applied: true };
  }
  await sql.query(
    `UPDATE location_updates SET applied = false WHERE vehicle_id = $1 AND recorded_at = $2`,
    [input.vehicleId, input.recordedAt],
  );
  return { duplicate: false, applied: false, reason: "out_of_order" };
}

export async function privateTracking(sql: Sql, actor: Actor, tripId: string) {
  const row = await loadTripBundle(sql, tripId);
  await assertTripAccess(actor, row);
  const points = await sql.query(
    `SELECT latitude, longitude, accuracy_m, recorded_at, received_at, applied
     FROM location_updates WHERE trip_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
    [tripId],
  );
  const current =
    points.find((point) => (point as { applied?: boolean }).applied !== false) ?? points[0] ?? null;
  const stale =
    !current ||
    Date.now() - new Date(String((current as { recordedAt?: string }).recordedAt)).getTime() >
      15 * 60 * 1000;
  return { tripId, current, stale, points };
}

export { tripParties };
