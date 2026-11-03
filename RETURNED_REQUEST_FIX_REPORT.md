# Returned request fix report

## Code changes

### Contracts
- `packages/contracts/src/index.ts` — `updateRequestSchema.resubmit?: boolean`

### Backend
- `src/services/workflow.service.ts` — `updateRequest(sql, config, actor, id, patch)`
  - Save while returned preserves status + `returned_reason`
  - Resubmit → `customs_clearance`, clears readiness/price/reason, `status_events`, broker notify
- `src/app.ts` — passes `config` into `updateRequest`

### Web
- `web/src/App.tsx` — return banner, merchant Edit modal (Save / Resubmit), status labels, history reason display

### Mobile
- `mobile/src/app/request/[id].tsx` — return banner + merchant correction modal (parity with web fields)
- `mobile/src/lib/i18n.ts` — status labels for returned / released / etc.

## Intentionally unchanged

- Broker remains the only role that initiates `returnForCorrection` via clearance API.
- Carrier/driver still cannot edit returned clearance requests.
- No new request statuses introduced.
