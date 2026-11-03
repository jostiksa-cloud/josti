/**
 * Vercel Edge Middleware — proxies /api/* to the Bun API origin.
 *
 * Keeps browser calls on the Vercel origin so httpOnly session cookies
 * (SameSite=Lax) continue to work. Does not run the Bun backend on Vercel.
 *
 * Server-only env: JOSTI_API_ORIGIN (e.g. https://api.example.com)
 * Never prefix this with VITE_ — it must not be embedded in the client bundle.
 */

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

export const config = {
  matcher: "/api/:path*",
};

export default async function middleware(request: Request): Promise<Response> {
  const apiOrigin = (process.env.JOSTI_API_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (!apiOrigin) {
    return Response.json(
      {
        error: {
          code: "API_ORIGIN_MISSING",
          message: "JOSTI_API_ORIGIN is not configured on this Vercel project",
        },
      },
      { status: 502 },
    );
  }

  const incoming = new URL(request.url);
  const target = `${apiOrigin}${incoming.pathname}${incoming.search}`;
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp.split(",")[0]?.trim() ?? clientIp);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  headers.set("x-forwarded-host", incoming.host);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    // Required for streaming request bodies in the Edge fetch implementation.
    (init as RequestInit & { duplex?: string }).duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json(
      {
        error: {
          code: "API_UNREACHABLE",
          message: "The JOSTI API origin could not be reached",
        },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    responseHeaders.set(key, value);
  });
  const getSetCookie = (
    upstream.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const cookies = typeof getSetCookie === "function" ? getSetCookie.call(upstream.headers) : [];
  for (const cookie of cookies) responseHeaders.append("set-cookie", cookie);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
