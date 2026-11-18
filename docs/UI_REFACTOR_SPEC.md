# UI Refactor Spec and Safe Refactor Plan

Project: SIMSET Model System
Goal: Modernize UX/UI without breaking current application logic
Hard rule: Existing selectors used by JavaScript remain intact

## 1. Refactor Principles

| Principle | Rule |
|---|---|
| Logic safety | Do not rename or remove existing `id`, `data-tab`, or event-bound class hooks |
| Encoding safety | Save all edited files as UTF-8 LF only |
| Visual consistency | Use a single SVG icon set across public and admin pages |
| Progressive refactor | Update structure and styles first, only then adjust non-breaking markup wrappers |
| No silent regressions | Any selector replacement must preserve old selector in DOM until JS is updated intentionally |

## 2. Target Design Direction

### Shared System

| Token Type | Spec |
|---|---|
| Tone | Clinical, trustworthy, task-first, readable |
| Primary palette | Deep slate + medical blue + controlled green accents |
| Base backgrounds | Light-neutral for public task pages, dark-slate retained only if contrast is improved or strategically isolated |
| Typography | Keep Thai-friendly family, prioritize readability over decorative dashboard feel |
| Iconography | Lucide or Heroicons SVG only |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48 scale |
| Radius | 8 / 12 / 16 |
| Motion | 150-250ms transitions, no layout-shifting hover |
| Focus | Visible 2-3px focus ring on every actionable control |

### Shared Component Decisions

| Component | Spec |
|---|---|
| Primary button | Filled, high contrast, 44px minimum target |
| Secondary button | Outline or tonal, never confused with destructive |
| Danger button | Reserved for reject/delete/cancel confirmation only |
| Cards | Lower decoration, stronger typography, explicit metadata rows |
| Tables | Sticky header where needed, compact but readable row density |
| Drawers | Single active drawer at a time, clear title, footer actions pinned |
| Modals | One purpose each, summary first, action buttons at footer |
| Status badges | One canonical color+label map used across pages |

## 3. Safe Refactor Strategy

### Phase 0: Encoding Stabilization

| Step | Action | Risk | Safe Guard |
|---|---|---|---|
| 0.1 | Re-save corrupted HTML/CSS/JS files as UTF-8 LF | Low | Verify diff only changes text encoding/copy |
| 0.2 | Replace corrupted Thai strings from trusted source copy | Medium | Review rendered page in browser before style refactor |
| 0.3 | Remove emoji from icons and print text | Low | Replace with inline SVG and plain text labels |
| 0.4 | Use UTF-8 console when running scripts | Low | Set `PYTHONIOENCODING=utf-8` in PowerShell sessions |

### Phase 1: Design Tokens and Shared Layer

| Step | Action | Files | Risk | Safe Guard |
|---|---|---|---|---|
| 1.1 | Introduce shared semantic tokens for text, surface, action, border, focus | `website/style.css`, `website/admin/admin.css`, `website/borrow.css` | Low | Add new vars without deleting old vars first |
| 1.2 | Normalize button, input, badge, modal, drawer styles | same | Medium | Keep old class names and alias to new component rules |
| 1.3 | Add reduced-motion and focus-visible coverage | same | Low | CSS-only, no DOM changes required |

### Phase 2: Page-by-Page Visual Refactor

Each page below must preserve all locked selectors.

## 4. Public Catalog Spec

Files:
- [website/index.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/index.html)
- [website/style.css](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/style.css)
- [website/app.js](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/app.js)

### UX Goals

| Goal | Spec |
|---|---|
| Fast scanning | Users should understand stock, category, and status without opening drawer |
| Trustworthy data | Last updated and realtime state must be visible but quiet |
| Search-first | Search and filters become the main control surface |

### Visual Structure

