# JOSTI production readiness audit

## Executive summary

The Vercel deployment serves the **web SPA homepage**, but the **Bun/Hono API does not start in production** because `DATABASE_URL` and `DATABASE_MODE=postgres` are missing. That single defect causes **all logins to fail** and blocks every authenticated workflow.

Demo login credentials have been **removed from production frontend builds**. Role-by-role auth testing and end-to-end workflow verification **cannot complete** until a production Postgres URL is supplied.

**Production-ready: NO**

---

## Components inventoried

| Component | Location | Runtime | Production hosting |
| --- | --- | --- | --- |
| Web frontend | `web/` | React 19 + Vite 7 | Vercel service `web` |
| Admin dashboard | `admin/` | React 19 + Vite 7 | Vercel service `admin` (`/admin/*`) |
| Backend API | `src/` | Bun + Hono | Vercel service `app` (`/api/*`) |
| Auth | `src/services/auth.service.ts` + cookies | JWT + Argon2id | Same API |
| Database | Postgres (prod) / PGlite (dev) | `postgres` / `@electric-sql/pglite` | **Not connected on Vercel** |
| File storage | Supabase Storage or local disk | Server-side only | Supabase keys present; DB URL missing |
| Mobile | `mobile/` | Expo | Out of Vercel scope |
| GitHub | `jostiksa-cloud/josti` | branch `main` | Connected |
| Vercel | project `josti` (team VEGA) | framework `services` | https://josti.vercel.app |

---

## Local vs production configuration differences

| Item | Local | Vercel Production | Risk |
| --- | --- | --- | --- |
| `NODE_ENV` | development | production | Config enforces Postgres |
| `DATABASE_MODE` | pglite | **unset** | Boot failure |
| `DATABASE_URL` | **empty** | **missing** | Boot failure |
| `APP_URL` | localhost:5173 | https://josti.vercel.app | OK once API works |
| `CORS_ORIGINS` | localhost ports | josti.vercel.app (+ team alias) | OK once API works |
| `TRUST_PROXY` | set | true | OK |
| `JWT_SECRET` | set | set | OK |
| Supabase URL/keys | set | set | Storage OK; not a substitute for `DATABASE_URL` |
| API access pattern | Vite proxy `/api` → :3000 | Middleware/service `/api` → Hono | OK |
| Jobs scheduler | In-process | Skipped when `VERCEL` | Document expiry/push need external runner |
| Framework preset | N/A | `services` (Hono+Vite+Vite) | SPA deep links broken |

---

## Discovered problems

See `PRODUCTION_BUG_TRACKER.md` for the live list. Highest impact:

1. **Missing Postgres env on Vercel** → API crash → login impossible  
2. **Demo credentials on login UI** → fixed for production builds  
3. **SPA hard-refresh 404** on client routes  
4. **Non-JSON 500** confusing the client → soft-fail + safer parse  

---

## Authentication root cause and repair status

Documented in `AUTHENTICATION_FAILURE_ANALYSIS.md`.

| Action | Status |
| --- | --- |
| Trace login → API → DB | Done; fails at `loadConfig` |
| Soft-fail JSON 503 on Vercel boot | Implemented (`src/index.ts`) |
| Safer client error parsing | Implemented |
| Set `DATABASE_URL` on Vercel | **Blocked — secret not available** |
| Re-test login for all roles | **Blocked** |

---

## Demo account cleanup

Documented in `DEMO_ACCOUNT_CLEANUP_REPORT.md`. Production bundle verified clean of demo passwords/emails.

---

## Database / backend safety

- No production DB reset, drop, or seed applied from this session  
- No password resets of real accounts  
- Migrations exist under `migrations/`; applying them requires a live `DATABASE_URL`  
- `005_demo_data.sql` may have created `@josti.test` users **if** previously applied to the shared Supabase project — identify before any cleanup; **do not delete without explicit confirmation**

---

## Vercel configuration (current)

| Setting | Value |
| --- | --- |
| Repo / branch | `jostiksa-cloud/josti` / `main` |
| Root directory | repository root |
| Framework | `services` |
| Services | `app` (hono), `web` (vite), `admin` (vite) |
| Rewrites | `/admin`→admin, `/api`→app, `/*`→web |
| Bun | `bunVersion: 1.x` |
| Env (present) | `NODE_ENV`, `APP_URL`, `ADMIN_URL`, `API_PUBLIC_URL`, `CORS_ORIGINS`, `TRUST_PROXY`, `JWT_SECRET`, Supabase + map vars |
| Env (**missing**) | `DATABASE_URL`, `DATABASE_MODE` |

Private keys are server-side only; no `VITE_*` secrets.

---

## Fixes implemented in this pass

1. `src/index.ts` — boot failure returns JSON 503 on Vercel instead of hard crash  
2. `web/src/api.ts` / admin client — tolerate non-JSON error bodies  
3. `web/src/App.tsx` — remove production demo credential UI; DEV-only helpers  
4. Reports created (this file + related)  
5. Prior session: Vercel MCP connect, project link, env upsert (without DB URL), multi-service deploy  

---

## What is required next (stop condition)

Provide the production Postgres connection string:

```text
DATABASE_MODE=postgres
DATABASE_URL=postgresql://...
```

(Recommended: Supabase **Session pooler** URI for the project already referenced by `SUPABASE_URL`.)

Then:

1. Upsert env on Vercel Production + Preview  
2. Redeploy  
3. Confirm `GET /api/v1/ready`  
4. Execute role login matrix with **authorized** test accounts (not fabricated)  
5. Re-check SPA deep links  

---

## Related reports

- `AUTHENTICATION_FAILURE_ANALYSIS.md`  
- `PRODUCTION_BUG_TRACKER.md`  
- `DEMO_ACCOUNT_CLEANUP_REPORT.md`  
- `PRODUCTION_VERIFICATION_REPORT.md`  
- `VERCEL_DEPLOYMENT_GUIDE.md`  
