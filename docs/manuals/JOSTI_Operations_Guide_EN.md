# JOSTI Operations Guide

Version 1.0.0 · 15 October 2026 · Intelligent Transport Corporation · Implemented by VEGA

## 1. Introduction and scope

JOSTI (جوستي) coordinates transportation of customs-cleared shipping containers from Saudi ports to merchant warehouses. It connects merchants, customs brokers, carrier companies, independent carriers, drivers, and administrators. JOSTI does not own or operate trucks.

Implemented modules:

- REST API on Bun and Hono.
- PostgreSQL schema and SQL migrations.
- Merchant, broker, carrier, and driver web application.
- Administrative dashboard.
- React Native / Expo mobile application.
- Private document storage, trip workflow, GPS updates, in-app notifications, ratings, incidents, and platform-fee records.

Supported clients: current Chrome, Edge, Firefox, or Safari; Android and iOS through the Expo application. The API must be reachable over HTTPS in production.

Not implemented: Fasah or other government connections, SMS, WhatsApp, auctions, return trips, maintenance, warehousing, price prediction, wallets, and payment gateways. External payment, clearance, and fee settlement are records of work done outside JOSTI.

## 2. Installation and startup

Required software: Bun 1.3 or newer, and a current browser. Production also needs Linux, Nginx, PM2, and PostgreSQL 15 or newer (Supabase PostgreSQL is supported).

Repository layout:

- `src/` API, middleware, services, jobs.
- `web/` merchant and operations web app.
- `admin/` administration dashboard.
- `mobile/` Expo application.
- `migrations/` SQL migrations.
- `deploy/` Linux Bash scripts.
- `docs/manuals/` this guide.

Windows development:

```powershell
cd C:\Users\admin\Downloads\JOSTI
bun install --frozen-lockfile
copy .env.example .env
bun run db:migrate
bun run dev
bun run --cwd web dev
bun run --cwd admin dev
```

Ports: API `http://127.0.0.1:3000`, web `http://127.0.0.1:5173`, admin `http://127.0.0.1:5174`. Health is `GET /health`. Readiness is `GET /ready` and checks the database. With no `DATABASE_URL`, development uses an embedded PostgreSQL database in `./data/pglite`. Set `JWT_SECRET` before startup. The placeholder value is rejected.

Create an administrator only through the environment, never a shared password:

```powershell
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="a-long-unique-password"
bun scripts/create-admin.ts
```

## 3. Configuration

| Variable | Purpose |
| --- | --- |
| DATABASE_MODE | `pglite` for development, `postgres` for production |
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | At least 32 characters |
| CORS_ORIGINS | Web and admin origins |
| STORAGE_LOCAL_DIR | Private files when Supabase Storage is unset |
| SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET | Optional private bucket |
| MAP_TILE_URL | Default OpenStreetMap tiles |
| FCM_SERVER_KEY, APNS_* | Optional push providers |
| ALLOW_DEV_RESET_TOKEN | Development password-reset token only; never in production |

Fee amount defaults to SAR 50. The free period is inactive until a finance administrator sets dates and eligibility. Sessions use HttpOnly cookies on the web and bearer tokens on mobile. Secrets stay in the server environment.

## 4. Roles

### Merchant

Register, upload the commercial registration, tax identification, national address, and IBAN certificate, and wait for verification then activation. Save a default broker or choose another active broker on each request. Create the request with port, container number, container type, truck type, loading place, destination, schedule, instructions, and an optional non-binding proposed price. The merchant cannot replace the broker-approved price. After release, select one candidate. That selection is the final assignment. Rate the carrier after delivery.

### Customs broker

Upload the clearance license, office registration, Fasah account evidence, and national address. Fasah evidence is reviewed by staff. Set the approved price, record external payment and permits, upload clearance evidence, and confirm readiness. Readiness does not show the request to carriers. Return incomplete requests for correction.

### Carrier company

Add vehicles and separate driver accounts, upload vehicle and driver documents, assign a driver to a vehicle, and set availability. Respond only to released, compatible requests. A response is a candidate, not an assignment. Rate the merchant after delivery. Share the join code with drivers.

### Independent carrier

