import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppConfig } from "../config";
import type { Sql } from "../db/sql";
import { AppError } from "../lib/errors";
import type { Actor } from "./access";
import { hasPermission, requireActive, requirePermission, sameOrg } from "./access";
import { resolveRuntimeConfig } from "./integrations.service";
import { notify } from "./notify.service";

const MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = new Set(["loading_photo"]);
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function detectFile(bytes: Uint8Array, declared: string): string | null {
  if (bytes.length < 12 || bytes.length > MAX_BYTES) return null;
  const pdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  const detected = pdf
    ? "application/pdf"
    : jpeg
      ? "image/jpeg"
      : png
        ? "image/png"
        : webp
          ? "image/webp"
          : null;
  if (!detected || !ALLOWED_MIME.has(detected)) return null;
  const normalized =
    declared === "image/jpg" || declared === "image/pjpeg" ? "image/jpeg" : declared;
  if (
    !normalized ||
    normalized === "application/octet-stream" ||
    normalized === detected ||
    (normalized.startsWith("image/") && detected.startsWith("image/"))
  ) {
    return detected;
  }
  return null;
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Buffer.from(digest).toString("hex");
}

export async function storeObject(
  sql: Sql,
  config: AppConfig,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const live = await resolveRuntimeConfig(sql, config);
  const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  if (live.storageMode === "supabase" && live.supabaseUrl && live.supabaseServiceKey) {
    const response = await fetch(
      `${live.supabaseUrl}/storage/v1/object/${live.supabaseBucket}/${key}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${live.supabaseServiceKey}`,
          "Content-Type": mime,
          "x-upsert": "false",
        },
        body: bytes,
      },
    );
    if (!response.ok) {
      throw new AppError(502, "STORAGE_FAILED", "Private object storage rejected the upload");
    }
    return key;
  }
  const path = join(live.localStorageDir, key);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, bytes);
  return key;
}

export async function readObject(sql: Sql, config: AppConfig, key: string): Promise<Uint8Array> {
  if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Invalid document reference");
  }
  const live = await resolveRuntimeConfig(sql, config);
  if (live.storageMode === "supabase" && live.supabaseUrl && live.supabaseServiceKey) {
    const response = await fetch(
      `${live.supabaseUrl}/storage/v1/object/${live.supabaseBucket}/${key}`,
      {
        headers: { Authorization: `Bearer ${live.supabaseServiceKey}` },
      },
    );
    if (!response.ok) throw new AppError(404, "NOT_FOUND", "Document content was not found");
    return new Uint8Array(await response.arrayBuffer());
  }
  const file = Bun.file(join(live.localStorageDir, key));
  if (!(await file.exists()))
    throw new AppError(404, "NOT_FOUND", "Document content was not found");
  return new Uint8Array(await file.arrayBuffer());
}

