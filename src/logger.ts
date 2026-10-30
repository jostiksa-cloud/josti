const SECRET_KEYS = [
  "password",
  "token",
  "authorization",
  "iban",
  "secret",
  "apns",
  "service_role",
];

export function redact(fields: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEYS.some((part) => key.toLowerCase().includes(part))) {
      out[key] = "[redacted]";
    } else if (value instanceof Error) {
      out[key] = value.message;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...redact(fields),
  });
  if (level === "error") console.error(line);
  else console.log(line);
}