| Area | New Spec | Locked Hooks |
|---|---|---|
| Navbar | Compact sticky header with logo left, update timestamp right | `#nav`, `#last-updated` |
| Hero | Reduce height, convert to utility header with summary cards | `#hero-stats`, `#stat-total`, `#stat-ready`, `#stat-models`, `#stat-locations` |
| Category filter | Replace emoji buttons with SVG + text pills | `.cat-btn`, `[data-age]` |
| Filter bar | Promote search and status chips; keep grouped/list toggle | `#search-input`, `#clear-search`, `#status-chips`, `#btn-grouped`, `#btn-individual` |
| Grid | Keep grouped and individual rendering modes | `#manikin-grid` |
| Drawer | Keep right drawer but make it factual and cleaner | `#detail-drawer`, `#drawer-overlay`, `#drawer-close`, `#drawer-body` |

### Safe Refactor Notes

| Change | Safe Approach | Avoid |
|---|---|---|
| Replace emoji age icons | Change rendered HTML in JS to SVG markup or decorative span backed by CSS | Renaming `#drawer-age-icon` or removing age container |
| Simplify hero | Only edit text blocks and wrapper classes | Removing stats IDs |
| Improve card layout | Add wrapper elements and CSS, preserve `.quick-view-btn` and click binding | Replacing buttons with unbound elements |

## 5. Borrowing Catalog Spec

Files:
- [website/borrow.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/borrow.html)
- [website/borrow.css](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/borrow.css)
- [website/borrow.js](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/borrow.js)

### UX Goals

| Goal | Spec |
|---|---|
| Guided booking | User always knows current date range, selected items, and next step |
| Lower cognitive load | Reduce hidden state between catalog, detail, and cart |
| Mobile usability | Primary actions remain visible at small widths |

### Visual Structure

| Area | New Spec | Locked Hooks |
|---|---|---|
| Header | Brand + auth state + labeled cart action | `#btn-login`, `#user-profile`, `#cart-icon-btn`, `#cart-badge` |
| Step summary | Add persistent booking summary strip under header | `#date-filter-label`, `#catalog-date-range` |
| Filters | Keep age pills, search, and date trigger in a stable top bar | `.cat-pill`, `#search-input`, `#btn-date-filter`, `#date-filter-bar` |
| Catalog cards | Show availability, quantity, and add action without requiring drawer first | `#equipments-grid` |
| Date modal | Keep existing modal IDs but add step explanation and validation summary | `#date-modal`, `#modal-start-date`, `#modal-end-date`, `#btn-modal-apply-dates` |
| Detail drawer | Make drawer informational, not mandatory for purchase | `#quick-detail-drawer`, `#detail-drawer-overlay` |
| Cart drawer | Convert to review-and-submit panel with sticky footer action | `#cart-drawer`, `#cart-drawer-overlay`, `#checkout-purpose`, `#btn-submit-request` |
| Matrix modal | Present as advanced availability view only | `#matrix-modal`, `#matrix-table` |

### Interaction Rules

| Rule | Spec |
|---|---|
| Missing dates | Add-to-cart must show inline reason and offer date modal |
| Cart visibility | Show cart as labeled button or pill while keeping `#cart-icon-btn` as clickable root |
| Overlay safety | Only one modal/drawer open at a time |
| Submit readiness | Disable submit until dates, purpose, and verification are valid |

### Safe Refactor Notes

| Change | Safe Approach | Avoid |
|---|---|---|
| Cart redesign | Wrap cart icon contents with text label while keeping `#cart-icon-btn` | Replacing root element or changing click target ID |
| Step layout | Insert non-breaking wrappers around current filter and content sections | Moving fields to new IDs |
| Availability feedback | Add helper blocks and `aria-live` regions | Changing JS data flow or RPC params |

## 6. Tracking Page Spec

Files:
- [website/tracking.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/tracking.html)
- [website/js/tracking.js](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/js/tracking.js)

### UX Goals

| Goal | Spec |
|---|---|
| Single-task page | Search, status, and printable result in one uninterrupted flow |
| Administrative clarity | Status wording should match borrowing lifecycle exactly |
| Print safety | A4 print version must be plain, legible, and encoding-safe |

