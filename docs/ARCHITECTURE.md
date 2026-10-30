# JOSTI architecture

JOSTI is a monorepo for Intelligent Transport Corporation, implemented by VEGA. It coordinates customs-cleared container transport. It does not operate a fleet.

## Runtime

- API: Bun, TypeScript, Hono, REST under `/api/v1`.
- Database: PostgreSQL. Production uses `DATABASE_URL` (Supabase PostgreSQL or another PostgreSQL 15+ server). Development and automated tests use embedded PGlite when `DATABASE_MODE=pglite`.
- Web: React, TypeScript, Vite in `web/` on port 5173.
- Admin: React, TypeScript, Vite in `admin/` on port 5174.
- Mobile: React Native and Expo in `mobile/`, same API and rules.
- Jobs: in-process scheduler in the API process for document expiry and push retries.

## Request path

Browser and mobile clients call the API. Web and admin development servers proxy `/api` to `127.0.0.1:3000`, so session cookies stay on the application origin. Mobile clients send `Authorization: Bearer` access tokens and store refresh tokens in the device secure store.

Protected routes load the account and session on every request. Suspension and permission changes apply without waiting for access-token expiry.

## Persistence

SQL migrations live in `migrations/` and are applied by `src/db/migrate-cli.ts`. Business changes that must be atomic (carrier assignment, trip confirmation, fee creation, ratings) run inside a database transaction. Partial unique indexes prevent two open requests for one container, two active trips for one driver or vehicle, and more than one platform fee per trip.

Private files are stored on the local disk (`STORAGE_LOCAL_DIR`) unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are both set, in which case Supabase Storage is used. Downloads always pass through an authorized API route. Permanent public storage URLs are not issued.

## Realtime

Trip locations and notifications are loaded by authenticated polling (the web trip screen polls every 15 seconds). Supabase Realtime is not required. The choice is recorded in `docs/DECISIONS_AND_ASSUMPTIONS.md`.

## Maps

The public map uses Leaflet and OpenStreetMap tiles. Coordinates shown to the public are rounded to two decimal degrees. Exact coordinates are returned only to trip participants and authorized administrators.
