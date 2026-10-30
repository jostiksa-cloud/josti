import type { AppConfig } from "../config";
import type { Sql } from "../db/sql";
import { log } from "../logger";
import { notify, retryPendingPushes } from "../services/notify.service";

export async function runMaintenance(sql: Sql, config: AppConfig): Promise<void> {
  const expiring = await sql.query<{
    id: string;
    ownerUserId: string;
    expiresOn: string;
    docType: string;
  }>(
    `SELECT id, owner_user_id, expires_on, doc_type FROM documents
     WHERE status = 'approved' AND expires_on IS NOT NULL
       AND expires_on >= CURRENT_DATE AND expires_on <= CURRENT_DATE + 30`,
  );
  for (const doc of expiring) {
    const days = Math.ceil((new Date(doc.expiresOn).getTime() - Date.now()) / 86_400_000);
    const bucket = days <= 7 ? "7" : days <= 14 ? "14" : "30";
    await notify(sql, config, {
      userIds: [doc.ownerUserId],
      type: "document_expiry",
      titleEn: "Document expiry reminder",
      titleAr: "تذكير بانتهاء مستند",
      bodyEn: `${doc.docType} expires within ${bucket} days.`,
      bodyAr: `المستند ${doc.docType} سينتهي خلال ${bucket} يومًا.`,
      data: { documentId: doc.id },
      dedupeKey: `expiry:${doc.id}:${bucket}`,
    });
  }
  const expired = await sql.query<{
    id: string;
    ownerUserId: string;
    vehicleId: string | null;
    driverId: string | null;
  }>(
    `SELECT id, owner_user_id, vehicle_id, driver_id FROM documents WHERE status = 'approved' AND expires_on < CURRENT_DATE`,
  );
  for (const doc of expired) {
    await sql.query(`UPDATE documents SET status = 'needs_update' WHERE id = $1`, [doc.id]);
    if (doc.vehicleId)
      await sql.query(
        `UPDATE vehicles SET status = 'needs_update' WHERE id = $1 AND status = 'active'`,
        [doc.vehicleId],
      );
    if (doc.driverId)
      await sql.query(
        `UPDATE drivers SET status = 'needs_update' WHERE id = $1 AND status = 'active'`,
        [doc.driverId],
      );
    await sql.query(
      `UPDATE accounts SET status = 'needs_update' WHERE id = $1 AND status = 'active'`,
      [doc.ownerUserId],
    );
    await notify(sql, config, {
      userIds: [doc.ownerUserId],
      type: "document_expired",
      titleEn: "Document expired",
      titleAr: "انتهت صلاحية مستند",
      bodyEn: "Replace the expired document before operational access can continue.",
      bodyAr: "يرجى استبدال المستند المنتهي قبل متابعة العمليات.",
      data: { documentId: doc.id },
      dedupeKey: `expired:${doc.id}`,
    });
  }
  await retryPendingPushes(sql, config);
}

export function startJobs(sql: Sql, config: AppConfig): () => void {
  const timer = setInterval(() => {
    runMaintenance(sql, config).catch((error) =>
      log("error", "maintenance failed", { err: error }),
    );
  }, config.jobIntervalMs);
  return () => clearInterval(timer);
}
