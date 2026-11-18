# UX/UI Audit Checklist

Project: SIMSET Model System
Scope: Public catalog, borrowing flow, tracking, admin login, admin dashboard tabs
Constraint: Keep existing JS hooks and runtime behavior intact. Do not change bound selectors without adding backward-compatible aliases.

## Audit Legend

| Status | Meaning |
|---|---|
| `Fail` | Must fix before UI refresh is considered complete |
| `Warn` | Should fix in current redesign cycle |
| `Pass` | Acceptable as-is |
| `N/A` | Not applicable to that page |

## Global Rules

| Area | Checkpoint | Status | Notes |
|---|---|---:|---|
| Encoding | All HTML, CSS, JS, MD, SQL saved as UTF-8 LF | `Warn` | Repo config is correct, but multiple pages already contain Mojibake |
| Icons | No emoji used as UI icons | `Fail` | Emoji still appear in public and admin UI |
| A11y | Visible `:focus-visible` on all interactive elements | `Warn` | Admin is better than public pages |
| A11y | All modals and drawers have keyboard escape, focus containment, and restore focus | `Warn` | Needs explicit audit in borrow/admin flows |
| Forms | No placeholder-only fields for required inputs | `Warn` | Some search and tracking fields still rely heavily on placeholder copy |
| Motion | Respect reduced motion | `Warn` | No clear `prefers-reduced-motion` handling found |
| Mobile | No hidden critical action behind hover-only UI | `Warn` | Cart and detail affordance need clearer mobile treatment |
| Safety | Keep existing IDs and `data-*` hooks stable | `Fail` | Mandatory for refactor work |

## Page: Public Catalog

File: [website/index.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/index.html)

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Content integrity | Thai copy renders correctly | `Fail` | Title, meta, labels, hero copy show Mojibake | Re-save file as UTF-8 and replace corrupted strings from source copy |
| Information hierarchy | Hero communicates purpose within 5 seconds | `Warn` | Strong visual style, but text corruption blocks comprehension | Rewrite hero copy and tighten to inventory-oriented summary |
| Navigation | Navbar provides identity and current freshness | `Pass` | Brand and last-updated are present | Keep layout, improve label clarity |
| Search/filter | Search, age filter, status filter are visible and understandable | `Warn` | Filters exist but rely on mixed iconography and small labels | Increase label contrast and add explicit section title |
| Search/filter | Clear search affordance is obvious | `Warn` | Tiny clear button | Enlarge hit area to 44px and add accessible label |
| Card design | Cards show name, status, location, capabilities clearly | `Warn` | Good density, but dark theme lowers scan speed | Increase contrast and reduce decorative weight |
| Card design | Icons are consistent SVGs | `Fail` | Emoji used in category and drawer age mapping | Replace with Lucide/Heroicons/SVG tokens |
| Empty/loading | Loading and empty states are readable | `Warn` | Text is corrupted in loading/empty copy | Replace copy and standardize tone |
| Drawer | Detail drawer is keyboard-friendly | `Warn` | Overlay and close exist, focus trap not confirmed | Add focus management and ESC handling if absent |
| Data trust | Realtime updates feel reliable, not noisy | `Pass` | Last updated pattern exists | Keep, but present as "updated at" text with exact timestamp |
| Mobile | Sticky filter bar does not crowd small screens | `Warn` | Wraps, but still visually dense | Collapse to two rows on mobile |

## Page: Borrowing Catalog

File: [website/borrow.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/borrow.html)

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Task flow | User sees a clear primary flow | `Fail` | Date filter, detail drawer, matrix modal, and cart drawer compete | Reframe as step flow: dates, selection, review |
| Authentication | Login state is visible and understandable | `Warn` | SSO button exists, but cart appears only after login state change | Make auth state persistent in header with explicit guidance |
| Search/filter | Filters are understandable without training | `Warn` | Category pills are clear, date filter is secondary, but state summary is weak | Add sticky booking summary bar |
| Date selection | Current selected date range is always visible | `Warn` | Date label exists but is easy to miss | Promote to persistent summary chip and section banner |
| Product list | Availability and borrowing affordance are obvious | `Warn` | Card interactions rely on drawer and hover states | Surface quantity and availability status directly on card |
| Add-to-cart | Add-to-cart works without ambiguity | `Warn` | Hybrid flow is functional but hidden in state transitions | Add inline helper text when dates are missing |
| Cart | Cart is discoverable on desktop and mobile | `Fail` | Cart icon uses emoji and acts as a hidden drawer trigger | Replace with fixed labeled cart button while preserving selector |
| Cart | Checkout fields are grouped in completion order | `Warn` | Purpose and CAPTCHA appear late in drawer | Group summary, purpose, verification, submit in one linear column |
| Drawer/modal | Nested overlays do not trap users | `Warn` | Date modal, matrix modal, detail drawer, cart drawer can overlap conceptually | Prevent multiple active overlays at once |
| Accessibility | Form labels exist for date and purpose inputs | `Pass` | Labels are present in main flow | Keep labels and add `aria-live` for availability updates |
| Feedback | Error and stock constraints are shown near the action | `Warn` | Note areas exist but need stronger placement | Move errors directly adjacent to quantity/add action |
| Mobile | Drawers and tables are usable at 375px | `Warn` | Drawer width adapts, matrix table remains heavy | Convert matrix to scrollable cards on small screens |

