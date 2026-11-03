# Visual verification report

Updated: 2026-10-31

## Method

1. Prototype: `file:///…/JOSTI_UIUX_Offline_Prototype/JOSTI_UIUX/index.html`
2. Web app: `http://127.0.0.1:5173/map`
3. Viewports: 375 / 768 / 1440
4. Artifacts: `docs/visual-checks/web_map_*.png`, `docs/visual-checks/proto_map_*.png`
5. Capture script: `scripts/visual-map-compare.mjs`

## Visitor map (critical)

| Check | Prototype | Implementation | Result |
| --- | --- | --- | --- |
| Map type | Offline SVG schematic `viewBox 0 0 1160 580` | `SchematicMap.tsx` same paths | Match |
| Layout | `grid2` map panel + nearby trucks | Home rebuilt | Match (1440) |
| Container height | 425px desktop / 370px ≤780 | `.map-wrap` | Match |
| Truck markers | White cards + stroke trucks + status dots | Same geometry/colors | Match |
| Guest snap | `round(x/70)*70` | Same | Match |
| Port label / tools / caption / legend | Present | Present + ProtoIcon plus/pin | Match |
| Status filter | `<select>` All statuses | Same | Match |
| Nearby list | Cards with truck icon, distance, rating, verified | Present; DEMO fallback when API empty | Match structure |
| NOT Leaflet | No Leaflet on visitor map | Public Home uses SVG only | Match |

Trip detail GPS track may still use Leaflet (operational tracking ≠ visitor schematic).

## Screenshot set (refreshed)

- `web_map_375.png` / `proto_map_375.png`
- `web_map_768.png` / `proto_map_768.png`
- `web_map_1440.png` / `proto_map_1440.png`

## Remaining visual open items

- Mobile full-frame screenshot compare vs prototype mobile breakpoints (Expo Go / simulator capture)
- Authenticated dashboard screenshot pass (prior auth script hung)
- Demo-only document preview modal (production uses real uploads — intentional)

## Counts (session)

| Metric | Value |
| --- | --- |
| Prototype screens inventoried | See `PROTOTYPE_SCREEN_INVENTORY.md` |
| Visitor map status | VISUALLY COMPARED (web); IMPLEMENTED (mobile) |
| Popups newly wired this session | Carrier respond picker; request wizard; rate; incident |
| Icons reused from prototype paths | plus, pin, truck, eye, menu, moon, bell, users, search, close, logout, star |
| Remaining critical diffs | Mobile visual capture queue; auth dashboard visual pass |
