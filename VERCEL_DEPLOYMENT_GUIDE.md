# Vercel deployment guide (JOSTI)

Status as of local verification: **web and admin production builds succeed**. Vercel is suitable for the **static React SPAs only**. The Bun API is **not** migrated to Vercel Functions and must stay on a long-running host (see Backend hosting). This guide does not deploy anything; apply settings only after your approval.

## Architecture summary

| Piece | Location | Runtime | Vercel role |
| --- | --- | --- | --- |
| Web app | `web/` | React 19 + Vite 7 + React Router | Static SPA + Edge `/api` proxy |
| Admin app | `admin/` | React 19 + Vite 7 + React Router | Separate Vercel project (optional) |
| API | `src/` | Bun + Hono (`Bun.serve`) | **Do not** host here without a deliberate rewrite |
| Contracts | `packages/contracts` | TypeScript (Vite alias) | Built into the SPA |
| Mobile | `mobile/` | Expo | Out of scope for Vercel |

Browser clients use **relative** `fetch('/api/v1…')` with `credentials: 'include'`. Dev servers proxy `/api` to `127.0.0.1:3000`. Production must keep `/api` on the **same origin** as the SPA so `httpOnly` cookies (`SameSite=Lax`) work. Root `middleware.ts` (and `admin/middleware.ts`) proxy `/api/*` to `JOSTI_API_ORIGIN`.

---

## Web project (primary)

### Exact project root directory

**Repository root** (the folder that contains `package.json`, `web/`, `src/`, and `vercel.json`).

In the Vercel dashboard: leave **Root Directory** empty / `.` (do **not** set it to `web`).

### Framework preset

**Vite**

### Install command

```bash
bun install --frozen-lockfile
```

(Already set in root `vercel.json`.)

### Build command

```bash
bun run build:web
```

### Output directory

```text
web/dist
```

### Configuration files

| File | Purpose |
| --- | --- |
| `vercel.json` | Install/build/output + SPA fallback rewrites |
| `middleware.ts` | Edge proxy for `/api/*` → `JOSTI_API_ORIGIN` |
| `.env.example` | Variable **names** only (no secrets) |

---

## Admin project (optional second Vercel project)

### Root directory

**`admin`**

### Framework preset

**Vite**

### Install / build / output

| Setting | Value |
| --- | --- |
| Install | `cd .. && bun install --frozen-lockfile` |
| Build | `bun run build` |
| Output | `dist` |

Uses `admin/vercel.json` and `admin/middleware.ts` (same proxy behavior as web).

---

## Required environment variables

### On Vercel (web and/or admin projects)

| Name | Public to browser? | Required | Notes |
| --- | --- | --- | --- |
| `JOSTI_API_ORIGIN` | **No** (server-only) | Yes for API | Bun API origin, HTTPS, no trailing slash. Example shape: `https://api.example.com`. Never name this `VITE_*`. |

No `VITE_*` variables are required for the current web/admin clients. Map tile URLs are loaded from `GET /api/v1/public/map-style` (and related public endpoints), not from client env.

### On the Bun API host (not Vercel)

Set in the API server `.env` (never in Vercel client env):

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` / `PORT` | Listen address (often `127.0.0.1` / `3000` behind Nginx) |
| `APP_URL` | Public web origin (Vercel URL or custom domain) |
| `ADMIN_URL` | Public admin origin |
| `API_PUBLIC_URL` | Public API origin (direct API hostname) |
| `CORS_ORIGINS` | Comma-separated list including every web/admin HTTPS origin |
| `TRUST_PROXY` | `true` when requests arrive via Vercel middleware or Nginx |
| `DATABASE_MODE` | `postgres` |
| `DATABASE_URL` | PostgreSQL connection URI |
| `JWT_SECRET` | ≥32 characters, not a placeholder |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | Optional private file storage |
| `SUPABASE_ANON_KEY` | Optional; server config only |
| `MAP_TILE_URL` / `MAP_ATTRIBUTION` | Optional map provider override |
| `SMTP_*` / `FCM_*` / `APNS_*` | Optional email / push |
| `ALLOW_DEV_RESET_TOKEN` | Must stay `false` in production |
| `STORAGE_LOCAL_DIR` | Local files if Supabase storage is unset |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` / `ARGON_MEMORY_COST` / `JOB_INTERVAL_MS` | Optional tuning |

