import { importPKCS8, SignJWT } from "jose";
import type { AppConfig } from "../config";
import type { Sql } from "../db/sql";
import { log } from "../logger";
import { resolveRuntimeConfig } from "./integrations.service";

export type Notice = {
  userIds: string[];
  type: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
};

export async function notify(sql: Sql, config: AppConfig, notice: Notice): Promise<void> {
  const uniqueUsers = [...new Set(notice.userIds.filter(Boolean))];
  for (const userId of uniqueUsers) {
    const params = [
      userId,
      notice.type,
      notice.titleEn,
      notice.titleAr,
      notice.bodyEn,
      notice.bodyAr,
      JSON.stringify(notice.data ?? {}),
      notice.dedupeKey ?? null,
    ];
    const inserted = notice.dedupeKey
      ? await sql.query<{ id: string }>(
          `INSERT INTO notifications
            (user_id, type, title_en, title_ar, body_en, body_ar, data, dedupe_key, push_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'pending')
           ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
           RETURNING id`,
          params,
        )
      : await sql.query<{ id: string }>(
          `INSERT INTO notifications
            (user_id, type, title_en, title_ar, body_en, body_ar, data, push_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'pending')
           RETURNING id`,
          params.slice(0, 7),
        );
    const notificationId = inserted[0]?.id;
    if (!notificationId) continue;
    await dispatchPush(sql, config, userId, notificationId, notice);
  }
}

async function dispatchPush(
  sql: Sql,
  config: AppConfig,
  userId: string,
  notificationId: string,
  notice: Notice,
) {
  const tokens = await sql.query<{ id: string; platform: string; token: string }>(
    `SELECT id, platform, token FROM push_tokens WHERE user_id = $1 AND disabled_at IS NULL`,
    [userId],
  );
  if (tokens.length === 0) {
    await sql.query(`UPDATE notifications SET push_status = 'skipped_no_token' WHERE id = $1`, [
      notificationId,
    ]);
    return;
  }
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  const live = await resolveRuntimeConfig(sql, config);
  for (const token of tokens) {
    const result = await sendToToken(live, token, notice);
    if (result.status === "sent") sent += 1;
    else if (result.status === "failed") {
      failed += 1;
      if (result.error) errors.push(result.error);
      if (result.disable) {
        await sql.query(
          `UPDATE push_tokens SET disabled_at = now(), last_error = $2 WHERE id = $1`,
          [token.id, result.error ?? "invalid"],
        );
      } else if (result.error) {
        await sql.query(`UPDATE push_tokens SET last_error = $2 WHERE id = $1`, [
          token.id,
          result.error,
        ]);
      }
    } else skipped += 1;
  }
  const status = sent > 0 ? "sent" : failed > 0 ? "failed" : "skipped_no_provider";
  await sql.query(
    `UPDATE notifications SET push_status = $2, push_error = $3, push_provider = $4 WHERE id = $1`,
    [notificationId, status, errors[0] ?? null, sent > 0 ? "provider" : null],
  );
  if (skipped && !sent && !failed) {
    log("info", "push skipped, provider not configured", { notificationId });
  }
}

type PushResult = { status: "sent" | "failed" | "skipped"; error?: string; disable?: boolean };

async function sendToToken(
  config: AppConfig,
  token: { platform: string; token: string },
  notice: Notice,
): Promise<PushResult> {
  if (token.platform === "ios") return sendApns(config, token.token, notice);
  return sendFcm(config, token.token, notice);
}

export async function sendFcm(
  config: AppConfig,
  token: string,
  notice: Pick<Notice, "titleEn" | "bodyEn" | "data">,
): Promise<PushResult> {
  if (!config.fcmServerKey) return { status: "skipped" };
  try {
    const response = await fetch(config.fcmEndpoint, {
      method: "POST",
      headers: {
        Authorization: `key=${config.fcmServerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: { title: notice.titleEn, body: notice.bodyEn },
        data: notice.data ?? {},
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      failure?: number;
      results?: { error?: string }[];
    };
    const error = payload.results?.find((item) => item.error)?.error;
    if (!response.ok || (payload.failure ?? 0) > 0 || error) {
      const disable = error === "NotRegistered" || error === "InvalidRegistration";
      return { status: "failed", error: error ?? `fcm_${response.status}`, disable };
    }
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "fcm_network" };
  }
}

async function sendApns(config: AppConfig, token: string, notice: Notice): Promise<PushResult> {
  if (!config.apnsKeyId || !config.apnsTeamId || !config.apnsBundleId || !config.apnsPrivateKey) {
    return { status: "skipped" };
  }
  try {
    const key = await importPKCS8(config.apnsPrivateKey.replace(/\\n/g, "\n"), "ES256");
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: config.apnsKeyId })
      .setIssuer(config.apnsTeamId)
      .setIssuedAt()
      .sign(key);
    const host = config.apnsProduction
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
    const response = await fetch(`${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": config.apnsBundleId,
        "apns-push-type": "alert",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: { alert: { title: notice.titleEn, body: notice.bodyEn }, sound: "default" },
        data: notice.data ?? {},
      }),
    });
    if (response.status === 410 || response.status === 400) {
      const body = await response.text();
      return { status: "failed", error: body.slice(0, 300), disable: response.status === 410 };
    }
    if (!response.ok) return { status: "failed", error: `apns_${response.status}` };
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "apns_error" };
  }
}

export async function retryPendingPushes(sql: Sql, config: AppConfig): Promise<void> {
  const pending = await sql.query<{
    id: string;
    userId: string;
    titleEn: string;
    bodyEn: string;
    data: Record<string, unknown>;
  }>(
    `SELECT id, user_id, title_en, body_en, data FROM notifications
     WHERE push_status IN ('pending', 'failed') AND created_at > now() - interval '1 day'
     ORDER BY created_at ASC LIMIT 50`,
  );
  for (const row of pending) {
    await dispatchPush(sql, config, row.userId, row.id, {
      userIds: [row.userId],
      type: "retry",
      titleEn: row.titleEn,
      titleAr: row.titleEn,
      bodyEn: row.bodyEn,
      bodyAr: row.bodyEn,
      data: row.data ?? {},
    });
  }
}
