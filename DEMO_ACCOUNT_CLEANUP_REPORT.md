# Demo account cleanup report

## Goal

Ensure production users never see default/demo/test login credentials or shortcuts.

## Frontend (web)

### Before

Login screen:

- Role cards autofilled `merchant@josti.test`, `broker@josti.test`, `carrier@josti.test`, `driver@josti.test`
- Displayed shared password `Password123`
- Copy encouraged “demonstration account” usage

### After

- Role cards remain (needed for register role selection) with **generic** labels only
- Email/password fields start **empty** in production
- Demo autofill + note gated by `import.meta.env.DEV` only
- Production Vite build scanned: **no** `Password123`, **no** `@josti.test` emails in `web/dist`

**File:** `web/src/App.tsx`

### Intentionally retained (not login credentials)

- `DEMO_TRUCKS` schematic map markers for guests (public map UX, not auth)
- Register role dropdown (no passwords)

## Admin

No demo credential UI found in `admin/src`.

## Backend / scripts (dev-only; not shipped to browser)

| Location | Content | Production exposure |
| --- | --- | --- |
| `migrations/005_demo_data.sql` | Seeds `@josti.test` users + notes `Password123` / `AdminPass123` | Only if that migration was applied to the DB |
| `scripts/seed-demo.ts` | Creates/uses demo users | CLI only |
| `scripts/export-demo-sql.ts` | Documents demo logins | Source only |
| `scripts/visual-auth-check.mjs` | Uses demo login for visual checks | Local script only |

These are **not** in the browser bundle.

## Production database accounts

Cannot inspect production Postgres rows: **`DATABASE_URL` is not configured** on Vercel or in local `.env`.

### Suspected demo emails (from seed/migration — do not delete without confirmation)

If migration `005_demo_data.sql` or `seed-demo` was applied to the shared Supabase project, these may exist:

- `admin@josti.test`
- `merchant@josti.test`
- `broker@josti.test`
- `carrier@josti.test`
- `driver@josti.test`

**Policy followed:** no deletion or password reset of database accounts. Report only.

## Authentication security

- No mock login
- No auth bypass added
- Password verification unchanged (Argon2id via `Bun.password`)
