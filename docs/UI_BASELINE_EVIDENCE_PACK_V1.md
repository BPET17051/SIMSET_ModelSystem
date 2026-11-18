# UI Baseline Evidence Pack v1

Project: SIMSET Model System  
Date: 2026-04-26  
Baseline source: [UI_BASELINE_SPEC_V1_CHECKLIST.md](./UI_BASELINE_SPEC_V1_CHECKLIST.md)

## 1. Screenshot Evidence

Current baseline screenshots stored in `docs/ui-baseline-evidence/`:

- Borrow desktop: [borrow-desktop.png](./ui-baseline-evidence/borrow-desktop.png)
- Borrow mobile: [borrow-mobile.png](./ui-baseline-evidence/borrow-mobile.png)
- Admin borrow requests desktop: [admin-borrow-requests-desktop.png](./ui-baseline-evidence/admin-borrow-requests-desktop.png)
- Admin borrow requests tablet: [admin-borrow-requests-tablet.png](./ui-baseline-evidence/admin-borrow-requests-tablet.png)

This pack is the current `after` baseline. Historical `before` captures remain in task discussion and prior regression reports.

## 2. Routes Tested

Routes verified in current baseline run:

- `/` -> redirects to `/borrow`
- `/borrow.html`
- `/tracking.html`
- `/history.html`
- `/success.html`
- `/admin/`
- `/admin/dashboard.html`

## 3. State Matrix

### Borrow runtime

| Route | Filter | Sort | View | Page | Expected behavior |
|---|---|---|---|---|---|
| `/borrow.html` | age + search | implicit availability ordering | grid/list | paginated | changing filter updates active chips immediately |
| `/borrow.html` | clear individual chip | preserved | preserved | reset to valid page | result set updates without drift |
| `/borrow.html` | clear all | default | preserved | reset to page 1 | empty state or results update immediately |
| `/borrow.html` | unchanged | unchanged | switch grid/list | preserved | filters/sort/page remain stable across view switch |
| `/borrow.html` | filter produces empty | preserved | grid/list specific empty state | n/a | CTA points to clear filter or choose dates |

### Admin borrow requests

| Route | Filter | Sort | View | Page | Expected behavior |
|---|---|---|---|---|---|
| `/admin/dashboard.html#borrow-requests` | search + status | newest/oldest/pickup/status | table only | paginated | active chips mirror query state |
| `/admin/dashboard.html#borrow-requests` | select page | preserved | table only | current page | bulk bar shows page scope badge |
| `/admin/dashboard.html#borrow-requests` | select all results | preserved | table only | across filtered dataset | bulk bar shows results scope and real total |
| `/admin/dashboard.html#borrow-requests` | filter/sort changes result set | changed | table only | current or reset page | out-of-scope selection warns before pruning |
| `/admin/dashboard.html#borrow-requests` | saved preset recalled | preset state restored | table only | reset to page 1 | filter + sort + column layout match preset |

## 4. QA Evidence

Executed on 2026-04-26:

- `python .agent/scripts/encoding_guard.py website`
- `npm run smoke:main-pages`
- `npm run smoke:nav`
- `npm run smoke:deploy-workflow`
- `npm run smoke:keyboard-nav`
- `npm run smoke:admin-selection`

Relevant checklist coverage:

- `QA-BR-01` to `QA-BR-08`: covered by `smoke:main-pages` and runtime inspection
- `QA-AD-01` to `QA-AD-06`: covered by `smoke:admin-selection` and source audit
- `QA-RG-01` to `QA-RG-05`: covered by smoke suite + encoding guard

## 5. Evidence Notes

- Borrow desktop/mobile screenshots reflect current public baseline after root redirect to `/borrow`
- Admin screenshots use deterministic `test_mode` runtime so toolbar, table, and selection UI render consistently
- This document closes Section 9 artifact requirements for the current checklist closure ticket
