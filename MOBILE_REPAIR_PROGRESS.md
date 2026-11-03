# Mobile repair progress

Statuses: NOT STARTED → IN PROGRESS → IMPLEMENTED → API TESTED → VERIFIED IN APP

| Item | Status | Evidence |
| --- | --- | --- |
| Functional audit docs | IMPLEMENTED | `MOBILE_FUNCTIONAL_AUDIT.md`, parity/bug trackers |
| Merchant create request screen | IMPLEMENTED | `mobile/src/app/request/new.tsx` |
| Create CTA wiring | IMPLEMENTED | home + work → `/request/new` |
| Create API payload parity | API TESTED | `POST /requests` succeeded (`REQ-000036`) |
| Broker pricing field parity | IMPLEMENTED | Full clearance modal on `request/[id].tsx` |
| Pricing persistence | API TESTED | `approvedPrice` 1250 visible to merchant fetch |
| Ready-without-doc blocked | API TESTED | 422 / CLEARANCE_INCOMPLETE |
| Carrier select on mobile | IMPLEMENTED | Final assignment button |
| Expo typecheck | PASSED | `bun run typecheck` |
| In-app Expo Go visual click-through | NOT STARTED | Reload Expo Go and exercise UI manually |

## Remaining

- Manual Expo Go pass for create wizard + clearance upload picker
- Optional cancel UI if product wants mobile-only cancel
- Broader modules (fleet CRUD on mobile, admin) remain web-primary by design
