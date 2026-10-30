# Requirements traceability

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Bun, Hono, TypeScript API | `src/` | `bun test`, typecheck |
| PostgreSQL migrations | `migrations/` | Applied on clean PGlite in tests |
| Supabase when configured | `DATABASE_URL`, storage service | Not connected; local fallback documented |
| React web and admin | `web/`, `admin/` | Production builds succeeded |
| Expo iOS and Android | `mobile/` | JS bundles exported; native signing blocked |
| Merchant, broker, carrier, driver, admin | Roles and permissions | Journey and finance 403 test |
| Manual verification and statuses | Account service | Activation requires documents |
| No combined merchant and broker | Registration rules | Rejects mismatched organization type |
| Ports Jeddah, Rabigh, Yanbu, Dammam | Seed migration | Public ports endpoint |
| Broker price, not merchant override | Clearance and selection | Journey uses approved price |
| Admin release before carriers see work | Request visibility | Carrier receives 404 and empty list |
| Candidate is not assignment | Response status and copy | Notification text asserted |
| One trip under concurrency | Transaction and unique request | One 201 and one 409 |
| Loading photo separate from Delivery Note | Evidence checks | Transition blocked without each file |
| Approximate public GPS | Rounding in map API | Coordinate precision asserted |
| Private tracking for parties | Tracking route | Stranger receives 404 |
| Ratings once | Unique constraint | Second rating 409 |
| Incidents do not cancel or fine | Incident service | Trip stays closed |
| SAR 50 once, free period inactive | Fee insert | One pending fee; second insert fails |
| Finance separation | Permission checks | Finance cannot release; merchant cannot settle |
| Arabic and English | Web, admin, mobile, both manuals | Manuals generated |
| No Fasah, SMS, wallet, auction | Not coded; UI copy says so | Manuals and screens |
