# Implementation plan

Status after the implemented release.

| Phase | State | Evidence |
| --- | --- | --- |
| 1 Foundation | Complete for local Bun/Hono/PGlite | Health and readiness tests, migration apply |
| 2 Database | Complete | `migrations/001`–`003`, constraint tests |
| 3 Access control | Complete | Role, suspension, and finance-permission tests |
| 4 Localization | Implemented in web, admin, and mobile | Arabic default RTL, English LTR |
| 5 Documents | Complete on API and screens | Upload, privacy, review, expiry job |
| 6–11 Workflow | Complete | Journey test from request through closure |
| 12 Maps and GPS | API, web map, mobile background task | Approximate public coordinates tested |
| 13 Closure and ratings | Complete | Duplicate rating and single fee tested |
| 14 Notifications | In-app plus provider adapter | Mock FCM failure tested; live APNs/FCM not configured |
| 15 Fees | Complete | SAR 50, inactive free period, one fee per trip |
| 16 Admin | Complete | Separate finance and operations checks |
| 17 Security baseline | Complete for parameterized SQL, cookies, private files | See limitations for multi-instance rate limits |
| 18 Mobile | Bundles exported | Device signing and store release not done |
| 19 Acceptance | Automated journey passing | Physical-device items recorded as blocked |

Supabase credentials were not present. Production uses the same PostgreSQL migrations through `DATABASE_URL`.
