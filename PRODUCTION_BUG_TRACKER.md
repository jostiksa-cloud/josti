# Production bug tracker

| ID | Severity | Area | Status | Summary |
| --- | --- | --- | --- | --- |
| P0-1 | **Critical** | API / Auth | **Blocked** | Missing `DATABASE_URL` + `DATABASE_MODE=postgres` on Vercel → API never boots → all logins fail |
| P0-2 | Critical | Auth UX | Fixed (client) | `Unexpected token 'A'` from parsing Vercel plain-text 500 as JSON |
| P0-3 | High | Security / UX | **Fixed** | Demo emails + `Password123` exposed on production login screen / bundle |
| P1-1 | High | Routing | Open | Hard refresh on SPA routes (`/login`, `/requests`, …) returns Vercel `NOT_FOUND` under multi-service config |
| P1-2 | High | API | Partial | Boot crash returned non-JSON; soft-fail JSON 503 added — still needs DB URL |
| P2-1 | Medium | Ops | Open | In-process jobs (`startJobs`) disabled on Vercel by design; document expiry / push retries need alternate runner |
| P2-2 | Medium | Uploads | Unverified | Edge/body size limits may clip >~4.5MB uploads through Vercel Functions |
| P2-3 | Low | Protection | Info | Vercel Authentication (SSO) enabled for non-custom domains; public users need share link or SSO off for open access |
| P3-1 | Low | Build | Info | Vite chunk >500kB warning only; not blocking |

## P0-1 details

- **Root cause:** `loadConfig()` rejects production without Postgres.
- **Evidence:** Vercel runtime logs on `/api/v1/auth/login`.
- **Fix:** Provide `DATABASE_URL` + `DATABASE_MODE=postgres`, redeploy.
- **Files:** `src/config.ts`, Vercel project env (not code).

## P0-3 details

- **Root cause:** Login UI hardcoded demo accounts for local demos.
- **Fix:** Role picker kept; credentials only under `import.meta.env.DEV`.
- **Files:** `web/src/App.tsx`
- **Verified:** Production bundle scan — no `Password123` / `merchant@josti.test`.

## P1-1 details

- **Symptom:** `GET https://josti.vercel.app/login` → `NOT_FOUND`.
- **Homepage `/`:** 200 OK.
- **Attempted:** `web/vercel.json` SPA rewrites; still 404 under `services` routing.
- **Workaround:** Client-side navigation from `/` works; hard refresh does not.
- **Follow-up:** Revisit Vercel Services + Vite SPA fallback or simplify hosting model after DB is fixed.
