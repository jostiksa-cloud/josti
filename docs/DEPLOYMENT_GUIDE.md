# Deployment guide

Development commands below are for Windows PowerShell in `C:\Users\admin\Downloads\JOSTI`. Production commands are Bash on Linux.

## Development

1. Install Bun 1.3 or newer.
2. `bun install --frozen-lockfile`
3. Copy `.env.example` to `.env`. Set `JWT_SECRET` to at least 32 random characters. Leave `DATABASE_MODE=pglite` for local development.
4. `bun run db:migrate`
5. Create an administrator: set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then `bun scripts/create-admin.ts`
6. `bun run dev` starts the API at `http://127.0.0.1:3000`. Health: `/health`. Readiness: `/ready`.
7. `bun run --cwd web dev` at `http://127.0.0.1:5173`.
8. `bun run --cwd admin dev` at `http://127.0.0.1:5174`.
9. Mobile: set `EXPO_PUBLIC_API_URL` to the computer's LAN address, then `bun run --cwd mobile start`. Do not ship a development URL in a store build.

## Linux production

Prerequisites: Bun, Nginx, PM2, PostgreSQL client tools, and a Supabase or other PostgreSQL database.

```bash
bash deploy/install.sh
# edit .env: NODE_ENV=production, DATABASE_MODE=postgres, DATABASE_URL, JWT_SECRET, HTTPS origins
bash deploy/migrate.sh
ADMIN_EMAIL=... ADMIN_PASSWORD=... bun scripts/create-admin.ts
bash deploy/start.sh
```

`ecosystem.config.cjs` starts `bun src/index.ts` through PM2. Nginx examples are in `deploy/nginx/josti.conf.example`. Serve `web/dist` and `admin/dist` as static files and proxy `/api/` to `127.0.0.1:3000`.

Backups: `deploy/backup.sh` uses `pg_dump`. Restore with `deploy/restore.sh`, then `deploy/migrate.sh`.

Object storage: leave Supabase storage variables empty to use `STORAGE_LOCAL_DIR`, or set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`. The bucket must be private.

Maps: set `MAP_TILE_URL` if OpenStreetMap is not acceptable. Push: set FCM and APNs variables. Empty values keep push undispatched and recorded as skipped.

Rollback: keep the previous release directory and the latest database dump. Restore the dump only if the new migration cannot be rolled forward safely. Do not drop a production database to re-run migrations.
