# Prototype differences log

Living document. Only differences found by inspection or screenshot comparison.

## Critical (fixed or open)

| ID | Area | Difference | Evidence | Resolution |
| --- | --- | --- | --- | --- |
| D001 | Visitor map | Web used Leaflet/OSM tiles; prototype uses **offline SVG schematic** (`mapWidget`, viewBox 1160×580, height 425px) | Prototype JS `mapWidget`; web `Home` MapContainer | **FIXED** 2026-10-31 — `web/src/components/SchematicMap.tsx` + Home wired to SVG |
| D002 | Visitor map filters | Web used `on_trip`; prototype uses `trip` / `offline` | Prototype `truckStatus` | **FIXED** — filter keys aligned |
| D003 | Map caption / tools | Missing port label, zoom tools, legend dots matching prototype CSS | Prototype CSS `.map-port-label` `.map-tools` | **FIXED** — styles + component |
| D004 | Admin login shell | Login rendered inside sidebar Shell | Screenshot admin_login_1440 | **FIXED** earlier — Shell skips `/login` |
| D005 | Mobile map | Truck list instead of SVG schematic | Code review `mobile/.../map.tsx` | **FIXED** — RN `SchematicMap` + nearby list |
| D006 | Map tool icons | Text +/−/⌖ vs prototype `I('plus')` / `−` / `I('pin')` | Prototype `mapWidget` | **FIXED** — `ProtoIcon` / mobile `Icon` |
| D007 | Carrier respond on mobile | Needs vehicleId+driverId; toast only | API `carrierRespondSchema` | **FIXED** — fleet picker `AppModal` on request detail |
| D008 | Request wizard popups | Prototype multi-step modal; web multipage form | Prototype `wizardRender` | **FIXED** — `Modal` + 3-step `NewRequest` wizard |
| D009 | Document/rate/incident modals | Prototype custom modals; coverage uneven on web | Prototype functions | **FIXED** — web+mobile rate/incident `Modal`; demo document preview still N/A (real uploads) |
| D010 | Map page layout | Missing `grid2` + nearby trucks panel + status `<select>` | Screenshot proto_map_1440 vs web_map_1440 (pre-fix) | **FIXED** — Home rebuilt to `mapPage` structure |
| D011 | Guest nearby empty | Live `/public/map` often empty → empty list while schematic shows demo trucks | Screenshot web_map_1440 empty pill | **FIXED** — fallback to prototype `DEMO_TRUCKS` when API empty (live rows win) |
| D012 | Shell chrome | Prototype guest topbar has search + role switcher + notifications; web shell differs | Screenshot compare 1440 | **FIXED** — search, round lang/theme/bell, users chip, avatar (no fake role switcher — real auth) |

## Non-blocking notes

- Live trip GPS tracking may still use Leaflet on trip detail (operational GPS ≠ visitor schematic). Keep schematic for public/visitor map only.
- `(2)` ZIP not found; using extracted offline prototype package at `JOSTI_UIUX_Offline_Prototype/JOSTI_UIUX`.
- Demo nearby distances/ratings used only when public map API returns no rows; mirrors prototype offline demo.