**Do not** put `JWT_SECRET`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, SMTP passwords, FCM/APNs keys, or admin passwords into any `VITE_*` variable or into the Vercel project as publicly exposed client env.

---

## Backend hosting requirements

The API (`src/index.ts`) uses:

- Long-lived `Bun.serve`
- In-process job scheduler (`src/jobs`)
- Persistent SQL pool / optional PGlite directory
- Optional local disk storage under `STORAGE_LOCAL_DIR`
- In-memory rate-limit buckets

**Assessment: do not run this Bun backend on Vercel Functions without an intentional architecture change.** Serverless would break the scheduler model, local storage assumptions, and long-lived process design. Keep the existing Linux + Bun + PM2 (+ Nginx) path in `docs/DEPLOYMENT_GUIDE.md` and `deploy/`.

Minimum API production checklist:

1. Bun 1.3+ on a VM/container you control
2. PostgreSQL (`DATABASE_MODE=postgres` + `DATABASE_URL`)
3. `bun run db:migrate` then admin bootstrap script as needed
4. `pm2` via `ecosystem.config.cjs` or equivalent
5. TLS termination (Nginx or cloud LB)
6. `CORS_ORIGINS` includes the Vercel web/admin origins
7. `TRUST_PROXY=true` when behind Nginx/Vercel proxy
8. Network allowlist/firewall so the Vercel Edge proxy can reach the API over HTTPS

---

## Domain and DNS configuration

### Typical layout

| Host | Points to | Role |
| --- | --- | --- |
| `app.example.com` | Vercel (web project) | User SPA |
| `admin.example.com` | Vercel (admin project) | Admin SPA |
| `api.example.com` | API VM / load balancer | Bun Hono API |

### DNS

1. In Vercel → Project → Settings → Domains, add `app.example.com` (and admin if used).
2. Create the DNS records Vercel shows (usually `CNAME` to `cname.vercel-dns.com`, or A/ALIAS per their UI).
3. Point `api.example.com` at the API host; terminate TLS there.
4. Set Vercel env `JOSTI_API_ORIGIN=https://api.example.com`.
5. On the API host set:

```text
APP_URL=https://app.example.com
ADMIN_URL=https://admin.example.com
API_PUBLIC_URL=https://api.example.com
CORS_ORIGINS=https://app.example.com,https://admin.example.com
TRUST_PROXY=true
```

6. Redeploy/restart API after env changes; redeploy Vercel after `JOSTI_API_ORIGIN` changes.

Preview deployments: add each `https://*.vercel.app` preview origin you need to `CORS_ORIGINS`, or restrict previews until production domains are ready.

### Cookie / auth note

Session cookies are set by the API and, when proxied through Vercel middleware, apply to the **SPA origin**. That matches the Nginx same-origin `/api/` pattern. Cross-origin absolute API URLs in the browser would break `SameSite=Lax` cookies without further backend changes — do not switch the client to a raw cross-origin API URL.

### Upload size note

The API rejects bodies over ~10 MB. Vercel Edge middleware/request limits are lower (platform limit, typically around 4.5 MB). Large document uploads through the Vercel proxy may fail; if that happens, put Nginx (or another reverse proxy) in front of both static files and API, or raise the question before changing architecture.

---

## Frontend production API URL verification

| Check | Result |
| --- | --- |
| `web/src/api.ts` | `fetch(\`/api/v1${path}\`)` — relative, correct for proxy |
| `admin/src/main.tsx` | Same relative `/api/v1` pattern |
| Dev proxy | `web/vite.config.ts` and `admin/vite.config.ts` → `http://127.0.0.1:3000` |
| Client `VITE_*` API URL | None — intentional |
| Production | SPA origin + `middleware.ts` → `JOSTI_API_ORIGIN` |

