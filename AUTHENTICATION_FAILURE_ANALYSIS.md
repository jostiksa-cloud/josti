# Authentication failure analysis (production)

## Verdict

**All production logins fail because the API process never starts.**  
Authentication code, password hashing, and session cookies are not reached.

## Evidence (Vercel runtime logs)

```
POST /api/v1/auth/login
Error: JOSTI cannot start. Missing or invalid configuration:
- DATABASE_URL and DATABASE_MODE=postgres (embedded PGlite is only for development and tests)
Bun process exited with exit status: 1.
```

Same failure for `GET /api/v1/auth/me`, `GET /api/v1/public/ports`, and other `/api` routes.

Vercel surfaces this as plain text:

```text
A server error has occurred
FUNCTION_INVOCATION_FAILED
```

The web client previously attempted `JSON.parse` on that body, producing:

```text
Unexpected token 'A', "A server e"... is not valid JSON
```

## Auth path (intended)

1. Login form → `POST /api/v1/auth/login` with `{ email, password }`
2. `loginAccount` verifies Argon2id hash, creates session
3. Sets `josti_access` / `josti_refresh` httpOnly cookies (`SameSite=Lax`, `Secure` in production)
4. `GET /api/v1/auth/me` loads role/permissions
5. Frontend stores account in React state; cookies persist session

## Why every account fails

| Step | Status |
| --- | --- |
| Form submit | Reaches browser network |
| API URL | Correct relative `/api/v1` |
| Function invoke | Starts, then **crashes in `loadConfig()`** |
| User lookup / password verify | **Never runs** |
| Session / cookies | **Never set** |

Not caused by wrong passwords, role mismatch, or CORS. Caused by **missing production database configuration**.

## Local vs Vercel

| Variable | Local `.env` | Vercel Production |
| --- | --- | --- |
| `DATABASE_URL` | **EMPTY** | **MISSING** |
| `DATABASE_MODE` | `pglite` (dev) | **MISSING** (defaults to pglite → rejected when `NODE_ENV=production`) |
| `JWT_SECRET` | SET | SET |
| `APP_URL` / `CORS_ORIGINS` | localhost | `https://josti.vercel.app` |
| `TRUST_PROXY` | SET | `true` |
| Supabase storage keys | SET | SET |

## Fixes applied (partial)

1. Soft-fail boot on Vercel: return JSON `503 CONFIG_INVALID` instead of crashing with non-JSON 500 (`src/index.ts`).
2. Client parses non-JSON errors safely (`web/src/api.ts`, admin client).
3. Demo credentials removed from production login UI (see `DEMO_ACCOUNT_CLEANUP_REPORT.md`).

## Fix still required (blocker)

Set on Vercel Production **and** Preview:

- `DATABASE_MODE=postgres`
- `DATABASE_URL=<Supabase or Postgres connection URI>`

Then redeploy and re-test login.

**Do not** reset passwords or weaken hashing as a workaround.
