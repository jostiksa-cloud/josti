# Web ↔ mobile parity report

## Pricing fields (broker clearance)

| Field | Web | Mobile (before) | Required for ready | Action |
| --- | --- | --- | --- | --- |
| approvedPrice | Yes | Yes | Yes (to mark ready) | Keep + validate > 0 |
| externalPaymentConfirmed | Checkbox | Hard-coded true | Yes when confirmReady | Add checkbox |
| permitsConfirmed | Checkbox | Hard-coded true | Yes when confirmReady | Add checkbox |
| confirmReady | Checkbox | Hard-coded true | Triggers admin review | Add checkbox |
| clearance_evidence file | File input | Missing | Yes when confirmReady | Image/document picker upload |
| progressNote | Textarea | Hard-coded | Optional | Editable note |
| returnForCorrection | Danger button | Missing | N/A | Add return action |
| returnReason | Via return payload | Missing | When returning | Default + optional note |

## Shipment creation fields (`createRequestSchema`)

| Field | Web wizard | Mobile (before) | Required | Action |
| --- | --- | --- | --- | --- |
| portCode | Yes | Missing screen | Yes | Implement |
| containerNumber | Yes (ISO) | Missing | Yes | Implement + regex |
| containerType | Yes | Missing | Yes | Chip select |
| truckType | Yes | Missing | Yes | Chip select |
| loadingLocation | Yes | Missing | Yes | Text |
| destination | Yes | Missing | Yes | Text |
| scheduledLoadingAt | date+time | Missing | Yes | Text → ISO |
| expectedDeliveryAt | datetime-local | Missing | Yes | Text → ISO |
| instructions | Yes | Missing | Optional | Text |
| useDefaultBroker | Yes | Missing | Default false | Toggle |
| brokerOrganizationId | When choose | Missing | When not default | Broker list |
| proposedPrice | Optional on older form | N/A in wizard | Optional | Omit (broker sets price) |

## Role operations snapshot

| Operation | Web | Mobile target |
| --- | --- | --- |
| Merchant create request | `/requests/new` | `/request/new` (new) |
| Broker clearance/pricing | Request detail form | Request detail modal (rebuild) |
| Carrier respond | Request detail | Modal (exists) |
| Merchant/broker select carrier | Table action | Add to request detail |
| Driver loading/delivery | Trip detail | Exists |
| Rate / incident | Trip modals | Exists |