---

## Feature verification notes (pre-production)

| Area | Finding |
| --- | --- |
| Authentication | Cookie session + `X-JOSTI-Client: web`; CSRF checks `Origin` against `CORS_ORIGINS` in production |
| Database | API-only; Vercel SPA never sees `DATABASE_URL` |
| File uploads | `FormData` to `/api/v1/documents` and `/me/avatar`; require working proxy and storage on API |
| API requests | Same-origin `/api/v1`; credentials included |
| CORS | Configured on Bun via `CORS_ORIGINS`; must list Vercel/custom SPA origins |
| Direct navigation / refresh | `BrowserRouter` + `vercel.json` SPA rewrite to `/index.html` |
| Arabic RTL / English LTR | `document.documentElement.lang/dir` toggled in app; `index.html` defaults to `lang="ar" dir="rtl"` |
| Secrets in browser bundle | No `JWT_SECRET`, DB URLs, or service-role keys in `web/dist` JS. Demo UI still embeds the local demo password string `Password123` for convenience — not a backend secret, but remove before a public launch if undesired |

---

## Bun backend on Vercel Functions?

**Not without breaking the current architecture.** No automatic migration was performed. Continue hosting the API with Bun + PM2 (or equivalent). Vercel only serves the static frontends and proxies `/api`.

---

## Local production build verification

Commands run successfully in this environment:

```bash
bun run build:web
bun run build:admin
```

Both emitted `web/dist` and `admin/dist` without errors. Chunk size warnings only; not blocking.

---

## Deployment verification checklist

Do **not** mark the system production-complete until each box is checked on a real deployment you approve.

### Build / Vercel

- [ ] Vercel Root Directory is repository root for web (or `admin` for the admin project)
- [ ] Framework preset is Vite
- [ ] Install / build / output match this guide
- [ ] `bun run build:web` (and admin if used) succeeds in CI/Vercel logs
- [ ] `JOSTI_API_ORIGIN` set on Vercel (server-only)
- [ ] No secrets stored as `VITE_*` or exposed client env

### Backend

- [ ] API reachable at `JOSTI_API_ORIGIN` over HTTPS
- [ ] `/health` and `/ready` succeed on the API host
- [ ] Postgres mode + migrations applied
- [ ] `CORS_ORIGINS` includes the live SPA origin(s)
- [ ] `TRUST_PROXY=true` when behind proxy
- [ ] Storage mode confirmed (local disk path writable, or Supabase private bucket)

### Runtime checks on the live SPA origin

- [ ] `/` loads
- [ ] Hard refresh on `/login`, `/requests`, `/trips/:id` (and admin routes) does not 404
- [ ] Login sets session; `/api/v1/auth/me` works with cookies
- [ ] Language toggle switches Arabic RTL ↔ English LTR
- [ ] Document upload smoke test (watch Edge body limits)
- [ ] Logout clears session
- [ ] Browser Network panel shows API calls to same SPA origin `/api/v1/...` (not a leaked absolute secret URL)

### Explicit non-goals until you approve

- [ ] No production DNS cutover without approval
- [ ] No API migration onto Vercel Functions without approval
- [ ] No destruction/replacement of the existing Bun backend

---

## Quick Vercel dashboard recipe (web)

1. Import the Git repository into Vercel.
2. Root Directory: **.** (repository root).
3. Confirm Framework **Vite**, install/build/output from `vercel.json`.
4. Add env `JOSTI_API_ORIGIN` = your Bun API HTTPS origin.
5. Deploy preview only; run the checklist above.
6. Attach custom domain when ready.
7. Update API `APP_URL` / `CORS_ORIGINS` / `TRUST_PROXY` to match.

Do not run `vercel deploy --prod` or change live DNS until you explicitly approve.