## Page: Tracking

File: [website/tracking.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/tracking.html)

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Content integrity | Thai copy and print labels render correctly | `Fail` | Significant Mojibake in headings, labels, buttons | Replace all corrupted strings and verify print output |
| Single-task clarity | Tracking ID lookup is the obvious first action | `Pass` | Search form is visually first | Keep single-task structure |
| Form quality | Input and button have proper labels and states | `Warn` | Button uses inline style and no explicit loading disabled pattern | Add disabled/loading state and externalize styles |
| Status comprehension | Status badge is easy to interpret | `Warn` | Color is clear, supporting text structure can be better | Add plain-language status explanation under badge |
| Result layout | Metadata and item list are easy to scan | `Warn` | Two-column grid works, but hierarchy is generic | Add section labels and stronger tracking reference block |
| Print mode | Print output is clean and professional | `Fail` | Print header contains corrupted emoji/text | Remove emoji, use plain text hospital header |
| Cancellation | Cancel request area is understandable | `Warn` | Hidden controls appear late with weak context | Add clear eligibility rule and current status note |
| Navigation | Back link is obvious and local | `Warn` | Present but copy is corrupted | Repair label and use consistent secondary button style |

## Page: Admin Login

File: [website/admin/index.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/index.html)

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Content integrity | All Thai copy renders correctly | `Fail` | Subtitle, errors, labels contain Mojibake | Replace copy and verify with UTF-8 |
| Form flow | Email/password form is conventional and low-friction | `Pass` | Structure is standard | Keep field order and submit action |
| Trust/security | Restricted-access note is clear without visual noise | `Warn` | Uses emoji in note and some corrupted copy | Replace emoji with lock SVG and concise security note |
| Error handling | Invalid credentials and permission errors are clear | `Pass` | Dedicated alert box exists | Keep, improve wording consistency |
| Accessibility | Labels, autocomplete, and focus states are present | `Pass` | Mostly correct | Keep and ensure password toggle has accessible label |
| Mobile | Card layout fits narrow viewports | `Pass` | Compact and centered | No layout change needed beyond style refresh |

## Page Group: Admin Dashboard Overview

Files:
- [website/admin/dashboard.html](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/dashboard.html)
- [website/admin/admin.css](/d:/Jedi_EX_HDX_BAC01/01.Jedi_SIMSET/SIMSET_Project/SIMSET_ModelSystem/website/admin/admin.css)

### Tab: Dashboard

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Information hierarchy | KPI cards reflect urgent operations first | `Warn` | KPI set exists but icons use emoji and labels are partially corrupted | Replace icons with SVG and relabel in operational language |
| Charts | Charts and mini-reports are glanceable | `Pass` | Bar sections are simple and lightweight | Keep chart format, improve headings and color semantics |
| Actionability | Dashboard links to pending work clearly | `Warn` | Review CTA exists but could be stronger | Add "needs action now" grouping above summary charts |
| Density | Table preview remains readable | `Pass` | Compact table works | Keep density with better header contrast |

### Tab: Borrow Requests

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Queue visibility | Pending counts and statuses are easy to parse | `Pass` | Summary cards exist | Keep, refine labels to match request lifecycle |
| Table workflow | Search, filter, and row actions are efficient | `Warn` | Action buttons are correct but row scannability can improve | Add row meta stack: borrower, dates, purpose, risk flags |
| High-risk actions | Approve/reject/return are visually distinct | `Pass` | Buttons are color-coded | Keep semantics, add confirmation text consistency |
| Reject flow | Reject reasons are easy to choose and audit | `Warn` | Modal works, but copy and hierarchy need cleanup | Add helper text and preflight summary |
| Return inspection | Partial return / maintenance logic is understandable | `Warn` | Modal is dense and action labels use emoji | Replace icons, add totals and validation summary row |

### Tab: Review

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Purpose | "Pending approval" items are clearly separated from rest | `Pass` | Dedicated tab exists | Keep |
| Decision support | Item preview includes enough metadata to approve safely | `Warn` | Needs clearer emphasis on missing fields, location, media | Add checklist-style side panel in edit/review flow |
| Bulk safety | Bulk actions remain understandable | `Warn` | Bulk action bar exists but depends on selection state | Add selected count summary and undo-friendly messaging |

