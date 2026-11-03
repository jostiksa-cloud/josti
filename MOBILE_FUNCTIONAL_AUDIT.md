# Mobile functional audit

Date: 2026-10-31  
Method: source comparison of web `App.tsx`, mobile Expo Router screens, `packages/contracts`, and `brokerClearance` / `createRequest` services.

## Confirmed root causes

### BUG-M01 — New shipment request (CRITICAL)

| Layer | Finding |
| --- | --- |
| UI | Merchant “New request” on home navigates to `/(tabs)/work`, **not** a create form |
| Routes | **No** `request/new` (or equivalent) screen exists under `mobile/src/app` |
| API | Web posts `POST /api/v1/requests` with `createRequestSchema`; mobile never calls it |
| Schema | Requires ISO container `^[A-Za-z]{4}\d{7}$`, port, containerType, truckType, locations, datetimes |

**Verdict:** Creation fails because the create workflow was never implemented on mobile (dead CTA).

### BUG-M02 — Transportation pricing (CRITICAL)

| Field (web clearance form) | Mobile before repair |
| --- | --- |
| `approvedPrice` | Present only |
| `externalPaymentConfirmed` | Hard-coded `true` (no UI) |
| `permitsConfirmed` | Hard-coded `true` (no UI) |
| `confirmReady` | Hard-coded `true` (no UI) |
| Clearance document upload (`clearance_evidence`) | Missing |
| `progressNote` | Hard-coded string |
| Return for correction | Missing |
| Status gate (`customs_clearance` / `returned_for_correction`) | Button shown for **all** broker statuses |

Backend `brokerClearance` refuses `confirmReady` without price + payment + permits + clearance document → mobile “save” fails or incorrectly forces ready.

## Additional gaps found in same pass

| ID | Area | Gap |
| --- | --- | --- |
| BUG-M03 | Merchant/broker | No final carrier assignment (`POST /requests/:id/select`) on mobile |
| BUG-M04 | Merchant | No cancel request action (`POST /requests/:id/cancel`) |
| BUG-M05 | Request detail | Candidate response list not shown |
| BUG-M06 | Work tab | No “New request” CTA for merchants |

## Repair status (same session)

- BUG-M01, M02, M03, M05, M06 → fixed in code; create/pricing API paths exercised against live API.
- See `MOBILE_BUG_TRACKER.md` and `MOBILE_REPAIR_PROGRESS.md`.
