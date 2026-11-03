# JOSTI route completion tracker

Prototype source: extracted `JOSTI_UIUX_Offline_Prototype` (no `(2)` zip under Downloads).  
Brand tokens: Aubergine `#2E1748` · Cyan `#32D5E7` · Pearl `#F3F5FA` · White `#FFFFFF`.  
Fonts: Tajawal (AR) · Plus Jakarta Sans (EN).

Legend: `done` | `partial` | `todo`

## Design system

| Asset | Status | Notes |
| --- | --- | --- |
| `packages/ui` tokens / layout / components | done | Shared by admin; web keeps full prototype stylesheet |
| `packages/ui/src/prototype-raw.css` | done | Extracted from offline prototype (~73KB) |
| `docs/visual-checks/` | partial | Guest screenshots at 375/768/1440; auth capture tooling present |

## Web (`web/`)

| Route | Role | Prototype | Design | API | Mobile | RTL | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | guest | auth | done | done | done | done | Split auth screen verified |
| `/register` | guest | register | done | done | partial | done | Role cards + forms |
| `/` | roles | dashboard | done | done | partial | done | Hero + stats + records |
| `/map` | guest+roles | map | done | done | done | done | Screenshots OK; port chips |
| `/requests` | roles | requests | done | done | partial | done | |
| `/requests/new` | merchant | wizard | done | done | partial | done | |
| `/requests/:id` | roles | detail | done | done | partial | done | |
| `/trips` | roles | trips | done | done | partial | done | |
| `/trips/:id` | roles | trip | done | done | partial | done | |
| `/fleet` | carrier | fleet | done | done | partial | done | |
| `/documents` | roles | docs | done | done | partial | done | |
| `/notifications` | roles | alerts | done | done | done | done | Page-title + actions |
| `/notifications/:id` | roles | — | done | done | partial | done | |
| `/profile` | all | profile | done | done | partial | done | |

## Admin (`admin/`)

| Route | Role | Prototype | Design | API | Mobile | RTL | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | admin | auth | done | done | done | done | Shell hidden on login |
| `/` | ops | dashboard | done | done | done | done | Mobile cards + export action |
| `/users` | verification | verification | done | done | done | done | Filter bar + cards |
| `/users/:id` | verification | review | done | done | partial | done | |
| `/fleet` | ops | fleet | done | done | done | done | Vehicle + driver cards |
| `/fleet/:id` | ops | detail | done | done | partial | done | |
| `/requests/:id` | ops | release | done | done | partial | done | |
| `/trips/:id` | ops | trip | done | done | partial | done | |
| `/incidents/:id` | ops | incidents | done | done | partial | done | |
| `/documents/:id` | verification | docs | done | done | partial | done | |
| `/finance` | finance | reports | done | done | done | done | Stacked page actions |
| `/map` | ops | map | done | done | partial | done | |
| `/integrations` | general | — | done | done | partial | done | |
| `/audit` | general | — | done | done | done | done | Mobile cards |
| `/audit/:id` | general | — | done | done | partial | done | |

## Mobile Expo (`mobile/`)

| Surface | Design | API | Notes |
| --- | --- | --- | --- |
| Tabs / trip / auth | partial | done | Functional; visual parity lagging web shell |

## Visual verification log

| Screen | 375 | 768 | 1440 | File |
| --- | --- | --- | --- | --- |
| Web map | ok | ok | ok | `docs/visual-checks/web_map_*.png` |
| Web login | ok | ok | ok | `docs/visual-checks/web_login_*.png` |
| Admin login | ok | — | ok | `docs/visual-checks/admin_login_fixed_*.png` |

## Remaining polish

1. Authenticated admin/web dashboard screenshot pass (playwright-core hangs on this host — use Chrome CDP manually if needed).
2. Mobile Expo theme tokens sync with `@josti/ui`.
3. Secondary detail pages: tighten page-head breadcrumbs consistently.
4. English LTR visual pass on every admin list page.
