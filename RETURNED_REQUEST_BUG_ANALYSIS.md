# Returned request bug analysis

Date: 2026-10-31

## Symptom

After a request was returned for correction, **no account could complete the correction cycle** from the product UI (web or mobile).

## Root cause

| Layer | Finding |
| --- | --- |
| Backend | `PATCH /api/v1/requests/:id` (`updateRequest`) already allowed **merchants** in the owning org to edit when status is `customs_clearance` or `returned_for_correction`. |
| Backend gap | Every update forced status back to `customs_clearance` and cleared pricing / `returned_reason`, with **no separate save vs resubmit**, and **no status_event / broker notification** on resubmit. |
| Web | Request detail showed returned status only as a badge. **No merchant Edit / Save / Resubmit controls** existed. Only the broker clearance form was available. |
| Mobile | Same gap: no merchant correction form; returned reason not shown. |

So the break was primarily **missing responsible-user UI + incomplete save/resubmit semantics**, not a total backend lockout of merchants.

## Ownership model (actual)

| Event | Actor | Responsible corrector |
| --- | --- | --- |
| Broker `returnForCorrection` via `POST /requests/:id/clearance` | Customs broker (same `brokerOrgId`) | **Merchant** (`merchantOrgId` / notified `merchantUserId`) |
| Shipment field corrections | Merchant only | Merchant |
| Clearance / price re-entry after merchant resubmit | Customs broker | Broker |

Carriers, drivers, and unrelated orgs cannot `PATCH` requests (role + org checks).

## Affected APIs / tables

- `PATCH /api/v1/requests/:id` — merchant corrections / resubmit
- `POST /api/v1/requests/:id/clearance` — broker return & clearance
- Tables: `transport_requests` (`status`, `returned_reason`, clearance flags), `status_events`, `notifications`

## Fix summary

1. Extend `updateRequestSchema` with `resubmit?: boolean`.
2. Save while returned keeps `returned_for_correction` + `returned_reason`.
3. Resubmit sets `customs_clearance`, clears broker readiness/price flags + reason, writes `status_events`, notifies broker users.
4. Web + mobile: show return reason, merchant correction modal with Save and Resubmit.