### Visual Structure

| Area | New Spec | Locked Hooks |
|---|---|---|
| Search block | Large labeled field with helper text and submit button | `#tracking-input`, `#btn-search` |
| Result header | Tracking ID, status, latest state explanation | `#result-view`, `#status-badge`, `#disp-tracking-id` |
| Metadata | Two-column grid for request facts, single-column on mobile | `#disp-created-at`, `#disp-purpose` |
| Item list | Clear table with qty and dates | `#items-body` |
| Cancel area | Secondary card with rule-based messaging | `#cancel-zone`, `#btn-login-cancel`, `#btn-cancel-request` |
| System states | Distinct loading and error blocks | `#loading`, `#error-view` |

### Safe Refactor Notes

| Change | Safe Approach | Avoid |
|---|---|---|
| Print cleanup | Move inline print rules to stable style block or external CSS | Removing existing result IDs |
| Status explanations | Add extra text node below badge | Overwriting status hook element structure if JS expects plain text only |

## 7. Admin Login Spec

Files:
- [website/admin/index.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/index.html)
- [website/admin/login.js](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/login.js)

### UX Goals

| Goal | Spec |
|---|---|
| Fast secure entry | Minimal distraction, clear permissions context |
| Clear failure states | Invalid auth and unauthorized role messages must be distinct |

### Visual Structure

| Area | New Spec | Locked Hooks |
|---|---|---|
| Card | Keep centered auth card with stronger hospital identity | `#login-form` |
| Inputs | Maintain email and password grouping | `#email`, `#password`, `#pw-toggle` |
| Alerts | Keep top alert area for permission/login errors | `#login-error`, `#login-error-msg` |
| Submit | Loading spinner and label stay within button | `#login-btn`, `#btn-spinner`, `#login-text` |

### Safe Refactor Notes

| Change | Safe Approach | Avoid |
|---|---|---|
| Brand update | Replace decorative icon with logo/SVG while preserving layout | Changing field IDs |
| Error message polish | Edit only displayed strings | Changing error container ID |

## 8. Admin Dashboard Shell Spec

Files:
- [website/admin/dashboard.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/dashboard.html)
- [website/admin/admin.css](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/admin.css)
- [website/admin/admin.js](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/admin.js)
- [website/admin/borrow-admin.js](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/borrow-admin.js)

### Shell Rules

| Area | Spec | Locked Hooks |
|---|---|---|
| Sidebar | Keep left navigation structure and `data-tab` switching | `[data-tab]`, `.sidebar-link` |
| Topbar | Keep page title, refresh, live indicator, last sync | `#topbar-title`, `#topbar-sub`, `#btn-global-refresh`, `#last-sync` |
| Tabs | Keep all `tab-pane` IDs stable | `.tab-pane`, `#tab-dashboard`, `#tab-review`, `#tab-borrow-requests`, `#tab-manikins`, `#tab-recycle`, `#tab-locations`, `#tab-reports`, `#tab-teams` |
| Mobile nav | Keep menu toggle and overlay behavior | `#btn-menu-toggle`, `#sidebar-overlay` |

### Cross-Tab Component Rules

| Component | Spec |
|---|---|
| Table toolbar | Search left, filters middle, actions right, consistent height |
| KPI cards | Max 4-5 per row, SVG icons only, short labels |
| Modal copy | Title, desc, body, footer action order standardized |
| Toasts | Success, warning, error use one layout and no emoji |
| Form grouping | Use section headers for long admin modals |

## 9. Admin Tab Specs

### Dashboard Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| KPI row | Retain stat cards but reorder by urgency | `#d-total`, `#d-ready`, `#d-maintenance`, `#d-broken`, `#d-review` |
| Review preview | Keep table preview with stronger "needs action" heading | `#dash-review-tbody`, `#btn-dash-review` |
| Reports | Keep 2-up cards on desktop, 1-up mobile | `#status-bars`, `#age-bars` |

