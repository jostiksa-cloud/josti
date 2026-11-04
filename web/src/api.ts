export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export type Row = Record<string, unknown>;

export async function api<T>(
  path: string,
  options: { method?: string; json?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers = new Headers({ "X-JOSTI-Client": "web" });
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }
  if (options.form) body = options.form;
  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: "include",
  });
  const text = await response.text();
  let payload: { data?: T; error?: { message?: string; details?: unknown } } = {};
  if (text) {
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      throw new ApiError(
        response.status || 502,
        response.ok
          ? "The server returned a non-JSON response"
          : text.split("\n").find((line) => line.trim()) || "Request failed",
      );
    }
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload.error?.message ?? "Request failed",
      payload.error?.details,
    );
  return payload.data as T;
}

export function text(value: unknown): string {
  return value == null ? "" : String(value);
}