Uses one carrier account plus its own driver profile. It cannot add separate drivers. It can accept candidate work and execute the trip itself after verification.

### Driver

Joins a carrier company with its organization id and join code, or is created by the company. Opens assigned trips only. Advances milestones, uploads the loading photograph and Delivery Note, and can send GPS updates.

### Verification administrator

Reviews documents, sets verified, needs-update, or suspended. Cannot activate an account and cannot release requests.

### Operations administrator

Releases requests, monitors trips, closes delivered trips, and resolves incidents. Cannot change fee policy.

### Finance administrator

Configures the fee and free period, records external settlements, and exports fees. Cannot release requests.

### General administrator

Holds verification, operations, and finance together, and can activate accounts and read the audit log. An administrator cannot change their own status or permissions.

## 5. Transportation workflow

1. Merchant creates a request. Status becomes customs clearance.
2. Broker sets the price and confirms readiness. Status becomes ready for administrative review.
3. Carriers still cannot list or open the request.
4. An operations or general administrator releases it.
5. Eligible carriers accept the approved price and become candidates.
6. Merchant or assigned broker confirms one candidate. The transaction creates one trip, such as `JST-000001`, with one carrier, driver, vehicle, and the approved price. Ordinary cancellation is then disabled.
7. Driver moves through: en route to port, arrived at port, loaded, trip started, in transit, arrived at destination, delivered.
8. Loaded requires a photograph. Delivered requires recipient name, time, and a Delivery Note. A loading photo cannot replace the Delivery Note.
9. An authorized administrator closes the trip. One SAR 50 fee is recorded unless an active free-period rule exempts it.
10. Eligible parties rate each other. Incidents are recorded without cancelling the trip or adding a fine.

## 6. Administrative operations

Use `http://127.0.0.1:5174`. Search users, approve or reject documents, activate vehicles and drivers only when their documents are approved, release ready requests, close delivered trips, resolve incidents, export trips and fees, and read the audit log. The API rejects actions that the signed-in permission does not allow even if a screen is opened directly.

## 7. Web and mobile operation

Web and admin production builds:

```powershell
bun run build:web
bun run build:admin
```

Mobile, from `mobile/`:

```powershell
$env:EXPO_PUBLIC_API_URL="https://api.example.com"
bun run start
bun run export:android
bun run export:ios
```

Windows can export both JavaScript bundles. Installing a signed iOS binary requires macOS. Android device builds need Android Studio or EAS. The app asks for camera, notification, and location permission with an explanation. Background tracking is for an active trip and stops if the operating system force-quits the app. Store submission was not performed.

## 8. Troubleshooting

- Startup says configuration is missing: set `JWT_SECRET` and, in production, `DATABASE_URL`.
- Migration fails: confirm PostgreSQL is reachable and the database user can create tables. Do not drop a production database.
- 401: sign in again. 403: the account is not active, is suspended, or lacks the permission. 404 on another party's record is expected.
- Upload rejected: use PDF, JPEG, PNG, or WebP under 10 MB. Loading evidence must be a photograph.
- Map empty: the vehicle has no location update in the last 24 hours.
- Push stays skipped: provider credentials are unset. A database row is not delivery.
- Mobile bundle fails: run `bun install` inside `mobile/` and confirm the Expo SDK matches `package.json`.

## 9. Testing and acceptance

```powershell
bun run typecheck
bun run lint
bun test
bun run build
```

The automated journey registers a merchant with a saved broker, proves carriers cannot see the request before release, confirms only one trip under concurrent selection, blocks missing evidence, records one fee, and repeats broker selection for a second broker. It also covers an independent carrier restriction, suspension, duplicate ratings, and a rejected push token.

Results recorded for this build are in `docs/TEST_REPORT.md`. Device push delivery, store signing, and a hosted Supabase project were not available.

## 10. Production launch checklist

- Create the administrator with a unique password.
- Serve HTTPS and keep secrets out of the repository and this manual.
- Take a database backup and test restore.
- Keep the storage bucket private.
- Confirm a finance-only account cannot release a request.
- Set production API URL in the mobile build.
- Configure push only with real provider keys.
- Monitor `/health` and `/ready`.
- Do not enable the free period until the business rule is approved.