### Borrow Requests Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| Queue summary | Retain 3 summary cards | `#b-pending`, `#b-receiving`, `#b-preparing` |
| Table toolbar | Keep search and status filter stable | `#borrow-search`, `#borrow-status-filter` |
| Row actions | Preserve approve/reject/return action wiring | JS function hooks and row buttons |
| Reject modal | Keep current IDs and improve copy only | `#reject-modal`, `#reject-req-id`, `#reject-reason-select`, `#reject-reason-text`, `#reject-save` |
| Return modal | Preserve item tbody and save flow | `#return-modal`, `#return-items-tbody`, `#return-save` |

### Review Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| Pending list | Maintain searchable, bulk-action-capable table | existing review table hooks |
| Edit/review modal | Standardize layout into sections: identity, ops, capabilities, notes | `#edit-modal` and bound fields |

### Manikins Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| Inventory table | Preserve row actions and filters | existing table IDs and buttons |
| Status editing | Maintain inline select behavior | `.status-select` |

### Recycle Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| History table | Preserve current loading and action hooks | existing recycle selectors |

### Locations Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| Table | Keep add/edit/delete hooks | `#locations-tbody`, `#btn-add-location` |
| Modal | Keep current location modal IDs | `#location-modal`, `#loc-edit-id`, `#loc-building`, `#loc-room`, `#loc-save` |

### Reports Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| KPI cards | Group by operational outcome | `#kpi-approved`, `#kpi-cancelled`, `#kpi-leadtime`, `#kpi-topusage` |
| Export | Keep export trigger stable | `#btn-export` |

### Teams Tab

| Area | Spec | Locked Hooks |
|---|---|---|
| Team list | Preserve list/detail split layout | `#teams-list`, `.team-card` |
| Detail header | Keep selected team code/name hooks | `#detail-team-code`, `#detail-team-name` |
| Members table | Preserve add/remove controls | `#team-members-tbody` |
| Capabilities | Keep checkbox grid and save/sync actions | `#team-caps-checkboxes` and related buttons |
| Images | Preserve cover/gallery upload hooks | `#team-cover-img`, `#team-cover-placeholder`, `#team-cover-input`, `#team-gallery-grid`, `#team-gallery-input` |
| Team modal | Keep create/edit IDs stable | `#team-modal`, `#team-modal-code`, `#team-modal-name`, `#team-modal-save` |
| Add-member modal | Keep searchable combobox IDs stable | `#add-member-modal`, `#add-member-sap-input`, `#add-member-sap`, `#add-member-order`, `#add-member-save` |

## 10. Implementation Guardrails

| Guardrail | Requirement |
|---|---|
| DOM compatibility | Existing JS selectors must continue resolving exactly |
| Wrapper strategy | New visual wrappers may be added around current nodes, not in place of them |
| CSS migration | Prefer additive CSS, then remove dead styles only after verification |
| Inline styles | Replace gradually, but preserve element identity |
| Copy changes | Fix corrupted text before layout QA |
| Icon migration | Replace emoji with inline SVG or mask-based icon components |

## 11. Verification Plan

| Check | How |
|---|---|
| No selector regressions | Smoke test all main actions: search, filters, drawers, modals, submit, approve, reject, return, team image upload |
| Encoding clean | Search repo for mojibake markers, replacement character, and corrupted Thai strings |
| Keyboard flow | Test tab order across public search, borrow cart, tracking search, admin modals |
| Responsive | Review 375px, 768px, 1024px, 1440px |
| Print | Validate tracking page print output with UTF-8 text and no emoji |

## 12. Recommended Execution Order

1. Fix encoding and iconography on public pages.
2. Introduce shared tokens and control styles.
3. Refactor public catalog.
4. Refactor borrowing flow.
5. Refactor tracking and print view.
6. Refactor admin login.
7. Refactor admin shell and highest-value tabs: borrow requests, dashboard, teams.
8. Finish remaining admin tabs and remove dead styles after smoke testing.
