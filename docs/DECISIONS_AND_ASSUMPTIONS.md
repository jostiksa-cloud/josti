# Decisions and assumptions

These decisions were made because no Supabase project, map key, push credentials, SMTP server, or client policy answers were present in the environment.

## Authentication

Supabase Auth is not configured. The API issues its own signed access tokens and rotating refresh sessions stored in PostgreSQL. Passwords are hashed with Argon2id. If a Supabase project is later connected, it is used for Postgres and optional private storage, not as a second login system in this release.

Account lifecycle:

1. Self-registration creates `pending_verification`.
2. A verification or general administrator sets `verified` after document review.
3. A general administrator sets `active` only after required documents and profile fields exist. `verified` alone cannot create requests, respond to loads, or move trips.
4. `needs_update` blocks operational actions until the account is verified and activated again.
5. `suspended` can sign in and read its own status, but cannot perform operational or administrative actions.
6. One account has one role. Merchant and customs broker cannot be combined. Independent carriers keep the carrier role and a linked driver profile on the same user. Company drivers are separate accounts.

General administration includes verification, operations, and finance. The narrower permissions do not include each other.

## Closure, ratings, and fees

Final closure is performed by an active operations or general administrator. The only implemented policy value is `admin_operations_or_general`. Any other value blocks closure instead of inventing an authority.

Merchant rates the carrier. Carrier rates the merchant. Broker ratings default to the carrier only (`broker_rating_targets`). Ratings are allowed after `delivered` or `closed`, once per rater, target role, and trip.

The platform fee defaults to SAR 50 per closed trip. The free period is stored in `platform_settings` and is inactive. It exempts a trip only when an authorized finance administrator sets it active with a start date, end date, and eligibility `all_completed_trips`. Eligibility `none` never exempts. No billing start date or retroactive rule is assumed.

There is no wallet, payment gateway, or automatic cancellation fine. Settlements are manual records of external payments.

## Carrier selection

Candidate acceptance stores the broker-approved price and does not assign the trip. Merchant or assigned broker confirms one candidate in a transaction. The database allows only one trip per request.

If a carrier omits service regions at registration, the account is stored with Jeddah, Rabigh, Yanbu, and Dammam so coverage is explicit and editable.

## Documents and Fasah

Fasah evidence is a manually reviewed file. There is no Fasah or other government integration.

## Notifications and maps

In-app notifications are always stored. Push is marked sent only after FCM or APNs accepts the request. Without credentials the status is `skipped_no_token` or `skipped_no_provider`.

OpenStreetMap is the default map provider because it does not require a paid key. `MAP_TILE_URL` can point at another tile service.

## Local database

PGlite is a real PostgreSQL engine for development and tests. Staging and production must set `DATABASE_MODE=postgres` and `DATABASE_URL`. PGlite is single-connection and is not a production database.