type DocRow = {
  id: string;
  ownerUserId: string;
  organizationId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  requestId: string | null;
  tripId: string | null;
  incidentId: string | null;
  docType: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  expiresOn: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

const IDENTITY_TYPES = new Set([
  "commercial_registration",
  "tax_identification",
  "national_address",
  "iban_certificate",
  "business_mobile_evidence",
  "customs_clearance_license",
  "office_commercial_registration",
  "fasah_account_evidence",
  "broker_national_address",
  "driver_license",
  "residence_permit",
  "passport",
]);

export async function canReadDocument(sql: Sql, actor: Actor, doc: DocRow): Promise<boolean> {
  if (actor.id === doc.ownerUserId) return true;
  if (sameOrg(actor, doc.organizationId)) return true;
  if (hasPermission(actor, "general")) return true;
  if (hasPermission(actor, "verification") && IDENTITY_TYPES.has(doc.docType)) return true;
  if (hasPermission(actor, "operations") && !IDENTITY_TYPES.has(doc.docType)) return true;
  if (doc.tripId) {
    const trips = await sql.query<{
      merchantOrgId: string;
      brokerOrgId: string;
      carrierOrgId: string;
      driverUserId: string;
    }>(
      `SELECT r.merchant_org_id, r.broker_org_id, t.carrier_org_id, d.user_id AS driver_user_id
       FROM trips t
       JOIN transport_requests r ON r.id = t.request_id
       JOIN drivers d ON d.id = t.driver_id
       WHERE t.id = $1`,
      [doc.tripId],
    );
    const trip = trips[0];
    if (!trip) return false;
    return (
      sameOrg(actor, trip.merchantOrgId) ||
      sameOrg(actor, trip.brokerOrgId) ||
      sameOrg(actor, trip.carrierOrgId) ||
      actor.id === trip.driverUserId
    );
  }
  if (doc.requestId) {
    const requests = await sql.query<{ merchantOrgId: string; brokerOrgId: string }>(
      `SELECT merchant_org_id, broker_org_id FROM transport_requests WHERE id = $1`,
      [doc.requestId],
    );
    const request = requests[0];
    return (
      !!request && (sameOrg(actor, request.merchantOrgId) || sameOrg(actor, request.brokerOrgId))
    );
  }
  return false;
}

export function publicDocument(doc: DocRow) {
  return {
    id: doc.id,
    docType: doc.docType,
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    expiresOn: doc.expiresOn,
    reviewNotes: doc.reviewNotes,
    organizationId: doc.organizationId,
    vehicleId: doc.vehicleId,
    driverId: doc.driverId,
    requestId: doc.requestId,
    tripId: doc.tripId,
    incidentId: doc.incidentId,
    createdAt: doc.createdAt,
  };
}

export async function createDocument(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  input: {
    docType: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    expiresOn?: string | null;
    vehicleId?: string | null;
    driverId?: string | null;
    requestId?: string | null;
    tripId?: string | null;
    incidentId?: string | null;
    replacesId?: string | null;
  },
): Promise<DocRow> {
  if (actor.status === "suspended")
    throw new AppError(403, "SUSPENDED", "This account is suspended");
  if (IMAGE_TYPES.has(input.docType) && input.mimeType === "application/pdf") {
    throw new AppError(422, "INVALID_FILE", "Loading evidence must be a photograph");
  }
  const mime = detectFile(input.bytes, input.mimeType);
  if (!mime)
    throw new AppError(422, "INVALID_FILE", "Upload a PDF, JPEG, PNG, or WebP file up to 10 MB");
  if (input.vehicleId) {
    const vehicles = await sql.query<{ organizationId: string }>(
      `SELECT organization_id FROM vehicles WHERE id = $1`,
      [input.vehicleId],
    );
    if (!vehicles[0] || !sameOrg(actor, vehicles[0].organizationId)) {
      throw new AppError(403, "FORBIDDEN", "You cannot attach a document to this vehicle");
    }
  }
  if (input.requestId || input.tripId) {
    requireActive(actor);
  }
  const vehicleDocs = new Set([
    "vehicle_registration",
    "vehicle_operating_card",
    "operating_license",
    "insurance",
    "periodic_inspection",
  ]);
  const driverDocs = new Set(["driver_license", "residence_permit", "passport"]);
  if (vehicleDocs.has(input.docType) && !input.vehicleId) {
    throw new AppError(422, "INVALID_FILE", "Choose the vehicle this document belongs to");
  }
  if (driverDocs.has(input.docType) && !input.driverId && !actor.driverId) {
    throw new AppError(422, "INVALID_FILE", "Choose the driver this document belongs to");
  }
  const key = await storeObject(sql, config, input.bytes, mime);
  const digest = await sha256Bytes(input.bytes);
  const rows = await sql.query<DocRow>(
    `INSERT INTO documents
      (owner_user_id, organization_id, vehicle_id, driver_id, request_id, trip_id, incident_id, doc_type,
       storage_key, original_filename, mime_type, size_bytes, sha256, expires_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      actor.id,
      actor.organizationId,
      input.vehicleId ?? null,
      input.driverId ?? actor.driverId,
      input.requestId ?? null,
      input.tripId ?? null,
      input.incidentId ?? null,
      input.docType,
      key,
      input.filename.slice(0, 180),
      mime,
      input.bytes.byteLength,
      digest,
      input.expiresOn ?? null,
    ],
  );
  const doc = rows[0];
  if (!doc) throw new AppError(500, "UPLOAD_FAILED", "Could not store the document");
  if (input.replacesId) {
    await sql.query(
      `UPDATE documents SET status = 'replaced', replaced_by = $2
       WHERE id = $1 AND owner_user_id = $3 AND status <> 'replaced'`,
      [input.replacesId, doc.id, actor.id],
    );
  }
  return doc;
}

export async function reviewDocument(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  documentId: string,
  decision: "approved" | "rejected" | "needs_update",
  notes?: string,
  expiresOn?: string,
) {
  requirePermission(actor, "verification");
  const docs = await sql.query<DocRow>(`SELECT * FROM documents WHERE id = $1`, [documentId]);
  const doc = docs[0];
  if (!doc || doc.status === "replaced") throw new AppError(404, "NOT_FOUND", "Document not found");
  await sql.query(
    `UPDATE documents SET status = $2, review_notes = $3, reviewed_by = $4, reviewed_at = now(), expires_on = COALESCE($5::date, expires_on)
     WHERE id = $1`,
    [documentId, decision, notes ?? null, actor.id, expiresOn ?? null],
  );
  if (decision === "approved" && doc.vehicleId && expiresOn) {
    const column =
      doc.docType === "insurance"
        ? "insurance_expiry"
        : doc.docType === "periodic_inspection"
          ? "inspection_expiry"
          : doc.docType === "vehicle_registration"
            ? "registration_expiry"
            : doc.docType === "vehicle_operating_card"
              ? "operating_card_expiry"
              : null;
    if (column) {
      await sql.query(`UPDATE vehicles SET ${column} = $2::date WHERE id = $1`, [
        doc.vehicleId,
        expiresOn,
      ]);
    }
  }
  if (decision === "approved" && doc.docType === "driver_license" && doc.driverId && expiresOn) {
    await sql.query(`UPDATE drivers SET license_expiry = $2::date WHERE id = $1`, [
      doc.driverId,
      expiresOn,
    ]);
  }
  await sql.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'document.review', 'document', $2, $3::jsonb)`,
    [actor.id, documentId, JSON.stringify({ decision })],
  );
  await notify(sql, config, {
    userIds: [doc.ownerUserId],
    type: "document_review",
    titleEn: decision === "approved" ? "Document approved" : "Document needs attention",
    titleAr: decision === "approved" ? "تم اعتماد المستند" : "المستند يحتاج إلى إجراء",
    bodyEn: notes || `Review result: ${decision}`,
    bodyAr: notes || (decision === "approved" ? "تم اعتماد المستند" : "يرجى مراجعة المستند"),
    data: { documentId, decision },
    dedupeKey: `document_review:${documentId}:${decision}`,
  });
}

export async function saveAvatar(
  sql: Sql,
  config: AppConfig,
  actor: Actor,
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  if (actor.status === "suspended")
    throw new AppError(403, "SUSPENDED", "This account is suspended");
  const mime = detectFile(bytes, mimeType);
  if (!mime || mime === "application/pdf") {
    throw new AppError(422, "INVALID_FILE", "The profile picture must be a JPEG, PNG, or WebP");
  }
  const key = await storeObject(sql, config, bytes, mime);
  await sql.query(`UPDATE accounts SET avatar_storage_key = $2 WHERE id = $1`, [actor.id, key]);
  return { updated: true };
}

export async function readAvatar(sql: Sql, config: AppConfig, actor: Actor) {
  const rows = await sql.query<{ avatarStorageKey: string | null; fullName: string }>(
    `SELECT avatar_storage_key, full_name FROM accounts WHERE id = $1`,
    [actor.id],
  );
  const key = rows[0]?.avatarStorageKey;
  if (!key) throw new AppError(404, "NOT_FOUND", "No profile picture has been uploaded");
  const bytes = await readObject(sql, config, key);
  const mime = detectFile(bytes, "application/octet-stream") ?? "image/jpeg";
  return { bytes, mime };
}

export async function listOwnDocuments(sql: Sql, actor: Actor) {
  if (hasPermission(actor, "verification") || hasPermission(actor, "general")) {
    return sql.query<DocRow>(`SELECT * FROM documents ORDER BY created_at DESC LIMIT 200`);
  }
  return sql.query<DocRow>(
    `SELECT * FROM documents WHERE owner_user_id = $1 OR organization_id = $2 ORDER BY created_at DESC`,
    [actor.id, actor.organizationId],
  );
}
