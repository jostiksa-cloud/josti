# Test report

Recorded 15 October 2026 on Windows, Bun 1.3.14. Commands were executed in `C:\Users\admin\Downloads\JOSTI`. A result is listed only when the command finished in this environment.

## Commands and results

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Exit 0. 95 installs, no lockfile changes. |
| `bun run typecheck` | Exit 0. API, web, admin, and mobile `tsc --noEmit`. |
| `bun run lint` | Exit 0. Biome checked 31 files. 3 `useOptionalChain` warnings in `auth.service.ts`, `directory.service.ts`, and `workflow.service.ts`. One deprecated-config notice. |
| `bun test` | Exit 0. 3 pass, 0 fail, 163 `expect()` calls, about 5.3 seconds. |
| `bun run build` | Exit 0. API bundle `dist/index.js` (0.99 MB). Web Vite build succeeded (`web/dist`, JS about 452 kB). Admin Vite build succeeded (`admin/dist`, JS about 428 kB). |
| `bun run db:migrate` with `DATABASE_MODE=pglite` and a clean data directory | Exit 0. Applied `001_schema.sql`, `002_reference.sql`, `003_active_trip_uniqueness.sql`. |
| API process on `127.0.0.1:3099` | `GET /health` returned 200 `{"status":"ok","service":"josti-api"}`. `GET /ready` returned 200 `{"status":"ready","database":"pglite","storage":"local"}`. The process was then stopped. |
| `bun run export:android -- --output-dir dist-android` in `mobile/` | Exit 0. Hermes bundle about 1.6 MB in `mobile/dist-android`. |
| `bun run export:ios -- --output-dir dist-ios` in `mobile/` | Exit 0. Hermes bundle about 1.6 MB in `mobile/dist-ios`. |
| `bun run manuals:pdf` | Exit 0. Both PDF manuals were written and inspected. |

## What the automated tests cover

`tests/platform.test.ts` runs against an in-memory PGlite database:

- Health, readiness, migrations, and duplicate open container protection.
- Journey A with the saved broker and journey B with a broker chosen for that request.
- Carriers cannot read a request before administrative release.
- Finance permission cannot release a request.
- Concurrent candidate selection produces one trip.
- Ordinary cancellation is rejected after confirmation.
- Loading and delivery evidence gates.
- Out-of-order GPS is stored and not applied when older.
- One rating per rater, target, and trip.
- An incident does not cancel a closed trip.
- One platform fee per trip, with the unique constraint rejecting a second insert.
- Settlement is finance-only.
- A suspended merchant cannot create a request.
- Public map coordinates are rounded and the response does not include a phone number.
- A rejected push token is disabled and is not marked sent.

## PDF inspection

| File | Pages | Embedded fonts | TOC links | Text |
| --- | --- | --- | --- | --- |
| `docs/manuals/JOSTI_Operations_Guide_EN.pdf` | 8 | Plus Jakarta Sans, Tajawal, Consolas | 10 | Searchable English, title `JOSTI Operations Guide` |
| `docs/manuals/JOSTI_Operations_Guide_AR.pdf` | 6 | Tajawal, Consolas | 10 | Searchable Arabic, RTL cover and body |

Rendered pages were checked for the cover, contents, configuration table, and final checklist in both languages. Page numbers and the version footer are present from page 2.

## Not executed

- No hosted Supabase project was connected.
- Linux deployment scripts were not run on a Linux host.
- No signed Android APK or iOS IPA was produced. iOS native compilation requires macOS.
- Push delivery was not sent to Apple or Google. The provider failure path was tested with a local mock.
- Background GPS was not exercised on a physical phone.
- Interactive browser clicks across desktop and phone layouts were not run. API tests and production web builds were.
- App Store and Google Play publication did not occur.