### Tab: Manikins Inventory

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Discoverability | Search/filter/edit flow is easy for frequent admin use | `Warn` | Likely efficient but visually crowded | Normalize toolbar, sticky filters, and row density |
| Status system | 9-status scheme is consistently represented | `Warn` | Many status colors exist, but semantics are easy to confuse | Add status legend and standard copy set |
| Edit modal | Edit form groups fields logically | `Warn` | Many field types and capability checkboxes | Group into identity, operational status, capabilities, notes |

### Tab: Recycle / History

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Auditability | Historical records are easy to review | `Warn` | Tab exists but needs stronger forensic view language | Add immutable metadata emphasis and timestamp grouping |
| Recoverability | Restore or review actions are clearly separated | `Warn` | Needs explicit visual distinction if present | Use neutral history tone, reserve destructive colors for actual delete |

### Tab: Locations

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| CRUD clarity | Add/edit/delete location is straightforward | `Pass` | Small-scope CRUD is appropriate | Keep flow, simplify modal copy |
| Data quality | Building/room fields convey expected format | `Warn` | Placeholder-based guidance only | Add helper text beneath fields |

### Tab: Reports

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| KPI readability | Top metrics are immediately interpretable | `Warn` | Data is useful but visual grouping needs hierarchy | Group KPIs by operations, turnaround, utilization |
| Export | Export action feels secondary but obvious | `Pass` | Export button exists | Keep |
| Visualization | Charts and summaries avoid clutter | `Pass` | Simple card/grid layout | Keep, standardize empty/loading copy |

### Tab: Teams

| Category | Checkpoint | Status | Current Observation | Audit Action |
|---|---|---:|---|---|
| Master-detail layout | Team list and detail pane are appropriate | `Pass` | Strongest layout in admin suite | Preserve overall structure |
| Team operations | Create/edit/delete/add-member flow is coherent | `Warn` | Functional, but many inline styles and mixed messaging | Consolidate actions into toolbar and section cards |
| Capabilities | Capability management is understandable | `Warn` | Checkbox grid works but needs better section labeling | Add summary and sync impact note |
| Images | Cover/gallery upload UX is clear | `Warn` | Uses emoji placeholder and mixed inline UI | Replace placeholder with SVG/image frame component |

## Selector Lock Checklist

The following hooks must remain stable during UI refactor:

| Page | Locked Selectors |
|---|---|
| Public catalog | `#search-input`, `#clear-search`, `#status-chips`, `#btn-grouped`, `#btn-individual`, `#manikin-grid`, `#detail-drawer`, `#drawer-overlay`, `.cat-btn`, `[data-age]`, `[data-status]` |
| Borrow | `#btn-login`, `#user-profile`, `#cart-icon-btn`, `#cart-badge`, `#search-input`, `.cat-pill`, `#btn-date-filter`, `#date-filter-bar`, `#start-date`, `#end-date`, `#btn-apply-dates`, `#btn-clear-dates`, `#equipments-grid`, `#date-modal`, `#modal-start-date`, `#modal-end-date`, `#quick-detail-drawer`, `#detail-drawer-overlay`, `#matrix-modal`, `#cart-drawer`, `#cart-drawer-overlay`, `#checkout-purpose`, `#btn-submit-request` |
| Tracking | `#tracking-input`, `#btn-search`, `#result-view`, `#status-badge`, `#items-body`, `#cancel-zone`, `#btn-login-cancel`, `#btn-cancel-request`, `#loading`, `#error-view` |
| Admin login | `#login-form`, `#email`, `#password`, `#pw-toggle`, `#login-btn`, `#login-error`, `#login-error-msg`, `#btn-spinner`, `#login-text` |
| Admin dashboard | `[data-tab]`, `.tab-pane`, `#tab-dashboard`, `#tab-review`, `#tab-borrow-requests`, `#tab-manikins`, `#tab-recycle`, `#tab-locations`, `#tab-reports`, `#tab-teams`, `#btn-menu-toggle`, `#sidebar-overlay`, `#logout-btn`, `#btn-global-refresh`, `#borrow-search`, `#borrow-status-filter` |
| Admin teams/images | `#teams-list`, `#teams-detail-content`, `#team-cover-preview`, `#team-cover-placeholder`, `#team-cover-img`, `#team-cover-input`, `#team-gallery-input`, `#team-gallery-grid`, `#team-modal`, `#add-member-modal` |

## Exit Criteria

| Area | Done When |
|---|---|
| Encoding | No visible Mojibake in rendered UI, metadata, print views, or generated docs |
| Consistency | All pages share one icon set, one spacing scale, one button hierarchy |
| Accessibility | Keyboard path covers search, table actions, drawers, and modals |
| Stability | Existing JS continues to function with no selector breakage |
| Responsiveness | Verified at 375px, 768px, 1024px, 1440px |
