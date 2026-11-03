# Mobile bug tracker

| ID | Severity | Status | Summary | Fix |
| --- | --- | --- | --- | --- |
| BUG-M01 | CRITICAL | FIXED | New request CTA opened Work tab; no create screen / no `POST /requests` | Added `mobile/src/app/request/new.tsx`; home/work navigate to `/request/new` |
| BUG-M02 | CRITICAL | FIXED | Pricing modal missing web clearance fields; hard-coded ready flags | Rebuilt clearance modal with price, payment, permits, ready, note, upload, return |
| BUG-M03 | HIGH | FIXED | No final carrier assignment on mobile | Candidate list + `POST /requests/:id/select` on request detail |
| BUG-M04 | LOW | OPEN | Cancel request not on web UI either | Deferred — API exists; no web reference UI |
| BUG-M05 | HIGH | FIXED | Responses list missing on mobile request detail | Rendered responses section |
| BUG-M06 | MEDIUM | FIXED | Work tab lacked create CTA | Merchant action on Work `PageHead` |

## Verification notes (2026-10-31)

API E2E (same payloads mobile will send):

- Merchant create → `REQ-000036` `customs_clearance`
- Broker `confirmReady` without clearance doc → blocked (422)
- Broker price save without ready → persisted `approvedPrice: 1250`
- Merchant re-fetch matches broker values
