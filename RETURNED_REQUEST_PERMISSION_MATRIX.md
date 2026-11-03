# Returned request permission matrix

| Action | Merchant (own org) | Broker (assigned org) | Carrier | Driver | Admin |
| --- | --- | --- | --- | --- | --- |
| See request when `returned_for_correction` | Yes | Yes | No* | No | Yes |
| See `returnedReason` | Yes | Yes | — | — | Yes |
| Edit shipment fields (save draft) | Yes | No | No | No | No |
| Resubmit after correction | Yes | No | No | No | No |
| Return for correction | No | Yes (from clearance / review states) | No | No | No** |
| Continue clearance / pricing on returned request | No | Yes | No | No | No |
| PATCH while locked (released+) | No | No | No | No | No |

\* Carriers only see requests in released/candidate/trip scopes, not returned clearance items.  
\*\* Admin release path is separate; return-for-correction is implemented on broker clearance today.

## Status transitions

```
customs_clearance ──(broker return)──► returned_for_correction
returned_for_correction ──(merchant save)──► returned_for_correction (fields updated, reason kept)
returned_for_correction ──(merchant resubmit)──► customs_clearance (reason cleared, broker notified)
customs_clearance ──(broker confirmReady)──► ready_for_admin_review
```
