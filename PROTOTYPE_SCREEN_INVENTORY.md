# Prototype screen & component inventory

**Prototype source:** `JOSTI_UIUX_Offline_Prototype` (requested `(2)` ZIP not found under Downloads).  
**Inspected:** `JOSTI_UIUX/index.html` (single-file SPA: CSS ~73KB, JS ~120KB, SVG schematic map).  
**Date:** 2026-10-31

## Prototype navigation (menus)

| Role | Pages |
| --- | --- |
| guest | map, profile |
| merchant | dashboard, map, requests, trips, profile |
| broker | dashboard, map, requests, trips, profile |
| carrier | dashboard, map, requests, trips, fleet, profile |
| driver | dashboard, trips, profile |
| admin | dashboard, map, requests, trips, verification, fleet, reports, incidents, profile |

## Prototype interactions / overlays (from JS)

| Function | Type | Notes |
| --- | --- | --- |
| `modal` / `closeModal` | centered modal + backdrop | `#1c10235c`, radius 23px |
| `toast` | toast | brand pill, 3.5s |
| `showVerifyGate` | modal | guest/unverified gate |
| `newRequest` / `wizardRender` | modal wizard | merchant request |
| `detail` | page/modal detail | request/trip |
| `documentModal` | modal | document upload/preview |
| `rate` | modal | post-delivery rating |
| `incident` | modal | incident report |
| `register` | modal/page | registration |
| `help` | overlay | walkthrough |
| `mapWidget` | **SVG schematic map** | NOT Leaflet — viewBox 1160×580 |
| `proofForm` / `advance` | forms | loading + delivery |

## Web routes ↔ prototype

| Prototype page | Web route | Project file | Status |
| --- | --- | --- | --- |
| map (guest hero) | `/` or `/map` | `web/src/App.tsx` Home + `SchematicMap.tsx` | VISUALLY COMPARED — SVG + nearby panel + topbar icons |
| login/register | `/login` `/register` | `web/src/App.tsx` | IMPLEMENTED |
| dashboard | `/` (authed) | Home/Dashboard | INSPECTED |
| requests | `/requests` | App.tsx | INSPECTED |
| request wizard | `/requests/new` | App.tsx | INSPECTED |
| request detail | `/requests/:id` | App.tsx | INSPECTED |
| trips | `/trips` | App.tsx | INSPECTED |
| trip detail | `/trips/:id` | App.tsx | INSPECTED (Leaflet for live tracking only) |
| fleet | `/fleet` | App.tsx | INSPECTED |
| profile | `/profile` | App.tsx | INSPECTED |
| documents | `/documents` | App.tsx | INSPECTED |
| notifications | `/notifications` | App.tsx | INSPECTED |
| admin * | `admin/` app | `admin/src/main.tsx` | INSPECTED |

## Mobile routes ↔ prototype

| Prototype concept | Mobile route | File | Status |
| --- | --- | --- | --- |
| auth | `/login` | `mobile/src/app/login.tsx` | IMPLEMENTED |
| dashboard | `/(tabs)/home` | `home.tsx` | IMPLEMENTED |
| requests/trips | `/(tabs)/work` | `work.tsx` | IMPLEMENTED |
| map | `/(tabs)/map` | `map.tsx` + `SchematicMap.tsx` | IMPLEMENTED schematic + nearby list |
| alerts | `/(tabs)/alerts` | `alerts.tsx` | IMPLEMENTED |
| profile | `/(tabs)/account` | `account.tsx` | IMPLEMENTED |
| request detail | `/request/[id]` | + broker price modal | IMPLEMENTED |
| trip detail | `/trip/[id]` | + loading/delivery modals | IMPLEMENTED |
| notice | `/notice/[id]` | | IMPLEMENTED |

## Assets

| Asset | Location |
| --- | --- |
| Brand SVGs | prototype `assets/` + `web/public/brand` + `mobile/assets` |
| Icon path set | `mobile/src/components/icons-paths.json` (29 icons from prototype) |
| Fonts | Tajawal + Plus Jakarta Sans |
| Map | Prototype SVG schematic extracted → `web/src/components/SchematicMap.tsx` |
