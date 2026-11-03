# Returned request test results

Date: 2026-10-31  
Environment: local API `http://127.0.0.1:3000` with demo accounts (`Password123`)

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Merchant creates request | PASS — `REQ-000068` / `customs_clearance` |
| 2 | Broker returns with reason | PASS — `saved: true` |
| 3 | Merchant sees returned status + reason | PASS — `returned_for_correction` / reason text |
| 4 | Carrier PATCH blocked | PASS — `403 FORBIDDEN` |
| 5 | Broker PATCH blocked | PASS — `403 FORBIDDEN` |
| 6 | Merchant save without resubmit | PASS — status stays returned; destination/instructions updated; reason kept |
| 7 | Merchant resubmit | PASS — status `customs_clearance`; reason `null`; fields updated |
| 8 | Broker sees resubmitted data | PASS — destination/instructions match |
| 9 | Merchant cannot call clearance | PASS — `403 FORBIDDEN` |

## UI verification remaining

- Manual click-through in Expo Go / browser for modal affordances (code shipped; API path verified).
