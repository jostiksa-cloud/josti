# JOSTI mobile reconstruction report

## Prototype source

- Requested: `JOSTI_UIUX_Offline_Prototype(2).zip` — **not found** under Downloads.
- Used: extracted `JOSTI_UIUX_Offline_Prototype` / `JOSTI_UIUX/index.html` (single interactive HTML prototype, responsive ≤780px).

Extracted assets live under `mobile/prototype/` and `mobile/src/components/icons-paths.json` (exact prototype SVG path set).

## Architecture change

Migrated from monolithic `App.tsx` to **Expo Router** (`src/app/`) with:

- Design tokens from prototype CSS (`src/theme`)
- Prototype icon set via `react-native-svg` (`Icon`)
- Custom modal + toast matching prototype CSS (not system `Alert`)
- Session/API context preserving real backend calls
- Tajawal + Plus Jakarta Sans via `@expo-google-fonts/*`

## Reconstructed screens

| Screen | Route | Roles |
| --- | --- | --- |
| Sign-in / register | `/login` | guest |
| Dashboard | `/(tabs)/home` | all |
| Work / requests / trips list | `/(tabs)/work` | all |
| Port map (schematic list) | `/(tabs)/map` | non-driver |
| Notifications | `/(tabs)/alerts` | all |
| Account / docs / settings | `/(tabs)/account` | all |
| Request detail + broker price modal | `/request/[id]` | roles |
| Trip detail + loading/delivery modals | `/trip/[id]` | roles |
| Notification detail | `/notice/[id]` | all |

## Reconstructed popups / overlays

| Overlay | Trigger | Behavior |
| --- | --- | --- |
| Verify-account modal | After register | Centered custom modal, dimmed backdrop, close + CTA |
| Logout confirm modal | Account → logout | Custom modal, cancel/confirm |
| Broker price modal | Request detail (broker) | Custom modal + amount field |
| Delivery confirmation modal | Trip detail (driver) | Recipient, time, Delivery Note upload |
| Toast | API / UX messages | Brand toast, 3.5s, bottom inset (prototype mobile rule) |

## Buttons / interactions wired to API

- Login / register / logout
- Refresh lists & alerts
- Mark all notifications read
- Profile save, avatar upload, document upload (camera/library)
- Push token registration
- Broker set price
- Carrier candidacy response
- Driver loading evidence (camera)
- Driver delivery confirmation + Delivery Note
- Background location tracking start
- Language + dark mode toggles

## Workflows by role

- **Merchant:** dashboard, requests, trips, notifications, profile/docs
- **Broker:** pricing modal on request, lists, docs
- **Carrier:** available candidacies + company trips, respond
- **Driver:** trips, tracking, loading evidence, delivery modal
- **Admin:** not a primary mobile persona in tabs (prototype admin is desktop-oriented); API still role-gated server-side

## Backend

Reuses existing `/api/v1` endpoints. No mock success paths. Business rules preserved (broker prices, manual admin release elsewhere, candidacy ≠ assignment, loading ≠ delivery note).

## Visual / responsive

- Tokens match prototype brand colors, radii, modal/toast metrics, button min-height 42, stroke icons 1.8
- Safe-area aware tab bar and toasts
- RTL via `I18nManager` + Arabic default
- Schematic map list (prototype map is SVG schematic; full Leaflet map remains on web)

## Remaining differences

1. Prototype is a single HTML SPA with sidebar; mobile uses native tabs mapped to the same menu concepts.
2. Interactive SVG port map is represented as a filtered truck list on mobile (full map remains on web).
3. Not every prototype admin page is a dedicated mobile screen.
4. Pixel overlay screenshot suite against every modal state still pending on device/Expo Go.
5. Fonts load from Google Fonts packages (same families as prototype embedded WOFF2).

## Build / run

```bash
cd mobile
bun run typecheck
bunx expo start --go
```
